import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Database } from "../db/adapter.ts";
import { BetterSqlite3Adapter } from "../db/adapters/better-sqlite3.ts";
import { WaSqliteNodeAdapter } from "../db/adapters/wa-sqlite-node.ts";
import { applyMigrations } from "../db/runner.ts";
import { loadMigrations } from "../db/migrations.ts";
import type { DeviationReason } from "../domain/types.ts";
import {
  startTodaySession,
  getActiveSession,
  endSession,
  getSessionItems,
  markItemDone,
  addAdhocItem,
  skipItem,
  substituteItem,
  createItem,
  resequenceItems,
  writeSet,
  prefillFromLastExecution,
  applyInterferenceGate,
  suggestSubstitutes,
} from "./sessions.ts";

type AdapterFactory = (path: string) => Promise<Database>;
const engines: ReadonlyArray<readonly [string, AdapterFactory]> = [
  ["better-sqlite3", (p) => BetterSqlite3Adapter.open(p)],
  ["wa-sqlite-node", (p) => WaSqliteNodeAdapter.open(p)],
];

const T = 1_700_000_000_000;
const userChoice: DeviationReason = "user_choice";

// Tabelas do PLANO/catalogo que a sessao NUNCA pode tocar (I-12).
const PLAN_TABLES = [
  "plan",
  "plan_phase",
  "work_block",
  "work_block_item",
  "exercise",
  "routine",
];

describe.each(engines)("sessions — %s", (_name, openDb) => {
  let db: Database;

  beforeEach(async () => {
    db = await openDb(":memory:");
    await applyMigrations(db, loadMigrations); // schema + seed
  });

  afterEach(async () => {
    await db.close();
  });

  async function snapshotPlan(): Promise<Record<string, unknown[]>> {
    const out: Record<string, unknown[]> = {};
    for (const t of PLAN_TABLES) {
      out[t] = await db.all(`SELECT * FROM ${t} ORDER BY id`);
    }
    return out;
  }

  it("lazy: startTodaySession nao cria nenhum session_item", async () => {
    const sid = await startTodaySession(db, {
      planId: "pl_vertical_18w",
      workBlockId: "wb_ter_forca",
      now: T,
    });
    const items = await getSessionItems(db, sid);
    expect(items).toHaveLength(0);
  });

  it("I-12: um fluxo completo de sessao NAO toca o plano", async () => {
    const before = await snapshotPlan();

    const sid = await startTodaySession(db, {
      planId: "pl_vertical_18w",
      workBlockId: "wb_ter_forca",
      now: T,
    });
    const done = await markItemDone(db, {
      sessionId: sid,
      exerciseId: "ex_back_squat",
      workBlockItemId: "wbi_ter_2",
      actualSequence: 1,
      isWarmup: false,
      now: T,
    });
    await writeSet(db, {
      sessionItemId: done,
      setIndex: 1,
      measures: { progressionType: "load_reps", reps: 5, loadKg: 100 },
      now: T,
    });
    await skipItem(db, {
      sessionId: sid,
      exerciseId: "ex_clean_pull",
      workBlockItemId: "wbi_ter_3",
      actualSequence: 2,
      reason: userChoice,
      now: T,
    });
    await substituteItem(db, {
      sessionId: sid,
      substituteExerciseId: "ex_rdl",
      plannedWorkBlockItemId: "wbi_ter_4",
      actualSequence: 3,
      reason: "equipment_busy",
      now: T,
    });
    await addAdhocItem(db, {
      sessionId: sid,
      exerciseId: "ex_hip_thrust",
      actualSequence: 4,
      now: T,
    });
    await endSession(db, sid, T + 3600_000);

    const after = await snapshotPlan();
    expect(after).toEqual(before); // plano/catalogo intactos
  });

  it("I-15: substituir preserva o planejado e progride o SUBSTITUTO", async () => {
    const sid = await startTodaySession(db, {
      planId: "pl_vertical_18w",
      workBlockId: "wb_ter_forca",
      now: T,
    });
    // Planejado wbi_ter_4 (RDL) substituido por hip thrust (exercicio diferente).
    const itemId = await substituteItem(db, {
      sessionId: sid,
      substituteExerciseId: "ex_hip_thrust",
      plannedWorkBlockItemId: "wbi_ter_4",
      actualSequence: 1,
      reason: userChoice,
      now: T,
    });
    const row = await db.get<{
      exercise_id: string;
      work_block_item_id: string;
      status: string;
    }>(
      `SELECT exercise_id, work_block_item_id, status FROM session_item WHERE id = ?`,
      [itemId],
    );
    expect(row?.status).toBe("substituted");
    expect(row?.exercise_id).toBe("ex_hip_thrust"); // o substituto (progride a si)
    expect(row?.work_block_item_id).toBe("wbi_ter_4"); // o planejado preservado
  });

  it("I-13: applyInterferenceGate grava interference_warned quando dispara", async () => {
    const sid = await startTodaySession(db, {
      planId: "pl_vertical_18w",
      workBlockId: "wb_sex_salto_m3",
      now: T,
    });
    const warned = await applyInterferenceGate(db, sid, [
      {
        exerciseId: "ex_a",
        acuteInterference: true,
        progressionType: "time_under_tension",
        plannedSequence: 1,
      },
      {
        exerciseId: "ex_b",
        acuteInterference: false,
        progressionType: "jump_height",
        plannedSequence: 2,
      },
    ]);
    expect(warned).not.toBeNull();
    const s = await db.get<{ interference_warned: number }>(
      `SELECT interference_warned FROM session WHERE id = ?`,
      [sid],
    );
    expect(s?.interference_warned).toBe(1);
  });

  it("I-13: NAO grava quando o gate nao dispara", async () => {
    const sid = await startTodaySession(db, {
      planId: "pl_vertical_18w",
      workBlockId: "wb_ter_forca",
      now: T,
    });
    const warned = await applyInterferenceGate(db, sid, [
      {
        exerciseId: "ex_a",
        acuteInterference: false,
        progressionType: "load_reps",
        plannedSequence: 1,
      },
    ]);
    expect(warned).toBeNull();
    const s = await db.get<{ interference_warned: number }>(
      `SELECT interference_warned FROM session WHERE id = ?`,
      [sid],
    );
    expect(s?.interference_warned).toBe(0);
  });

  it("recuperacao: getActiveSession acha a sessao nao-encerrada + seus itens", async () => {
    const sid = await startTodaySession(db, {
      planId: "pl_vertical_18w",
      workBlockId: "wb_ter_forca",
      now: T,
    });
    await markItemDone(db, {
      sessionId: sid,
      exerciseId: "ex_back_squat",
      workBlockItemId: "wbi_ter_2",
      actualSequence: 1,
      isWarmup: false,
      now: T,
    });

    const active = await getActiveSession(db);
    expect(active?.id).toBe(sid);
    expect(active?.ended_at).toBeNull();
    const items = await getSessionItems(db, sid);
    expect(items).toHaveLength(1);

    await endSession(db, sid, T + 1000);
    expect(await getActiveSession(db)).toBeUndefined();
  });

  it("writeSet polimorfico: load_reps / contact_quality / jump_height round-trip", async () => {
    const sid = await startTodaySession(db, {
      planId: "pl_vertical_18w",
      workBlockId: "wb_ter_forca",
      now: T,
    });
    const item = await markItemDone(db, {
      sessionId: sid,
      exerciseId: "ex_back_squat",
      workBlockItemId: "wbi_ter_2",
      actualSequence: 1,
      isWarmup: false,
      now: T,
    });

    await writeSet(db, {
      sessionItemId: item,
      setIndex: 1,
      measures: { progressionType: "load_reps", reps: 5, loadKg: 102.5 },
      rpe: 8,
      now: T,
    });
    await writeSet(db, {
      sessionItemId: item,
      setIndex: 2,
      measures: { progressionType: "contact_quality", quality: "tremor" },
      now: T,
    });
    await writeSet(db, {
      sessionItemId: item,
      setIndex: 3,
      measures: { progressionType: "jump_height", heightCm: 42.5 },
      now: T,
    });

    const sets = await db.all<{
      set_index: number;
      progression_type: string;
      reps: number | null;
      load_kg: number | null;
      quality: string | null;
      height_cm: number | null;
      rpe: number | null;
    }>(
      `SELECT set_index, progression_type, reps, load_kg, quality, height_cm, rpe
       FROM session_set WHERE session_item_id = ? ORDER BY set_index`,
      [item],
    );
    expect(sets[0]).toMatchObject({
      progression_type: "load_reps",
      reps: 5,
      load_kg: 102.5,
      rpe: 8,
      quality: null,
      height_cm: null,
    });
    expect(sets[1]).toMatchObject({
      progression_type: "contact_quality",
      quality: "tremor",
      reps: null,
      load_kg: null,
    });
    expect(sets[2]).toMatchObject({
      progression_type: "jump_height",
      height_cm: 42.5,
      reps: null,
    });
  });

  it("createItem valida status->reason (skipped sem reason lanca)", async () => {
    const sid = await startTodaySession(db, {
      planId: "pl_vertical_18w",
      workBlockId: "wb_ter_forca",
      now: T,
    });
    await expect(
      createItem(db, {
        sessionId: sid,
        exerciseId: "ex_back_squat",
        workBlockItemId: "wbi_ter_2",
        actualSequence: 1,
        status: "skipped",
        deviationReason: null, // skipped EXIGE reason
        isWarmup: false,
        now: T,
      }),
    ).rejects.toThrow(/deviation_reason/);
  });

  it("createItem: done+reason (forbidden) e substituted/deferred sem reason (required) lancam", async () => {
    const sid = await startTodaySession(db, { planId: "pl_vertical_18w", workBlockId: "wb_ter_forca", now: T });
    const base = {
      sessionId: sid,
      exerciseId: "ex_back_squat",
      workBlockItemId: "wbi_ter_2" as string | null,
      actualSequence: 1,
      isWarmup: false,
      now: T,
    };
    // done NAO pode ter reason
    await expect(
      createItem(db, { ...base, status: "done", deviationReason: userChoice }),
    ).rejects.toThrow(/null deviation_reason/);
    // substituted EXIGE reason
    await expect(
      createItem(db, { ...base, status: "substituted", deviationReason: null }),
    ).rejects.toThrow(/requires a deviation_reason/);
    // deferred EXIGE reason
    await expect(
      createItem(db, { ...base, status: "deferred", deviationReason: null }),
    ).rejects.toThrow(/requires a deviation_reason/);
  });

  it("resequenceItems exige a lista COMPLETA (lista parcial lanca, nao colide)", async () => {
    const sid = await startTodaySession(db, { planId: "pl_vertical_18w", workBlockId: "wb_ter_forca", now: T });
    const a = await markItemDone(db, { sessionId: sid, exerciseId: "ex_back_squat", workBlockItemId: "wbi_ter_2", actualSequence: 1, isWarmup: false, now: T });
    await markItemDone(db, { sessionId: sid, exerciseId: "ex_rdl", workBlockItemId: "wbi_ter_4", actualSequence: 2, isWarmup: false, now: T });
    await expect(resequenceItems(db, sid, [a])).rejects.toThrow(/exatamente/);
  });

  it("resequenceItems reordena sem colidir o UNIQUE(session_id, actual_sequence)", async () => {
    const sid = await startTodaySession(db, {
      planId: "pl_vertical_18w",
      workBlockId: "wb_ter_forca",
      now: T,
    });
    const a = await markItemDone(db, { sessionId: sid, exerciseId: "ex_back_squat", workBlockItemId: "wbi_ter_2", actualSequence: 1, isWarmup: false, now: T });
    const b = await markItemDone(db, { sessionId: sid, exerciseId: "ex_rdl", workBlockItemId: "wbi_ter_4", actualSequence: 2, isWarmup: false, now: T });

    await resequenceItems(db, sid, [b, a]); // inverte a ordem

    const items = await getSessionItems(db, sid);
    expect(items.map((i) => i.id)).toEqual([b, a]);
    expect(items.map((i) => i.actual_sequence)).toEqual([1, 2]);
  });

  it("suggestSubstitutes acha exercicios da mesma function_tag", async () => {
    // ex_bounce_drop_jumps e ex_depth_jumps compartilham 'plio_reativo'.
    const subs = await suggestSubstitutes(db, "ex_bounce_drop_jumps");
    const ids = subs.map((s) => s.id);
    expect(ids).toContain("ex_depth_jumps");
    expect(ids).not.toContain("ex_bounce_drop_jumps"); // nao sugere a si mesmo
  });

  it("prefillFromLastExecution traz a ultima serie do exercicio", async () => {
    const sid = await startTodaySession(db, { planId: "pl_vertical_18w", workBlockId: "wb_ter_forca", now: T });
    const item = await markItemDone(db, { sessionId: sid, exerciseId: "ex_back_squat", workBlockItemId: "wbi_ter_2", actualSequence: 1, isWarmup: false, now: T });
    await writeSet(db, { sessionItemId: item, setIndex: 1, measures: { progressionType: "load_reps", reps: 5, loadKg: 100 }, now: T });
    await writeSet(db, { sessionItemId: item, setIndex: 2, measures: { progressionType: "load_reps", reps: 5, loadKg: 105 }, now: T + 10 });

    const pre = await prefillFromLastExecution(db, "ex_back_squat");
    expect(pre?.progression_type).toBe("load_reps");
    expect(pre?.load_kg).toBe(105); // a mais recente (timestamp maior)
  });
});

// ---------------------------------------------------------------------------
// I-12 ESTRUTURAL (estatico): trava que o repositorio nunca escreva no plano.
// O teste de fluxo acima e dinamico (so prova o caminho exercitado); este le o
// source e falha se aparecer INSERT/UPDATE/DELETE contra tabela de plano/
// catalogo — pega uma regressao futura mesmo sem fluxo que a exercite.
// ---------------------------------------------------------------------------
describe("sessions — I-12 estrutural (estatico)", () => {
  it("o repositorio NAO tem SQL de escrita contra tabelas de plano/catalogo", async () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = await readFile(join(dir, "sessions.ts"), "utf-8");
    const planTables = [
      "work_block_item",
      "work_block",
      "plan_phase",
      "plan",
      "exercise",
      "routine",
    ];
    for (const t of planTables) {
      const re = new RegExp(`(INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+${t}\\b`, "i");
      expect(re.test(src), `sessions.ts nao deve escrever em ${t}`).toBe(false);
    }
  });
});
