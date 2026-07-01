import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { Database } from "../db/adapter.ts";
import { BetterSqlite3Adapter } from "../db/adapters/better-sqlite3.ts";
import { WaSqliteNodeAdapter } from "../db/adapters/wa-sqlite-node.ts";
import { applyMigrations } from "../db/runner.ts";
import { loadMigrations } from "../db/migrations.ts";

// ============================================================================
// migration 008: textos didaticos + torácica sem rolo. So UPDATE de name/how_to
// (nada imutavel). Trava que o retexto entrou e nao mexeu em progression_type.
// ============================================================================

type AdapterFactory = (path: string) => Promise<Database>;
const engines: ReadonlyArray<readonly [string, AdapterFactory]> = [
  ["better-sqlite3", (p) => BetterSqlite3Adapter.open(p)],
  ["wa-sqlite-node", (p) => WaSqliteNodeAdapter.open(p)],
];

describe.each(engines)("migration 008 didactic how_to — %s", (_name, openDb) => {
  let db: Database;

  beforeEach(async () => {
    db = await openDb(":memory:");
    await applyMigrations(db, loadMigrations);
  });

  afterEach(async () => {
    await db.close();
  });

  it("torácica: nome nao cita mais so 'rolo' e how_to da opcao sem rolo", async () => {
    const ex = await db.get<{
      name: string;
      how_to: string | null;
      progression_type: string;
    }>(
      "SELECT name, how_to, progression_type FROM exercise WHERE id = 'ex_extensao_toracica_rolo'",
    );
    expect(ex?.name).toMatch(/cadeira|toalha/i);
    expect(ex?.how_to).toMatch(/toalha/i);
    expect(ex?.how_to).toMatch(/cadeira/i);
    expect(ex?.progression_type).toBe("time_under_tension"); // intacto
  });

  it("aquecimento: how_to agora define 'pogos'", async () => {
    const ex = await db.get<{ how_to: string | null }>(
      "SELECT how_to FROM exercise WHERE id = 'ex_aquecimento_dinamico'",
    );
    expect(ex?.how_to).toMatch(/pogos/i);
    expect(ex?.how_to).toMatch(/saltinhos/i); // a definicao leiga entrou
  });
});
