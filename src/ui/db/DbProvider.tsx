// =============================================================================
// Provider do banco (Bloco C). Abre o adapter OPFS UMA vez (singleton de modulo
// — sobrevive ao double-invoke do StrictMode em dev, e e o certo num PWA de
// pagina unica: a conexao vive a vida do app), roda as migrations (schema +
// seed) e registra o lifecycle (release em background — Bloco A). Expoe o db via
// contexto so quando pronto.
// =============================================================================

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

import type { Database } from "../../db/adapter.ts";
import { WaSqliteOpfsAdapter } from "../../db/adapters/wa-sqlite-opfs.ts";
import { applyMigrations } from "../../db/runner.ts";
import { loadMigrationsBrowser } from "../../db/migrations.browser.ts";
import { registerOpfsLifecycle } from "../../db/lifecycle.ts";

let dbSingleton: Promise<Database> | null = null;

function openDbOnce(): Promise<Database> {
  if (dbSingleton === null) {
    dbSingleton = (async (): Promise<Database> => {
      const adapter = await WaSqliteOpfsAdapter.open("treino.sqlite");
      await applyMigrations(adapter, loadMigrationsBrowser);
      // Endurecimento Bloco A: solta os handles em background (best-effort).
      registerOpfsLifecycle(() => adapter);
      return adapter;
    })();
  }
  return dbSingleton;
}

type DbState =
  | { status: "loading" }
  | { status: "ready"; db: Database }
  | { status: "error"; message: string };

const DbContext = createContext<Database | null>(null);

/** Acesso ao banco. So pode ser chamado dentro do DbProvider em estado ready. */
export function useDb(): Database {
  const db = useContext(DbContext);
  if (db === null) {
    throw new Error("useDb: chamado fora do DbProvider (ou ainda carregando).");
  }
  return db;
}

export function DbProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DbState>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    openDbOnce().then(
      (db) => {
        if (alive) setState({ status: "ready", db });
      },
      (err: unknown) => {
        if (!alive) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ status: "error", message });
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="center-state">
        <p className="muted">Abrindo o banco…</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="center-state">
        <div className="error-box">
          <strong>Nao consegui abrir o banco.</strong>
          <p>{state.message}</p>
          <p>
            No iPhone: abra no Safari e instale na Tela de Inicio. Se persistir
            depois de reabrir, reinicie o aparelho (handle preso).
          </p>
        </div>
      </div>
    );
  }

  return <DbContext.Provider value={state.db}>{children}</DbContext.Provider>;
}
