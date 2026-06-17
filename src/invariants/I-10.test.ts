/**
 * I-10 — measurement_source imutavel.
 * Brief §9: "Mutacao de measurement_source em registro existente falha."
 *
 * Triggers `*_measurement_source_immutable` em jump_test e body_weight_log
 * fazem RAISE(ABORT) em qualquer UPDATE da coluna.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../db/runner.ts";
import { loadMigrations } from "../db/migrations.ts";
import { engines, type Database } from "./_helpers/engines.ts";

describe.each(engines)(
  "I-10 (DB) — measurement_source imutavel (%s)",
  (_engineName, openDb) => {
    let db: Database;
    beforeEach(async () => {
      db = await openDb(":memory:");
      await applyMigrations(db, loadMigrations);
    });
    afterEach(async () => {
      await db.close();
    });

    it("UPDATE measurement_source em jump_test eh REJEITADO", async () => {
      const now = Date.now();
      await db.exec(
        `INSERT INTO jump_test (id, jump_type, height_cm, measurement_source, performed_at, timestamp_server)
         VALUES ('jt1', 'CMJ', 50, 'instrumented', ${now}, ${now})`,
      );
      await expect(
        db.exec(
          `UPDATE jump_test SET measurement_source = 'subjective' WHERE id = 'jt1'`,
        ),
      ).rejects.toThrow();
    });

    it("UPDATE measurement_source em body_weight_log eh REJEITADO", async () => {
      const now = Date.now();
      await db.exec(
        `INSERT INTO body_weight_log (id, weight_kg, measured_at, measurement_source, timestamp_server)
         VALUES ('bw1', 80, ${now}, 'instrumented', ${now})`,
      );
      await expect(
        db.exec(
          `UPDATE body_weight_log SET measurement_source = 'subjective' WHERE id = 'bw1'`,
        ),
      ).rejects.toThrow();
    });
  },
);
