import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { Database } from "../db/adapter.ts";
import { BetterSqlite3Adapter } from "../db/adapters/better-sqlite3.ts";
import { WaSqliteNodeAdapter } from "../db/adapters/wa-sqlite-node.ts";
import { applyMigrations } from "../db/runner.ts";
import { loadMigrations } from "../db/migrations.ts";
import { getExercises, getExercise } from "./catalog.ts";

type AdapterFactory = (path: string) => Promise<Database>;
const engines: ReadonlyArray<readonly [string, AdapterFactory]> = [
  ["better-sqlite3", (p) => BetterSqlite3Adapter.open(p)],
  ["wa-sqlite-node", (p) => WaSqliteNodeAdapter.open(p)],
];

describe.each(engines)("catalog (modo de fazer) — %s", (_name, openDb) => {
  let db: Database;

  beforeEach(async () => {
    db = await openDb(":memory:");
    await applyMigrations(db, loadMigrations);
  });

  afterEach(async () => {
    await db.close();
  });

  it("migrations 004 e 005 aplicam: schema avanca e o catalogo ganha how_to/category", async () => {
    // Afere que as linhas 4 e 5 existem (nao MAX — migrations 006+ subiriam o topo).
    const v4 = await db.get<{ v: number }>(
      "SELECT version AS v FROM schema_version WHERE version = 4",
    );
    const v5 = await db.get<{ v: number }>(
      "SELECT version AS v FROM schema_version WHERE version = 5",
    );
    expect(v4?.v).toBe(4);
    expect(v5?.v).toBe(5);
    // O 005 populou how_to + category; video_url segue NULL (link e opcional).
    const ex = await getExercise(db, "ex_back_squat");
    expect(ex?.name).toBe("Back squat");
    expect(ex?.how_to).toMatch(/agachamento/i);
    expect(ex?.category).toBe("forca");
    expect(ex?.video_url).toBeNull();
  });

  it("005 cobre TODO o catalogo: how_to e category nao-nulos, categoria valida", async () => {
    const all = await getExercises(db);
    // Se o 005 errou/omitiu um id, o how_to/category daquele exercicio fica NULL
    // (o UPDATE nao casou) — o teste falha listando exatamente quais.
    const semConteudo = all
      .filter((e) => e.how_to === null || e.category === null)
      .map((e) => e.id);
    expect(semConteudo).toEqual([]);

    const CATS = ["forca", "salto", "ginastica", "flexibilidade", "mobilidade", "core"];
    const invalidas = all
      .filter((e) => e.category !== null && !CATS.includes(e.category))
      .map((e) => `${e.id}:${e.category ?? ""}`);
    expect(invalidas).toEqual([]);
  });

  it("getExercises devolve o catalogo ordenado por nome; getExercise por id", async () => {
    const all = await getExercises(db);
    expect(all.length).toBeGreaterThan(10);
    const names = all.map((e) => e.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names); // ja ordenado
    expect(all.map((e) => e.id)).toContain("ex_pancake_straddle");

    expect(await getExercise(db, "ex_inexistente")).toBeUndefined();
  });

  it("how_to / video_url / category sao legiveis e gravaveis (colunas reais)", async () => {
    await db.run(
      `UPDATE exercise
         SET how_to = ?, video_url = ?, category = ?
       WHERE id = ?`,
      [
        "Sente-se com as pernas afastadas; tronco a frente; PNF contrai-relaxa.",
        "https://example.com/v",
        "flexibilidade",
        "ex_pancake_straddle",
      ],
    );
    const ex = await getExercise(db, "ex_pancake_straddle");
    expect(ex?.how_to).toMatch(/PNF/);
    expect(ex?.video_url).toBe("https://example.com/v");
    expect(ex?.category).toBe("flexibilidade");
    // acute_interference do seed (pancake = hold profundo >60s) chega na leitura.
    expect(ex?.acute_interference).toBe(1);
  });
});
