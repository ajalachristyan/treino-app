/**
 * CHECK SQL ↔ TS enum parity.
 *
 * Mitiga a "costura fragil" que anotamos no Passo 2: o tipo TS e a string da
 * CHECK no SQL sao duas expressoes textuais do MESMO fato. Quando alguem
 * adiciona valor ao enum em um lado e esquece o outro, este teste falha.
 *
 * Le `migrations/001_init.sql`, extrai cada `IN (...)` por enum, e compara
 * set-igualdade com o array TS correspondente.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  DATA_ORIGINS,
  DEVIATION_REASONS,
  JUMP_TYPES,
  LOAD_TYPES,
  MEASUREMENT_SOURCES,
  PRIORITIES,
  PROGRESSION_TYPES,
  QUALITY_PER_SETS,
  SESSION_ITEM_STATUSES,
} from "../domain/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_FILE = join(
  __dirname,
  "..",
  "..",
  "migrations",
  "001_init.sql",
);

interface EnumPair {
  readonly column: string;
  readonly tsValues: ReadonlyArray<string>;
}

const ENUMS: ReadonlyArray<EnumPair> = [
  { column: "progression_type", tsValues: PROGRESSION_TYPES },
  { column: "priority", tsValues: PRIORITIES },
  { column: "load_type", tsValues: LOAD_TYPES },
  { column: "status", tsValues: SESSION_ITEM_STATUSES },
  { column: "deviation_reason", tsValues: DEVIATION_REASONS },
  { column: "data_origin", tsValues: DATA_ORIGINS },
  { column: "measurement_source", tsValues: MEASUREMENT_SOURCES },
  { column: "jump_type", tsValues: JUMP_TYPES },
  { column: "quality", tsValues: QUALITY_PER_SETS },
];

function extractCheckValues(sql: string, column: string): string[][] {
  // Procura todas as ocorrencias de `<column> IN ( ... )` no SQL.
  // [^)]+ matches multi-line (newlines incluidos).
  const pattern = new RegExp(`\\b${column}\\s+IN\\s*\\(([^)]+)\\)`, "g");
  const results: string[][] = [];
  for (const match of sql.matchAll(pattern)) {
    const raw = match[1] ?? "";
    const values = [...raw.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    results.push(values);
  }
  return results;
}

describe("CHECK SQL ↔ TS enum parity", () => {
  it("todo CHECK IN (...) de enum no schema bate valor-a-valor com o array TS", async () => {
    const sql = await readFile(MIGRATION_FILE, "utf-8");

    for (const { column, tsValues } of ENUMS) {
      const occurrences = extractCheckValues(sql, column);
      expect(
        occurrences.length,
        `Nenhum CHECK IN(...) encontrado para "${column}" em 001_init.sql`,
      ).toBeGreaterThan(0);

      const tsSorted = [...tsValues].sort();
      for (const sqlValues of occurrences) {
        const sqlSorted = [...sqlValues].sort();
        expect(
          sqlSorted,
          `CHECK SQL para "${column}" diverge do array TS. SQL=${JSON.stringify(sqlSorted)} TS=${JSON.stringify(tsSorted)}`,
        ).toEqual(tsSorted);
      }
    }
  });
});
