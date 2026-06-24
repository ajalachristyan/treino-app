import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { Database } from "../db/adapter.ts";
import { BetterSqlite3Adapter } from "../db/adapters/better-sqlite3.ts";
import { WaSqliteNodeAdapter } from "../db/adapters/wa-sqlite-node.ts";
import { applyMigrations } from "../db/runner.ts";
import { loadMigrations } from "../db/migrations.ts";

// ============================================================================
// Seed determinístico (migrations/002_seed_plan.sql) — contrato ESTRUTURAL.
//
// Não trava a contagem exata de exercícios (isso é refinado pelo dono no
// checkpoint 3); trava as propriedades que NÃO podem regredir: deloads/taper nas
// semanas certas, fases contíguas, 1 rotina de mobilidade referenciada (não
// copiada), aquecimento marcado (I-7), nenhum exercise contact_time (I-6), e o
// seed não cria observação (só catálogo + intenção).
// ============================================================================

type AdapterFactory = (path: string) => Promise<Database>;

const engines: ReadonlyArray<readonly [string, AdapterFactory]> = [
  ["better-sqlite3", (p) => BetterSqlite3Adapter.open(p)],
  ["wa-sqlite-node", (p) => WaSqliteNodeAdapter.open(p)],
];

describe.each(engines)("seed 002_seed_plan — %s", (_name, openDb) => {
  let db: Database;

  beforeEach(async () => {
    db = await openDb(":memory:");
    await applyMigrations(db, loadMigrations); // 001 (schema) + 002 (seed)
  });

  afterEach(async () => {
    await db.close();
  });

  it("aplica limpo e leva o schema a versao 2", async () => {
    const v = await db.get<{ v: number }>(
      "SELECT MAX(version) AS v FROM schema_version",
    );
    expect(v?.v).toBe(2);
  });

  it("cria exatamente 1 plano de 18 semanas", async () => {
    const plans = await db.all<{ duration_weeks: number }>(
      "SELECT duration_weeks FROM plan",
    );
    expect(plans).toHaveLength(1);
    expect(plans[0]?.duration_weeks).toBe(18);
  });

  it("as fases cobrem 1-18 contiguas, sem buraco nem sobreposicao", async () => {
    const phases = await db.all<{ week_start: number; week_end: number }>(
      "SELECT week_start, week_end FROM plan_phase ORDER BY week_start",
    );
    expect(phases.length).toBeGreaterThan(0);
    expect(phases[0]?.week_start).toBe(1);
    expect(phases[phases.length - 1]?.week_end).toBe(18);
    for (let i = 1; i < phases.length; i++) {
      expect(phases[i]?.week_start).toBe((phases[i - 1]?.week_end ?? 0) + 1);
    }
  });

  it("deloads comecam nas semanas 6, 10 e 18", async () => {
    const deloads = await db.all<{ week_start: number }>(
      "SELECT week_start FROM plan_phase WHERE is_deload = 1 ORDER BY week_start",
    );
    expect(deloads.map((p) => p.week_start)).toEqual([6, 10, 18]);
  });

  it("taper unico em 16-17", async () => {
    const taper = await db.all<{ week_start: number; week_end: number }>(
      "SELECT week_start, week_end FROM plan_phase WHERE is_taper = 1",
    );
    expect(taper).toHaveLength(1);
    expect(taper[0]?.week_start).toBe(16);
    expect(taper[0]?.week_end).toBe(17);
  });

  it("exatamente 1 rotina recorrente de mobilidade (referenciada, nao copiada)", async () => {
    const recurring = await db.all<{ id: string }>(
      "SELECT id FROM routine WHERE recurring = 1",
    );
    expect(recurring).toHaveLength(1);
  });

  it("todo work_block respeita o XOR plan/routine", async () => {
    // (plan_id IS NULL) = (routine_id IS NULL) => ambos preenchidos ou ambos
    // vazios => viola o XOR. Deve dar zero.
    const bad = await db.all(
      "SELECT id FROM work_block WHERE (plan_id IS NULL) = (routine_id IS NULL)",
    );
    expect(bad).toHaveLength(0);
  });

  it("todo bloco de treino (Ter/Qui/Sex) comeca com o aquecimento marcado", async () => {
    // I-7 estrutural no SEED: o aquecimento esta marcado is_warmup onde deve.
    // (A exclusao do aquecimento de progressao/volume — o coracao do I-7 — e
    // testada nos testes de ENGINE, nao aqui.)
    const trainingBlocks = [
      "wb_ter_forca",
      "wb_qui_superior",
      "wb_sex_salto_m1",
      "wb_sex_salto_m2",
      "wb_sex_salto_m3",
    ];
    for (const wb of trainingBlocks) {
      const first = await db.get<{ is_warmup: number }>(
        `SELECT is_warmup FROM work_block_item
         WHERE work_block_id = ? ORDER BY planned_sequence LIMIT 1`,
        [wb],
      );
      expect(first?.is_warmup, `bloco ${wb} deve comecar com aquecimento`).toBe(
        1,
      );
    }
  });

  it("I-6: nenhum exercise usa progression_type contact_time (vive em jump_test)", async () => {
    const ct = await db.all(
      "SELECT id FROM exercise WHERE progression_type = 'contact_time'",
    );
    expect(ct).toHaveLength(0);
  });

  it("os pliometricos SAO contact_quality (trava o mapeamento, nao so 'nao contact_time')", async () => {
    // Assercao POSITIVA: um plio remapeado para jump_height/load_reps falha aqui
    // (o `not contact_time` sozinho deixaria passar — contact_time e enum valido
    // de exercise; o que I-6 proibe e session_set, coberto no check acima).
    const plyoIds = ["ex_drop_landings", "ex_bounce_drop_jumps", "ex_depth_jumps"];
    const rows = await db.all<{ id: string; progression_type: string }>(
      `SELECT id, progression_type FROM exercise
       WHERE id IN (${plyoIds.map(() => "?").join(", ")})`,
      plyoIds,
    );
    expect(rows).toHaveLength(plyoIds.length); // os 3 existem no seed
    for (const r of rows) {
      expect(r.progression_type, `${r.id} deve ser contact_quality`).toBe(
        "contact_quality",
      );
    }
  });

  it("o seed nao cria observacao — session/item/set/jump_test vazios", async () => {
    for (const t of [
      "session",
      "session_item",
      "session_set",
      "jump_test",
    ]) {
      const rows = await db.all(`SELECT 1 FROM ${t}`);
      expect(rows, `tabela ${t} deve estar vazia no seed`).toHaveLength(0);
    }
  });

  it("todo work_block_item aponta para um exercise existente (FK + integridade)", async () => {
    const orphan = await db.all(
      `SELECT wbi.id FROM work_block_item wbi
       LEFT JOIN exercise e ON e.id = wbi.exercise_id
       WHERE e.id IS NULL`,
    );
    expect(orphan).toHaveLength(0);
  });
});
