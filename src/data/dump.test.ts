import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { Database } from "../db/adapter.ts";
import { BetterSqlite3Adapter } from "../db/adapters/better-sqlite3.ts";
import { WaSqliteNodeAdapter } from "../db/adapters/wa-sqlite-node.ts";
import { applyMigrations } from "../db/runner.ts";
import { loadMigrations } from "../db/migrations.ts";
import { dumpDatabase, sqlLiteral } from "./dump.ts";

type AdapterFactory = (path: string) => Promise<Database>;

const engines: ReadonlyArray<readonly [string, AdapterFactory]> = [
  ["better-sqlite3", (p) => BetterSqlite3Adapter.open(p)],
  ["wa-sqlite-node", (p) => WaSqliteNodeAdapter.open(p)],
];

describe.each(engines)("dumpDatabase round-trip — %s", (_name, openDb) => {
  let db: Database;
  let db2: Database;

  beforeEach(async () => {
    db = await openDb(":memory:");
    db2 = await openDb(":memory:");
  });

  afterEach(async () => {
    await db.close();
    await db2.close();
  });

  it("escaping: aspas, newline, unicode, REAL, inteiro e NULL sobrevivem", async () => {
    await db.exec(
      `CREATE TABLE probe (id INTEGER PRIMARY KEY, txt TEXT, flo REAL)`,
    );
    // Valor cheio de armadilhas de escaping (aspas simples, quebra de linha,
    // ponto-e-virgula, acento) — o que mata um dump ingenuo.
    await db.run("INSERT INTO probe (id, txt, flo) VALUES (?, ?, ?)", [
      1,
      "Agachamento 'pesado'; série Nº1\nlinha 2 — fim",
      1.5,
    ]);
    await db.run("INSERT INTO probe (id, txt, flo) VALUES (?, ?, ?)", [
      2,
      null,
      42,
    ]);

    const sql = await dumpDatabase(db);
    await db2.exec(sql);

    const original = await db.all("SELECT * FROM probe ORDER BY id");
    const restored = await db2.all("SELECT * FROM probe ORDER BY id");
    expect(restored).toEqual(original);
  });

  it("schema real: migrations -> dump -> reimport reproduz schema + versao", async () => {
    await applyMigrations(db, loadMigrations);

    const sql = await dumpDatabase(db);
    await db2.exec(sql);

    const schemaObjects = (d: Database): Promise<{ type: string; name: string }[]> =>
      d.all<{ type: string; name: string }>(
        `SELECT type, name FROM sqlite_master
         WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`,
      );
    // Mesmas tabelas, indices e triggers do schema original.
    expect(await schemaObjects(db2)).toEqual(await schemaObjects(db));

    // O dump preserva o schema_version do original (seja qual for a ultima
    // migration — hoje o seed 002 leva a 2).
    const maxVer = (d: Database): Promise<{ v: number } | undefined> =>
      d.get<{ v: number }>("SELECT MAX(version) AS v FROM schema_version");
    expect((await maxVer(db2))?.v).toBe((await maxVer(db))?.v);
  });

  it("dump de uma tabela com dados preserva as linhas (count + conteudo)", async () => {
    await applyMigrations(db, loadMigrations);
    // exercise tem progression_type imutavel + colunas variadas; insere 2 linhas
    // validas para provar que dados reais (nao so schema) atravessam o round-trip.
    // IDs proprios (prefixo zz_, nao colidem com o seed). O banco ja vem com o
    // seed (002), entao a tabela tem seed + estes 2; o round-trip preserva TODOS.
    await db.run(
      `INSERT INTO exercise
        (id, name, progression_type, priority, load_type, acute_interference, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["zz_test_a", "Back squat 'pesado'", "load_reps", "primary", "barbell", 0, 1700000000000],
    );
    await db.run(
      `INSERT INTO exercise
        (id, name, progression_type, priority, load_type, acute_interference, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["zz_test_b", "Couch stretch", "time_under_tension", "accessory", "bodyweight", 1, 1700000000000],
    );

    const sql = await dumpDatabase(db);
    await db2.exec(sql);

    // Round-trip fiel de TODA a tabela (seed + os 2 de teste), na mesma ordem.
    const original = await db.all("SELECT * FROM exercise ORDER BY id");
    const restored = await db2.all("SELECT * FROM exercise ORDER BY id");
    expect(restored).toEqual(original);
    // E os 2 inseridos sobrevivem especificamente.
    const restoredTest = await db2.all<{ id: string }>(
      "SELECT id FROM exercise WHERE id LIKE 'zz_test_%' ORDER BY id",
    );
    expect(restoredTest.map((r) => r.id)).toEqual(["zz_test_a", "zz_test_b"]);
  });
});

describe("sqlLiteral", () => {
  it("escapa e tipa cada valor", () => {
    expect(sqlLiteral(null)).toBe("NULL");
    expect(sqlLiteral(undefined)).toBe("NULL");
    expect(sqlLiteral(42)).toBe("42");
    expect(sqlLiteral(1.5)).toBe("1.5");
    expect(sqlLiteral(-3)).toBe("-3");
    expect(sqlLiteral(1700000000000)).toBe("1700000000000");
    expect(sqlLiteral(10n)).toBe("10");
    expect(sqlLiteral("o'brien")).toBe("'o''brien'");
    expect(sqlLiteral(Number.NaN)).toBe("NULL");
    expect(sqlLiteral(new Uint8Array([0, 255, 16]))).toBe("X'00ff10'");
  });
});
