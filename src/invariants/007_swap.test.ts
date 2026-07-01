import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { Database } from "../db/adapter.ts";
import { BetterSqlite3Adapter } from "../db/adapters/better-sqlite3.ts";
import { WaSqliteNodeAdapter } from "../db/adapters/wa-sqlite-node.ts";
import { applyMigrations } from "../db/runner.ts";
import { loadMigrations } from "../db/migrations.ts";
import { getWorkBlockItems } from "../data/plan.ts";

// ============================================================================
// migration 007: na terca (wb_ter_forca), troca panturrilha sentada -> em pe e
// Nordic -> hiperextensao/back extension (gluteo). Descontinua (active=0) os
// antigos (preservados p/ FK + historico) e adiciona os novos. Conta ATIVA
// da terca fica igual (6): tira 2, poe 2.
// ============================================================================

type AdapterFactory = (path: string) => Promise<Database>;
const engines: ReadonlyArray<readonly [string, AdapterFactory]> = [
  ["better-sqlite3", (p) => BetterSqlite3Adapter.open(p)],
  ["wa-sqlite-node", (p) => WaSqliteNodeAdapter.open(p)],
];

describe.each(engines)("migration 007 swap ter-forca — %s", (_name, openDb) => {
  let db: Database;

  beforeEach(async () => {
    db = await openDb(":memory:");
    await applyMigrations(db, loadMigrations);
  });

  afterEach(async () => {
    await db.close();
  });

  it("terca ATIVA: back extension e panturrilha em pe entram; nordic e sentada saem", async () => {
    const items = await getWorkBlockItems(db, "wb_ter_forca");
    const ids = items.map((i) => i.exercise_id);
    expect(ids).toContain("ex_back_extension");
    expect(ids).toContain("ex_panturrilha_em_pe");
    expect(ids).not.toContain("ex_nordic");
    expect(ids).not.toContain("ex_panturrilha_sentada");
    expect(items).toHaveLength(6); // tira 2, poe 2
    // aquecimento continua sendo o primeiro (I-7 no seed nao regride)
    expect(items[0]?.is_warmup).toBe(1);
  });

  it("os antigos seguem no catalogo, so DESCONTINUADOS (active=0) no bloco", async () => {
    const ex = await db.all<{ id: string }>(
      "SELECT id FROM exercise WHERE id IN ('ex_nordic','ex_panturrilha_sentada')",
    );
    expect(ex).toHaveLength(2); // historico das sessoes passadas segue honesto
    const inactive = await db.all<{ active: number }>(
      "SELECT active FROM work_block_item WHERE id IN ('wbi_ter_5','wbi_ter_6') ORDER BY id",
    );
    expect(inactive.map((r) => r.active)).toEqual([0, 0]);
  });

  it("back extension entrou no catalogo com load_reps + how_to de gluteo", async () => {
    const ex = await db.get<{
      progression_type: string;
      how_to: string | null;
      category: string | null;
    }>(
      "SELECT progression_type, how_to, category FROM exercise WHERE id = 'ex_back_extension'",
    );
    expect(ex?.progression_type).toBe("load_reps");
    expect(ex?.category).toBe("forca");
    expect(ex?.how_to).toMatch(/gluteo/i);
  });
});
