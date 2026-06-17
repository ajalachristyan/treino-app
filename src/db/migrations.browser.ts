// =============================================================================
// Loader de migrations para o BROWSER. Espelha o contrato de loadMigrations()
// (de migrations.ts), mas SEM node:* — o SQL chega via import.meta.glob do
// Vite, que inlina os .sql como string no bundle (query '?raw').
//
// REGRA DE GRAFO: este arquivo importa SO ./migrations.manifest.ts (browser-
// safe). NUNCA importa ./migrations.ts (que arrasta node:fs/path/url). Se
// alguem trocar este import por migrations.ts, o `vite build` quebra com
// "node:fs externalized".
// =============================================================================

import { MIGRATION_MANIFEST } from "./migrations.manifest.ts";
import type { MigrationFile } from "./migrations.manifest.ts";

// Glob estatico resolvido em build: { '/migrations/001_init.sql': '<conteudo>' }.
// `eager: true` + `import: 'default'` => valores ja sao a string crua do .sql.
const rawSqlByPath = import.meta.glob("/migrations/*.sql", {
  query: "?raw",
  eager: true,
  import: "default",
}) as Record<string, string>;

/**
 * Resolve cada entrada do manifesto para o conteudo do seu .sql via Vite glob,
 * casando por nome de arquivo (`{name}.sql`). Retorna ordenado por version,
 * igual ao loader Node — `applyMigrations` ja reordena, mas mantemos a
 * paridade de comportamento.
 */
export async function loadMigrationsBrowser(): Promise<MigrationFile[]> {
  const files = MIGRATION_MANIFEST.map(({ version, name }) => {
    // import.meta.glob chaveia pelo caminho absoluto a partir da raiz do projeto.
    const path = `/migrations/${name}.sql`;
    const sql = rawSqlByPath[path];
    if (sql === undefined) {
      throw new Error(
        `migrations.browser: arquivo nao encontrado no glob para ` +
          `"${name}" (esperado em "${path}"). Conferir MIGRATION_MANIFEST ` +
          `e /migrations/*.sql.`,
      );
    }
    return { version, name, sql } satisfies MigrationFile;
  });

  return files.sort((a, b) => a.version - b.version);
}
