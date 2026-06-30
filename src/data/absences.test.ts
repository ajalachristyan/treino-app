import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { Database } from "../db/adapter.ts";
import { BetterSqlite3Adapter } from "../db/adapters/better-sqlite3.ts";
import { WaSqliteNodeAdapter } from "../db/adapters/wa-sqlite-node.ts";
import { applyMigrations } from "../db/runner.ts";
import { loadMigrations } from "../db/migrations.ts";
import {
  recordMiss,
  getMisses,
  getMissesForDate,
  deleteMiss,
} from "./absences.ts";

const DAY_MS = 86400000;
const D1 = 1_700_000_000_000; // base arbitraria; missed_date e so um inteiro
const D2 = D1 + DAY_MS;
const D3 = D1 + 5 * DAY_MS;

type AdapterFactory = (path: string) => Promise<Database>;
const engines: ReadonlyArray<readonly [string, AdapterFactory]> = [
  ["better-sqlite3", (p) => BetterSqlite3Adapter.open(p)],
  ["wa-sqlite-node", (p) => WaSqliteNodeAdapter.open(p)],
];

describe.each(engines)("absences (faltas) — %s", (_name, openDb) => {
  let db: Database;

  beforeEach(async () => {
    db = await openDb(":memory:");
    await applyMigrations(db, loadMigrations);
  });

  afterEach(async () => {
    await db.close();
  });

  it("migration 003 aplica: missed_session existe e o schema chega a 3", async () => {
    const t = await db.get<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='missed_session'",
    );
    expect(t?.name).toBe("missed_session");
    const v = await db.get<{ v: number }>(
      "SELECT MAX(version) AS v FROM schema_version",
    );
    expect(v?.v).toBe(3);
  });

  it("recordMiss grava; getMisses devolve; reason so-espacos -> NULL, bloco NULL ok", async () => {
    const id = await recordMiss(db, { missedDate: D1, now: D1 + 1000 });
    const all = await getMisses(db);
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe(id);
    expect(all[0]?.missed_date).toBe(D1);
    expect(all[0]?.work_block_id).toBeNull();
    expect(all[0]?.reason).toBeNull();

    // reason so-espacos -> NULL (em OUTRO dia: falta avulsa e unica por data).
    const id2 = await recordMiss(db, { missedDate: D2, reason: "   ", now: D2 + 2000 });
    const got2 = (await getMisses(db)).find((m) => m.id === id2);
    expect(got2?.reason).toBeNull();
  });

  it("falta avulsa (bloco NULL) e unica por dia; falta de BLOCO coexiste no mesmo dia", async () => {
    await recordMiss(db, { missedDate: D1, now: D1 });
    // 2a falta AVULSA no mesmo dia -> barrada pelo indice parcial unico.
    await expect(
      recordMiss(db, { missedDate: D1, now: D1 + 1 }),
    ).rejects.toThrow(/UNIQUE|constraint/i);
    // mas uma falta de BLOCO no mesmo dia coexiste (work_block_id NOT NULL).
    const idBloco = await recordMiss(db, {
      missedDate: D1,
      workBlockId: "wb_ter_forca", // existe no seed 002
      now: D1 + 2,
    });
    const doDia = await getMissesForDate(db, D1);
    expect(doDia).toHaveLength(2);
    expect(doDia.map((m) => m.id)).toContain(idBloco);
  });

  it("aceita work_block_id real do seed; rejeita id inexistente (FK ON)", async () => {
    const id = await recordMiss(db, {
      missedDate: D1,
      workBlockId: "wb_ter_forca", // existe no seed 002
      reason: "  viagem  ",
      now: D1,
    });
    const got = (await getMisses(db)).find((m) => m.id === id);
    expect(got?.work_block_id).toBe("wb_ter_forca");
    expect(got?.reason).toBe("viagem"); // trim aplicado

    await expect(
      recordMiss(db, { missedDate: D1, workBlockId: "wb_inexistente", now: D1 }),
    ).rejects.toThrow();
  });

  it("getMissesForDate filtra pelo dia exato; getMisses(range) pelo intervalo", async () => {
    await recordMiss(db, { missedDate: D1, now: D1 });
    await recordMiss(db, { missedDate: D2, now: D2 });
    await recordMiss(db, { missedDate: D3, now: D3 });

    expect(await getMissesForDate(db, D2)).toHaveLength(1);
    expect(await getMissesForDate(db, D1 + 999)).toHaveLength(0); // dia exato, nao "perto"

    const range = await getMisses(db, { from: D1, to: D2 });
    expect(range.map((m) => m.missed_date)).toEqual([D2, D1]); // exclui D3, desc
  });

  it("ordena mais recente primeiro; deleteMiss desfaz", async () => {
    const idOld = await recordMiss(db, { missedDate: D1, now: D1 });
    await recordMiss(db, { missedDate: D2, now: D2 });

    const all = await getMisses(db);
    expect(all[0]?.missed_date).toBe(D2); // mais recente primeiro

    await deleteMiss(db, idOld);
    const after = await getMisses(db);
    expect(after).toHaveLength(1);
    expect(after.find((m) => m.id === idOld)).toBeUndefined();
  });
});
