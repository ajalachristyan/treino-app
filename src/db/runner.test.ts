import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BetterSqlite3Adapter } from "./adapters/better-sqlite3.ts";
import { applyMigrations, currentSchemaVersion } from "./runner.ts";

describe("migration runner — better-sqlite3", () => {
  let db: BetterSqlite3Adapter;

  beforeEach(async () => {
    db = await BetterSqlite3Adapter.open(":memory:");
  });

  afterEach(async () => {
    await db.close();
  });

  // ===========================================================================
  // 1. Zero -> v1: aplicar do zero leva o banco a versao 1.
  // ===========================================================================
  it("apply from empty db brings schema to version 1", async () => {
    expect(await currentSchemaVersion(db)).toBe(0);

    await applyMigrations(db);

    expect(await currentSchemaVersion(db)).toBe(1);

    // sanity: algumas tabelas-chave existem
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
    await applyMigrations(db);
    const versionsAfterFirst = await db.all<{ version: number }>(
      `SELECT version FROM schema_version`,
    );

    await applyMigrations(db);
    const versionsAfterSecond = await db.all<{ version: number }>(
      `SELECT version FROM schema_version`,
    );

    expect(versionsAfterFirst).toHaveLength(1);
    expect(versionsAfterSecond).toHaveLength(1);
    expect(await currentSchemaVersion(db)).toBe(1);
  });

  // ===========================================================================
  // 3. FK ON: foreign_keys eh ON apos open (PRAGMA per-connection).
  //    Sem isso, as FKs declaradas no schema sao decorativas.
  // ===========================================================================
  it("foreign_keys is ON after adapter open", async () => {
    const fk = await db.pragma("foreign_keys");
    expect(fk).toBe(1);
  });

  // ===========================================================================
  // 4. Rollback on error: erro no meio de uma transacao deixa o banco limpo.
  //    Testa o contrato do db.transaction() que o runner usa.
  // ===========================================================================
  it("transaction rolls back on error — db stays clean", async () => {
    await expect(
      db.transaction(async () => {
        await db.exec("CREATE TABLE rollback_canary (id INTEGER PRIMARY KEY)");

        // sanity mid-transaction: tabela existe
        const midTx = await db.get<{ name: string }>(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='rollback_canary'`,
        );
        expect(midTx?.name).toBe("rollback_canary");

        throw new Error("simulated mid-migration failure");
      }),
    ).rejects.toThrow("simulated mid-migration failure");

    // Apos o ROLLBACK, a tabela NAO deve existir.
    const postRollback = await db.get<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='rollback_canary'`,
    );
    expect(postRollback).toBeUndefined();
  });
});
