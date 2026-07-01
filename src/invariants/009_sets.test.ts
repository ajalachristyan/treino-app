import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { Database } from "../db/adapter.ts";
import { BetterSqlite3Adapter } from "../db/adapters/better-sqlite3.ts";
import { WaSqliteNodeAdapter } from "../db/adapters/wa-sqlite-node.ts";
import { applyMigrations } from "../db/runner.ts";
import { loadMigrations } from "../db/migrations.ts";
import { getWorkBlockItems } from "../data/plan.ts";

// ============================================================================
// migration 009: 3 series de alvo nos itens de TRABALHO da terca/quinta (forca).
// Aquecimento fica sem alvo (NULL); salto/mobilidade/core intocados.
// ============================================================================

type AdapterFactory = (path: string) => Promise<Database>;
const engines: ReadonlyArray<readonly [string, AdapterFactory]> = [
  ["better-sqlite3", (p) => BetterSqlite3Adapter.open(p)],
  ["wa-sqlite-node", (p) => WaSqliteNodeAdapter.open(p)],
];

describe.each(engines)("migration 009 — 3 series ter/qui — %s", (_name, openDb) => {
  let db: Database;

  beforeEach(async () => {
    db = await openDb(":memory:");
    await applyMigrations(db, loadMigrations);
  });

  afterEach(async () => {
    await db.close();
  });

  it("forca (ter/qui): trabalho = 3 series; aquecimento = sem alvo (NULL)", async () => {
    for (const wb of ["wb_ter_forca", "wb_qui_superior"]) {
      const items = await getWorkBlockItems(db, wb);
      expect(items.length).toBeGreaterThan(0);
      for (const it of items) {
        if (it.is_warmup === 1) {
          expect(it.planned_sets, `${it.exercise_id} (aquecimento)`).toBeNull();
        } else {
          expect(it.planned_sets, `${it.exercise_id} (trabalho)`).toBe(3);
        }
      }
    }
  });

  it("salto nao foi tocado (segue sem alvo de series)", async () => {
    const sex = await getWorkBlockItems(db, "wb_sex_salto_m1");
    expect(sex.length).toBeGreaterThan(0);
    expect(sex.every((it) => it.planned_sets === null)).toBe(true);
  });
});
