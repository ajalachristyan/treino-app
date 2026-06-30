// =============================================================================
// Repositorio de FALTAS (P2.5) — "nao treinei neste dia".
//
// Fato imutavel (brief: observacao e fato). Distinto da sessao LAZY: a falta e um
// registro DELIBERADO do dono — ele aperta "Nao treinei hoje". Sem update: so
// insert / get / delete (o delete desfaz um toque errado). Nao mexe na semana do
// plano (isso e o "empurrao" em planConfig.repeatCurrentWeek) — a falta so
// alimenta o historico/estatistica, pra "sem prejuizo" nao virar amnesia.
// =============================================================================

import type { Database } from "../db/adapter.ts";
import { newId, type MissedSessionId } from "../domain/types.ts";

export interface MissedSessionRow {
  id: string;
  missed_date: number; // epoch ms, meia-noite local
  work_block_id: string | null;
  reason: string | null;
  created_at: number;
}

export interface RecordMissArgs {
  missedDate: number; // epoch ms, meia-noite local do dia faltado
  workBlockId?: string | null; // bloco planejado (opcional)
  reason?: string | null; // motivo curto (opcional)
  now: number; // epoch ms (created_at) — injetado p/ testabilidade/determinismo
}

const SELECT_COLS =
  "id, missed_date, work_block_id, reason, created_at FROM missed_session";

/** Grava uma falta. Motivo so-espacos vira NULL. Devolve o id criado. */
export async function recordMiss(
  db: Database,
  args: RecordMissArgs,
): Promise<MissedSessionId> {
  const id = newId<MissedSessionId>();
  await db.run(
    `INSERT INTO missed_session (id, missed_date, work_block_id, reason, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      id,
      args.missedDate,
      args.workBlockId ?? null,
      args.reason?.trim() || null,
      args.now,
    ],
  );
  return id;
}

/**
 * Faltas, mais recente primeiro. Sem `range` = todas; com `range` = as cujo
 * missed_date cai em [from, to] (epoch ms, inclusivo).
 */
export function getMisses(
  db: Database,
  range?: { from: number; to: number },
): Promise<MissedSessionRow[]> {
  if (range) {
    return db.all<MissedSessionRow>(
      `SELECT ${SELECT_COLS} WHERE missed_date BETWEEN ? AND ?
       ORDER BY missed_date DESC, created_at DESC`,
      [range.from, range.to],
    );
  }
  return db.all<MissedSessionRow>(
    `SELECT ${SELECT_COLS} ORDER BY missed_date DESC, created_at DESC`,
  );
}

/** Faltas registradas para um dia (meia-noite local). Pro "ja marquei hoje?". */
export function getMissesForDate(
  db: Database,
  dateMidnight: number,
): Promise<MissedSessionRow[]> {
  return db.all<MissedSessionRow>(
    `SELECT ${SELECT_COLS} WHERE missed_date = ? ORDER BY created_at DESC`,
    [dateMidnight],
  );
}

/** Desfaz uma falta (toque errado). */
export async function deleteMiss(db: Database, id: string): Promise<void> {
  await db.run("DELETE FROM missed_session WHERE id = ?", [id]);
}
