// =============================================================================
// STUB PROVISORIO — tendencia (I-14, brief 8.3 anti-poluicao).
// Semanas marcadas como deload sao EXCLUIDAS do calculo de tendencia — uma
// queda nelas eh PLANO, nao regressao. Expansao para item 6 do brief §12.
// =============================================================================

import { TREND_REGRESSION_THRESHOLD_PCT } from "../../domain/constants.ts";

export type TrendClassification = "rising" | "stable" | "regression";

export interface WeeklyVolume {
  readonly week: number;
  readonly volume: number;
}

export interface PhaseInfo {
  readonly weekStart: number;
  readonly weekEnd: number;
  readonly isDeload: boolean;
}

function isWeekDeload(week: number, phases: ReadonlyArray<PhaseInfo>): boolean {
  return phases.some(
    (p) => p.isDeload && week >= p.weekStart && week <= p.weekEnd,
  );
}

/**
 * Classifica tendencia da serie de cargas semanais. Semanas marcadas
 * `isDeload=true` na lista de fases sao EXCLUIDAS do calculo (I-14).
 */
export function computeTrend(
  volumes: ReadonlyArray<WeeklyVolume>,
  phases: ReadonlyArray<PhaseInfo>,
): TrendClassification {
  const usable = volumes.filter((v) => !isWeekDeload(v.week, phases));
  if (usable.length < 2) return "stable";

  const sorted = [...usable].sort((a, b) => a.week - b.week);
  const half = Math.floor(sorted.length / 2);
  const earlierMean =
    sorted.slice(0, half).reduce((s, v) => s + v.volume, 0) / half;
  const laterMean =
    sorted.slice(half).reduce((s, v) => s + v.volume, 0) /
    (sorted.length - half);

  if (earlierMean === 0) return "stable";
  const change = (laterMean - earlierMean) / earlierMean;

  if (change <= -TREND_REGRESSION_THRESHOLD_PCT) return "regression";
  if (change >= TREND_REGRESSION_THRESHOLD_PCT) return "rising";
  return "stable";
}
