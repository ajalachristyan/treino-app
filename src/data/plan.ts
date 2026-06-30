// =============================================================================
// Selectors do plano (read-only) — Bloco C / P1.
//
// SQL num lugar so. As derivacoes "que semana e agora" e "que dia ISO e hoje"
// sao calculadas NA LEITURA (nunca persistidas) — o principio-mae do brief:
// o instante (epoch ms) e fato; "que semana/dia do plano" e interpretacao.
// =============================================================================

import type { Database } from "../db/adapter.ts";

export interface PlanRow {
  id: string;
  name: string;
  start_date: number; // epoch ms
  duration_weeks: number;
}

export interface PhaseRow {
  id: string;
  name: string;
  week_start: number;
  week_end: number;
  is_deload: number; // 0/1
  is_taper: number; // 0/1
}

export interface WorkBlockRow {
  id: string;
  name: string;
  day_of_week: number | null; // ISO Seg=1..Dom=7
  week_start: number | null;
  week_end: number | null;
  ordered: number; // 0/1
}

export interface WorkBlockItemRow {
  id: string;
  exercise_id: string;
  exercise_name: string;
  progression_type: string;
  priority: string;
  planned_sequence: number;
  planned_sets: number | null;
  notes: string | null;
  is_warmup: number; // 0/1
  acute_interference: number; // 0/1 — alimenta o gate I-13
  function_tag: string | null;
}

export interface RoutineRow {
  id: string;
  name: string;
  attachable: number; // 0/1
  recurring: number; // 0/1
}

const WEEK_MS = 7 * 86400000;

/** O plano (so ha um no seed). */
export function getPlan(db: Database): Promise<PlanRow | undefined> {
  return db.get<PlanRow>(
    "SELECT id, name, start_date, duration_weeks FROM plan LIMIT 1",
  );
}

export function getPhases(db: Database, planId: string): Promise<PhaseRow[]> {
  return db.all<PhaseRow>(
    `SELECT id, name, week_start, week_end, is_deload, is_taper
     FROM plan_phase WHERE plan_id = ? ORDER BY week_start`,
    [planId],
  );
}

/**
 * DERIVADO na leitura (nunca coluna): em que semana (1..duration_weeks) o
 * instante `now` cai, dado o start_date do plano. Clampado ao intervalo valido.
 */
export function currentWeek(plan: PlanRow, now: number): number {
  const elapsed = Math.floor((now - plan.start_date) / WEEK_MS);
  return Math.min(Math.max(elapsed + 1, 1), plan.duration_weeks);
}

/** A fase que contem a semana (ou undefined se fora do plano). */
export function phaseForWeek(
  phases: readonly PhaseRow[],
  week: number,
): PhaseRow | undefined {
  return phases.find((p) => week >= p.week_start && week <= p.week_end);
}

/**
 * Dia da semana em ISO (Seg=1..Dom=7) a partir de um Date local. JS getDay() e
 * Dom=0..Sab=6 — convertemos para casar com work_block.day_of_week (ISO).
 */
export function isoDayOfWeek(now: Date): number {
  const js = now.getDay(); // 0=Dom..6=Sab
  return js === 0 ? 7 : js;
}

/**
 * Blocos do PLANO que se aplicam a uma semana. Bloco com week_start NULL vale
 * para todas as semanas (Ter/Qui/Seg/Qua/Sab); com range, so na janela (os 3
 * blocos de salto por fase). Ordenado por dia da semana.
 */
export function getPlanBlocksForWeek(
  db: Database,
  planId: string,
  week: number,
): Promise<WorkBlockRow[]> {
  return db.all<WorkBlockRow>(
    `SELECT id, name, day_of_week, week_start, week_end, ordered
     FROM work_block
     WHERE plan_id = ?
       AND (week_start IS NULL OR ? BETWEEN week_start AND week_end)
     ORDER BY day_of_week`,
    [planId, week],
  );
}

/** Itens de um bloco, com nome/tipo do exercise (JOIN), na ordem planejada. */
export function getWorkBlockItems(
  db: Database,
  workBlockId: string,
): Promise<WorkBlockItemRow[]> {
  return db.all<WorkBlockItemRow>(
    `SELECT wbi.id, wbi.exercise_id, e.name AS exercise_name,
            e.progression_type, e.priority, wbi.planned_sequence,
            wbi.planned_sets, wbi.notes, wbi.is_warmup, e.acute_interference,
            e.function_tag
     FROM work_block_item wbi
     JOIN exercise e ON e.id = wbi.exercise_id
     WHERE wbi.work_block_id = ? AND wbi.active = 1
     ORDER BY wbi.planned_sequence`,
    [workBlockId],
  );
}

/** Rotinas anexaveis (mobilidade/core). Recorrentes primeiro. */
export function getAttachableRoutines(db: Database): Promise<RoutineRow[]> {
  return db.all<RoutineRow>(
    `SELECT id, name, attachable, recurring FROM routine
     WHERE attachable = 1 ORDER BY recurring DESC, name`,
  );
}

export interface ExerciseRow {
  id: string;
  name: string;
  progression_type: string;
  function_tag: string | null;
}

/** Catalogo completo de exercicios (para escolher ad-hoc / substituto). */
export function getAllExercises(db: Database): Promise<ExerciseRow[]> {
  return db.all<ExerciseRow>(
    `SELECT id, name, progression_type, function_tag FROM exercise ORDER BY name`,
  );
}

/** Blocos de uma rotina (a rotina tem seus proprios work_blocks). */
export function getRoutineBlocks(
  db: Database,
  routineId: string,
): Promise<WorkBlockRow[]> {
  return db.all<WorkBlockRow>(
    `SELECT id, name, day_of_week, week_start, week_end, ordered
     FROM work_block WHERE routine_id = ? ORDER BY name`,
    [routineId],
  );
}
