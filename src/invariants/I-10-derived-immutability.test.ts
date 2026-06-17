/**
 * I-10 DERIVADO (de D1) — exercise.progression_type e session_set.progression_type
 * sao IMUTAVEIS apos criacao.
 *
 * Brief NAO crava explicitamente esta imutabilidade — eh derivada da regua
 * 1.2 ("nasce fixo e nenhuma regra futura reclassifica") e da decisao D1 do
 * Passo 3 (desnormalizacao defendida por triggers). Sem isso, a copia do
 * tipo dentro de session_set poderia ficar inconsistente e séries antigas
 * mentiriam sobre o que mediram.
 *
 * Triggers `exercise_progression_type_immutable` e
 * `session_set_progression_type_immutable` fazem RAISE(ABORT).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../db/runner.ts";
import { loadMigrations } from "../db/migrations.ts";
import { engines, type Database } from "./_helpers/engines.ts";

describe.each(engines)(
  "I-10 derivado — progression_type imutavel (%s)",
  (_engineName, openDb) => {
    let db: Database;
    beforeEach(async () => {
      db = await openDb(":memory:");
      await applyMigrations(db, loadMigrations);
    });
    afterEach(async () => {
      await db.close();
    });

    it("UPDATE exercise.progression_type eh REJEITADO", async () => {
      const now = Date.now();
      await db.exec(
        `INSERT INTO exercise (id, name, progression_type, priority, load_type, created_at)
         VALUES ('ex1', 'Back Squat', 'load_reps', 'primary', 'barbell', ${now})`,
      );
      await expect(
        db.exec(
          `UPDATE exercise SET progression_type='jump_height' WHERE id='ex1'`,
        ),
      ).rejects.toThrow();
    });

    it("UPDATE session_set.progression_type eh REJEITADO", async () => {
      const now = Date.now();
      await db.exec(`
        INSERT INTO exercise (id, name, progression_type, priority, load_type, created_at)
        VALUES ('ex1', 'Back Squat', 'load_reps', 'primary', 'barbell', ${now});
      `);
      await db.exec(
        `INSERT INTO session (id, started_at, timestamp_server) VALUES ('s1', ${now}, ${now})`,
      );
      await db.exec(
        `INSERT INTO session_item (id, session_id, exercise_id, actual_sequence, status, data_origin, timestamp_server)
         VALUES ('si1', 's1', 'ex1', 1, 'done', 'live', ${now})`,
      );
      await db.exec(
        `INSERT INTO session_set (id, session_item_id, set_index, progression_type, reps, load_kg, timestamp_server)
         VALUES ('ss1', 'si1', 1, 'load_reps', 8, 100, ${now})`,
      );

      await expect(
        db.exec(
          `UPDATE session_set SET progression_type='time_under_tension' WHERE id='ss1'`,
        ),
      ).rejects.toThrow();
    });
  },
);
