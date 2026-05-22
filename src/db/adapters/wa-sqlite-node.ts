// =============================================================================
// Adapter para wa-sqlite rodando em Node (USADO APENAS NOS TESTES, como espelho
// do engine de producao).
//
// Em producao (browser), wa-sqlite carrega o WASM via fetch e usa OPFS como
// VFS persistente. Em Node, fetch nao funciona com URL file:// e nao ha OPFS;
// providenciamos o WASM como buffer (via import.meta.resolve + readFile) e o
// default VFS in-memory cobre todos os testes :memory:.
//
// Por que existe: a interface src/db/adapter.ts foi desenhada async-first
// precisamente para que os testes de invariante (Passo 5) rodem PARAMETRIZADOS
// nos dois engines (this + better-sqlite3). Garante que um CHECK/trigger que
// passa no teste tambem se comporta identico no engine de producao alvo.
//
// VERSAO DO SQLITE: 3.44.0 (wa-sqlite npm 1.0.0, jan/2024).
// Comparar com better-sqlite3 (SQLite 3.53.1). Ver DECISIONS.md para o gatilho
// de revisao da versao de producao.
//
// PROPAGACAO DE ERRO: o Factory do wa-sqlite envolve `step` e dispara
// SQLiteError automaticamente em rc de erro (CHECK violation, FK, NOT NULL etc).
// Empiricamente verificado: INSERT violando CHECK lanca SQLiteError com a
// mensagem do banco. As checagens `if (rc !== SQLITE_DONE) throw` abaixo sao
// HEDGE DEFENSIVO: se um dia o Factory afrouxar esse wrap, OU se um rc
// obscuro escapar (ex.: SQLITE_BUSY num modo especifico), o adapter falha
// LOUD em vez de engolir silenciosamente. O canario (Teste 0 em runner.test.ts)
// trava a propriedade "INSERT que viola CHECK lanca" como invariante do
// proprio adapter.
// =============================================================================

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import SQLiteESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs";
import * as SQLite from "wa-sqlite";

import type { Database } from "../adapter.ts";

const SQLITE_ROW = 100;
const SQLITE_DONE = 101;

type BindValue = string | number | bigint | null | Uint8Array;

interface WaSqliteApi {
  open_v2(path: string, flags?: number, vfs?: string): Promise<number>;
  close(db: number): Promise<number>;
  exec(
    db: number,
    sql: string,
    callback?: (row: unknown[], cols: string[]) => void,
  ): Promise<number>;
  statements(db: number, sql: string): AsyncIterable<number>;
  step(stmt: number): Promise<number>;
  finalize(stmt: number): Promise<number>;
  bind(stmt: number, i: number, value: BindValue): number;
  column_names(stmt: number): string[];
  row(stmt: number): unknown[];
}

let cachedApi: WaSqliteApi | null = null;

async function getWaSqliteApi(): Promise<WaSqliteApi> {
  if (cachedApi) return cachedApi;
  const wasmUrl = import.meta.resolve("wa-sqlite/dist/wa-sqlite-async.wasm");
  const wasmBinary = await readFile(fileURLToPath(wasmUrl));
  const module = await SQLiteESMFactory({ wasmBinary });
  cachedApi = SQLite.Factory(module) as WaSqliteApi;
  return cachedApi;
}

export class WaSqliteNodeAdapter implements Database {
  private constructor(
    private readonly sqlite3: WaSqliteApi,
    private readonly dbHandle: number,
  ) {}

  static async open(path: string): Promise<WaSqliteNodeAdapter> {
    const sqlite3 = await getWaSqliteApi();
    const dbHandle = await sqlite3.open_v2(path);
    const adapter = new WaSqliteNodeAdapter(sqlite3, dbHandle);

    // FK eh per-connection (igual better-sqlite3); sem isso o schema fica
    // com FK decorativas.
    await adapter.pragma("foreign_keys", "ON");

    // WAL/synchronous: nao se aplicam ao :memory: nem ao default VFS
    // in-memory do wa-sqlite em Node. Em producao (OPFS), o adapter de
    // browser cuida disso conforme a particularidade do OPFS.
    return adapter;
  }

  async exec(sql: string): Promise<void> {
    await this.sqlite3.exec(this.dbHandle, sql);
  }

  async run(sql: string, params: readonly unknown[] = []): Promise<void> {
    for await (const stmt of this.sqlite3.statements(this.dbHandle, sql)) {
      this.bindAll(stmt, params);
      const rc = await this.sqlite3.step(stmt);
      // Hedge defensivo (ver cabecalho): em erro, o step ja teria lancado;
      // se chegou aqui com rc !== DONE, algo escapou. Falha LOUD.
      if (rc !== SQLITE_DONE) {
        throw new Error(
          `wa-sqlite: unexpected step rc in run(): ${rc} ` +
            `(expected SQLITE_DONE=${SQLITE_DONE})`,
        );
      }
    }
  }

  async get<T = unknown>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T | undefined> {
    let result: T | undefined = undefined;
    for await (const stmt of this.sqlite3.statements(this.dbHandle, sql)) {
      this.bindAll(stmt, params);
      if (result === undefined) {
        const rc = await this.sqlite3.step(stmt);
        if (rc === SQLITE_ROW) {
          result = this.rowToObject<T>(stmt);
        } else if (rc !== SQLITE_DONE) {
          // Hedge: rc inesperado eh erro nao-lancado pelo Factory. Falha LOUD.
          throw new Error(
            `wa-sqlite: unexpected step rc in get(): ${rc} ` +
              `(expected ROW=${SQLITE_ROW} or DONE=${SQLITE_DONE})`,
          );
        }
      }
    }
    return result;
  }

  async all<T = unknown>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    const rows: T[] = [];
    for await (const stmt of this.sqlite3.statements(this.dbHandle, sql)) {
      this.bindAll(stmt, params);
      while (true) {
        const rc = await this.sqlite3.step(stmt);
        if (rc === SQLITE_DONE) break;
        if (rc !== SQLITE_ROW) {
          // Hedge: rc inesperado eh erro nao-lancado pelo Factory. Falha LOUD.
          throw new Error(
            `wa-sqlite: unexpected step rc in all(): ${rc} ` +
              `(expected ROW=${SQLITE_ROW} or DONE=${SQLITE_DONE})`,
          );
        }
        rows.push(this.rowToObject<T>(stmt));
      }
    }
    return rows;
  }

  async pragma(name: string, value?: string | number): Promise<unknown> {
    if (value !== undefined) {
      await this.sqlite3.exec(this.dbHandle, `PRAGMA ${name} = ${value}`);
      return undefined;
    }
    let result: unknown = undefined;
    await this.sqlite3.exec(
      this.dbHandle,
      `PRAGMA ${name}`,
      (row: unknown[]) => {
        if (result === undefined) result = row[0];
      },
    );
    return result;
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.sqlite3.exec(this.dbHandle, "BEGIN");
    let result: T;
    try {
      result = await fn();
    } catch (err) {
      try {
        await this.sqlite3.exec(this.dbHandle, "ROLLBACK");
      } catch {
        // ja abortada por constraint; estado consistente.
      }
      throw err;
    }
    await this.sqlite3.exec(this.dbHandle, "COMMIT");
    return result;
  }

  async close(): Promise<void> {
    await this.sqlite3.close(this.dbHandle);
  }

  private bindAll(stmt: number, params: readonly unknown[]): void {
    for (let i = 0; i < params.length; i++) {
      this.sqlite3.bind(stmt, i + 1, params[i] as BindValue);
    }
  }

  private rowToObject<T>(stmt: number): T {
    const cols = this.sqlite3.column_names(stmt);
    const vals = this.sqlite3.row(stmt);
    const row: Record<string, unknown> = {};
    for (let i = 0; i < cols.length; i++) {
      row[cols[i] as string] = vals[i];
    }
    return row as T;
  }
}
