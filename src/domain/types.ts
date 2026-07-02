import { v7 as uuidv7 } from "uuid";

// ============================================================================
// IDs brandados — impede passar exerciseId onde se espera sessionId etc.
// ============================================================================

type Brand<T, K extends string> = T & { readonly __brand: K };

export type ExerciseId = Brand<string, "ExerciseId">;
export type PlanId = Brand<string, "PlanId">;
export type WorkBlockId = Brand<string, "WorkBlockId">;
export type WorkBlockItemId = Brand<string, "WorkBlockItemId">;
export type RoutineId = Brand<string, "RoutineId">;
export type SessionId = Brand<string, "SessionId">;
export type SessionItemId = Brand<string, "SessionItemId">;
export type SessionSetId = Brand<string, "SessionSetId">;
export type JumpTestId = Brand<string, "JumpTestId">;
export type SessionLoadId = Brand<string, "SessionLoadId">;
export type BodyWeightLogId = Brand<string, "BodyWeightLogId">;
export type PainLogId = Brand<string, "PainLogId">;
export type MissedSessionId = Brand<string, "MissedSessionId">;

export function newId<T extends string>(): T {
  return uuidv7() as T;
}

// ============================================================================
// Quantidades brandadas — impedem "passei kg onde se esperava cm" etc.
// ============================================================================

export type Cm = Brand<number, "Cm">;
export type Ms = Brand<number, "Ms">;
export type Kg = Brand<number, "Kg">;
export type Seconds = Brand<number, "Seconds">;
export type Rpe = Brand<number, "Rpe">; // CR10, 0-10
export type EpochMs = Brand<number, "EpochMs">;

// ============================================================================
// Enums do domínio — padrão único: const array + literal union derivado.
// Adicionar valor no array atualiza o tipo automaticamente.
// ============================================================================

export const PROGRESSION_TYPES = [
  "load_reps",
  "isometric_intent",
  "contact_quality",
  "contact_time",
  "jump_height",
  "difficulty_tier",
  "assisted_load",
  "skill_acquisition",
  "time_under_tension",
] as const;
export type ProgressionType = (typeof PROGRESSION_TYPES)[number];

export const PRIORITIES = ["primary", "accessory", "finisher", "bonus"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const LOAD_TYPES = [
  "barbell",
  "dumbbell",
  "band",
  "bodyweight",
  "assisted",
  "box_height",
] as const;
export type LoadType = (typeof LOAD_TYPES)[number];

export const SESSION_ITEM_STATUSES = [
  "done",
  "skipped",
  "substituted",
  "reordered",
  "deferred",
  "added_adhoc",
] as const;
export type SessionItemStatus = (typeof SESSION_ITEM_STATUSES)[number];

/**
 * Statuses de session_item que implicam EXECUCAO (o item foi FEITO, mesmo que
 * substituindo o planejado). FONTE UNICA da regra "o que conta como executado" —
 * consumida pela progressao (progression.ts), pelo historico de execucao
 * (sessions.ts: executionHistoryFor) e pela aderencia (data/adherence.ts).
 * Adicionar/reclassificar um status aqui propaga para os tres; skipped/deferred
 * ficam DE FORA (nao-feito). Ver feedback-single-source-of-truth.
 */
export const EXECUTED_SESSION_ITEM_STATUSES: readonly SessionItemStatus[] = [
  "done",
  "substituted",
  "reordered",
  "added_adhoc",
];

export const DEVIATION_REASONS = [
  "equipment_busy",
  "injury_avoidance",
  "user_choice",
  "engine_suggested",
] as const;
export type DeviationReason = (typeof DEVIATION_REASONS)[number];

export const DATA_ORIGINS = ["live", "narrated"] as const;
export type DataOrigin = (typeof DATA_ORIGINS)[number];

export const MEASUREMENT_SOURCES = ["instrumented", "subjective"] as const;
export type MeasurementSource = (typeof MEASUREMENT_SOURCES)[number];

export const QUALITY_PER_SETS = ["stable", "tremor", "joint_pain"] as const;
export type QualityPerSet = (typeof QUALITY_PER_SETS)[number];

export const JUMP_TYPES = ["CMJ", "SJ", "DJ", "approach", "bounce"] as const;
export type JumpType = (typeof JUMP_TYPES)[number];

// ============================================================================
// Tipos compostos
// ============================================================================

export type RepRange = { readonly min: number; readonly max: number };

export type FunctionTag = Brand<string, "FunctionTag">;
export function asFunctionTag(s: string): FunctionTag {
  return s as FunctionTag;
}

// ============================================================================
// Regra cross-field: status -> deviation_reason
// Fonte ÚNICA de verdade. Schema não replica (ver feedback-single-source-of-truth).
// ============================================================================

const REASON_REQUIRED_STATUSES = ["skipped", "substituted", "deferred"] as const;
const REASON_FORBIDDEN_STATUSES = ["done"] as const;

function isReasonRequired(s: SessionItemStatus): boolean {
  return (REASON_REQUIRED_STATUSES as readonly string[]).includes(s);
}

function isReasonForbidden(s: SessionItemStatus): boolean {
  return (REASON_FORBIDDEN_STATUSES as readonly string[]).includes(s);
}

export function assertValidDeviation(
  status: SessionItemStatus,
  reason: DeviationReason | null,
): void {
  if (isReasonRequired(status) && reason === null) {
    throw new Error(
      `status='${status}' requires a deviation_reason (one of: ${DEVIATION_REASONS.join(", ")})`,
    );
  }
  if (isReasonForbidden(status) && reason !== null) {
    throw new Error(
      `status='${status}' must have null deviation_reason; received '${reason}'`,
    );
  }
}
