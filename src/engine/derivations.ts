// =============================================================================
// STUB PROVISORIO — derivacoes puras (rsi, rsi_mod, isRecallLate, volumeByBlock).
// Implementa apenas o que os invariantes do Passo 5 exigem.
// Expansao fica para item 6 do brief §12.
// =============================================================================

import { RECALL_LATE_THRESHOLD_MIN } from "../domain/constants.ts";

/**
 * Reactive Strength Index (DJ, SSC rapido). Brief Secao 8.1:
 *   rsi = height / contact_time
 * Derivado na leitura — NUNCA gravado como coluna em jump_test (I-3).
 */
export function rsi(heightCm: number, contactTimeMs: number): number {
  return heightCm / contactTimeMs;
}

/**
 * RSI-modified (CMJ, SSC lento). Brief Secao 8.1:
 *   rsi_mod = height / time_to_takeoff
 * Sensor de fadiga. Derivado na leitura — NUNCA gravado como coluna (I-3).
 */
export function rsiMod(heightCm: number, timeToTakeoffMs: number): number {
  return heightCm / timeToTakeoffMs;
}

/**
 * Determina se um sRPE foi registrado tarde demais (I-5).
 * Threshold em constants.ts; teste valida COMPORTAMENTO (>30 vs <30), nao numero.
 */
export function isRecallLate(
  endedAtMs: number,
  recordedAtMs: number,
): boolean {
  const deltaMs = recordedAtMs - endedAtMs;
  return deltaMs > RECALL_LATE_THRESHOLD_MIN * 60 * 1000;
}

// ---------------------------------------------------------------------------

export interface ExerciseItemSets {
  readonly isWarmup: boolean;
  readonly sets: ReadonlyArray<{ readonly reps: number; readonly loadKg: number }>;
}

/**
 * Volume de um bloco. Itens com `isWarmup=true` SAO IGNORADOS (I-7).
 * Soma reps × loadKg apenas das series de itens nao-warmup.
 */
export function volumeByBlock(items: ReadonlyArray<ExerciseItemSets>): number {
  return items
    .filter((i) => !i.isWarmup)
    .flatMap((i) => i.sets)
    .reduce((sum, s) => sum + s.reps * s.loadKg, 0);
}
