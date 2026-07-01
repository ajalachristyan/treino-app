// =============================================================================
// Prontidao (peca 3 da camada de aderencia+prontidao — spec 2026-07-01).
//
// Puro e ADVISORY. Pega o resumo de aderencia (adherence.ts) + contexto de fase
// e decide: aviso de aderencia baixa, trava da fase de risco (nao pular caminho
// pro Mes 3 sem base), lista de exercicios primary largados, e UMA sugestao de
// ajuste. A sugestao e SEMPRE um rearranjo do proprio plano (repetir semana /
// estender fase / mexer data) — jamais treino novo (invariante de design §2 do
// spec). Anti-culpa §6.3: sugere, nunca pune nem bloqueia.
//
// I-9 (NOT consulted): nao le/computa razao aguda:cronica.
// =============================================================================

import {
  KEY_EXERCISE_NEGLECT_STREAK,
  PHASE_ADHERENCE_WARN_PCT,
} from "../../domain/constants.ts";
import type { AdherenceSummary } from "./adherence.ts";

/** Rearranjos do PROPRIO plano — nunca conteudo novo (invariante §2 do spec). */
export type SuggestedAdjustment = "repeat_week" | "extend_phase" | "shift_start";

export interface ReadinessInput {
  /** Aderencia da fase atual (de adherence.ts). */
  readonly phaseAdherence: AdherenceSummary;
  /** A proxima semana/sessao entra numa fase de risco (Mes 3 / depth jumps)? */
  readonly enteringRiskPhase: boolean;
  /** Aderencia primary acumulada das fases ANTERIORES (0..1) — a "base". */
  readonly baseAdherencePct: number;
}

export interface ReadinessAssessment {
  readonly adherenceWarning: boolean;
  readonly riskPhaseGate: boolean;
  readonly neglectedPrimary: readonly string[];
  readonly suggestedAdjustment: SuggestedAdjustment | null;
}

export function assessReadiness(input: ReadinessInput): ReadinessAssessment {
  const adherenceWarning = input.phaseAdherence.pct < PHASE_ADHERENCE_WARN_PCT;
  const riskPhaseGate =
    input.enteringRiskPhase && input.baseAdherencePct < PHASE_ADHERENCE_WARN_PCT;

  const neglectedPrimary = Object.entries(
    input.phaseAdherence.primaryNeglectStreak,
  )
    .filter(([, streak]) => streak >= KEY_EXERCISE_NEGLECT_STREAK)
    .map(([exerciseId]) => exerciseId)
    .sort();

  // Uma sugestao, seguranca primeiro: a trava da fase de risco (nao pular
  // caminho) vence o aviso de aderencia. Ambas sao rearranjo do plano.
  let suggestedAdjustment: SuggestedAdjustment | null = null;
  if (riskPhaseGate) {
    suggestedAdjustment = "extend_phase";
  } else if (adherenceWarning) {
    suggestedAdjustment = "repeat_week";
  }

  return {
    adherenceWarning,
    riskPhaseGate,
    neglectedPrimary,
    suggestedAdjustment,
  };
}
