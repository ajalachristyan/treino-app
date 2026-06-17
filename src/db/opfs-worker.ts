// =============================================================================
// WEB WORKER que possui o wa-sqlite + OPFS REAL.
//
// POR QUE UM WORKER: o AccessHandlePoolVFS adquire FileSystemSyncAccessHandles
// via FileSystemFileHandle.createSyncAccessHandle(), que so existe em contexto
// de Web Worker (NAO na main thread). A spike provou em Chrome real:
// "createSyncAccessHandle is not a function" quando rodado na main thread. Por
// isso TODO o wa-sqlite + VFS vive aqui dentro; a main thread (wa-sqlite-opfs.ts)
// vira um proxy fino que conversa com este worker via postMessage RPC.
//
// BUILD SINCRONO: usamos wa-sqlite.mjs/.wasm (NAO o -async). O AccessHandlePool
// VFS usa FileSystemSyncAccessHandle (metodos sincronos) e o proprio docblock
// dele diz que casa com o build regular do SQLite (sem Asyncify). A JS API
// continua expondo step/exec como Promise (o Factory envolve), mas o VFS por
// baixo nao precisa do Asyncify.
//
// D1 (PONTO DE REVISAO — journaling em OPFS): NAO ligamos WAL/synchronous as
// cegas aqui. O AccessHandlePoolVFS tem caracteristicas proprias de journaling
// (arquivos de journal/WAL vivem no mesmo diretorio flat). A decisao de modo de
// journal sobre OPFS e o gatilho de revisao do engine de producao estao no
// DECISIONS.md — NAO selar nesta spike.
//
// PROPAGACAO DE ERRO: identica ao node adapter — o Factory envolve `step` e
// dispara em rc de erro; os `if (rc !== SQLITE_DONE) throw` sao hedge defensivo
// (falha LOUD se algum rc obscuro escapar). O onmessage abaixo captura qualquer
// throw e o devolve como { ok:false, error } para o proxy rejeitar — incluindo
// o canario de CHECK violation.
// =============================================================================

import SQLiteESMFactory from "wa-sqlite/dist/wa-sqlite.mjs";
import * as SQLite from "wa-sqlite";
import { AccessHandlePoolVFS } from "wa-sqlite/src/examples/AccessHandlePoolVFS.js";
import wasmUrl from "wa-sqlite/dist/wa-sqlite.wasm?url";

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
// por worker (singleton), NAO a cada open(). Motivo: o VFS adquire
// SyncAccessHandles EXCLUSIVOS do OPFS e os mantem pelo tempo de vida do worker
// — close() fecha a CONEXAO, nao devolve os handles do VFS. Como ha um worker
// por aba, isso espelha o "singleton por pagina" da versao antiga (e o cachedApi
// do wa-sqlite-node.ts). Mantemos UMA conexao (dbHandle) viva entre mensagens.
// doClose() zera estes campos apos fechar, para que um 'open' subsequente no
// MESMO worker (caso ele nao seja terminado) reinicialize do zero em vez de
// reusar uma conexao morta.
let sqlite3: WaSqliteApi | null = null;
let dbHandle: number | null = null;

// -----------------------------------------------------------------------------
// Helpers de execucao — copiados VERBATIM do antigo wa-sqlite-opfs.ts, agora
// operando no sqlite3/dbHandle locais do worker (ver getDb()).
// -----------------------------------------------------------------------------

function getDb(): { sqlite3: WaSqliteApi; dbHandle: number } {
  if (sqlite3 === null || dbHandle === null) {
    throw new Error("opfs-worker: banco nao aberto (envie 'open' primeiro).");
  }
  return { sqlite3, dbHandle };
}

function bindAll(api: WaSqliteApi, stmt: number, params: readonly unknown[]): void {
  for (let i = 0; i < params.length; i++) {
    api.bind(stmt, i + 1, params[i] as BindValue);
  }
}

function rowToObject<T>(api: WaSqliteApi, stmt: number): T {
  const cols = api.column_names(stmt);
  const vals = api.row(stmt);
  const row: Record<string, unknown> = {};
  for (let i = 0; i < cols.length; i++) {
    row[cols[i] as string] = vals[i];
  }
  return row as T;
}

async function doExec(sql: string): Promise<void> {
  const { sqlite3: api, dbHandle: db } = getDb();
  await api.exec(db, sql);
}

async function doRun(sql: string, params: readonly unknown[] = []): Promise<void> {
  const { sqlite3: api, dbHandle: db } = getDb();
  for await (const stmt of api.statements(db, sql)) {
    bindAll(api, stmt, params);
    const rc = await api.step(stmt);
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

async function doGet<T = unknown>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T | undefined> {
  const { sqlite3: api, dbHandle: db } = getDb();
  let result: T | undefined = undefined;
  for await (const stmt of api.statements(db, sql)) {
    bindAll(api, stmt, params);
    if (result === undefined) {
      const rc = await api.step(stmt);
      if (rc === SQLITE_ROW) {
        result = rowToObject<T>(api, stmt);
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

async function doAll<T = unknown>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const { sqlite3: api, dbHandle: db } = getDb();
  const rows: T[] = [];
  for await (const stmt of api.statements(db, sql)) {
    bindAll(api, stmt, params);
    while (true) {
      const rc = await api.step(stmt);
      if (rc === SQLITE_DONE) break;
      if (rc !== SQLITE_ROW) {
        // Hedge: rc inesperado eh erro nao-lancado pelo Factory. Falha LOUD.
        throw new Error(
          `wa-sqlite: unexpected step rc in all(): ${rc} ` +
            `(expected ROW=${SQLITE_ROW} or DONE=${SQLITE_DONE})`,
        );
      }
      rows.push(rowToObject<T>(api, stmt));
    }
  }
  return rows;
}

async function doPragma(
  name: string,
  value?: string | number,
): Promise<unknown> {
  const { sqlite3: api, dbHandle: db } = getDb();
  if (value !== undefined) {
    await api.exec(db, `PRAGMA ${name} = ${value}`);
    return undefined;
  }
  let result: unknown = undefined;
  await api.exec(db, `PRAGMA ${name}`, (row: unknown[]) => {
    if (result === undefined) result = row[0];
  });
  return result;
}

// -----------------------------------------------------------------------------
// Init lazy do engine (factory + VFS + conexao). So roda na 1a mensagem 'open'.
// -----------------------------------------------------------------------------

async function doOpen(): Promise<void> {
  if (sqlite3 !== null && dbHandle !== null) return; // idempotente

  const module = await SQLiteESMFactory({ locateFile: () => wasmUrl });
  const api = SQLite.Factory(module) as WaSqliteApi;

  // Acquire do OPFS: createSyncAccessHandle so funciona AQUI (no worker). So
  // falha se OUTRA aba/instancia ja segura os handles — o onmessage mapeia esse
  // throw para "OPFS_LOCKED" (ver abaixo).
  const vfs = new AccessHandlePoolVFS(OPFS_DIR);
  await vfs.isReady;
  api.vfs_register(vfs, true); // makeDefault => open_v2 sem vfs usa este.

  const handle = await api.open_v2(DB_FILENAME);

  // FK eh per-connection (igual better-sqlite3 e ao node adapter); sem isso o
  // schema fica com FK decorativas. WAL/synchronous: ver cabecalho (D1).
  await api.exec(handle, "PRAGMA foreign_keys = ON");

  sqlite3 = api;
  dbHandle = handle;
}

async function doClose(): Promise<void> {
  if (sqlite3 !== null && dbHandle !== null) {
    try {
      await sqlite3.close(dbHandle);
    } catch (closeErr) {
      // Loga e segue: mesmo se o close logico falhar, zeramos os globais
      // abaixo para nao deixar estado stale.
      console.error("opfs-worker: falha no close do banco:", closeErr);
    }
  }
  // Zera os globais do singleton: normalmente o proxy chama terminate() logo
  // apos o close (descartando o worker inteiro), mas se o worker NAO for
  // terminado, zerar aqui evita reusar uma conexao ja fechada (estado stale) —
  // um 'open' subsequente reinicializa do zero (doOpen e idempotente so quando
  // ambos os campos estao setados).
  sqlite3 = null;
  dbHandle = null;
}

// -----------------------------------------------------------------------------
// Protocolo RPC. Mensagens do proxy: { id, type, sql?, params?, name?, value? }.
// Resposta: { id, ok:true, result } | { id, ok:false, error }.
//
// CRITICO: uma violacao de constraint (o canario) chega aqui como throw do
// Factory; capturamos e devolvemos ok:false com a mensagem do banco, para o
// proxy rejeitar a Promise correspondente — preservando a propriedade "INSERT
// que viola CHECK lanca".
// -----------------------------------------------------------------------------

interface RpcRequest {
  id: number;
  type: "open" | "probe" | "exec" | "run" | "get" | "all" | "pragma" | "close";
  sql?: string;
  params?: unknown[];
  name?: string;
  value?: string | number;
}

// Resultado do probe de capacidades (ver doProbe). So flags de presenca de API,
// lidas no contexto do worker — sem efeito colateral.
interface ProbeResult {
  hasGetDirectory: boolean;
  hasCreateSyncAccessHandle: boolean;
  workerUserAgent: string;
}

// -----------------------------------------------------------------------------
// PROBE de capacidades (SEM efeito colateral). NAO instancia o
// AccessHandlePoolVFS (instanciar adquiriria os SyncAccessHandles EXCLUSIVOS e
// bloquearia o open real) e NAO abre o banco. So devolve flags de presenca das
// APIs de OPFS vistas DENTRO do worker — o que o botao Diagnostico do harness
// usa para distinguir "navegador embutido / sem OPFS" de "banco em outra aba".
// -----------------------------------------------------------------------------
function doProbe(): ProbeResult {
  const hasGetDirectory =
    typeof navigator?.storage?.getDirectory === "function";
  const hasCreateSyncAccessHandle =
    typeof FileSystemFileHandle !== "undefined" &&
    !!FileSystemFileHandle.prototype &&
    "createSyncAccessHandle" in FileSystemFileHandle.prototype;
  return {
    hasGetDirectory,
    hasCreateSyncAccessHandle,
    workerUserAgent: navigator.userAgent,
  };
}

self.onmessage = async (e: MessageEvent<RpcRequest>): Promise<void> => {
  const msg = e.data;
  const { id, type } = msg;
  try {
    let result: unknown;
    switch (type) {
      case "open":
        try {
          await doOpen();
        } catch (openErr) {
          // Loga a causa real no console do worker para depuracao (sempre).
          console.error("opfs-worker: falha ao abrir o OPFS:", openErr);
          // DESMASCARAR: antes, QUALQUER throw aqui virava "OPFS_LOCKED",
          // mascarando navegador embutido / OPFS ausente / modo privado como
          // se fosse disputa de aba. Agora so usamos "OPFS_LOCKED" se a
          // mensagem real indicar lock genuino; o resto sobe como
          // "OPFS_INIT_FAILED: <mensagem real>" para o proxy surfacar a causa.
          const realMsg =
            openErr instanceof Error ? openErr.message : String(openErr);
          const looksLikeLock = /lock|exclusive/i.test(realMsg);
          self.postMessage({
            id,
            ok: false,
            error: looksLikeLock
              ? "OPFS_LOCKED"
              : "OPFS_INIT_FAILED: " + realMsg,
          });
          return;
        }
        result = undefined;
        break;
      case "probe":
        result = doProbe();
        break;
      case "exec":
        await doExec(msg.sql ?? "");
        result = undefined;
        break;
      case "run":
        await doRun(msg.sql ?? "", msg.params ?? []);
        result = undefined;
        break;
      case "get":
        result = await doGet(msg.sql ?? "", msg.params ?? []);
        break;
      case "all":
        result = await doAll(msg.sql ?? "", msg.params ?? []);
        break;
      case "pragma":
        result = await doPragma(msg.name ?? "", msg.value);
        break;
      case "close":
        await doClose();
        result = undefined;
        break;
      default: {
        // Exaustividade: se o protocolo crescer e esquecermos um case, o
        // typecheck quebra aqui (never) e em runtime falha LOUD.
        const never: never = type;
        throw new Error(`opfs-worker: tipo de mensagem desconhecido: ${String(never)}`);
      }
    }
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({ id, ok: false, error: message });
  }
};
