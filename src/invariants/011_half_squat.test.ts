import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { Database } from "../db/adapter.ts";
import { BetterSqlite3Adapter } from "../db/adapters/better-sqlite3.ts";
import { WaSqliteNodeAdapter } from "../db/adapters/wa-sqlite-node.ts";
import { applyMigrations } from "../db/runner.ts";
import { loadMigrations } from "../db/migrations.ts";
import { getWorkBlockItems, getPlanBlocksForWeek } from "../data/plan.ts";
import { suggestPrescription } from "../engine/decision/prescription.ts";
import { PRIMARY_STRENGTH_FUNCTION_TAGS } from "../domain/constants.ts";

// ============================================================================
// migration 011: half-squat @70% (velocidade) no Sex/M3 (wb_sex_salto_m3).
// Fonte: Rivera (pesquisa-rivera-transcricoes.md:60-64) — M3, @70% 5x4, MOVA
// RAPIDO, progride por -1 rep/+1 serie (NAO por carga). Modelado como
// PASS-THROUGH: load_reps SEM faixa de reps + function_tag fora de
// PRIMARY_STRENGTH_FUNCTION_TAGS => o motor nao sugere/progride carga nem vira PAP.
// ============================================================================

type AdapterFactory = (path: string) => Promise<Database>;
const engines: ReadonlyArray<readonly [string, AdapterFactory]> = [
  ["better-sqlite3", (p) => BetterSqlite3Adapter.open(p)],
  ["wa-sqlite-node", (p) => WaSqliteNodeAdapter.open(p)],
];

describe.each(engines)("migration 011 — half-squat Sex/M3 — %s", (_name, openDb) => {
  let db: Database;

  beforeEach(async () => {
    db = await openDb(":memory:");
    await applyMigrations(db, loadMigrations);
  });

  afterEach(async () => {
    await db.close();
  });

  it("ex_half_squat: load_reps, barbell, SEM faixa (pass-through), tag nao-primaria", async () => {
    const items = await getWorkBlockItems(db, "wb_sex_salto_m3");
    const hs = items.find((i) => i.exercise_id === "ex_half_squat");
    expect(hs).toBeDefined();
    expect(hs?.progression_type).toBe("load_reps");
    expect(hs?.load_type).toBe("barbell");
    expect(hs?.rep_min).toBeNull(); // sem faixa => pass-through (nao progride carga)
    expect(hs?.rep_max).toBeNull();
    expect(hs?.function_tag).toBe("velocidade_agachamento");
    // fora de PRIMARY_STRENGTH_FUNCTION_TAGS => NUNCA vira PAP no M3
    expect(PRIMARY_STRENGTH_FUNCTION_TAGS.includes(hs?.function_tag ?? "")).toBe(false);
  });

  it("entra apos o aquecimento, ANTES dos saltos; ordem e sequencia 1..6 intactas", async () => {
    const items = await getWorkBlockItems(db, "wb_sex_salto_m3");
    // ordem completa (o offset-renumber nao embaralhou os itens de baixo)
    expect(items.map((i) => i.exercise_id)).toEqual([
      "ex_aquecimento_dinamico",
      "ex_half_squat",
      "ex_depth_jumps",
      "ex_approach_jump",
      "ex_isometria_balistica",
      "ex_hip_thrust",
    ]);
    // sequencias contiguas 1..6 (sem buraco nem duplicata pos-renumber)
    expect(items.map((i) => i.planned_sequence)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("so aparece do M3 em diante (bloco semanas 11-18), nao no M1", async () => {
    const wk1 = await getPlanBlocksForWeek(db, "pl_vertical_18w", 1);
    expect(wk1.some((b) => b.id === "wb_sex_salto_m3")).toBe(false);
    const wk12 = await getPlanBlocksForWeek(db, "pl_vertical_18w", 12);
    expect(wk12.some((b) => b.id === "wb_sex_salto_m3")).toBe(true);
  });

  it("motor: PASS-THROUGH em TODA fase (m1/m2/m3) — nunca vira PAP nem progride carga", async () => {
    const items = await getWorkBlockItems(db, "wb_sex_salto_m3");
    const hs = items.find((i) => i.exercise_id === "ex_half_squat");
    expect(hs).toBeDefined();
    const item = {
      exerciseId: hs!.exercise_id,
      functionTag: hs!.function_tag,
      progressionType: hs!.progression_type,
      repMin: hs!.rep_min,
      repMax: hs!.rep_max,
      plannedSets: hs!.planned_sets,
    };
    for (const emphasis of ["m1", "m2", "m3"] as const) {
      const presc = suggestPrescription(item, emphasis, []);
      expect(presc.mode, emphasis).toBe("pass_through"); // nao PAP no m3, nao dupla no m1/m2
      expect(presc.suggestedLoadKg, emphasis).toBeNull(); // nunca inventa/progride carga
    }
  });
});
