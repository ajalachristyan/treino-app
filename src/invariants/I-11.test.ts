/**
 * I-11 — Sync last-write-wins por timestamp_server.
 * Brief §9: "Conflito de dois dispositivos resolve por timestamp do servidor,
 * nenhum dado eh perdido silenciosamente."
 *
 * COBERTURA PARCIAL — somente a parte ESTRUTURAL aqui (toda tabela de
 * registro tem `timestamp_server NOT NULL`, sem o que LWW fica sem ancoragem).
 * GATILHO: quando o passo de SYNC for construido, adicionar teste
 * `engine.resolveSyncConflict(rowA, rowB)` provando que vence o de
 * timestamp_server maior e nenhum dado eh perdido.
 *
 * Decisao acordada: sync por arquivo + LWW + snapshot pre-sobrescrita (ver
 * DECISIONS.md). Resolucao linha-a-linha via CRDT/HLC explicitamente REJEITADA.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../db/runner.ts";
import { engines, type Database } from "./_helpers/engines.ts";

const REGISTRY_WITH_TS = [
  "session",
  "session_item",
  "session_set",
  "jump_test",
  "session_load",
  "body_weight_log",
  "pain_log",
];

describe.each(engines)(
  "I-11 (DB, estrutural) — timestamp_server presente e NOT NULL (%s)",
  (_engineName, openDb) => {
    let db: Database;
    beforeEach(async () => {
      db = await openDb(":memory:");
      await applyMigrations(db);
    });
    afterEach(async () => {
      await db.close();
    });

    it("toda tabela de registro tem coluna timestamp_server NOT NULL", async () => {
      for (const t of REGISTRY_WITH_TS) {
        const cols = await db.all<{ name: string; notnull: number }>(
          `PRAGMA table_info(${t})`,
        );
        const tsCol = cols.find((c) => c.name === "timestamp_server");
        expect(
          tsCol,
          `${t} nao tem coluna timestamp_server`,
        ).toBeDefined();
        expect(
          tsCol!.notnull,
          `${t}.timestamp_server deveria ser NOT NULL`,
        ).toBe(1);
      }
    });
  },
);
