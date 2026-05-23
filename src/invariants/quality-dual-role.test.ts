/**
 * `quality` — papel duplo em session_set.
 *
 * Decidido no Passo 3 (R1 + ratificacao): UMA observacao subjetiva, UMA
 * coluna; o PAPEL eh interpretacao da engine, nao propriedade do dado.
 *   - Para progression_type='contact_quality': quality EH a medida primaria
 *     (CHECK exaustivo exige quality NOT NULL nesse ramo).
 *   - Para os outros tipos: quality eh observacao secundaria opcional (sinal
 *     de regressao da §7.4) — fica FORA do CASE, sem constrangimento.
 *
 * Dois testes:
 *   #26 — contact_quality com quality=NULL falha (medida primaria obrigatoria).
 *   #27 — load_reps com quality='tremor' preenchido passa (sinal secundario).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../db/runner.ts";
import { engines, type Database } from "./_helpers/engines.ts";

describe.each(engines)(
  "quality (DB) — papel duplo (%s)",
  (_engineName, openDb) => {
    let db: Database;
    beforeEach(async () => {
      db = await openDb(":memory:");
      await applyMigrations(db);
    });
    afterEach(async () => {
      await db.close();
    });

    it("contact_quality com quality=NULL eh REJEITADO (quality eh primaria nesse ramo)", async () => {
      const now = Date.now();
      await db.exec(
        `INSERT INTO exercise (id, name, progression_type, priority, load_type, created_at)
         VALUES ('ex_dl', 'Drop Landing', 'contact_quality', 'primary', 'bodyweight', ${now})`,
      );
      await db.exec(
        `INSERT INTO session (id, started_at, timestamp_server) VALUES ('s1', ${now}, ${now})`,
      );
      await db.exec(
        `INSERT INTO session_item (id, session_id, exercise_id, actual_sequence, status, data_origin, timestamp_server)
         VALUES ('si1', 's1', 'ex_dl', 1, 'done', 'live', ${now})`,
      );

      // sem quality e sem nenhuma outra primaria => CHECK do ramo contact_quality falha
      await expect(
        db.exec(
          `INSERT INTO session_set (id, session_item_id, set_index, progression_type, timestamp_server)
           VALUES ('ss1', 'si1', 1, 'contact_quality', ${now})`,
        ),
      ).rejects.toThrow();
    });

    it("load_reps com quality='tremor' preenchido EH ACEITO (papel secundario universal)", async () => {
      const now = Date.now();
      await db.exec(
        `INSERT INTO exercise (id, name, progression_type, priority, load_type, created_at)
         VALUES ('ex_bs', 'Back Squat', 'load_reps', 'primary', 'barbell', ${now})`,
      );
      await db.exec(
        `INSERT INTO session (id, started_at, timestamp_server) VALUES ('s1', ${now}, ${now})`,
      );
      await db.exec(
        `INSERT INTO session_item (id, session_id, exercise_id, actual_sequence, status, data_origin, timestamp_server)
         VALUES ('si1', 's1', 'ex_bs', 1, 'done', 'live', ${now})`,
      );

      await db.exec(
        `INSERT INTO session_set (id, session_item_id, set_index, progression_type, reps, load_kg, quality, timestamp_server)
         VALUES ('ss1', 'si1', 1, 'load_reps', 8, 100, 'tremor', ${now})`,
      );

      const rows = await db.all<{ id: string; quality: string }>(
        `SELECT id, quality FROM session_set WHERE id='ss1'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.quality).toBe("tremor");
    });
  },
);
