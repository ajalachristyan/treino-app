import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { Database } from "../db/adapter.ts";
import { BetterSqlite3Adapter } from "../db/adapters/better-sqlite3.ts";
import { WaSqliteNodeAdapter } from "../db/adapters/wa-sqlite-node.ts";
import { applyMigrations } from "../db/runner.ts";
import { loadMigrations } from "../db/migrations.ts";
import { setStartDate, localMidnight } from "./planConfig.ts";
import {
  startTodaySession,
  markItemDone,
  writeSet,
  skipItem,
  substituteItem,
} from "./sessions.ts";
import type { DeviationReason } from "../domain/types.ts";
import { computeAdherence } from "../engine/decision/adherence.ts";
import { plannedOccurrences } from "./adherence.ts";

type AdapterFactory = (path: string) => Promise<Database>;
const engines: ReadonlyArray<readonly [string, AdapterFactory]> = [
  ["better-sqlite3", (p) => BetterSqlite3Adapter.open(p)],
  ["wa-sqlite-node", (p) => WaSqliteNodeAdapter.open(p)],
];

const WEEK_MS = 7 * 86_400_000;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const userChoice: DeviationReason = "user_choice";

describe.each(engines)(
  "adherence data — plannedOccurrences — %s",
  (_name, openDb) => {
    let db: Database;
    // start = uma segunda-feira a meia-noite local; "agora" = meio da semana 3
    // (semanas 1 e 2 ja totalmente vencidas).
    const start = localMidnight(new Date(2026, 0, 5));
    const now = start + 2 * WEEK_MS + 12 * HOUR_MS;

    beforeEach(async () => {
      db = await openDb(":memory:");
      await applyMigrations(db, loadMigrations);
      await setStartDate(db, start);
    });

    afterEach(async () => {
      await db.close();
    });

    it("enumera as ocorrencias do plano, marcando done pelo executado; exclui warmup", async () => {
      // Semana 1: fez back squat (wbi_ter_2); nao tocou o resto do plano.
      const s = await startTodaySession(db, {
        planId: "pl_vertical_18w",
        workBlockId: "wb_ter_forca",
        now: start + DAY_MS, // dentro da janela da semana 1
      });
      const it = await markItemDone(db, {
        sessionId: s,
        exerciseId: "ex_back_squat",
        workBlockItemId: "wbi_ter_2",
        actualSequence: 1,
        isWarmup: false,
        now: start + DAY_MS,
      });
      await writeSet(db, {
        sessionItemId: it,
        setIndex: 1,
        measures: { progressionType: "load_reps", reps: 5, loadKg: 100 },
        now: start + DAY_MS,
      });

      const occ = await plannedOccurrences(db, { fromWeek: 1, toWeek: 1 }, now);

      const squat = occ.filter((o) => o.exerciseId === "ex_back_squat");
      expect(squat).toHaveLength(1);
      expect(squat[0]?.done).toBe(true);
      expect(squat[0]?.priority).toBe("primary");

      const cleanPull = occ.filter((o) => o.exerciseId === "ex_clean_pull");
      expect(cleanPull).toHaveLength(1);
      expect(cleanPull[0]?.done).toBe(false);

      // aquecimento (warmup) nunca e ocorrencia de aderencia.
      expect(occ.some((o) => o.exerciseId === "ex_aquecimento_dinamico")).toBe(
        false,
      );
    });

    it("guarda do placeholder: sem data real fixada => lista vazia (nao inventa)", async () => {
      // Re-semeia sem fixar a data (start_date volta ao placeholder do seed).
      await db.close();
      db = await openDb(":memory:");
      await applyMigrations(db, loadMigrations); // NAO chama setStartDate
      const occ = await plannedOccurrences(db, { fromWeek: 1, toWeek: 3 }, now);
      expect(occ).toEqual([]);
    });

    it("I-15: substituicao do slot planejado conta como done", async () => {
      const s = await startTodaySession(db, {
        planId: "pl_vertical_18w",
        workBlockId: "wb_ter_forca",
        now: start + DAY_MS,
      });
      // back squat (wbi_ter_2) substituido por zercher — slot cumprido.
      const it = await substituteItem(db, {
        sessionId: s,
        substituteExerciseId: "ex_zercher_leve",
        plannedWorkBlockItemId: "wbi_ter_2",
        actualSequence: 1,
        reason: userChoice,
        now: start + DAY_MS,
      });
      await writeSet(db, {
        sessionItemId: it,
        setIndex: 1,
        measures: { progressionType: "load_reps", reps: 5, loadKg: 60 },
        now: start + DAY_MS,
      });

      const occ = await plannedOccurrences(db, { fromWeek: 1, toWeek: 1 }, now);
      // A ocorrencia continua chaveada pelo exercicio PLANEJADO (back squat),
      // marcada done porque o slot foi cumprido pelo substituto.
      const squat = occ.filter((o) => o.exerciseId === "ex_back_squat");
      expect(squat).toHaveLength(1);
      expect(squat[0]?.done).toBe(true);
    });

    it("pulado NAO conta como done", async () => {
      const s = await startTodaySession(db, {
        planId: "pl_vertical_18w",
        workBlockId: "wb_ter_forca",
        now: start + DAY_MS,
      });
      await skipItem(db, {
        sessionId: s,
        exerciseId: "ex_back_squat",
        workBlockItemId: "wbi_ter_2",
        actualSequence: 1,
        reason: userChoice,
        now: start + DAY_MS,
      });

      const occ = await plannedOccurrences(db, { fromWeek: 1, toWeek: 1 }, now);
      const squat = occ.filter((o) => o.exerciseId === "ex_back_squat");
      expect(squat).toHaveLength(1);
      expect(squat[0]?.done).toBe(false);
    });

    it("dia futuro nao vencido: nao conta como falta (anti-culpa)", async () => {
      // "agora" = terca-feira da semana 1 de manha (so o 1o dia venceu).
      const early = start + 1 * DAY_MS + 9 * HOUR_MS; // week 1, dia 2
      const occ = await plannedOccurrences(db, { fromWeek: 1, toWeek: 1 }, early);
      // Sabado (wb_sab_bonus, dia 6) ainda nao chegou -> nao aparece como falta.
      expect(occ.some((o) => o.exerciseId === "ex_zercher_leve")).toBe(false);
    });

    it("multi-semana: order cronologico alimenta o primaryNeglectStreak (via computeAdherence)", async () => {
      // Nenhuma sessao: back squat (primary) fica largado nas semanas 1 e 2.
      const occ = await plannedOccurrences(db, { fromWeek: 1, toWeek: 2 }, now);
      const squat = occ.filter((o) => o.exerciseId === "ex_back_squat");
      expect(squat).toHaveLength(2); // uma por semana
      expect(squat[0]!.order).toBeLessThan(squat[1]!.order); // semana 1 antes da 2

      const summary = computeAdherence(occ);
      expect(summary.primaryNeglectStreak["ex_back_squat"]).toBe(2);
      // acessorio largado o mesmo tanto NAO entra no neglect de primary.
      expect(summary.primaryNeglectStreak["ex_rdl"]).toBeUndefined();
    });
  },
);
