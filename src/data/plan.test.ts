import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { Database } from "../db/adapter.ts";
import { BetterSqlite3Adapter } from "../db/adapters/better-sqlite3.ts";
import { WaSqliteNodeAdapter } from "../db/adapters/wa-sqlite-node.ts";
import { applyMigrations } from "../db/runner.ts";
import { loadMigrations } from "../db/migrations.ts";
import {
  getPlan,
  getPhases,
  getPlanBlocksForWeek,
  getWorkBlockItems,
  getAttachableRoutines,
  getRoutineBlocks,
  currentWeek,
  phaseForWeek,
  isoDayOfWeek,
  type PlanRow,
} from "./plan.ts";

// ---------------------------------------------------------------------------
// Funcoes PURAS (derivacoes na leitura) — sem DB.
// ---------------------------------------------------------------------------
describe("plan — derivacoes puras", () => {
  const WEEK_MS = 7 * 86400000;
  const plan: PlanRow = {
    id: "p",
    name: "x",
    start_date: 1_000_000,
    duration_weeks: 18,
  };

  it("currentWeek: instante do start = semana 1", () => {
    expect(currentWeek(plan, plan.start_date)).toBe(1);
  });

  it("currentWeek: +1 semana = semana 2; +5 semanas = semana 6", () => {
    expect(currentWeek(plan, plan.start_date + WEEK_MS)).toBe(2);
    expect(currentWeek(plan, plan.start_date + 5 * WEEK_MS + 1)).toBe(6);
  });

  it("currentWeek: clampa antes do inicio (1) e depois do fim (duration)", () => {
    expect(currentWeek(plan, plan.start_date - 5000)).toBe(1);
    expect(currentWeek(plan, plan.start_date + 100 * WEEK_MS)).toBe(18);
  });

  it("isoDayOfWeek: domingo -> 7, segunda -> 1 (nao 0)", () => {
    let sunday = new Date(2026, 0, 1);
    while (sunday.getDay() !== 0) {
      sunday = new Date(sunday.getTime() + 86400000);
    }
    const monday = new Date(sunday.getTime() + 86400000);
    expect(isoDayOfWeek(sunday)).toBe(7);
    expect(isoDayOfWeek(monday)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Selectors sobre o seed (002), nos dois engines.
// ---------------------------------------------------------------------------
type AdapterFactory = (path: string) => Promise<Database>;
const engines: ReadonlyArray<readonly [string, AdapterFactory]> = [
  ["better-sqlite3", (p) => BetterSqlite3Adapter.open(p)],
  ["wa-sqlite-node", (p) => WaSqliteNodeAdapter.open(p)],
];

describe.each(engines)("plan — selectors sobre o seed — %s", (_name, openDb) => {
  let db: Database;

  beforeEach(async () => {
    db = await openDb(":memory:");
    await applyMigrations(db, loadMigrations);
  });

  afterEach(async () => {
    await db.close();
  });

  it("getPlan devolve o plano de 18 semanas", async () => {
    const plan = await getPlan(db);
    expect(plan?.id).toBe("pl_vertical_18w");
    expect(plan?.duration_weeks).toBe(18);
  });

  it("getPhases devolve as 7 fases ordenadas por week_start", async () => {
    const phases = await getPhases(db, "pl_vertical_18w");
    expect(phases).toHaveLength(7);
    expect(phases[0]?.week_start).toBe(1);
    expect(phaseForWeek(phases, 6)?.is_deload).toBe(1);
    expect(phaseForWeek(phases, 16)?.is_taper).toBe(1);
    expect(phaseForWeek(phases, 3)?.is_deload).toBe(0);
    expect(phaseForWeek(phases, 99)).toBeUndefined();
  });

  it("getPlanBlocksForWeek inclui os blocos sempre-validos + o bloco de salto da fase", async () => {
    const wk1 = await getPlanBlocksForWeek(db, "pl_vertical_18w", 1);
    const ids1 = wk1.map((b) => b.id);
    expect(ids1).toContain("wb_sex_salto_m1");
    expect(ids1).not.toContain("wb_sex_salto_m2");
    expect(ids1).not.toContain("wb_sex_salto_m3");
    expect(ids1).toContain("wb_ter_forca"); // week NULL -> sempre

    const wk8 = await getPlanBlocksForWeek(db, "pl_vertical_18w", 8);
    const ids8 = wk8.map((b) => b.id);
    expect(ids8).toContain("wb_sex_salto_m2");
    expect(ids8).not.toContain("wb_sex_salto_m1");
  });

  it("getWorkBlockItems: itens na ordem, aquecimento primeiro (is_warmup=1)", async () => {
    const items = await getWorkBlockItems(db, "wb_ter_forca");
    expect(items.length).toBeGreaterThan(0);
    // ordenado por planned_sequence
    const seqs = items.map((i) => i.planned_sequence);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    // primeiro e aquecimento
    expect(items[0]?.is_warmup).toBe(1);
    expect(items[0]?.exercise_name).toBeTruthy(); // JOIN trouxe o nome
  });

  it("getAttachableRoutines: recorrente primeiro", async () => {
    const routines = await getAttachableRoutines(db);
    expect(routines.length).toBeGreaterThanOrEqual(2);
    expect(routines[0]?.recurring).toBe(1);
  });

  it("getRoutineBlocks: a rotina de mobilidade tem ao menos um bloco", async () => {
    const blocks = await getRoutineBlocks(db, "rt_mobilidade_nucleo");
    expect(blocks.length).toBeGreaterThan(0);
  });
});
