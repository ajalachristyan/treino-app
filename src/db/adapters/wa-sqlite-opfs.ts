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
// mapeia 1:1 em mensagens. Toda a logica de step/bind/exec/VFS migrou para o
// worker (mesmas funcoes, mesmos hedges defensivos).
//
// D1 (PONTO DE REVISAO — journaling em OPFS): a decisao de WAL/synchronous
// sobre OPFS e o gatilho de revisao do engine de producao seguem no DECISIONS.md
// — NAO selados nesta spike. (O worker liga apenas foreign_keys = ON.)
// =============================================================================

import type { Database } from "../adapter.ts";

// Mensagem enviada ao worker. Espelha RpcRequest do opfs-worker.ts.
interface RpcRequest {
  id: number;
  type: "open" | "exec" | "run" | "get" | "all" | "pragma" | "close";
  sql?: string;
  params?: unknown[];
  name?: string;
  value?: string | number;
}

// Resposta do worker.
type RpcResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

export class WaSqliteOpfsAdapter implements Database {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  private constructor(private readonly worker: Worker) {
    this.worker.onmessage = (e: MessageEvent<RpcResponse>): void => {
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
    // que estiver pendente, para nenhum await ficar pendurado para sempre.
    this.worker.onerror = (ev: ErrorEvent): void => {
      const err = new Error(`opfs-worker: erro fatal — ${ev.message}`);
      for (const [, entry] of this.pending) entry.reject(err);
      this.pending.clear();
    };
  }

  /**
   * Envia uma mensagem ao worker e devolve uma Promise resolvida/rejeitada pela
   * resposta correspondente (casada por id). O worker processa as mensagens em
   * ordem FIFO — ver a nota de transaction() abaixo.
   */
  private rpc<T = unknown>(req: Omit<RpcRequest, "id">): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.worker.postMessage({ id, ...req } satisfies RpcRequest);
    });
  }

  static async open(path: string): Promise<WaSqliteOpfsAdapter> {
    // O `path` do caller e ignorado para o nome real (o worker fixa o nome do
    // arquivo em OPFS); mantido na assinatura por paridade com a interface
    // Database.
    void path;

    // new URL(..., import.meta.url) + { type: "module" } e o padrao suportado
    // pelo Vite para empacotar o worker como chunk proprio (e o .wasm como
    // asset). Ver docs do Vite "Web Workers".
    const worker = new Worker(new URL("../opfs-worker.ts", import.meta.url), {
      type: "module",
    });

    const adapter = new WaSqliteOpfsAdapter(worker);

    try {
      await adapter.rpc({ type: "open" });
    } catch (err) {
      // O worker sinaliza "OPFS_LOCKED" quando outra aba/instancia ja segura os
      // SyncAccessHandles do OPFS. Mapeia para a mensagem PT-BR tipada.
      worker.terminate();
      if (err instanceof Error && err.message === "OPFS_LOCKED") {
        throw new Error(
          "treino-app: banco aberto em outra aba/instancia. Feche as outras " +
            "abas e recarregue.",
          { cause: err },
        );
      }
      throw err;
    }

    return adapter;
  }

  async exec(sql: string): Promise<void> {
    await this.rpc<void>({ type: "exec", sql });
  }

  async run(sql: string, params: readonly unknown[] = []): Promise<void> {
    await this.rpc<void>({ type: "run", sql, params: params as unknown[] });
  }

  async get<T = unknown>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T | undefined> {
    return this.rpc<T | undefined>({
      type: "get",
      sql,
      params: params as unknown[],
    });
  }

  async all<T = unknown>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    return this.rpc<T[]>({ type: "all", sql, params: params as unknown[] });
  }

  async pragma(name: string, value?: string | number): Promise<unknown> {
    // exactOptionalPropertyTypes: so inclui `value` na mensagem se foi passado.
    return this.rpc<unknown>(
      value !== undefined
        ? { type: "pragma", name, value }
        : { type: "pragma", name },
    );
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // IDENTICO em forma ao node adapter: BEGIN ... COMMIT, com ROLLBACK no
    // catch. Funciona via RPC porque (a) o worker processa as mensagens em
    // ordem FIFO e (b) este app e single-user e nao-reentrante — nao ha duas
    // transacoes concorrentes disputando a mesma conexao. Se um dia houver
    // operacoes concorrentes na mesma conexao, esta suposicao precisa revisao
    // (igual a nota do node adapter).
    await this.exec("BEGIN");
    let result: T;
    try {
      result = await fn();
    } catch (err) {
      try {
        await this.exec("ROLLBACK");
      } catch {
        // ja abortada por constraint; estado consistente.
      }
      throw err;
    }
    await this.exec("COMMIT");
    return result;
  }

  async close(): Promise<void> {
    try {
      await this.rpc<void>({ type: "close" });
    } finally {
      // Sempre encerra o worker, mesmo se o close logico falhar — senao o
      // worker (e os SyncAccessHandles do OPFS) vazam.
      this.worker.terminate();
    }
  }

  /**
   * "Hard reset" da spike: apaga o diretorio do AccessHandlePoolVFS em OPFS.
   * Best-effort — engole erro se o diretorio nao existir ainda.
   *
   * PRECISA do worker FECHADO (sem SyncAccessHandles vivos): remover o
   * diretorio enquanto o VFS o segura colide. O harness (App.tsx) abre/fecha o
   * banco por acao e instrui recarregar a pagina apos o reset — o que descarta
   * o worker e libera os handles. Por isso este metodo NAO precisa de um worker
   * proprio: opera direto na OPFS pela main thread (removeEntry e main-thread).
   */
  static async deleteDatabase(): Promise<void> {
    const root = await navigator.storage.getDirectory();
    try {
      // removeEntry nao aceita "/" no nome; usa o nome do diretorio sem a barra.
      await root.removeEntry("treino-opfs", { recursive: true });
    } catch {
      // diretorio inexistente ou ja removido — no-op.
    }
  }
}
