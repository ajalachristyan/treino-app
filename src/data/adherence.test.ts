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
import {
  plannedOccurrences,
  readinessNow,
  adherenceOverview,
} from "./adherence.ts";

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

describe.each(engines)("adherence data — readinessNow — %s", (_name, openDb) => {
  let db: Database;
  const start = localMidnight(new Date(2026, 0, 5)); // segunda-feira
  const nowInWeek = (w: number): number =>
    start + (w - 1) * WEEK_MS + 12 * HOUR_MS;

  beforeEach(async () => {
    db = await openDb(":memory:");
    await applyMigrations(db, loadMigrations);
    await setStartDate(db, start);
  });

  afterEach(async () => {
    await db.close();
  });

  it("guarda do placeholder: sem data real => null (nenhum banner)", async () => {
    await db.close();
    db = await openDb(":memory:");
    await applyMigrations(db, loadMigrations); // sem setStartDate
    expect(await readinessNow(db, nowInWeek(3))).toBeNull();
  });

  it("M1 com aderencia baixa: adherenceWarning + repeat_week, SEM riskPhaseGate", async () => {
    // Semana 3 do Mes 1, nada logado -> fase mal seguida, mas M1 nao e risco.
    const view = await readinessNow(db, nowInWeek(3));
    expect(view).not.toBeNull();
    expect(view!.adherenceWarning).toBe(true);
    expect(view!.riskPhaseGate).toBe(false); // M1 nao e fase de risco
    expect(view!.suggestedAdjustment).toBe("repeat_week");
  });

  it("M3 com base insuficiente: riskPhaseGate + extend_phase", async () => {
    // Semana 11 (Mes 3), nada feito em M1/M2 -> base primary = 0.
    const view = await readinessNow(db, nowInWeek(11));
    expect(view).not.toBeNull();
    expect(view!.riskPhaseGate).toBe(true);
    expect(view!.suggestedAdjustment).toBe("extend_phase");
  });

  it("neglectedPrimary vem como NOME leigo, nao id de exercicio", async () => {
    // Semana 5 do Mes 1, nada logado -> back squat largado (>= streak, placeholder 3).
    const view = await readinessNow(db, nowInWeek(5));
    expect(view).not.toBeNull();
    expect(view!.neglectedPrimary).toContain("Back squat");
    expect(view!.neglectedPrimary.every((n) => !n.startsWith("ex_"))).toBe(true);
  });

  it("P1: dia 1 do plano (fase sem ocorrencia vencida) NAO avisa aderencia (anti-culpa)", async () => {
    // Segunda ao meio-dia da semana 1: nenhum dia venceu -> fase vazia. Nao pode
    // dizer "voce esta atras" sem o dono ter tido chance de treinar.
    const view = await readinessNow(db, nowInWeek(1));
    expect(view).not.toBeNull();
    expect(view!.adherenceWarning).toBe(false);
    expect(view!.suggestedAdjustment).toBeNull();
  });

  it("P2: semana de deload leve NAO vira 'repita a semana' (recuperacao e de proposito)", async () => {
    // Fim da semana 6 (Deload 1): dias vencidos, nada logado -> plano estrutural
    // cheio contado, mas deload treina menos DE PROPOSITO. Sem nag de aderencia.
    const nowEndOfWeek6 = start + 5 * WEEK_MS + 6 * DAY_MS + 12 * HOUR_MS;
    const view = await readinessNow(db, nowEndOfWeek6);
    expect(view).not.toBeNull();
    expect(view!.adherenceWarning).toBe(false);
  });

  it("P3: taper (sem 16) NAO dispara o gate 'Mes 3' (peaking ja passou)", async () => {
    // Base zerada (nada em M1/M2), mas taper NAO e o Mes 3 real -> sem riskPhaseGate.
    const view = await readinessNow(db, nowInWeek(16));
    expect(view).not.toBeNull();
    expect(view!.riskPhaseGate).toBe(false);
  });

  it("adherenceOverview: placeholder => null (empty state, sem culpa)", async () => {
    await db.close();
    db = await openDb(":memory:");
    await applyMigrations(db, loadMigrations); // sem setStartDate
    expect(await adherenceOverview(db, nowInWeek(3))).toBeNull();
  });

  it("adherenceOverview: fase ativa devolve semana, nome, resumo por tier e prontidao", async () => {
    const ov = await adherenceOverview(db, nowInWeek(3));
    expect(ov).not.toBeNull();
    expect(ov!.week).toBe(3);
    expect(ov!.phaseName).toContain("Mes 1");
    expect(ov!.summary.byPriority.primary.planned).toBeGreaterThan(0);
    expect(ov!.summary.done).toBe(0); // nada logado
    expect(ov!.readiness.adherenceWarning).toBe(true);
  });
});
