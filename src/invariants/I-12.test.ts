/**
 * I-12 — Sessao eh lista mutavel, nao copia read-only.
 * Brief §9: "Durante a sessao eh possivel adicionar, remover, reordenar e
 * substituir, e o plano original permanece intacto."
 *
 * Calcula SHA-256 do estado completo (SELECT * ORDER BY id) de work_block +
 * work_block_item ANTES e DEPOIS de mutar a sessao (add ad-hoc, skip,
 * reorder, substitute). Espera hash identico — plano nao foi tocado.
 */
import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../db/runner.ts";
import { loadMigrations } from "../db/migrations.ts";
import { engines, type Database } from "./_helpers/engines.ts";

describe.each(engines)(
  "I-12 (DB) — sessao mutavel, plano intacto (%s)",
  (_engineName, openDb) => {
    let db: Database;
    beforeEach(async () => {
      db = await openDb(":memory:");
      await applyMigrations(db, loadMigrations);
    });
    afterEach(async () => {
      await db.close();
    });

    async function snapshotPlan(): Promise<string> {
      const wb = await db.all("SELECT * FROM work_block ORDER BY id");
      const wbi = await db.all(
        "SELECT * FROM work_block_item ORDER BY id, planned_sequence",
      );
      return createHash("sha256")
        .update(JSON.stringify({ wb, wbi }))
        .digest("hex");
    }

    it("mutar a sessao (add/skip/reorder/substitute) nao altera work_block nem work_block_item", async () => {
      const now = Date.now();

      // Setup do plano
      await db.exec(`
        INSERT INTO exercise (id, name, progression_type, priority, load_type, created_at)
        VALUES
          ('ex_back', 'Back Squat', 'load_reps', 'primary', 'barbell', ${now}),
          ('ex_leg',  'Leg Press',  'load_reps', 'accessory', 'barbell', ${now});
      `);
      await db.exec(
        `INSERT INTO plan (id, name, start_date, duration_weeks, created_at)
         VALUES ('p1', 'Test Plan', ${now}, 18, ${now})`,
      );
      await db.exec(
        `INSERT INTO work_block (id, plan_id, name, day_of_week, week_start, week_end, ordered, internal_rest_s, created_at)
         VALUES ('wb1', 'p1', 'Tue Force', 2, 1, 5, 1, 180, ${now})`,
      );
      await db.exec(`
        INSERT INTO work_block_item (id, work_block_id, exercise_id, planned_sequence, planned_sets, is_warmup)
        VALUES
          ('wbi1', 'wb1', 'ex_back', 1, 4, 0),
          ('wbi2', 'wb1', 'ex_back', 2, 4, 0),
          ('wbi3', 'wb1', 'ex_back', 3, 4, 0);
      `);

      // Snapshot ANTES (so plano)
      const hashBefore = await snapshotPlan();

      // Cria sessao + semeia session_items
      await db.exec(
        `INSERT INTO session (id, plan_id, work_block_id, started_at, timestamp_server)
         VALUES ('s1', 'p1', 'wb1', ${now}, ${now})`,
      );
      await db.exec(`
        INSERT INTO session_item (id, session_id, exercise_id, work_block_item_id, actual_sequence, status, data_origin, timestamp_server)
        VALUES
          ('si1', 's1', 'ex_back', 'wbi1', 1, 'done', 'live', ${now}),
          ('si2', 's1', 'ex_back', 'wbi2', 2, 'done', 'live', ${now}),
          ('si3', 's1', 'ex_back', 'wbi3', 3, 'done', 'live', ${now});
      `);

      // MUTACOES da sessao:
      // - Adicionar ad-hoc
      await db.exec(
        `INSERT INTO session_item (id, session_id, exercise_id, actual_sequence, status, data_origin, timestamp_server)
         VALUES ('si_adhoc', 's1', 'ex_leg', 4, 'added_adhoc', 'live', ${now})`,
      );
      // - Skip um existente
      await db.exec(
        `UPDATE session_item SET status='skipped', deviation_reason='user_choice' WHERE id='si2'`,
      );
      // - Reorder
      await db.exec(
        `UPDATE session_item SET actual_sequence=999 WHERE id='si3'`,
      );
      // - Substitute (muda exercise_id e marca substituted)
      await db.exec(
        `UPDATE session_item SET status='substituted', deviation_reason='equipment_busy', exercise_id='ex_leg' WHERE id='si1'`,
      );

      // Snapshot DEPOIS
      const hashAfter = await snapshotPlan();

      expect(hashAfter).toBe(hashBefore);
    });
  },
);
