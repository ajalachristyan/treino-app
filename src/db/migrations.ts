// =============================================================================
// Manifesto de migrations. Ordem importa — cada entrada corresponde a um
// arquivo em /migrations/{name}.sql e a uma versao no schema_version.
//
// Para adicionar uma nova migration:
//   1. Crie /migrations/00X_nome.sql (DDL/DML versionada)
//   2. Adicione { version: X, name: '00X_nome' } abaixo, na ordem
//   3. O ultimo statement do arquivo deve ser:
//        INSERT INTO schema_version (version, applied_at) VALUES (X, ...);
// =============================================================================

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

export interface MigrationFile {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

interface MigrationManifestEntry {
  readonly version: number;
  readonly name: string;
}

export const MIGRATION_MANIFEST: ReadonlyArray<MigrationManifestEntry> = [
  { version: 1, name: "001_init" },
] as const;

export async function loadMigrations(): Promise<MigrationFile[]> {
  return Promise.all(
    MIGRATION_MANIFEST.map(async ({ version, name }) => ({
      version,
      name,
      sql: await readFile(join(MIGRATIONS_DIR, `${name}.sql`), "utf-8"),
    })),
  );
}
