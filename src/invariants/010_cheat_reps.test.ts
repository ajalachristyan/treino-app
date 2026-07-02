import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { Database } from "../db/adapter.ts";
import { BetterSqlite3Adapter } from "../db/adapters/better-sqlite3.ts";
import { WaSqliteNodeAdapter } from "../db/adapters/wa-sqlite-node.ts";
import { applyMigrations } from "../db/runner.ts";
import { loadMigrations } from "../db/migrations.ts";
import {
  startTodaySession,
  markItemDone,
  writeSet,
  getSessionSets,
} from "../data/sessions.ts";

// ============================================================================
// migration 010: cheat_reps em session_set — coluna SECUNDARIA universal (como
// rpe/notes), sempre opcional (NULL), FORA do CHECK exaustivo (CASE). Registro
// de reps "roubadas"; NAO conta pra progressao (testado em progression).
// ============================================================================

type AdapterFactory = (path: string) => Promise<Database>;
const engines: ReadonlyArray<readonly [string, AdapterFactory]> = [
  ["better-sqlite3", (p) => BetterSqlite3Adapter.open(p)],
  ["wa-sqlite-node", (p) => WaSqliteNodeAdapter.open(p)],
];

const T = 1_700_000_000_000;

describe.each(engines)("migration 010 — cheat_reps — %s", (_name, openDb) => {
  let db: Database;

  beforeEach(async () => {
    db = await openDb(":memory:");
    await applyMigrations(db, loadMigrations);
  });

  afterEach(async () => {
    await db.close();
  });

  async function itemId(): Promise<string> {
    const sid = await startTodaySession(db, {
      planId: "pl_vertical_18w",
      workBlockId: "wb_ter_forca",
      now: T,
    });
    return markItemDone(db, {
      sessionId: sid,
      exerciseId: "ex_back_squat",
      workBlockItemId: "wbi_ter_2",
      actualSequence: 1,
      isWarmup: false,
      now: T,
    });
  }

  it("writeSet grava cheat_reps opcional; sem cheat => NULL (secundaria)", async () => {
    const iid = await itemId();
    await writeSet(db, {
      sessionItemId: iid,
      setIndex: 1,
      measures: { progressionType: "load_reps", reps: 8, loadKg: 100 },
      cheatReps: 2,
      now: T,
    });
    await writeSet(db, {
      sessionItemId: iid,
      setIndex: 2,
      measures: { progressionType: "load_reps", reps: 6, loadKg: 100 },
      now: T + 1,
    });
    const sets = await getSessionSets(db, iid);
    expect(sets[0]?.cheat_reps).toBe(2);
    expect(sets[1]?.cheat_reps).toBeNull(); // opcional: ausente = NULL
  });

  it("cheat_reps negativo viola o CHECK do schema", async () => {
    const iid = await itemId();
    await expect(
      db.run(
        `INSERT INTO session_set
           (id, session_item_id, set_index, progression_type, reps, load_kg,
            cheat_reps, timestamp_server)
         VALUES ('ss_neg', ?, 1, 'load_reps', 5, 100, -1, ?)`,
        [iid, T],
      ),
    ).rejects.toThrow();
  });

  it("cheat_reps NAO entra no CHECK exaustivo: um load_reps normal ainda grava", async () => {
    // Regressao: adicionar a coluna nao pode ter mexido no CASE do load_reps.
    const iid = await itemId();
    await writeSet(db, {
      sessionItemId: iid,
      setIndex: 1,
      measures: { progressionType: "load_reps", reps: 5, loadKg: 90 },
      now: T,
    });
    const sets = await getSessionSets(db, iid);
    expect(sets).toHaveLength(1);
    expect(sets[0]?.reps).toBe(5);
  });
});
