// =============================================================================
// Manifesto de migrations — SEM IMPORTS DE node:*.
//
// Este modulo e o ponto unico de verdade para "quais migrations existem e em
// que ordem". Foi extraido de migrations.ts justamente para que o grafo do
// browser (que importa o loader Vite em migrations.browser.ts) NUNCA tenha de
// tocar migrations.ts — esse ultimo arrasta node:fs/node:path/node:url e roda
// fileURLToPath(import.meta.url) no load, o que quebra o bundle do browser.
//
// Para adicionar uma nova migration:
//   1. Crie /migrations/00X_nome.sql (DDL/DML versionada)
//   2. Adicione { version: X, name: '00X_nome' } abaixo, na ordem
//   3. O ultimo statement do arquivo deve ser:
//        INSERT INTO schema_version (version, applied_at) VALUES (X, ...);
//
// Os loaders (Node em migrations.ts, browser em migrations.browser.ts) leem
// este manifesto e resolvem o `sql` de cada entrada a partir da sua fonte.
// =============================================================================

export interface MigrationFile {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

export interface MigrationManifestEntry {
  readonly version: number;
  readonly name: string;
}

export const MIGRATION_MANIFEST: ReadonlyArray<MigrationManifestEntry> = [
  { version: 1, name: "001_init" },
] as const;
