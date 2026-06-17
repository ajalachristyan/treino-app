/**
 * I-6 — contact_time/RSI eh derivado de teste periodico.
 * Brief §9: "Nao ha contact_time instrumentado fora de jump_test."
 *
 * I-6 estrutural: INSERT em session_set com progression_type='contact_time'
 * eh rejeitado pelo CHECK (CASE ramo `THEN 0`). E session_set NAO tem coluna
 * contact_time, fisicamente impossivel registrar fora de jump_test.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../db/runner.ts";
import { loadMigrations } from "../db/migrations.ts";
import { engines, type Database } from "./_helpers/engines.ts";

describe.each(engines)(
  "I-06 (DB) — contact_time fora de session_set (%s)",
  (_engineName, openDb) => {
    let db: Database;
    beforeEach(async () => {
      db = await openDb(":memory:");
      await applyMigrations(db, loadMigrations);
    });
    afterEach(async () => {
      await db.close();
    });

    it("INSERT session_set com progression_type='contact_time' eh REJEITADO pelo CHECK", async () => {
      const now = Date.now();
      await db.exec(
        `INSERT INTO exercise (id, name, progression_type, priority, load_type, created_at)
         VALUES ('ex_dj', 'Depth Jump', 'contact_time', 'primary', 'bodyweight', ${now})`,
      );
      await db.exec(
        `INSERT INTO session (id, started_at, timestamp_server) VALUES ('s1', ${now}, ${now})`,
      );
      await db.exec(
        `INSERT INTO session_item (id, session_id, exercise_id, actual_sequence, status, data_origin, timestamp_server)
         VALUES ('si1', 's1', 'ex_dj', 1, 'done', 'live', ${now})`,
      );

      await expect(
        db.exec(
          `INSERT INTO session_set (id, session_item_id, set_index, progression_type, height_cm, timestamp_server)
           VALUES ('ss1', 'si1', 1, 'contact_time', 30, ${now})`,
        ),
      ).rejects.toThrow();
    });

    it("session_set NAO tem coluna contact_time nem contact_time_ms", async () => {
      const cols = await db.all<{ name: string }>(
        `PRAGMA table_info(session_set)`,
      );
      const names = cols.map((c) => c.name);
      expect(names).not.toContain("contact_time");
      expect(names).not.toContain("contact_time_ms");
    });
  },
);
