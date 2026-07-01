// =============================================================================
// Aderencia (peca 1 da camada de aderencia+prontidao — spec 2026-07-01).
//
// Puro: sem DB. Recebe ocorrencias PLANEJADAS de exercicio (o wiring monta a
// lista a partir de work_block_item x sessions x missed_session) e resume o
// quao bem o dono seguiu o plano, ponderado pela IMPORTANCIA (exercise.priority).
// Consumido por readiness.ts (avisos/sugestoes) e pela tela de aderencia.
//
// I-9 (NOT consulted): nao le/computa razao aguda:cronica.
// =============================================================================

/** Grau de importancia do exercicio (campo exercise.priority do seed). */
export type ExercisePriority = "primary" | "accessory" | "finisher" | "bonus";

/**
 * Uma ocorrencia PLANEJADA de um exercicio numa janela (semana/mes/fase).
 * `done` = foi executado (feito/substituido/etc.); false = pulado ou a sessao
 * inteira faltou. `order` cresce com o tempo (maior = mais recente) — usado
 * para a sequencia final de negligencia.
 */
export interface PlannedOccurrence {
  readonly exerciseId: string;
  readonly priority: ExercisePriority;
  readonly done: boolean;
  readonly order: number;
}

export interface TierAdherence {
  readonly planned: number;
  readonly done: number;
}

export interface AdherenceSummary {
  readonly planned: number;
  readonly done: number;
  /** done/planned (0..1); 0 quando nada foi planejado. */
  readonly pct: number;
  readonly byPriority: Readonly<Record<ExercisePriority, TierAdherence>>;
  /**
   * Por exercicio PRIMARY, a sequencia FINAL de vezes que foi largado (nao-feito
   * nas ocorrencias mais recentes). So aparece se > 0. Alimenta o aviso de
   * "voce largou <exercicio-chave> repetidamente" (readiness.ts).
   */
  readonly primaryNeglectStreak: Readonly<Record<string, number>>;
}

export function computeAdherence(
  occurrences: readonly PlannedOccurrence[],
): AdherenceSummary {
  const byPriority: Record<ExercisePriority, { planned: number; done: number }> = {
    primary: { planned: 0, done: 0 },
    accessory: { planned: 0, done: 0 },
    finisher: { planned: 0, done: 0 },
    bonus: { planned: 0, done: 0 },
  };

  let planned = 0;
  let done = 0;
  for (const o of occurrences) {
    planned++;
    byPriority[o.priority].planned++;
    if (o.done) {
      done++;
      byPriority[o.priority].done++;
    }
  }
  const pct = planned === 0 ? 0 : done / planned;

  const primaryNeglectStreak = computePrimaryNeglect(occurrences);

  return { planned, done, pct, byPriority, primaryNeglectStreak };
}

function computePrimaryNeglect(
  occurrences: readonly PlannedOccurrence[],
): Record<string, number> {
  const byExercise = new Map<string, PlannedOccurrence[]>();
  for (const o of occurrences) {
    if (o.priority !== "primary") continue;
    const arr = byExercise.get(o.exerciseId) ?? [];
    arr.push(o);
    byExercise.set(o.exerciseId, arr);
  }

  const streaks: Record<string, number> = {};
  for (const [exerciseId, arr] of byExercise) {
    const sorted = [...arr].sort((a, b) => a.order - b.order);
    let streak = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const current = sorted[i];
      if (current === undefined || current.done) break;
      streak++;
    }
    if (streak > 0) streaks[exerciseId] = streak;
  }
  return streaks;
}
