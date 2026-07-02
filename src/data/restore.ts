// =============================================================================
// RESTAURAR backup (.sql) — a outra metade do Bloco B (dump.ts so EXPORTA).
//
// CONTRATO (do HANDOFF-p25 / dump.ts): reimportar = db.exec(sqlInteiro) DIRETO.
//   - NUNCA fatiar por ';' em JS: ';'/newline ocorrem DENTRO de strings PT-BR.
//   - NUNCA embrulhar em transacao: o dump ja traz seu proprio BEGIN...COMMIT.
//
// PONTO DE DESIGN (o handoff avisa em maiusculas): o dump usa CREATE TABLE (nao
// IF NOT EXISTS) e o banco vivo NUNCA esta vazio (as migrations recriam schema +
// seed a cada abertura). Um db.exec(dump) por cima COLIDIRIA. Por isso o restore
// RESETA o schema (dropa tudo) ANTES de reimportar. O reset roda em autocommit,
// FORA de transacao, para nao aninhar no BEGIN do dump (SQLite nao aninha).
//
// ANTI-CULPA (trust boundary): um arquivo errado (foto, .txt) ou um dump cortado
// (download interrompido) NAO pode zerar o banco. assertLooksLikeBackup roda
// ANTES de qualquer DROP — se o arquivo nao for um backup completo do treino-app,
// lanca e o banco fica intacto.
//
// PURO sobre a interface Database (adapter.ts): a MESMA funcao roda no OPFS
// (producao, via o worker) e nos dois engines de teste (better-sqlite3 e
// wa-sqlite-node). db.exec repassa o SQL inteiro ao SQLite nos tres.
// =============================================================================

import type { Database } from "../db/adapter.ts";
import { currentSchemaVersion } from "../db/runner.ts";
import { dumpDatabase } from "./dump.ts";

/**
 * Valida, SEM efeito colateral, que `sql` e um backup completo do treino-app.
 * Lanca com mensagem leiga se nao for — usado como pre-flight antes de destruir
 * o estado atual (anti-culpa) e tambem na UI, no momento em que o arquivo e
 * escolhido, para recusar arquivo errado sem sequer pedir confirmacao.
 */
export function assertLooksLikeBackup(sql: string): void {
  // Cabecalho marcador que dump.ts sempre escreve nas 2 primeiras linhas.
  if (!sql.slice(0, 200).includes("treino-app backup")) {
    throw new Error(
      "Esse arquivo não parece um backup do treino-app. Escolha um arquivo " +
        "“treino-backup-….sql” que o próprio app gerou em “Baixar backup”.",
    );
  }
  // Estrutura do dump: uma transacao com o schema completo dentro.
  if (!/CREATE TABLE\s+"?schema_version\b/i.test(sql)) {
    throw new Error(
      "Esse backup está incompleto (não contém o schema). Use um arquivo de " +
        "backup íntegro.",
    );
  }
  // Sem o COMMIT terminal o arquivo foi cortado (download interrompido, etc.).
  if (!/COMMIT;\s*$/.test(sql)) {
    throw new Error(
      "Esse backup parece cortado (sem o final esperado). Baixe o backup de " +
        "novo e tente com o arquivo completo.",
    );
  }
}

/**
 * Restaura o banco a partir de um dump .sql (gerado por dumpDatabase).
 * DESTRUTIVO: substitui TODO o estado atual pelo do backup. Valide/confirme
 * antes (a UI confirma; esta funcao revalida por seguranca).
 *
 * ATOMICO na pratica: tira um snapshot do estado ATUAL antes de destruir e, se o
 * import falhar depois do reset (arquivo que passou a validacao heuristica mas
 * quebra no meio), recoloca o snapshot — um backup ruim NUNCA deixa o banco
 * vazio. Eco do "snapshot pre-sobrescrita" do I-11. Esta feature existe para NAO
 * perder historico; falhar destruindo o dado seria trair o proprio proposito.
 */
export async function restoreFromDump(db: Database, dumpSql: string): Promise<void> {
  assertLooksLikeBackup(dumpSql); // pre-flight: lanca antes de tocar no banco.
  const safety = await dumpDatabase(db); // snapshot do estado atual (rollback).
  await resetSchema(db); // dropa tudo, senao o CREATE TABLE do dump colide.
  try {
    await db.exec(dumpSql); // direto, o dump inteiro (traz seu proprio BEGIN...COMMIT).
    await assertRestored(db); // pos-condicao: o schema voltou (falha LOUD).
  } catch (err) {
    // Import falhou APOS o reset: desfaz e recoloca o estado anterior.
    await rollbackTo(db, safety);
    throw err; // propaga o erro original; o dado antigo esta de volta.
  } finally {
    // O dump abre com PRAGMA foreign_keys=OFF; religa (o default dos adapters e
    // ON) para nao deixar a conexao viva sem enforcement de FK.
    await db.pragma("foreign_keys", "ON").catch(() => {});
  }
}

/**
 * Recoloca o estado anterior (`safety`, um dump valido do proprio app) apos um
 * import que falhou. O dump que falhou pode ter deixado uma transacao aberta —
 * aborta antes; depois limpa o estado parcial e reimporta o snapshot.
 */
async function rollbackTo(db: Database, safety: string): Promise<void> {
  await db.exec("ROLLBACK").catch(() => {}); // fecha txn aberta pelo dump que falhou.
  await resetSchema(db); // limpa o que o import parcial deixou.
  await db.exec(safety); // reimporta o snapshot do estado anterior.
}

/**
 * Dropa TODOS os objetos de usuario (tabelas + views). Dropar uma tabela ja
 * remove seus indices e triggers, entao tabelas + views bastam. Roda em
 * autocommit (sem BEGIN) para nao aninhar na transacao do dump; FK off para a
 * ordem de drop entre tabelas com referencia nao importar.
 */
async function resetSchema(db: Database): Promise<void> {
  const objects = await db.all<{ type: string; name: string }>(
    `SELECT type, name FROM sqlite_master
     WHERE type IN ('view', 'table') AND name NOT LIKE 'sqlite_%'`,
  );
  const q = (name: string): string => `"${name.replace(/"/g, '""')}"`;
  const stmts = ["PRAGMA foreign_keys=OFF;"];
  for (const o of objects.filter((o) => o.type === "view")) {
    stmts.push(`DROP VIEW IF EXISTS ${q(o.name)};`);
  }
  for (const o of objects.filter((o) => o.type === "table")) {
    stmts.push(`DROP TABLE IF EXISTS ${q(o.name)};`);
  }
  await db.exec(stmts.join("\n"));
}

/**
 * Confirma que o dump recriou o schema (schema_version com ao menos 1 versao).
 * Um dump validado que executa sem erro sempre satisfaz isto; a checagem existe
 * para que uma falha silenciosa (schema vazio pos-import) apareca LOUD em vez de
 * o app so mostrar "banco vazio" depois do reload.
 */
async function assertRestored(db: Database): Promise<void> {
  const version = await currentSchemaVersion(db);
  if (version < 1) {
    throw new Error(
      "Falha ao restaurar: o backup não recriou o banco. Reinstale o app e " +
        "tente de novo com o arquivo de backup.",
    );
  }
}
