// =============================================================================
// Runner de migrations. Agnostico ao engine (recebe um Database — qualquer
// adapter que satisfaca a interface src/db/adapter.ts).
//
// Garantias:
//   - Cada migration pendente roda dentro de uma transacao (db.transaction).
//     Erro no meio => ROLLBACK; banco fica no estado anterior.
//   - Idempotente: aplicar duas vezes consecutivas eh no-op na segunda.
//   - O proprio arquivo SQL grava sua linha em schema_version (ultimo
//     statement antes do COMMIT implicito da transacao do runner).
// =============================================================================

import type { Database } from "./adapter.ts";
import { loadMigrations } from "./migrations.ts";

/**
 * Retorna a maior versao registrada em schema_version, ou 0 se a tabela ainda
 * nao existe (banco nunca migrado).
 */
export async function currentSchemaVersion(db: Database): Promise<number> {
  const tableExists = await db.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'`,
  );
  if (!tableExists) return 0;

  const row = await db.get<{ version: number | null }>(
    `SELECT MAX(version) AS version FROM schema_version`,
  );
  return row?.version ?? 0;
}

/**
 * Aplica todas as migrations cuja `version` eh maior que a versao atual do
 * banco. Cada migration roda dentro de uma transacao propria.
 */
export async function applyMigrations(db: Database): Promise<void> {
  const current = await currentSchemaVersion(db);
  const all = await loadMigrations();
  const pending = all
    .filter((m) => m.version > current)
    .sort((a, b) => a.version - b.version);

  for (const m of pending) {
    await db.transaction(async () => {
      await db.exec(m.sql);
    });
  }
}
