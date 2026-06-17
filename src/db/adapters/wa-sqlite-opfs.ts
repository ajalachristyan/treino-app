// =============================================================================
// Adapter para wa-sqlite rodando no BROWSER com persistencia em OPFS.
//
// Este e o engine de PRODUCAO alvo (PWA local-first no celular). O SQL e a
// logica de step/bind/transaction sao IDENTICOS ao wa-sqlite-node.ts — a JS
// API do wa-sqlite e a mesma. So mudam (a) o carregamento do WASM e (b) o VFS:
//   - Node:    WASM via readFile + default VFS in-memory.
//   - Browser: WASM via URL do Vite (?url) + AccessHandlePoolVFS sobre OPFS.
//
// BUILD SINCRONO: usamos wa-sqlite.mjs/.wasm (NAO o -async). O AccessHandlePool
// VFS usa FileSystemSyncAccessHandle (metodos sincronos) e o proprio docblock
// dele diz que casa com o build regular do SQLite (sem Asyncify). Por isso a
// JS API continua expondo step/exec como Promise (o Factory envolve), mas o
// VFS por baixo nao precisa do Asyncify.
//
// D1 (PONTO DE REVISAO — journaling em OPFS): NAO ligamos WAL/synchronous as
// cegas aqui. O AccessHandlePoolVFS tem caracteristicas proprias de journaling
// (arquivos de journal/WAL vivem no mesmo diretorio flat). A decisao de modo
// de journal sobre OPFS e o gatilho de revisao do engine de producao estao no
// DECISIONS.md — NAO selar nesta spike.
//
// PROPAGACAO DE ERRO: identica ao node adapter — o Factory envolve `step` e
// dispara em rc de erro; os `if (rc !== SQLITE_DONE) throw` sao hedge defensivo
// (falha LOUD se algum rc obscuro escapar).
// =============================================================================

import SQLiteESMFactory from "wa-sqlite/dist/wa-sqlite.mjs";
import * as SQLite from "wa-sqlite";
import { AccessHandlePoolVFS } from "wa-sqlite/src/examples/AccessHandlePoolVFS.js";
import wasmUrl from "wa-sqlite/dist/wa-sqlite.wasm?url";

import type { Database } from "../adapter.ts";

const SQLITE_ROW = 100;
const SQLITE_DONE = 101;

// Diretorio flat em OPFS onde o AccessHandlePoolVFS guarda seus arquivos.
const OPFS_DIR = "/treino-opfs";

// Nome fixo do arquivo de banco. Callers passam um `path` por paridade de
// interface (igual ao node adapter), mas no browser o nome real e fixo — o
// que persiste em OPFS e a identidade do app, nao o caminho que o caller pediu.
const DB_FILENAME = "treino.sqlite";

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
  vfs_register(vfs: unknown, makeDefault?: boolean): number;
}

// O Factory do WASM + o AccessHandlePoolVFS sao criados e registrados UMA vez
// por pagina (singleton), NAO a cada open(). Motivo: o VFS adquire
// SyncAccessHandles EXCLUSIVOS do OPFS e os mantem pelo tempo de vida da pagina
// — close() fecha a CONEXAO, nao devolve os handles do VFS. Se cada open()
// criasse um VFS novo, a 2a chamada na MESMA aba colidiria com os handles ainda
// presos pela 1a (erro espurio de "outra aba" na segunda acao). Espelha o
// cachedApi do wa-sqlite-node.ts.
let cachedApi: WaSqliteApi | null = null;

async function getOpfsApi(): Promise<WaSqliteApi> {
  if (cachedApi) return cachedApi;
  const module = await SQLiteESMFactory({ locateFile: () => wasmUrl });
  const sqlite3 = SQLite.Factory(module) as WaSqliteApi;
  // Acquire do OPFS: so falha aqui se OUTRA aba/instancia ja segura os handles.
  const vfs = new AccessHandlePoolVFS(OPFS_DIR);
  await vfs.isReady;
  sqlite3.vfs_register(vfs, true); // makeDefault => open_v2 sem vfs usa este.
  cachedApi = sqlite3;
  return sqlite3;
}

export class WaSqliteOpfsAdapter implements Database {
  private constructor(
    private readonly sqlite3: WaSqliteApi,
    private readonly dbHandle: number,
  ) {}

  static async open(path: string): Promise<WaSqliteOpfsAdapter> {
    // O `path` do caller e ignorado para o nome real (ver DB_FILENAME); mantido
    // na assinatura por paridade com a interface Database.
    void path;

    // Factory + VFS sao singleton por pagina (ver getOpfsApi). So lanca aqui se
    // OUTRA aba/instancia ja segura os SyncAccessHandles do OPFS.
    let sqlite3: WaSqliteApi;
    try {
      sqlite3 = await getOpfsApi();
    } catch (err) {
      throw new Error(
        "treino-app: nao foi possivel abrir o OPFS (provavelmente aberto em " +
          "outra aba/instancia). Feche as outras abas e recarregue.",
        { cause: err },
      );
    }

    const dbHandle = await sqlite3.open_v2(DB_FILENAME);
    const adapter = new WaSqliteOpfsAdapter(sqlite3, dbHandle);

    // FK eh per-connection (igual better-sqlite3 e ao node adapter); sem isso o
    // schema fica com FK decorativas.
    await adapter.pragma("foreign_keys", "ON");

    // WAL/synchronous: ver cabecalho (D1). NAO ligar aqui sem revisao.
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

  /**
   * "Hard reset" da spike: apaga o diretorio do AccessHandlePoolVFS em OPFS.
   * Best-effort — engole erro se o diretorio nao existir ainda. Deve ser
   * chamado com o banco FECHADO (sem handles abertos) para nao colidir com os
   * SyncAccessHandles do VFS.
   */
  static async deleteDatabase(): Promise<void> {
    const root = await navigator.storage.getDirectory();
    try {
      // removeEntry nao aceita "/" no nome; usa o nome do diretorio sem a barra.
      await root.removeEntry(OPFS_DIR.replace(/^\//, ""), { recursive: true });
    } catch {
      // diretorio inexistente ou ja removido — no-op.
    }
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
