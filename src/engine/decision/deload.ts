// =============================================================================
// STUB PROVISORIO — deload (Secao 8.3).
// Implementa apenas o que I-4 e I-5 exigem:
//   - I-4: ramo objetivo opera SO sobre instrumentado.
//   - I-5: entradas recall_late=true sao EXCLUIDAS do gatilho.
// Expansao para item 6 do brief §12.
//
// I-9 (NOT consulted): este modulo NAO le, nao importa, nao computa razao
// aguda:cronica. Decisao de deload eh tomada sobre carga absoluta e sinais
// objetivos/subjetivos, nunca sobre o ratio. O teste I-9 grepa este diretorio
// e exige zero ocorrencias.
// =============================================================================

import {
  CONSECUTIVE_LOAD_DROP_DAYS_FOR_DELOAD,
  LOAD_DROP_THRESHOLD_PCT,
  OBJECTIVE_DELOAD_JUMP_DROP_PCT,
} from "../../domain/constants.ts";

export interface InstrumentedJumpEntry {
  readonly day: number;
  readonly heightCm: number;
}

export interface SubjectiveSignal {
  readonly day: number;
  readonly sorenessEnergy: number;
}

export interface LoadEntry {
  readonly day: number;
  readonly load: number;
  readonly recallLate: boolean;
}

/**
 * Ramo OBJETIVO do deload (I-4). Opera APENAS sobre dados instrumentados.
 * Sinais subjetivos sao ignorados deliberadamente (eles vivem no proprio
 * ramo subjetivo, nao neste).
 */
export function shouldSuggestObjectiveDeload(input: {
  instrumentedJumps?: ReadonlyArray<InstrumentedJumpEntry>;
  subjectiveSignals?: ReadonlyArray<SubjectiveSignal>; // ACEITO MAS IGNORADO
}): boolean {
  const jumps = input.instrumentedJumps ?? [];
  if (jumps.length < 2) return false;

  const half = Math.floor(jumps.length / 2);
  const baseline =
    jumps.slice(0, half).reduce((s, j) => s + j.heightCm, 0) / half;
  const recent =
    jumps.slice(half).reduce((s, j) => s + j.heightCm, 0) /
    (jumps.length - half);

  const drop = (baseline - recent) / baseline;
  return drop >= OBJECTIVE_DELOAD_JUMP_DROP_PCT;
}

/**
 * Sugestao de deload baseada em queda consecutiva de carga (Secao 8.3).
 * I-5: entradas com `recallLate=true` sao FILTRADAS antes do calculo.
 */
export function shouldSuggestDeload(
  entries: ReadonlyArray<LoadEntry>,
): boolean {
  // I-5: exclusao deterministica, nao "menos confiavel".
  const filtered = entries.filter((e) => !e.recallLate);
  if (filtered.length < CONSECUTIVE_LOAD_DROP_DAYS_FOR_DELOAD + 1) return false;

  const sorted = [...filtered].sort((a, b) => a.day - b.day);
  // Brief §8.3 ("≥2 sessoes de queda de carga"): conta sessoes ABAIXO da
  // baseline (media da serie filtrada) por uma margem >= LOAD_DROP_THRESHOLD_PCT.
  // Interpretacao "abaixo da baseline" e nao "transicao de drop entre dias
  // consecutivos" — series como [500,500,200,200,500,...] tem 2 sessoes
  // de queda (dias 3 e 4), mesmo que a transicao entre 3 e 4 nao seja
  // queda. Threshold em constants.ts (TODO).
  const mean = sorted.reduce((s, e) => s + e.load, 0) / sorted.length;
  if (mean === 0) return false;
  const lowThreshold = mean * (1 - LOAD_DROP_THRESHOLD_PCT);

  let consecutive = 0;
  for (const e of sorted) {
    if (e.load < lowThreshold) {
      consecutive++;
      if (consecutive >= CONSECUTIVE_LOAD_DROP_DAYS_FOR_DELOAD) return true;
    } else {
      consecutive = 0;
    }
  }
  return false;
}
