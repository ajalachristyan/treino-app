import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { Database } from "../db/adapter.ts";
import { BetterSqlite3Adapter } from "../db/adapters/better-sqlite3.ts";
import { WaSqliteNodeAdapter } from "../db/adapters/wa-sqlite-node.ts";
import { applyMigrations } from "../db/runner.ts";
import { loadMigrations } from "../db/migrations.ts";
import { dumpDatabase } from "./dump.ts";
import { restoreFromDump, assertLooksLikeBackup } from "./restore.ts";

type AdapterFactory = (path: string) => Promise<Database>;

// Os DOIS engines de teste (mesma garantia dos testes de invariante): o restore
// delega o parse ao SQLite (db.exec), entao deve se comportar identico nos dois.
const engines: ReadonlyArray<readonly [string, AdapterFactory]> = [
  ["better-sqlite3", (p) => BetterSqlite3Adapter.open(p)],
  ["wa-sqlite-node", (p) => WaSqliteNodeAdapter.open(p)],
];

// Foto multiset de TODAS as tabelas de usuario. Ordem-agnostico por tabela
// (linhas ordenadas pelo proprio JSON), para comparar CONTEUDO, nao rowid/ordem.
async function snapshotTables(db: Database): Promise<Record<string, string>> {
  const tables = await db.all<{ name: string }>(
    `SELECT name FROM sqlite_master
     WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  );
  const out: Record<string, string> = {};
  for (const { name } of tables) {
    const rows = await db.all<Record<string, unknown>>(
      `SELECT * FROM "${name}"`,
    );
    out[name] = JSON.stringify(rows.map((r) => JSON.stringify(r)).sort());
  }
  return out;
}

// body_weight_log: sem FK, insert simples — o marcador distintivo de cada banco.
async function insertWeight(db: Database, id: string, kg: number): Promise<void> {
  await db.run(
    `INSERT INTO body_weight_log
       (id, weight_kg, measured_at, measurement_source, timestamp_server)
     VALUES (?, ?, ?, ?, ?)`,
    [id, kg, 1700000000000, "subjective", 1700000000000],
  );
}

describe.each(engines)("restoreFromDump — %s", (_name, openDb) => {
  let dbA: Database; // "backup": o estado que queremos recuperar
  let dbB: Database; // "atual": o banco vivo (migrado + semeado, dados diferentes)

  beforeEach(async () => {
    dbA = await openDb(":memory:");
    dbB = await openDb(":memory:");
    await applyMigrations(dbA, loadMigrations);
    await applyMigrations(dbB, loadMigrations);
  });

  afterEach(async () => {
    await dbA.close();
    await dbB.close();
  });

  it("restaura sobre um banco JA populado: substitui tudo, sem colidir nem mesclar", async () => {
    // O ponto de design do handoff: o dump usa CREATE TABLE (nao IF NOT EXISTS),
    // e o banco vivo NUNCA esta vazio (as migrations recriam schema + seed). Um
    // db.exec(dump) ingenuo COLIDIRIA ("table ... already exists"). O restore tem
    // de RESETAR antes. Este teste so passa se isso acontecer.
    await insertWeight(dbA, "bw_do_backup", 80.5);
    await insertWeight(dbB, "bw_atual_do_B", 99.9);
    const dumpA = await dumpDatabase(dbA);

    await restoreFromDump(dbB, dumpA);

    // B reproduz A em TODAS as tabelas (schema_version incluso).
    expect(await snapshotTables(dbB)).toEqual(await snapshotTables(dbA));
    // Concretamente: o peso do backup entrou; o antigo de B sumiu (nao mesclou).
    const ids = await dbB.all<{ id: string }>(
      `SELECT id FROM body_weight_log ORDER BY id`,
    );
    expect(ids.map((r) => r.id)).toEqual(["bw_do_backup"]);
  });

  it("rejeita um arquivo que NAO e backup, sem tocar no banco (anti-culpa)", async () => {
    // Trust boundary: arquivo errado (foto, .txt aleatorio) nao pode ZERAR o
    // banco. A validacao roda ANTES de qualquer reset — o banco fica intacto.
    await insertWeight(dbB, "bw_atual_do_B", 99.9);
    const before = await snapshotTables(dbB);

    await expect(
      restoreFromDump(dbB, "isto nao e um backup;\nselect 1;\n"),
    ).rejects.toThrow();

    expect(await snapshotTables(dbB)).toEqual(before);
  });

  it("rejeita um backup truncado (sem COMMIT final), sem tocar no banco", async () => {
    // Download interrompido / arquivo cortado: sem o COMMIT terminal o dump nao
    // esta completo. Rejeita antes de destruir o estado atual.
    await insertWeight(dbB, "bw_atual_do_B", 99.9);
    const dumpA = await dumpDatabase(dbA);
    const truncated = dumpA.slice(0, dumpA.lastIndexOf("COMMIT;"));
    const before = await snapshotTables(dbB);

    await expect(restoreFromDump(dbB, truncated)).rejects.toThrow();

    expect(await snapshotTables(dbB)).toEqual(before);
  });

  it("um backup que PASSA a validacao mas quebra no meio NAO destroi o banco (rollback)", async () => {
    // A janela que a validacao heuristica nao cobre: um arquivo com cabecalho +
    // CREATE schema_version + COMMIT final, mas SQL invalido no meio. Sem
    // rollback, o reset ja commitou e o import falha -> banco VAZIO. Como o
    // proposito desta feature e NAO perder historico, um backup ruim tem de
    // deixar o estado ATUAL intacto (snapshot pre-sobrescrita, eco do I-11).
    await insertWeight(dbB, "bw_atual_do_B", 99.9);
    const before = await snapshotTables(dbB);
    const evil =
      [
        "-- treino-app backup (dump SQL). Reimporte via SQLite (db.exec).",
        "-- NAO faca split por ';' em JS.",
        "PRAGMA foreign_keys=OFF;",
        "BEGIN TRANSACTION;",
        "CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);",
        "INSERT INTO schema_version (version, applied_at) VALUES (1, 1);",
        "ISTO NAO E SQL VALIDO (((;",
        "COMMIT;",
      ].join("\n") + "\n";
    // A validacao ACEITA (senao o teste nao exercita a janela certa).
    expect(() => assertLooksLikeBackup(evil)).not.toThrow();

    await expect(restoreFromDump(dbB, evil)).rejects.toThrow();

    // O estado atual continua LA (rollback recolocou o banco anterior).
    expect(await snapshotTables(dbB)).toEqual(before);
  });

  it("apos restaurar, a conexao fica com foreign_keys=ON (nao herda o OFF do dump)", async () => {
    // O dump abre com PRAGMA foreign_keys=OFF; restore.ts nao pode deixar a
    // conexao viva sem enforcement de FK (o default dos adapters e ON).
    await insertWeight(dbA, "bw_do_backup", 80.5);
    const dumpA = await dumpDatabase(dbA);
    await restoreFromDump(dbB, dumpA);
    expect(Number(await dbB.pragma("foreign_keys"))).toBe(1);
  });

  it("assertLooksLikeBackup: aceita dump real, rejeita lixo / truncado / sem cabecalho", async () => {
    const dumpA = await dumpDatabase(dbA);
    expect(() => assertLooksLikeBackup(dumpA)).not.toThrow();
    // Lixo aleatorio.
    expect(() => assertLooksLikeBackup("qualquer coisa")).toThrow();
    // Truncado (sem COMMIT).
    expect(() =>
      assertLooksLikeBackup(dumpA.slice(0, dumpA.lastIndexOf("COMMIT;"))),
    ).toThrow();
    // Um .sql qualquer sem o cabecalho marcador do treino-app (2 primeiras linhas).
    expect(() =>
      assertLooksLikeBackup(dumpA.split("\n").slice(2).join("\n")),
    ).toThrow();
  });
});
