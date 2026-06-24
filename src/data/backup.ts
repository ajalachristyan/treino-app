// =============================================================================
// Download do backup (.sql) — Bloco B.
//
// A durabilidade REAL no iOS nao vem do VFS (pode ser despejado/corrompido);
// vem de instalar + persist() + BACKUP EXTERNO (brief 10.5). Este e o backup
// externo manual ate o sync no Drive (P3). O botao "Baixar backup" chama
// downloadBackup; o usuario guarda o .sql em Arquivos/iCloud.
// =============================================================================

import type { Database } from "../db/adapter.ts";
import { dumpDatabase } from "./dump.ts";

/**
 * Nome do arquivo de backup com timestamp local. `now` e parametro para ser
 * deterministico em teste (e nao depender do relogio).
 */
export function backupFilename(now: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  // Resolucao de SEGUNDOS para dois backups no mesmo minuto nao colidirem.
  const stamp =
    `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}` +
    `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `treino-backup-${stamp}.sql`;
}

/**
 * Gera o dump SQL e dispara o download como arquivo .sql. Browser-only (Blob +
 * <a download>). Revoga a object URL no finally para nao vazar.
 */
export async function downloadBackup(
  db: Database,
  now: Date = new Date(),
): Promise<void> {
  const sql = await dumpDatabase(db);
  // text/plain (nao "application/sql", nao-padrao): o iOS/Safari nao renomeia
  // nem trata como binario; o .download abaixo fixa a extensao .sql.
  const blob = new Blob([sql], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = backupFilename(now);
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
