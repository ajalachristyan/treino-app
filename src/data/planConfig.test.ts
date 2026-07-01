import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { Database } from "../db/adapter.ts";
import { BetterSqlite3Adapter } from "../db/adapters/better-sqlite3.ts";
import { WaSqliteNodeAdapter } from "../db/adapters/wa-sqlite-node.ts";
import { applyMigrations } from "../db/runner.ts";
import { loadMigrations } from "../db/migrations.ts";
import { getPlan, getPhases, currentWeek, type PlanRow } from "./plan.ts";
import {
  SEED_PLACEHOLDER_START_DATE,
  isStartDateSet,
  localMidnight,
  setStartDate,
  setCurrentWeekToday,
  repeatCurrentWeek,
  resolveSessionPhase,
} from "./planConfig.ts";

const DAY_MS = 86400000;

// ---------------------------------------------------------------------------
// PURO — sem DB.
// ---------------------------------------------------------------------------
describe("planConfig — puro", () => {
  it("SEED_PLACEHOLDER_START_DATE casa com a linha do plano no seed 002 (paridade)", async () => {
    const seed = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "migrations",
      "002_seed_plan.sql",
    );
    const src = await readFile(seed, "utf-8");
    // A linha do INSERT INTO plan tem ..., <start_date>, 18, ... — se o seed
    // mudar o placeholder e este modulo nao, a paridade quebra aqui.
    expect(src).toContain(`, ${SEED_PLACEHOLDER_START_DATE}, 18,`);
  });

  it("localMidnight zera hora/min/seg/ms no fuso local", () => {
    const d = new Date(2026, 5, 24, 15, 30, 45, 123);
    const m = new Date(localMidnight(d));
    expect([m.getFullYear(), m.getMonth(), m.getDate()]).toEqual([2026, 5, 24]);
    expect([m.getHours(), m.getMinutes(), m.getSeconds(), m.getMilliseconds()]).toEqual([
      0, 0, 0, 0,
    ]);
  });
});

// ---------------------------------------------------------------------------
// COM DB — nos dois engines (a ancora e uma coluna real).
// ---------------------------------------------------------------------------
type AdapterFactory = (path: string) => Promise<Database>;
const engines: ReadonlyArray<readonly [string, AdapterFactory]> = [
  ["better-sqlite3", (p) => BetterSqlite3Adapter.open(p)],
  ["wa-sqlite-node", (p) => WaSqliteNodeAdapter.open(p)],
];

describe.each(engines)("planConfig — ancora editavel — %s", (_name, openDb) => {
  let db: Database;

  beforeEach(async () => {
    db = await openDb(":memory:");
    await applyMigrations(db, loadMigrations);
  });

  afterEach(async () => {
    await db.close();
  });

  it("isStartDateSet: falso no seed cru, verdadeiro apos definir; persiste o valor", async () => {
    const plan = await getPlan(db);
    expect(plan?.start_date).toBe(SEED_PLACEHOLDER_START_DATE);
    expect(isStartDateSet(plan!)).toBe(false);

    const chosen = localMidnight(new Date(2026, 7, 12)); // 12 ago 2026 local
    await setStartDate(db, chosen);

    const plan2 = await getPlan(db);
    expect(plan2?.start_date).toBe(chosen);
    expect(isStartDateSet(plan2!)).toBe(true);
  });

  it("setCurrentWeekToday(N): hoje vira o INICIO da semana N", async () => {
    const plan = await getPlan(db);
    const now = new Date(2026, 5, 24, 15, 30); // 24 jun 2026 15:30 local
    await setCurrentWeekToday(db, plan!, 5, now);

    const p = await getPlan(db);
    expect(currentWeek(p!, now.getTime())).toBe(5); // hoje = semana 5
    expect(currentWeek(p!, localMidnight(now) - 1)).toBe(4); // 1ms antes = semana 4
  });

  it("setCurrentWeekToday clampa [1,18] — observavel no start_date persistido, nao so via currentWeek", async () => {
    // DISCRIMINANTE: checar via currentWeek MASCARA o clamp (currentWeek re-clampa
    // por conta propria). Asseramos o start_date PERSISTIDO — se o Math.min/max
    // sumir, at99 != at18 e o teste fica vermelho.
    const plan = await getPlan(db);
    const now = new Date(2026, 5, 24);
    const mid = localMidnight(now);
    const WEEK = 7 * DAY_MS;

    await setCurrentWeekToday(db, plan!, 18, now);
    const at18 = (await getPlan(db))!.start_date;
    await setCurrentWeekToday(db, plan!, 99, now);
    const at99 = (await getPlan(db))!.start_date;
    expect(at99).toBe(at18); // clamp alto: 99 -> 18 (mesma ancora)
    expect(at18).toBe(mid - 17 * WEEK); // e o valor da semana 18, nao 98 semanas atras

    await setCurrentWeekToday(db, plan!, 1, now);
    const at1 = (await getPlan(db))!.start_date;
    await setCurrentWeekToday(db, plan!, -3, now);
    expect((await getPlan(db))!.start_date).toBe(at1); // clamp baixo: -3 -> 1
    expect(at1).toBe(mid); // semana 1 ancora hoje
    expect(currentWeek((await getPlan(db))!, now.getTime())).toBe(1);
  });

  it("repeatCurrentWeek: re-ancora a semana atual em hoje e empurra o resto 7 dias", async () => {
    await setStartDate(db, localMidnight(new Date(2026, 5, 1))); // comeca 1 jun
    let p = await getPlan(db);

    const day9 = new Date(2026, 5, 9, 10, 0); // 8 dias depois -> semana 2
    expect(currentWeek(p!, day9.getTime())).toBe(2);

    await repeatCurrentWeek(db, day9); // "nao treinei essa semana" (le o plano internamente)
    p = await getPlan(db);

    expect(currentWeek(p!, day9.getTime())).toBe(2); // continua na semana 2
    expect(currentWeek(p!, localMidnight(day9) - 1)).toBe(1); // hoje e o inicio dela
    // ganhou a semana: +6 dias ainda e 2; so vira 3 na semana seguinte
    expect(currentWeek(p!, localMidnight(day9) + 6 * DAY_MS)).toBe(2);
    expect(currentWeek(p!, localMidnight(day9) + 8 * DAY_MS)).toBe(3);
  });

  it("resolveSessionPhase: placeholder do seed => null (sem data real nao chuta a fase)", async () => {
    const phases = await getPhases(db, "pl_vertical_18w");
    const plan: PlanRow = {
      id: "pl_vertical_18w",
      name: "x",
      start_date: SEED_PLACEHOLDER_START_DATE,
      duration_weeks: 18,
    };
    expect(
      resolveSessionPhase(plan, phases, SEED_PLACEHOLDER_START_DATE + DAY_MS),
    ).toBeNull();
  });

  it("resolveSessionPhase: inicio no futuro => null (mesma guarda do PhaseBanner)", async () => {
    const phases = await getPhases(db, "pl_vertical_18w");
    const start = localMidnight(new Date(2026, 7, 12));
    const plan: PlanRow = { id: "pl_vertical_18w", name: "x", start_date: start, duration_weeks: 18 };
    expect(resolveSessionPhase(plan, phases, start - 1000)).toBeNull();
  });

  it("resolveSessionPhase: semana de M1 => enfase m1 (parent m1)", async () => {
    const phases = await getPhases(db, "pl_vertical_18w");
    const start = localMidnight(new Date(2026, 7, 12));
    const plan: PlanRow = { id: "pl_vertical_18w", name: "x", start_date: start, duration_weeks: 18 };
    const pc = resolveSessionPhase(plan, phases, start); // semana 1
    expect(pc?.emphasis).toBe("m1");
    expect(pc?.parentEmphasis).toBe("m1");
  });

  it("resolveSessionPhase: semana de deload => enfase deload, parent m1", async () => {
    const phases = await getPhases(db, "pl_vertical_18w");
    const start = localMidnight(new Date(2026, 7, 12));
    const WEEK = 7 * DAY_MS;
    const plan: PlanRow = { id: "pl_vertical_18w", name: "x", start_date: start, duration_weeks: 18 };
    const pc = resolveSessionPhase(plan, phases, start + 5 * WEEK); // semana 6 = deload 1
    expect(pc?.emphasis).toBe("deload");
    expect(pc?.parentEmphasis).toBe("m1"); // a recuperacao serve o bloco anterior
  });

  it("setStartDate rejeita NaN/Infinity pela PROPRIA guarda (nao pelo NOT NULL do schema)", async () => {
    // Casar a MENSAGEM do guard: se cair so no NOT NULL constraint, a regex falha.
    // E Infinity nem lanca sem o guard (vira ancora corrompida) — por isso entra.
    await expect(setStartDate(db, Number.NaN)).rejects.toThrow(/epochMs invalido/i);
    await expect(setStartDate(db, Number.POSITIVE_INFINITY)).rejects.toThrow(/epochMs invalido/i);
    await expect(setStartDate(db, Number.NEGATIVE_INFINITY)).rejects.toThrow(/epochMs invalido/i);
    // e nada gravou: a ancora segue o placeholder
    expect((await getPlan(db))?.start_date).toBe(SEED_PLACEHOLDER_START_DATE);
  });
});

// ---------------------------------------------------------------------------
// I-12 ESTRUTURAL (estatico) — planConfig e o UNICO modulo fora de sessions
// autorizado a escrever no plano, e SO a ancora: `UPDATE plan SET start_date`.
// Espelha o guard de sessions.test.ts, mas com a excecao explicita da ancora:
// le o source e falha se aparecer qualquer OUTRA escrita contra plano/catalogo
// (pega uma regressao futura mesmo sem fluxo que a exercite).
// ---------------------------------------------------------------------------
describe("planConfig — I-12 estrutural (estatico)", () => {
  it("so escreve `UPDATE plan SET start_date` — nenhuma outra escrita em plano/catalogo", async () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = await readFile(join(dir, "planConfig.ts"), "utf-8");

    // Nenhuma escrita contra as demais tabelas de plano/catalogo.
    const forbiddenTables = [
      "work_block_item",
      "work_block",
      "plan_phase",
      "exercise",
      "routine",
    ];
    for (const t of forbiddenTables) {
      const re = new RegExp(`(INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+${t}\\b`, "i");
      expect(re.test(src), `planConfig.ts nao deve escrever em ${t}`).toBe(false);
    }

    // Contra `plan`: nada de INSERT/DELETE; e todo UPDATE deve ser SET start_date.
    expect(/INSERT\s+INTO\s+plan\b/i.test(src), "nao deve INSERT em plan").toBe(false);
    expect(/DELETE\s+FROM\s+plan\b/i.test(src), "nao deve DELETE em plan").toBe(false);
    const planUpdates = src.match(/UPDATE\s+plan\s+SET\s+(\w+)/gi) ?? [];
    expect(planUpdates.length, "esperava ao menos um UPDATE plan SET start_date").toBeGreaterThan(0);
    for (const u of planUpdates) {
      expect(/UPDATE\s+plan\s+SET\s+start_date\b/i.test(u), `UPDATE plan nao-ancora: ${u}`).toBe(true);
    }
  });
});
