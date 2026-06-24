// =============================================================================
// Backup por DUMP SQL (Bloco B).
//
// POR QUE DUMP SQL (e nao um .sqlite binario): o wa-sqlite 1.0.0 NAO expoe
// sqlite3_serialize, e o arquivo do AccessHandlePoolVFS em OPFS NAO e um .sqlite
// cru valido (nomes aleatorios + header de 4 KB por arquivo) — ler e baixar o
// arquivo do OPFS daria lixo. Entao o backup e um script SQL re-importavel
// (estilo `.dump` do sqlite3), que tambem e auditavel e sobrevive a mudanca de
// engine. (brief 2 / pendencia ja autorizam "dump SQL".)
//
// PURO sobre a interface Database: roda na MAIN THREAD via o adapter OPFS (cada
// query vira um RPC para o worker) E identico num teste Node (better-sqlite3 /
// wa-sqlite-node). Sem RPC novo no worker.
// =============================================================================

import type { Database } from "../db/adapter.ts";

interface SchemaObject {
  type: string;
  name: string;
  sql: string;
}

/**
 * Serializa o banco inteiro como SQL re-importavel. Ordem: PRAGMA + BEGIN ->
 * CREATE TABLE + INSERTs (tabela a tabela, na ordem de criacao) -> CREATE
 * INDEX/TRIGGER DEPOIS dos dados (nao disparam em INSERT, nao atrasam a carga)
 * -> COMMIT.
 */
export async function dumpDatabase(db: Database): Promise<string> {
  // Cabecalho documenta o CONTRATO de re-importacao (red team Bloco B): este
  // .sql so e seguro reimportar por um caminho que delega o parse ao SQLite
  // (ex.: db.exec) — um split ingenuo por ';' em JS quebraria, pois ';' e
  // newline aparecem DENTRO de strings (ex.: notas em PT-BR).
  const out: string[] = [
    "-- treino-app backup (dump SQL). Reimporte via SQLite (db.exec).",
    "-- NAO faca split por ';' em JS: ';'/newline ocorrem dentro de strings.",
    "PRAGMA foreign_keys=OFF;",
    "BEGIN TRANSACTION;",
  ];

  // Objetos do schema, menos os internos do SQLite. Ordem natural do
  // sqlite_master = ordem de criacao (FK-valida para os CREATE TABLE).
  const objects = await db.all<SchemaObject>(
    `SELECT type, name, sql FROM sqlite_master
     WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'`,
  );
  const tables = objects.filter((o) => o.type === "table");
  const others = objects.filter((o) => o.type !== "table"); // index/trigger/view

  for (const t of tables) {
    out.push(`${t.sql};`);
    const rows = await db.all<Record<string, unknown>>(
      `SELECT * FROM ${quoteId(t.name)}`,
    );
    const first = rows[0];
    if (first === undefined) continue; // tabela vazia
    const cols = Object.keys(first);
    const colList = cols.map(quoteId).join(", ");
    for (const row of rows) {
      const vals = cols.map((c) => sqlLiteral(row[c])).join(", ");
      out.push(`INSERT INTO ${quoteId(t.name)} (${colList}) VALUES (${vals});`);
    }
  }

  for (const o of others) {
    out.push(`${o.sql};`);
  }

  out.push("COMMIT;");
  return out.join("\n") + "\n";
}

/** Identificador (tabela/coluna) com aspas duplas, escapando aspas internas. */
function quoteId(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

/** Um valor de coluna como literal SQL seguro. */
export function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "NULL"; // NaN/Infinity nao tem literal SQL
    return Number.isInteger(v) ? v.toFixed(0) : String(v);
  }
  if (typeof v === "string") return `'${v.replace(/'/g, "''")}'`;
  // Defensivo: o schema atual nao tem BLOB, mas se aparecer, vira X'hex'.
  if (v instanceof Uint8Array) return blobLiteral(v);
  if (v instanceof ArrayBuffer) return blobLiteral(new Uint8Array(v));
  // Fallback: trata como texto (nunca deveria chegar aqui).
  return `'${String(v).replace(/'/g, "''")}'`;
}

function blobLiteral(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `X'${hex}'`;
}
