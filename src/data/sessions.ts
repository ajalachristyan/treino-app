// =============================================================================
// Repositorio da SESSAO AO VIVO (Bloco D / P2) — o coracao do app.
//
// Principio (brief 1.4): male​abilidade do usuario, contabilidade do app. O
// usuario mexe livre (adicionar/pular/reordenar/substituir); o registro guarda
// o QUE mudou e POR QUE, sem relaxar.
//
// LAZY (decisao do dono, casa com anti-culpa 6.3): a session nasce com a lista
// PLANEJADA so na memoria (React, vinda de getWorkBlockItems). Uma linha
// session_item so nasce quando o item e TOCADO (1a serie / pular / substituir /
// marcar feito). Item planejado intocado nao cria linha — "evapora" com registro
// zero, sem virar pendencia.
//
// I-12: NUNCA escrevemos em work_block/work_block_item aqui — o plano fica
// intacto (provado no teste por comparacao das tabelas antes/depois).
// I-15: substituir preserva work_block_item_id (recupera o planejado); o
// substituto progride a si mesmo, nunca o planejado.
// I-13: o gate de interferencia AVISA (nao bloqueia) e grava interference_warned.
// I-6: writeSet e polimorfico e NAO tem ramo contact_time (vive em jump_test).
// =============================================================================

import type { Database } from "../db/adapter.ts";
import {
  newId,
  assertValidDeviation,
  type SessionId,
  type SessionItemId,
  type SessionSetId,
  type SessionItemStatus,
  type DeviationReason,
  type ProgressionType,
  type QualityPerSet,
} from "../domain/types.ts";
import {
  checkInterferenceGate,
  type SessionPlanItem,
} from "../engine/decision/interference.ts";

export interface SessionRow {
  id: string;
  plan_id: string | null;
  work_block_id: string | null;
  attached_routine_id: string | null;
  started_at: number;
  ended_at: number | null;
  interference_warned: number;
}

export interface SessionItemRow {
  id: string;
  session_id: string;
  exercise_id: string;
  exercise_name: string;
  progression_type: ProgressionType;
  work_block_item_id: string | null;
  from_routine_id: string | null;
  actual_sequence: number;
  status: SessionItemStatus;
  deviation_reason: DeviationReason | null;
  data_origin: string;
  is_warmup: number;
}

export interface SessionSetRow {
  id: string;
  set_index: number;
  progression_type: ProgressionType;
  reps: number | null;
  load_kg: number | null;
  assisted_load_kg: number | null;
  seconds: number | null;
  height_cm: number | null;
  intent_pct: number | null;
  difficulty_step: number | null;
  skill_achieved: number | null;
  quality: string | null;
  rpe: number | null;
}

/**
 * Medidas de UMA serie, tipadas por progression_type. NAO ha ramo contact_time
 * (I-6: contact_time so existe em jump_test, nunca session_set).
 */
export type SetMeasures =
  | { progressionType: "load_reps"; reps: number; loadKg: number }
  | { progressionType: "isometric_intent"; intentPct: number }
  | { progressionType: "contact_quality"; quality: QualityPerSet }
  | { progressionType: "jump_height"; heightCm: number }
  | { progressionType: "difficulty_tier"; difficultyStep: number }
  | { progressionType: "assisted_load"; assistedLoadKg: number; reps: number }
  | { progressionType: "skill_acquisition"; skillAchieved: boolean }
  | { progressionType: "time_under_tension"; seconds: number };

// ---------------------------------------------------------------------------
// SESSAO
// ---------------------------------------------------------------------------

export async function startTodaySession(
  db: Database,
  args: {
    planId: string | null;
    workBlockId: string | null;
    attachedRoutineId?: string | null;
    now: number;
  },
): Promise<SessionId> {
  const id = newId<SessionId>();
  await db.run(
    `INSERT INTO session
       (id, plan_id, work_block_id, attached_routine_id, started_at, ended_at,
        interference_warned, timestamp_server)
     VALUES (?, ?, ?, ?, ?, NULL, 0, ?)`,
    [
      id,
      args.planId,
      args.workBlockId,
      args.attachedRoutineId ?? null,
      args.now,
      args.now,
    ],
  );
  return id;
}

/** Recuperacao pos-crash: a sessao em andamento (ended_at NULL), se houver. */
export function getActiveSession(db: Database): Promise<SessionRow | undefined> {
  return db.get<SessionRow>(
    `SELECT id, plan_id, work_block_id, attached_routine_id, started_at,
            ended_at, interference_warned
     FROM session WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
  );
}

export async function endSession(
  db: Database,
  sessionId: string,
  now: number,
): Promise<void> {
  await db.run(`UPDATE session SET ended_at = ? WHERE id = ?`, [now, sessionId]);
}

export function getSessionItems(
  db: Database,
  sessionId: string,
): Promise<SessionItemRow[]> {
  return db.all<SessionItemRow>(
    `SELECT si.id, si.session_id, si.exercise_id, e.name AS exercise_name,
            e.progression_type, si.work_block_item_id, si.from_routine_id,
            si.actual_sequence, si.status, si.deviation_reason, si.data_origin,
            si.is_warmup
     FROM session_item si JOIN exercise e ON e.id = si.exercise_id
     WHERE si.session_id = ? ORDER BY si.actual_sequence`,
    [sessionId],
  );
}

export function getSessionSets(
  db: Database,
  sessionItemId: string,
): Promise<SessionSetRow[]> {
  return db.all<SessionSetRow>(
    `SELECT id, set_index, progression_type, reps, load_kg, assisted_load_kg,
            seconds, height_cm, intent_pct, difficulty_step, skill_achieved,
            quality, rpe
     FROM session_set WHERE session_item_id = ? ORDER BY set_index`,
    [sessionItemId],
  );
}

/** So as colunas de medida (subset de SessionSetRow) — basta para reconstruir. */
export interface MeasureRow {
  progression_type: ProgressionType;
  reps: number | null;
  load_kg: number | null;
  assisted_load_kg: number | null;
  seconds: number | null;
  height_cm: number | null;
  intent_pct: number | null;
  difficulty_step: number | null;
  skill_achieved: number | null;
  quality: string | null;
}

/** Reconstroi as medidas tipadas a partir das colunas de medida (recovery/prefill). */
export function setRowToMeasures(row: MeasureRow): SetMeasures {
  switch (row.progression_type) {
    case "load_reps":
      return { progressionType: "load_reps", reps: row.reps ?? 0, loadKg: row.load_kg ?? 0 };
    case "isometric_intent":
      return { progressionType: "isometric_intent", intentPct: row.intent_pct ?? 0 };
    case "contact_quality":
      return { progressionType: "contact_quality", quality: (row.quality ?? "stable") as QualityPerSet };
    case "jump_height":
      return { progressionType: "jump_height", heightCm: row.height_cm ?? 0 };
    case "difficulty_tier":
      return { progressionType: "difficulty_tier", difficultyStep: row.difficulty_step ?? 1 };
    case "assisted_load":
      return { progressionType: "assisted_load", assistedLoadKg: row.assisted_load_kg ?? 0, reps: row.reps ?? 0 };
    case "skill_acquisition":
      return { progressionType: "skill_acquisition", skillAchieved: row.skill_achieved === 1 };
    case "time_under_tension":
      return { progressionType: "time_under_tension", seconds: row.seconds ?? 0 };
    case "contact_time":
      // I-6: nao existe session_set contact_time; o tipo so existe por exaustao.
      throw new Error("setRowToMeasures: contact_time nao tem session_set (I-6).");
  }
}

// ---------------------------------------------------------------------------
// ITENS (lazy — so nascem quando tocados)
// ---------------------------------------------------------------------------

interface CreateItemArgs {
  sessionId: string;
  exerciseId: string;
  workBlockItemId: string | null; // o planejado (preservado p/ I-15)
  fromRoutineId?: string | null;
  actualSequence: number;
  status: SessionItemStatus;
  deviationReason?: DeviationReason | null;
  isWarmup: boolean;
  now: number;
}

/** Cria a linha session_item. Valida status->reason na fonte unica (types.ts). */
export async function createItem(
  db: Database,
  args: CreateItemArgs,
): Promise<SessionItemId> {
  const reason = args.deviationReason ?? null;
  assertValidDeviation(args.status, reason); // I-1 da regra cross-field
  const id = newId<SessionItemId>();
  await db.run(
    `INSERT INTO session_item
       (id, session_id, exercise_id, work_block_item_id, from_routine_id,
        actual_sequence, status, deviation_reason, data_origin, is_warmup,
        timestamp_server)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'live', ?, ?)`,
    [
      id,
      args.sessionId,
      args.exerciseId,
      args.workBlockItemId,
      args.fromRoutineId ?? null,
      args.actualSequence,
      args.status,
      reason,
      args.isWarmup ? 1 : 0,
      args.now,
    ],
  );
  return id;
}

/** Item planejado executado: status='done' (sem reason). */
export function markItemDone(
  db: Database,
  a: { sessionId: string; exerciseId: string; workBlockItemId: string | null; actualSequence: number; isWarmup: boolean; now: number },
): Promise<SessionItemId> {
  return createItem(db, { ...a, status: "done", deviationReason: null });
}

/** Exercicio ad-hoc adicionado na hora (sem planejado). */
export function addAdhocItem(
  db: Database,
  a: { sessionId: string; exerciseId: string; actualSequence: number; isWarmup?: boolean; now: number },
): Promise<SessionItemId> {
  return createItem(db, {
    sessionId: a.sessionId,
    exerciseId: a.exerciseId,
    workBlockItemId: null,
    actualSequence: a.actualSequence,
    status: "added_adhoc",
    deviationReason: null,
    isWarmup: a.isWarmup ?? false,
    now: a.now,
  });
}

/** Pular o planejado (evapora visualmente, mas registra com motivo). */
export function skipItem(
  db: Database,
  a: { sessionId: string; exerciseId: string; workBlockItemId: string | null; actualSequence: number; reason: DeviationReason; isWarmup?: boolean; now: number },
): Promise<SessionItemId> {
  return createItem(db, {
    sessionId: a.sessionId,
    exerciseId: a.exerciseId,
    workBlockItemId: a.workBlockItemId,
    actualSequence: a.actualSequence,
    status: "skipped",
    deviationReason: a.reason,
    isWarmup: a.isWarmup ?? false,
    now: a.now,
  });
}

/**
 * Substituir o planejado pelo substituto. I-15: exercise_id = SUBSTITUTO,
 * mas work_block_item_id = PLANEJADO (preservado para recuperar o que foi
 * substituido). O substituto progride a si mesmo; o planejado nunca.
 */
export function substituteItem(
  db: Database,
  a: { sessionId: string; substituteExerciseId: string; plannedWorkBlockItemId: string; actualSequence: number; reason: DeviationReason; isWarmup?: boolean; now: number },
): Promise<SessionItemId> {
  return createItem(db, {
    sessionId: a.sessionId,
    exerciseId: a.substituteExerciseId,
    workBlockItemId: a.plannedWorkBlockItemId, // PRESERVA o planejado (I-15)
    actualSequence: a.actualSequence,
    status: "substituted",
    deviationReason: a.reason,
    isWarmup: a.isWarmup ?? false,
    now: a.now,
  });
}

/**
 * Reordena os itens persistidos para a nova ordem (lista de ids na ordem). Faz
 * em DUAS fases numa transacao para nao colidir o UNIQUE(session_id,
 * actual_sequence): primeiro joga todos para um offset alto, depois renumera
 * 1..n na ordem dada.
 */
export async function resequenceItems(
  db: Database,
  sessionId: string,
  orderedItemIds: readonly string[],
): Promise<void> {
  // Guarda (red team): a lista DEVE conter exatamente os itens persistidos da
  // sessao. Lista parcial colidiria o UNIQUE na fase 2 (um item omitido com
  // sequencia <= n). Falha LOUD em vez de abortar a transacao silenciosamente.
  const existing = await db.all<{ id: string }>(
    `SELECT id FROM session_item WHERE session_id = ?`,
    [sessionId],
  );
  const given = new Set(orderedItemIds);
  if (existing.length !== given.size || existing.some((r) => !given.has(r.id))) {
    throw new Error(
      `resequenceItems: a lista deve conter exatamente os ${existing.length} ` +
        `itens da sessao (recebidos ${given.size}).`,
    );
  }
  await db.transaction(async () => {
    const OFFSET = 100000;
    for (let i = 0; i < orderedItemIds.length; i++) {
      await db.run(
        `UPDATE session_item SET actual_sequence = ? WHERE id = ? AND session_id = ?`,
        [OFFSET + i, orderedItemIds[i], sessionId],
      );
    }
    for (let i = 0; i < orderedItemIds.length; i++) {
      await db.run(
        `UPDATE session_item SET actual_sequence = ? WHERE id = ? AND session_id = ?`,
        [i + 1, orderedItemIds[i], sessionId],
      );
    }
  });
}

// ---------------------------------------------------------------------------
// SERIES (writeSet polimorfico — I-6: sem ramo contact_time)
// ---------------------------------------------------------------------------

type MeasureCols = {
  reps: number | null;
  load_kg: number | null;
  assisted_load_kg: number | null;
  seconds: number | null;
  height_cm: number | null;
  intent_pct: number | null;
  difficulty_step: number | null;
  skill_achieved: number | null;
  quality: string | null;
};

function measureColumns(m: SetMeasures): MeasureCols {
  const base: MeasureCols = {
    reps: null,
    load_kg: null,
    assisted_load_kg: null,
    seconds: null,
    height_cm: null,
    intent_pct: null,
    difficulty_step: null,
    skill_achieved: null,
    quality: null,
  };
  switch (m.progressionType) {
    case "load_reps":
      return { ...base, reps: m.reps, load_kg: m.loadKg };
    case "isometric_intent":
      return { ...base, intent_pct: m.intentPct };
    case "contact_quality":
      return { ...base, quality: m.quality };
    case "jump_height":
      return { ...base, height_cm: m.heightCm };
    case "difficulty_tier":
      return { ...base, difficulty_step: m.difficultyStep };
    case "assisted_load":
      return { ...base, assisted_load_kg: m.assistedLoadKg, reps: m.reps };
    case "skill_acquisition":
      return { ...base, skill_achieved: m.skillAchieved ? 1 : 0 };
    case "time_under_tension":
      return { ...base, seconds: m.seconds };
  }
}

/**
 * Grava uma serie. O CHECK exaustivo do schema valida que SO as colunas certas
 * do tipo estao preenchidas; coluna errada FALHA (canario). `qualitySecondary`
 * e o sinal opcional de qualidade para tipos != contact_quality (papel duplo da
 * coluna quality).
 */
export async function writeSet(
  db: Database,
  a: {
    sessionItemId: string;
    setIndex: number;
    measures: SetMeasures;
    qualitySecondary?: QualityPerSet | null;
    rpe?: number | null;
    notes?: string | null;
    now: number;
  },
): Promise<SessionSetId> {
  const cols = measureColumns(a.measures);
  if (
    a.measures.progressionType !== "contact_quality" &&
    a.qualitySecondary != null
  ) {
    cols.quality = a.qualitySecondary;
  }
  const id = newId<SessionSetId>();
  await db.run(
    `INSERT INTO session_set
       (id, session_item_id, set_index, progression_type,
        reps, load_kg, assisted_load_kg, seconds, height_cm, intent_pct,
        difficulty_step, skill_achieved, quality, rpe, notes, timestamp_server)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      a.sessionItemId,
      a.setIndex,
      a.measures.progressionType,
      cols.reps,
      cols.load_kg,
      cols.assisted_load_kg,
      cols.seconds,
      cols.height_cm,
      cols.intent_pct,
      cols.difficulty_step,
      cols.skill_achieved,
      cols.quality,
      a.rpe ?? null,
      a.notes ?? null,
      a.now,
    ],
  );
  return id;
}

/**
 * Pre-preenchimento (memoria de carga, brief 6.1): a serie mais recente daquele
 * exercicio em qualquer sessao. Devolve o progression_type + as colunas crap
 * para a UI sugerir os mesmos valores.
 */
export function prefillFromLastExecution(
  db: Database,
  exerciseId: string,
): Promise<MeasureRow | undefined> {
  return db.get<MeasureRow>(
    `SELECT ss.progression_type, ss.reps, ss.load_kg, ss.assisted_load_kg,
            ss.seconds, ss.height_cm, ss.intent_pct, ss.difficulty_step,
            ss.skill_achieved, ss.quality
     FROM session_set ss
     JOIN session_item si ON si.id = ss.session_item_id
     WHERE si.exercise_id = ?
     ORDER BY ss.timestamp_server DESC LIMIT 1`,
    [exerciseId],
  );
}

/** A ultima execucao daquele exercicio como SetMeasures (memoria de carga). */
export async function lastMeasuresFor(
  db: Database,
  exerciseId: string,
): Promise<SetMeasures | undefined> {
  const row = await prefillFromLastExecution(db, exerciseId);
  return row !== undefined ? setRowToMeasures(row) : undefined;
}

// ---------------------------------------------------------------------------
// ENGINE NA LEITURA (sem persistir interpretacao)
// ---------------------------------------------------------------------------

/**
 * I-13: roda o gate de interferencia sobre os itens PLANEJADOS da sessao; se
 * disparar, grava session.interference_warned=1 (FATO de que o gate acionou —
 * nao interpretacao) e devolve o aviso. NUNCA bloqueia.
 */
export async function applyInterferenceGate(
  db: Database,
  sessionId: string,
  planItems: ReadonlyArray<SessionPlanItem>,
): Promise<ReturnType<typeof checkInterferenceGate>> {
  const warning = checkInterferenceGate(planItems);
  if (warning !== null) {
    await db.run(
      `UPDATE session SET interference_warned = 1 WHERE id = ?`,
      [sessionId],
    );
  }
  return warning;
}

/**
 * Sugestao de substituto por funcao (function_tag). Engine de verdade vem na P5;
 * aqui e SQL simples — mesma tag, exercicio diferente. Limite: P2 REGISTRA, a
 * interpretacao real fica para a P5.
 */
export function suggestSubstitutes(
  db: Database,
  exerciseId: string,
): Promise<{ id: string; name: string }[]> {
  return db.all<{ id: string; name: string }>(
    `SELECT id, name FROM exercise
     WHERE function_tag IS NOT NULL
       AND function_tag = (SELECT function_tag FROM exercise WHERE id = ?)
       AND id != ?
     ORDER BY name`,
    [exerciseId, exerciseId],
  );
}

// ---------------------------------------------------------------------------
// HISTORICO (leitura de sessoes finalizadas) + manutencao
// ---------------------------------------------------------------------------

export interface FinishedSessionRow {
  id: string;
  started_at: number;
  ended_at: number;
  work_block_name: string | null;
}

/**
 * Sessoes FINALIZADAS (ended_at != NULL), mais recentes primeiro, com o nome do
 * bloco do dia (LEFT JOIN — sessao livre nao tem bloco). E a fonte da tela
 * Historico: o treino registrado continua no banco depois de finalizar, so
 * faltava onde ve-lo.
 */
export function getFinishedSessions(db: Database): Promise<FinishedSessionRow[]> {
  return db.all<FinishedSessionRow>(
    `SELECT s.id, s.started_at, s.ended_at, wb.name AS work_block_name
     FROM session s
     LEFT JOIN work_block wb ON wb.id = s.work_block_id
     WHERE s.ended_at IS NOT NULL
     ORDER BY s.started_at DESC`,
  );
}

/**
 * Remove uma sessao INTEIRA (series + itens + registros derivados). Uso:
 * descartar um treino de teste/engano. Cascata manual na ordem das FK, numa
 * transacao. NUNCA toca no plano (work_block/work_block_item) nem no catalogo —
 * so apaga o que a propria sessao criou (I-12 continua valido).
 */
export async function discardSession(
  db: Database,
  sessionId: string,
): Promise<void> {
  await db.transaction(async () => {
    await db.run(
      `DELETE FROM session_set WHERE session_item_id IN
         (SELECT id FROM session_item WHERE session_id = ?)`,
      [sessionId],
    );
    await db.run(`DELETE FROM session_item WHERE session_id = ?`, [sessionId]);
    await db.run(`DELETE FROM session_load WHERE session_id = ?`, [sessionId]);
    await db.run(`DELETE FROM jump_test WHERE session_id = ?`, [sessionId]);
    await db.run(`DELETE FROM session WHERE id = ?`, [sessionId]);
  });
}
