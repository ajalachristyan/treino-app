import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "./adapter.ts";
import { BetterSqlite3Adapter } from "./adapters/better-sqlite3.ts";
import { WaSqliteNodeAdapter } from "./adapters/wa-sqlite-node.ts";
import { applyMigrations, currentSchemaVersion } from "./runner.ts";
import { loadMigrations } from "./migrations.ts";

// ============================================================================
// LEVA 1 do Passo 5 — INFRAESTRUTURA DE TESTE.
//
// A MESMA suite roda contra os dois engines (describe.each parametriza).
//
//   - better-sqlite3 (SQLite 3.53.1) — engine de teste rapido (native binding).
//   - wa-sqlite-node (SQLite 3.44.0) — espelho do engine de producao (WASM).
//
// Objetivo: fechar a fresta "teste verde no engine A, comportamento diferente
// no engine B". Drift de ~9 minor versions entre 3.44 e 3.53 (ver DECISIONS.md).
//
// Test 0 (canario) eh o primeiro de tudo: prova que o adapter PROPAGA erro
// de constraint como excecao. Sem isso, os 15 invariantes da leva 2 seriam
// teatro — INSERTs que deveriam falhar pareceriam passar e os .toThrow()
// dos testes ficariam mentindo. Mesmo o wa-sqlite hoje lancando SQLiteError
// automaticamente, o canario trava essa propriedade como invariante do
// proprio adapter; se um dia parar, cai aqui antes de qualquer outro.
// ============================================================================

type AdapterFactory = (path: string) => Promise<Database>;

const engines: ReadonlyArray<readonly [string, AdapterFactory]> = [
  ["better-sqlite3", (p) => BetterSqlite3Adapter.open(p)],
  ["wa-sqlite-node", (p) => WaSqliteNodeAdapter.open(p)],
];

describe.each(engines)("db adapter + runner — %s", (_engineName, openDb) => {
  let db: Database;

  beforeEach(async () => {
    db = await openDb(":memory:");
  });

  afterEach(async () => {
    await db.close();
  });

  // ===========================================================================
  // TEST 0 — CANARIO: INSERT que viola CHECK LANCA, nao engole.
  // Pre-requisito de validade de tudo que vem depois (especialmente leva 2).
  // ===========================================================================
  it("CANARY — INSERT que viola CHECK lanca (exec e run)", async () => {
    await db.exec("CREATE TABLE canary (x INTEGER CHECK (x > 0))");

    // via db.exec (caminho da migracao)
    await expect(
      db.exec("INSERT INTO canary (x) VALUES (-1)"),
    ).rejects.toThrow();

    // via db.run (caminho com bind de parametros)
    await expect(
      db.run("INSERT INTO canary (x) VALUES (?)", [-2]),
    ).rejects.toThrow();

    // Confirma que nenhuma das tentativas pegou: tabela deve estar vazia.
    const count = await db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM canary",
    );
    expect(count?.n).toBe(0);
  });

  // ===========================================================================
  // 1. Zero -> v1: aplicar do zero leva o banco a versao 1.
  // ===========================================================================
  it("apply from empty db brings schema to version 1", async () => {
    expect(await currentSchemaVersion(db)).toBe(0);

    await applyMigrations(db, loadMigrations);

    expect(await currentSchemaVersion(db)).toBe(1);

    const tables = await db.all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
    );
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("exercise");
    expect(tableNames).toContain("session");
    expect(tableNames).toContain("session_set");
    expect(tableNames).toContain("jump_test");
    expect(tableNames).toContain("schema_version");
  });

  // ===========================================================================
  // 2. Idempotencia: aplicar duas vezes nao duplica versao nem quebra.
  // ===========================================================================
  it("apply twice is idempotent — second call is no-op", async () => {
    await applyMigrations(db, loadMigrations);
    const versionsAfterFirst = await db.all<{ version: number }>(
      `SELECT version FROM schema_version`,
    );

    await applyMigrations(db, loadMigrations);
    const versionsAfterSecond = await db.all<{ version: number }>(
      `SELECT version FROM schema_version`,
    );

    expect(versionsAfterFirst).toHaveLength(1);
    expect(versionsAfterSecond).toHaveLength(1);
    expect(await currentSchemaVersion(db)).toBe(1);
  });

  // ===========================================================================
  // 3. FK ON: foreign_keys eh ON apos open (PRAGMA per-connection).
  // ===========================================================================
  it("foreign_keys is ON after adapter open", async () => {
    const fk = await db.pragma("foreign_keys");
    expect(fk).toBe(1);
  });

  // ===========================================================================
  // 4. Rollback on error: erro no meio de uma transacao deixa o banco limpo.
  // ===========================================================================
  it("transaction rolls back on error — db stays clean", async () => {
    await expect(
      db.transaction(async () => {
        await db.exec("CREATE TABLE rollback_canary (id INTEGER PRIMARY KEY)");

        const midTx = await db.get<{ name: string }>(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='rollback_canary'`,
        );
        expect(midTx?.name).toBe("rollback_canary");

        throw new Error("simulated mid-migration failure");
      }),
    ).rejects.toThrow("simulated mid-migration failure");

    const postRollback = await db.get<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='rollback_canary'`,
    );
    expect(postRollback).toBeUndefined();
  });
});
