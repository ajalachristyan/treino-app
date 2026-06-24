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
// FILA SERIAL (Bloco A / red team): o self.onmessage e async, entao SEM
// serializar dois handlers interleavariam nos `await` — uma op poderia rodar com
// o banco meio-reaberto por outra. Encadeamos cada mensagem numa fila (workQueue
// no fim): handleMessage(N+1) so comeca quando handleMessage(N) termina por
// completo. Cada RPC vira atomico em relacao aos outros.
//
// RELEASE iOS por TERMINATE (nao aqui): liberar handle em background no iOS e
// feito pelo PROXY com worker.terminate() (jeito confiavel — WebKit #301520);
// este worker nao tem mensagem de "release". doClose() so faz um close logico do
// banco (flush) antes do terminate. WAL/synchronous seguem no DECISIONS.md (D1).
//
// PROPAGACAO DE ERRO: o Factory envolve `step` e dispara em rc de erro; os
// `if (rc !== SQLITE_DONE) throw` sao hedge defensivo (falha LOUD se algum rc
// obscuro escapar). handleMessage captura qualquer throw e devolve { ok:false }
// para o proxy rejeitar — incluindo o canario de CHECK violation.
// =============================================================================

import SQLiteESMFactory from "wa-sqlite/dist/wa-sqlite.mjs";
import * as SQLite from "wa-sqlite";
// VENDORADO (capacity 3) — ver ./vendor/AccessHandlePoolVFS.js e o cabecalho de doOpen.
import { AccessHandlePoolVFS } from "./vendor/AccessHandlePoolVFS.js";
import wasmUrl from "wa-sqlite/dist/wa-sqlite.wasm?url";
import { createSerialQueue } from "./concurrency.ts";

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

// Conexao viva (factory + VFS + dbHandle), criada UMA vez por worker e mantida
// entre mensagens. O VFS adquire SyncAccessHandles EXCLUSIVOS e os mantem pelo
// tempo de vida do worker — close() fecha a CONEXAO, nao devolve os handles (so
// terminar o worker devolve, no iOS). doClose() zera estes campos para que um
// 'open' subsequente reinicialize do zero em vez de reusar conexao morta.
let sqlite3: WaSqliteApi | null = null;
let dbHandle: number | null = null;

// -----------------------------------------------------------------------------
// Helpers de execucao — operam no sqlite3/dbHandle locais do worker (ver
// ensureOpen, que abre o banco sob demanda).
// -----------------------------------------------------------------------------

function getDb(): { sqlite3: WaSqliteApi; dbHandle: number } {
  if (sqlite3 === null || dbHandle === null) {
    throw new Error("opfs-worker: banco nao aberto (envie 'open' primeiro).");
  }
  return { sqlite3, dbHandle };
}

// Garante o banco aberto antes de qualquer op. NAO precisa coalescing: a fila
// serial (onmessage/workQueue) ja garante que dois doOpen nunca rodem
// concorrentes. O check de idempotencia em doOpen e belt-and-suspenders.
async function ensureOpen(): Promise<{ sqlite3: WaSqliteApi; dbHandle: number }> {
  if (sqlite3 === null || dbHandle === null) {
    await doOpen();
  }
  return getDb();
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
  const { sqlite3: api, dbHandle: db } = await ensureOpen();
  await api.exec(db, sql);
}

async function doRun(sql: string, params: readonly unknown[] = []): Promise<void> {
  const { sqlite3: api, dbHandle: db } = await ensureOpen();
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
  const { sqlite3: api, dbHandle: db } = await ensureOpen();
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
  const { sqlite3: api, dbHandle: db } = await ensureOpen();
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
  const { sqlite3: api, dbHandle: db } = await ensureOpen();
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
// Init do engine (factory + VFS + conexao). Roda na 1a 'open' E em qualquer op
// depois que o worker for recriado (o proxy termina o worker no release de
// background) — por isso e idempotente.
//
// CAPACITY 3 (VFS vendorado): mantida por baixo custo, mas a causa-raiz do erro
// iOS "unknown transient reason" NAO era contagem de handle (isso daria "Invalid
// platform file handle"). Era (a) pressao de storage do WebKit e (b) um
// FileSystemSyncAccessHandle ORFAO que sobrevivia ao reload e segurava o arquivo
// (bloqueando reabrir E removeEntry; WebKit #301520, aberto no iOS 26). O
// endurecimento ataca (b) liberando os handles via worker.terminate() no proxy
// ao ir pra background, e recupera no boot via acquireVfs.
//
// RECUPERACAO != o retry-em-loop que antes PIORAVA: aquele recriava o VFS SEM
// liberar os handles presos, que colidiam com a tentativa seguinte. acquireVfs
// chama pool.close() ANTES de tentar de novo (solta o que pegou) e tenta UMA
// vez. Se ainda falhar, o handle e de um processo morto que o iOS nao soltou (so
// reiniciar o aparelho resolve); propagamos com a causa crua.
// -----------------------------------------------------------------------------

async function acquireVfs(): Promise<AccessHandlePoolVFS> {
  const pool = new AccessHandlePoolVFS(OPFS_DIR);
  try {
    await pool.isReady;
    return pool;
  } catch (firstErr) {
    console.warn(
      "opfs-worker: acquire inicial do VFS falhou, tentando recuperar:",
      firstErr,
    );
    try {
      // Solta o que esta instancia pegou no acquire parcial. RESIDUAL (red team
      // N1): um createSyncAccessHandle que so resolva DEPOIS do Promise.all
      // rejeitar fica fora dos mapas e nao e fechado aqui — viraria orfao. Baixa
      // probabilidade; o retry abaixo colide LOUD nesse arquivo (nao corrompe),
      // e o fallback ultimo e reiniciar o aparelho.
      await pool.close();
    } catch {
      // best-effort: se nem fechar der, o retry abaixo ainda pode falhar LOUD.
    }
    const retry = new AccessHandlePoolVFS(OPFS_DIR);
    await retry.isReady; // se falhar de novo, propaga (travado de verdade).
    return retry;
  }
}

async function doOpen(): Promise<void> {
  if (sqlite3 !== null && dbHandle !== null) return; // idempotente

  const module = await SQLiteESMFactory({ locateFile: () => wasmUrl });
  const api = SQLite.Factory(module) as WaSqliteApi;

  // createSyncAccessHandle so funciona AQUI (no worker). O pool (capacity 3 no
  // VFS vendorado) e adquirido dentro de isReady, com recuperacao (acquireVfs).
  const pool = await acquireVfs();
  api.vfs_register(pool, true); // makeDefault => open_v2 sem vfs usa este.

  const handle = await api.open_v2(DB_FILENAME);

  // FK eh per-connection (igual better-sqlite3 e ao node adapter); sem isso o
  // schema fica com FK decorativas. WAL/synchronous: ver cabecalho (D1).
  await api.exec(handle, "PRAGMA foreign_keys = ON");

  sqlite3 = api;
  dbHandle = handle;
}

// Close LOGICO do banco (flush + finaliza). Chamado pelo proxy antes de terminar
// o worker — quem realmente devolve os handles ao SO no iOS e o terminate(). Por
// isso NAO tentamos vfs.close() aqui (in-worker close nao solta o lock de forma
// confiavel — WebKit #301520). Idempotente.
async function doClose(): Promise<void> {
  if (sqlite3 !== null && dbHandle !== null) {
    try {
      await sqlite3.close(dbHandle);
    } catch (closeErr) {
      // Loga e segue: zeramos os globais abaixo para nao deixar estado stale.
      console.error("opfs-worker: falha no close do banco:", closeErr);
    }
  }
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

// Processa UMA mensagem. NAO e ligado direto ao onmessage: passa pela fila
// serial (workQueue, abaixo) para nunca interleavar com outro handler nos await.
async function handleMessage(msg: RpcRequest): Promise<void> {
  const { id, type } = msg;
  try {
    let result: unknown;
    switch (type) {
      case "open":
        try {
          await ensureOpen();
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
}

// FILA SERIAL: encadeia cada mensagem para que handleMessage(N+1) so comece
// quando handleMessage(N) terminar por completo (todos os await + postMessage).
// Sem isto, dois handlers async interleavariam nos await (ver cabecalho).
const enqueueMessage = createSerialQueue();
self.onmessage = (e: MessageEvent<RpcRequest>): void => {
  const msg = e.data;
  void enqueueMessage(() => handleMessage(msg));
};
