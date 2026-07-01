// =============================================================================
// prescription.ts — overlay de LEITURA: memoria de carga x intencao da fase.
// NUNCA muta o plano (I-12). O sugeridor so rearranja o conteudo do PROPRIO
// plano (faixa/serie/carga por fase); jamais autora treino novo. Sem historico
// => carga em branco (o dono digita). Zero estimativa antropometrica.
// Plano do motor §7.1-7.3 / handoff §5.
// =============================================================================

import {
  DELOAD_LOAD_FACTOR,
  DELOAD_VOLUME_FACTOR,
  LOAD_INCREMENT_KG,
  M1_REP_RANGE,
  M2_REP_RANGE,
  M3_PAP_INTENSITY_PCT,
  M3_PAP_REPS,
  M3_PAP_SETS,
  PRIMARY_STRENGTH_FUNCTION_TAGS,
  TAPER_VOLUME_FACTOR,
} from "../../domain/constants.ts";
import type { PhaseEmphasis } from "./phase.ts";
import {
  latestExecutedOccurrence,
  shouldProgressExercise,
  type SessionItemHistory,
} from "./progression.ts";

export type PrescriptionMode =
  | "double_progression"
  | "peak_pap"
  | "pass_through";

export type RecoveryReason = "none" | "deload" | "taper" | "reactive_deload";

export interface RepRange {
  readonly min: number;
  readonly max: number;
}

export interface PrescriptionItem {
  readonly exerciseId: string;
  readonly functionTag: string | null;
  readonly progressionType: string;
  readonly repMin: number | null;
  readonly repMax: number | null;
  readonly plannedSets: number | null;
}

export interface Prescription {
  readonly mode: PrescriptionMode;
  readonly sets: number | null;
  readonly repRange: RepRange | null;
  readonly suggestedLoadKg: number | null;
  readonly intensityHintPct: number | null;
  readonly recovery: RecoveryReason;
}

export interface RecoveryContext {
  readonly isScheduledDeload: boolean;
  readonly isScheduledTaper: boolean;
  readonly isReactiveDeload: boolean;
}

/** Forca primaria = tag na lista (bucket por TAG, nao por priority). */
function isPrimaryStrength(item: PrescriptionItem): boolean {
  return (
    item.functionTag !== null &&
    PRIMARY_STRENGTH_FUNCTION_TAGS.includes(item.functionTag)
  );
}

/** Carga de referencia = maior carga de trabalho da ultima execucao (memoria). */
function memoryLoadKg(
  exerciseId: string,
  history: ReadonlyArray<SessionItemHistory>,
): number | null {
  const latest = latestExecutedOccurrence(exerciseId, history);
  if (!latest || latest.sets.length === 0) return null;
  let max: number | null = null;
  for (const set of latest.sets) {
    if (max === null || set.loadKg > max) max = set.loadKg;
  }
  return max;
}

/** Dupla progressao numa faixa: bateu o topo na maioria das series => +incremento. */
function doubleProgression(
  item: PrescriptionItem,
  range: RepRange,
  history: ReadonlyArray<SessionItemHistory>,
  memory: number | null,
): Prescription {
  let load = memory;
  if (memory !== null) {
    const progresses = shouldProgressExercise(
      item.exerciseId,
      history,
      range,
      item.plannedSets,
    );
    load = progresses ? memory + LOAD_INCREMENT_KG : memory;
  }
  return {
    mode: "double_progression",
    sets: item.plannedSets,
    repRange: range,
    suggestedLoadKg: load,
    intensityHintPct: null,
    recovery: "none",
  };
}

/**
 * O que a fase prescreve para UM item, a partir da memoria de carga.
 * - forca primaria (por tag): molde da fase (M1/M2 dupla progressao; M3 PAP);
 * - acessorio load_reps com faixa: dupla progressao na PROPRIA faixa;
 * - plio/iso/skill/mobilidade: pass-through (sem carga).
 */
export function suggestPrescription(
  item: PrescriptionItem,
  emphasis: PhaseEmphasis,
  history: ReadonlyArray<SessionItemHistory>,
): Prescription {
  const memory = memoryLoadKg(item.exerciseId, history);

  if (isPrimaryStrength(item)) {
    if (emphasis === "m3") {
      // PAP: 2x2 fixo, dica @85%; carga = memoria (o dono digita; sem e1RM).
      return {
        mode: "peak_pap",
        sets: M3_PAP_SETS,
        repRange: { min: M3_PAP_REPS, max: M3_PAP_REPS },
        suggestedLoadKg: memory,
        intensityHintPct: M3_PAP_INTENSITY_PCT,
        recovery: "none",
      };
    }
    const range = emphasis === "m1" ? M1_REP_RANGE : M2_REP_RANGE;
    return doubleProgression(item, range, history, memory);
  }

  if (
    item.progressionType === "load_reps" &&
    item.repMin !== null &&
    item.repMax !== null
  ) {
    return doubleProgression(
      item,
      { min: item.repMin, max: item.repMax },
      history,
      memory,
    );
  }

  // Plio/iso/skill/mobilidade — pass-through + cue: o app nunca inventa carga.
  return {
    mode: "pass_through",
    sets: item.plannedSets,
    repRange:
      item.repMin !== null && item.repMax !== null
        ? { min: item.repMin, max: item.repMax }
        : null,
    suggestedLoadKg: null,
    intensityHintPct: null,
    recovery: "none",
  };
}

/** Arredonda a sugestao de carga pra 0,5 kg (e so uma sugestao; o dono ajusta). */
function roundToHalfKg(kg: number): number {
  return Math.round(kg * 2) / 2;
}

/**
 * Encolhe a prescricao na recuperacao. UM fator unico, nunca empilhado (red team
 * B3): o agendado (deload/taper) SUPRIME o reativo — nunca deload x reativo =
 * x0.25. Taper mantem a carga e corta so o volume.
 */
export function modifyForRecovery(
  base: Prescription,
  ctx: RecoveryContext,
): Prescription {
  let loadFactor: number;
  let volumeFactor: number;
  let reason: RecoveryReason;
  if (ctx.isScheduledDeload) {
    loadFactor = DELOAD_LOAD_FACTOR;
    volumeFactor = DELOAD_VOLUME_FACTOR;
    reason = "deload";
  } else if (ctx.isScheduledTaper) {
    loadFactor = 1; // taper mantem a carga; corta so o volume
    volumeFactor = TAPER_VOLUME_FACTOR;
    reason = "taper";
  } else if (ctx.isReactiveDeload) {
    loadFactor = DELOAD_LOAD_FACTOR;
    volumeFactor = DELOAD_VOLUME_FACTOR;
    reason = "reactive_deload";
  } else {
    return base;
  }

  const sets =
    base.sets === null
      ? null
      : Math.max(1, Math.round(base.sets * volumeFactor));
  const suggestedLoadKg =
    base.suggestedLoadKg === null
      ? null
      : roundToHalfKg(base.suggestedLoadKg * loadFactor);

  return { ...base, sets, suggestedLoadKg, recovery: reason };
}
