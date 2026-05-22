// =============================================================================
// Adapter sincrono -> assincrono para better-sqlite3.
//
// Cada metodo envolve uma chamada sincrona de better-sqlite3 num
// Promise.resolve, satisfazendo a interface Database (async-first) sem
// custo real. Usado nos testes; em producao (browser), o adapter equivalente
// para wa-sqlite entra no Passo 5.
//
// PRAGMAs ligados no `open()`:
//   - foreign_keys = ON   (sempre — sem isso, FK eh declarativa apenas)
//   - journal_mode = WAL  (so para DBs em disco; :memory: nao suporta)
//   - synchronous = NORMAL (so para DBs em disco; default seguro com WAL)
// =============================================================================

import Database from "better-sqlite3";
import type { Database as IDatabase } from "../adapter.ts";

type BetterSqliteDb = Database.Database;

export class BetterSqlite3Adapter implements IDatabase {
  private readonly db: BetterSqliteDb;

  private constructor(db: BetterSqliteDb) {
    this.db = db;
  }

  /**
   * Abre conexao e configura PRAGMAs criticos. `path` pode ser ':memory:'
   * para testes ou um caminho de arquivo para uso real.
   */
  static async open(path: string): Promise<BetterSqlite3Adapter> {
    const db = new Database(path);
    const adapter = new BetterSqlite3Adapter(db);

    // FK eh per-connection no SQLite e o schema 001_init.sql depende dela.
    await adapter.pragma("foreign_keys", "ON");

    if (path !== ":memory:") {
      // WAL e synchronous=NORMAL nao se aplicam a :memory:.
      await adapter.pragma("journal_mode", "WAL");
      await adapter.pragma("synchronous", "NORMAL");
    }

    return adapter;
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async run(sql: string, params: readonly unknown[] = []): Promise<void> {
    this.db.prepare(sql).run(...(params as unknown[]));
  }

  async get<T = unknown>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T | undefined> {
    return this.db.prepare(sql).get(...(params as unknown[])) as T | undefined;
  }

  async all<T = unknown>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    return this.db.prepare(sql).all(...(params as unknown[])) as T[];
  }

  async pragma(name: string, value?: string | number): Promise<unknown> {
    if (value !== undefined) {
      this.db.pragma(`${name} = ${value}`);
      return undefined;
    }
    // simple: true => retorna o primeiro valor da primeira linha (escalar)
    return this.db.pragma(name, { simple: true });
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    this.db.exec("BEGIN");
    let result: T;
    try {
      result = await fn();
    } catch (err) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // ROLLBACK pode falhar se a transacao ja foi abortada por erro
        // de constraint. Ignoramos: o estado ja eh consistente.
      }
      throw err;
    }
    this.db.exec("COMMIT");
    return result;
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
