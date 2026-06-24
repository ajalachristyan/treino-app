// =============================================================================
// Proxy de MAIN THREAD para wa-sqlite + OPFS, que de fato roda dentro de um
// Web Worker (ver src/db/opfs-worker.ts).
//
// POR QUE WORKER (mudanca da spike Fase 0): o AccessHandlePoolVFS depende de
// FileSystemFileHandle.createSyncAccessHandle(), API que so existe em contexto
// de Web Worker — NAO na main thread. Verificado em Chrome real:
// "createSyncAccessHandle is not a function" ao rodar na main thread. Por isso
// este arquivo deixou de ser o engine e virou um PROXY FINO: cria o worker,
// fala com ele via postMessage RPC, e a interface async Database (adapter.ts)
// mapeia 1:1 em mensagens.
//
// ENDURECIMENTO iOS (Bloco A) — release por TERMINATE, nao por close-in-worker:
// no iOS, se o processo do PWA e morto em background com um SyncAccessHandle
// aberto, o handle vira ORFAO e bloqueia reabrir/apagar ate REINICIAR o aparelho
// (a dor central da saga; WebKit #301520, ABERTO no iOS 26). A pesquisa de campo
// mostra que o jeito CONFIAVEL de soltar o lock no iOS e `worker.terminate()` a
// partir da main thread — fechar handle DENTRO do worker NAO solta o lock de
// forma confiavel. Entao:
//   - release() (lifecycle, ao ir pra background): drena ops em voo e TERMINA o
//     worker. Isso solta os handles.
//   - a proxima op recria o worker sozinha (ensureWorker -> reabre a conexao ao
//     arquivo OPFS que persiste). Recriar e best-effort com a recuperacao no
//     worker (acquireVfs).
// release e DEFESA EM PROFUNDIDADE, best-effort (e um RPC/terminate assincrono;
// o iOS pode matar antes). A durabilidade do dado vem do flush-por-commit do VFS
// + INSTALAR na tela + persist() + BACKUP EXTERNO (brief 10.5) — nunca do VFS so.
//
// D1 (journaling em OPFS): WAL/synchronous seguem no DECISIONS.md (so ligamos
// foreign_keys = ON). Stack mantida: wa-sqlite 1.0.0 + AccessHandlePoolVFS cap 3.
// =============================================================================

import type { Database } from "../adapter.ts";
import { createBusyGate, type BusyGate } from "../concurrency.ts";

// Mensagem enviada ao worker. Espelha RpcRequest do opfs-worker.ts.
interface RpcRequest {
  id: number;
  type: "open" | "probe" | "exec" | "run" | "get" | "all" | "pragma" | "close";
  sql?: string;
  params?: unknown[];
  name?: string;
  value?: string | number;
}

// Flags de capacidade devolvidas pelo probe (espelha ProbeResult do worker).
export interface ProbeResult {
  hasGetDirectory: boolean;
  hasCreateSyncAccessHandle: boolean;
  workerUserAgent: string;
}

// Resposta do worker.
type RpcResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

// NOTA Vite: o `new URL("../opfs-worker.ts", import.meta.url)` PRECISA ficar
// INLINE dentro de cada `new Worker(...)` — se for hoisted para uma constante, o
// Vite nao detecta o worker estaticamente e nao empacota o wa-sqlite/.wasm (o
// build "passa" mas emite o worker cru e some o wasm). Por isso ele se repete.

export class WaSqliteOpfsAdapter implements Database {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  // Worker vivo, ou null apos release()/close() (recriado lazy em ensureWorker).
  private worker: Worker | null = null;
  // Coalesce a recriacao do worker: dois ops concorrentes nao devem criar dois
  // workers (dois pools disputariam os mesmos arquivos do OPFS).
  private workerReady: Promise<void> | null = null;
  // Drena ops em voo antes de terminar o worker — ver concurrency.ts. release()
  // espera whenIdle() para nao matar o worker no meio de uma escrita/transacao.
  private readonly gate: BusyGate = createBusyGate();
  // Release em curso (background): teardown() seta ANTES de drenar e zera no
  // fim. As ops esperam isto ANTES de contar no gate (beforeOp), para nao postar
  // para um worker prestes a ser terminado (a janela whenIdle->terminate que o
  // red team apontou) — senao a ultima escrita antes do background se perderia.
  private releasing: Promise<void> | null = null;

  private constructor() {}

  /** Liga os handlers de mensagem/erro a um worker recem-criado. */
  private attach(worker: Worker): void {
    worker.onmessage = (e: MessageEvent<RpcResponse>): void => {
      const res = e.data;
      const entry = this.pending.get(res.id);
      if (entry === undefined) return; // resposta orfa (nao deveria ocorrer).
      this.pending.delete(res.id);
      if (res.ok) {
        entry.resolve(res.result);
      } else {
        entry.reject(new Error(res.error));
      }
    };
    // Erro fatal do worker (ex.: falha de carregamento do WASM): rejeita tudo
    // que estiver pendente e descarta o worker, para nenhum await ficar
    // pendurado e a proxima op recriar do zero.
    worker.onerror = (ev: ErrorEvent): void => {
      const err = new Error(`opfs-worker: erro fatal — ${ev.message}`);
      if (this.worker === worker) {
        this.worker = null;
        this.workerReady = null;
      }
      for (const [, entry] of this.pending) entry.reject(err);
      this.pending.clear();
    };
  }

  /**
   * Envia uma mensagem ao worker atual e devolve uma Promise casada por id. O
   * worker processa as mensagens numa fila serial (ver opfs-worker.ts), entao
   * dois handlers nunca interleavam. Rejeita se nao ha worker (chame
   * ensureWorker antes — as ops publicas fazem isso dentro do gate).
   */
  private rpc<T = unknown>(req: Omit<RpcRequest, "id">): Promise<T> {
    const worker = this.worker;
    if (worker === null) {
      return Promise.reject(
        new Error("opfs adapter: worker ausente (encerrado por release/close)."),
      );
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      worker.postMessage({ id, ...req } satisfies RpcRequest);
    });
  }

  /**
   * Espera um release em curso terminar ANTES de a op contar no gate. Fica FORA
   * do gate.track de proposito: se esperasse DENTRO, o whenIdle() do teardown
   * (que conta essa op no busy) nunca drenaria -> deadlock. Fora, ou a op espera
   * o release, ou ja foi contada pelo gate e o release a drena — nunca posta para
   * o worker zumbi.
   */
  private async beforeOp(): Promise<void> {
    while (this.releasing !== null) await this.releasing;
  }

  /** Op padrao: espera release pendente, conta no gate, garante worker, envia. */
  private async op<T>(req: Omit<RpcRequest, "id">): Promise<T> {
    await this.beforeOp();
    return this.gate.track(async () => {
      await this.ensureWorker();
      return this.rpc<T>(req);
    });
  }

  /**
   * Garante um worker vivo + banco aberto. Recria o worker apos um
   * release()/close() (que o terminou para soltar os handles no iOS). Coalescido
   * por workerReady para nao criar dois workers concorrentes.
   */
  private async ensureWorker(): Promise<void> {
    if (this.worker !== null) return;
    if (this.workerReady === null) {
      this.workerReady = this.spawnAndOpen().finally(() => {
        this.workerReady = null;
      });
    }
    await this.workerReady;
  }

  /**
   * Cria o worker, liga os handlers e abre a conexao ao arquivo OPFS. Chamado SO
   * por ensureWorker, que zera o `workerReady` no .finally — este metodo nao o
   * gerencia (nao chame fora de ensureWorker, ou `workerReady` fica stale).
   */
  private async spawnAndOpen(): Promise<void> {
    const worker = new Worker(new URL("../opfs-worker.ts", import.meta.url), {
      type: "module",
    });
    this.attach(worker);
    this.worker = worker;
    try {
      await this.rpc({ type: "open" });
    } catch (err) {
      // Open falhou: desmonta para a proxima tentativa recriar do zero (sem
      // worker meio-aberto preso). Rejeita o pending e termina.
      this.worker = null;
      const fatal = err instanceof Error ? err : new Error(String(err));
      for (const [, entry] of this.pending) entry.reject(fatal);
      this.pending.clear();
      worker.terminate();
      throw err;
    }
  }

  static async open(path: string): Promise<WaSqliteOpfsAdapter> {
    // O `path` do caller e ignorado para o nome real (o worker fixa o nome do
    // arquivo em OPFS); mantido na assinatura por paridade com a interface.
    void path;

    // Feature-detect de MAIN THREAD antes de gastar um worker: se nem
    // navigator.storage.getDirectory existe, OPFS esta indisponivel neste
    // contexto (tipico de navegador embutido no iPhone) — falha LOUD com
    // instrucao acionavel em vez de um erro obscuro la dentro do worker.
    if (
      !(
        navigator.storage &&
        typeof navigator.storage.getDirectory === "function"
      )
    ) {
      throw new Error(
        "treino-app: OPFS indisponivel neste navegador/contexto " +
          "(navigator.storage.getDirectory ausente). No iPhone, abra no Safari " +
          "e/ou instale na Tela de Inicio; navegadores embutidos " +
          "(WhatsApp/Instagram/etc.) nao suportam.",
      );
    }

    const adapter = new WaSqliteOpfsAdapter();
    try {
      await adapter.ensureWorker();
    } catch (err) {
      if (err instanceof Error && err.message === "OPFS_LOCKED") {
        // Lock genuino: outra aba/instancia ja segura os SyncAccessHandles.
        throw new Error(
          "treino-app: banco aberto em outra aba/instancia. Feche as outras " +
            "abas e recarregue.",
          { cause: err },
        );
      }
      if (err instanceof Error && err.message.startsWith("OPFS_INIT_FAILED:")) {
        // Falha real de init desmascarada pelo worker — SURFACA a causa crua.
        const real = err.message.slice("OPFS_INIT_FAILED:".length).trim();
        throw new Error(
          `OPFS falhou ao abrir: ${real}. Possiveis causas no iPhone: ` +
            "navegador embutido, modo privado, OPFS nao suportado, ou handle " +
            "orfao (reinicie o aparelho se persistir).",
          { cause: err },
        );
      }
      throw err;
    }
    return adapter;
  }

  /**
   * Probe de capacidades de OPFS, sem efeito colateral. Cria um worker
   * DESCARTAVEL, pede { type:"probe" } (que NAO instancia o VFS nem abre o
   * banco) e SEMPRE o termina no finally.
   */
  static async probe(): Promise<ProbeResult> {
    const worker = new Worker(new URL("../opfs-worker.ts", import.meta.url), {
      type: "module",
    });
    try {
      return await new Promise<ProbeResult>((resolve, reject) => {
        worker.onmessage = (e: MessageEvent<RpcResponse>): void => {
          const res = e.data;
          if (res.ok) resolve(res.result as ProbeResult);
          else reject(new Error(res.error));
        };
        worker.onerror = (ev: ErrorEvent): void => {
          reject(new Error(`opfs-worker: erro fatal no probe — ${ev.message}`));
        };
        worker.postMessage({ id: 1, type: "probe" } satisfies RpcRequest);
      });
    } finally {
      worker.terminate();
    }
  }

  async exec(sql: string): Promise<void> {
    await this.op<void>({ type: "exec", sql });
  }

  async run(sql: string, params: readonly unknown[] = []): Promise<void> {
    await this.op<void>({ type: "run", sql, params: params as unknown[] });
  }

  async get<T = unknown>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T | undefined> {
    return this.op<T | undefined>({
      type: "get",
      sql,
      params: params as unknown[],
    });
  }

  async all<T = unknown>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    return this.op<T[]>({ type: "all", sql, params: params as unknown[] });
  }

  async pragma(name: string, value?: string | number): Promise<unknown> {
    // exactOptionalPropertyTypes: so inclui `value` se foi passado.
    return this.op<unknown>(
      value !== undefined
        ? { type: "pragma", name, value }
        : { type: "pragma", name },
    );
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // O gate.track externo mantem busy >= 1 do BEGIN ao COMMIT/ROLLBACK, entao um
    // release() concorrente (background) espera a transacao terminar antes de
    // terminar o worker — nunca a corta no meio. BEGIN/COMMIT/ROLLBACK usam rpc
    // cru; as ops dentro de fn() passam por exec/run/etc (track aninhado).
    //
    // Suposicao (single-user, single-tab): nao ha duas transacoes concorrentes
    // na mesma conexao. O track NAO e mutex — e gate de drenagem; uma op solta
    // disparada sem await em paralelo a uma transacao poderia interleavar (a
    // fila serial do worker preserva a ordem de chegada, mas nao agrupa a
    // transacao). Os call sites (repositorio) sempre fazem await da transacao.
    await this.beforeOp();
    return this.gate.track(async () => {
      await this.ensureWorker();
      await this.rpc<void>({ type: "exec", sql: "BEGIN" });
      let result: T;
      try {
        result = await fn();
      } catch (err) {
        try {
          await this.rpc<void>({ type: "exec", sql: "ROLLBACK" });
        } catch {
          // ja abortada por constraint; estado consistente.
        }
        throw err;
      }
      await this.rpc<void>({ type: "exec", sql: "COMMIT" });
      return result;
    });
  }

  /**
   * Solta os SyncAccessHandles do OPFS terminando o worker (jeito confiavel no
   * iOS — WebKit #301520). Chamado pelo lifecycle ao ir pra background, para um
   * handle nunca vazar se o iOS matar o app. A proxima op recria o worker.
   *
   * Best-effort: e assincrono (drena + posta + termina); o iOS pode matar antes.
   * A durabilidade do dado JA escrito nao depende disto (flush-por-commit +
   * backup externo). Aqui so prevenimos o handle orfao.
   */
  async release(): Promise<void> {
    await this.teardown(false);
  }

  async close(): Promise<void> {
    await this.teardown(true);
  }

  /**
   * Drena ops em voo e termina o worker. `graceful` faz um close logico do banco
   * antes (flush limpo); release usa false (so termina — mais rapido no
   * background). Idempotente: se nao ha worker, no-op.
   */
  private async teardown(graceful: boolean): Promise<void> {
    // Coalesce releases concorrentes (ex.: visibilitychange:hidden + pagehide
    // quase juntos): o 2o espera o 1o terminar.
    if (this.releasing !== null) return this.releasing;

    let settle!: () => void;
    this.releasing = new Promise<void>((resolve) => {
      settle = resolve;
    });
    try {
      // Drena as ops JA contadas no gate (inclusive uma transacao inteira) antes
      // de terminar. Ops que cheguem agora veem `releasing` (beforeOp) e esperam
      // — nenhuma posta para o worker que estamos prestes a terminar.
      await this.gate.whenIdle();
      const worker = this.worker;
      if (worker === null) return;
      this.workerReady = null;
      if (graceful) {
        try {
          await this.rpc<void>({ type: "close" });
        } catch {
          // best-effort: o terminate abaixo solta os handles de qualquer jeito.
        }
      }
      this.worker = null;
      worker.terminate(); // solta os handles do OPFS de forma confiavel no iOS.
      for (const [, entry] of this.pending) {
        entry.reject(new Error("opfs adapter: worker encerrado (release/close)."));
      }
      this.pending.clear();
    } finally {
      this.releasing = null;
      settle();
    }
  }

  /**
   * "Hard reset": apaga o diretorio do AccessHandlePoolVFS em OPFS. Best-effort.
   * PRECISA do worker FECHADO (sem SyncAccessHandles vivos) — chame close()/
   * release() antes, ou recarregue a pagina. Opera direto na OPFS pela main
   * thread (removeEntry e main-thread).
   */
  static async deleteDatabase(): Promise<void> {
    const root = await navigator.storage.getDirectory();
    try {
      await root.removeEntry("treino-opfs", { recursive: true });
    } catch {
      // diretorio inexistente ou ja removido — no-op.
    }
  }
}
