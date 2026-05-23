// =============================================================================
// STUB PROVISORIO — gate de interferencia (I-13, brief 7.2).
// Refino acordado: AVISA, nao bloqueia (Secao 6.3 eh anti-culpa).
// Expansao para item 6 do brief §12.
// =============================================================================

export interface SessionPlanItem {
  readonly exerciseId: string;
  readonly acuteInterference: boolean;
  readonly progressionType: string;
  readonly plannedSequence: number;
}

export type InterferenceWarning = {
  readonly kind: "interference_warning";
  readonly precedingExerciseId: string;
  readonly potencyExerciseId: string;
};

const POTENCY_TYPES = new Set([
  "jump_height",
  "contact_time",
  "contact_quality",
  "isometric_intent",
]);

function isPotencyItem(item: SessionPlanItem): boolean {
  return POTENCY_TYPES.has(item.progressionType);
}

/**
 * Gate de interferencia: se um item com `acuteInterference=true` precede
 * um item de potencia na MESMA sessao, retorna warning (I-13).
 * Caso contrario retorna null.
 *
 * Refino: aviso, nao bloqueio. A sessao prossegue com flag para a estatistica.
 */
export function checkInterferenceGate(
  plan: ReadonlyArray<SessionPlanItem>,
): InterferenceWarning | null {
  const sorted = [...plan].sort((a, b) => a.plannedSequence - b.plannedSequence);

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i]!;
    if (!item.acuteInterference) continue;
    // Procura item de potencia DEPOIS deste na sequencia.
    for (let j = i + 1; j < sorted.length; j++) {
      const candidate = sorted[j]!;
      if (isPotencyItem(candidate)) {
        return {
          kind: "interference_warning",
          precedingExerciseId: item.exerciseId,
          potencyExerciseId: candidate.exerciseId,
        };
      }
    }
  }
  return null;
}
