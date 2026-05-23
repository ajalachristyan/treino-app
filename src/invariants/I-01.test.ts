/**
 * I-1 — Observação ≠ interpretação.
 * Brief §9: "Nenhuma tabela de registro grava papel/significado. Registro
 * guarda só o observado."
 *
 * DENYLIST SOFT: a defesa real está em I-2/I-3/I-6 concretos.
 * Este teste varre nomes de coluna nas tabelas de registro contra padrões
 * interpretativos conhecidos. Se aparecer match, alguém gravou
 * interpretação como fato — falha.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../db/runner.ts";
import { engines, type Database } from "./_helpers/engines.ts";

const REGISTRY_TABLES = [
  "exercise",
  "session",
  "session_item",
  "session_set",
  "jump_test",
  "session_load",
  "body_weight_log",
  "pain_log",
];

const INTERPRETIVE_PATTERNS: ReadonlyArray<RegExp> = [
  /^role$/i,
  /_role$/i,
  /^kpi/i,
  /_kpi$/i,
  /^meaning$/i,
  /^interpretation$/i,
  /^classification$/i,
];

describe.each(engines)(
  "I-01 (DB) — registry tables sem coluna interpretativa (%s)",
  (_engineName, openDb) => {
    let db: Database;
    beforeEach(async () => {
      db = await openDb(":memory:");
      await applyMigrations(db);
    });
    afterEach(async () => {
      await db.close();
    });

    it("nenhuma coluna em tabela de registro casa com denylist interpretativa", async () => {
      for (const table of REGISTRY_TABLES) {
        const cols = await db.all<{ name: string }>(
          `PRAGMA table_info(${table})`,
        );
        expect(cols.length, `tabela ${table} sem colunas?`).toBeGreaterThan(0);
        for (const c of cols) {
          for (const pat of INTERPRETIVE_PATTERNS) {
            expect(
              c.name.match(pat),
              `coluna "${c.name}" em "${table}" casa com padrão interpretativo ${pat}`,
            ).toBeNull();
          }
        }
      }
    });
  },
);
