// =============================================================================
// STUB PROVISORIO — progressao (I-7, I-15).
//   - I-7: itens com isWarmup=true sao EXCLUIDOS de progressao/volume.
//   - I-15: planejado-nao-feito NAO progride; substituto progride a si mesmo
//           se foi executado (status implica execucao).
// Expansao para item 6 do brief §12.
// =============================================================================

import { PROGRESSION_MIN_SETS_FRACTION } from "../../domain/constants.ts";
import {
  EXECUTED_SESSION_ITEM_STATUSES,
  type SessionItemStatus,
} from "../../domain/types.ts";

export interface SetData {
  readonly reps: number;
  readonly loadKg: number;
  // B4: reps "roubadas" na serie. REGISTRO/HISTORICO apenas — a progressao le so
  // `reps` (limpas); cheat NUNCA sobe carga. Opcional (ausente = sem cheat).
  readonly cheatReps?: number;
}

export interface SessionItemHistory {
  readonly sessionId: string;
  readonly exerciseId: string; // exercicio ATUAL feito (substituto se substituicao)
  readonly status: SessionItemStatus;
  readonly isWarmup: boolean;
  readonly sets: ReadonlyArray<SetData>;
}

// "Executado" vem da fonte unica EXECUTED_SESSION_ITEM_STATUSES (domain/types.ts).

const NON_EXECUTED_STATUSES: ReadonlyArray<SessionItemStatus> = [
  "skipped",
  "deferred",
];

/**
 * Ocorrencia EXECUTADA mais recente de um exercicio no historico (assumido
 * cronologico). "Executada" = status implica execucao (done/substituted/
 * reordered/added_adhoc) e nao e warmup (I-7). Fonte UNICA da regra "o que conta
 * como execucao" — reusada por shouldProgressExercise e pela prescricao
 * (memoria de carga em prescription.ts).
 */
export function latestExecutedOccurrence(
  exerciseId: string,
  history: ReadonlyArray<SessionItemHistory>,
): SessionItemHistory | undefined {
  let latest: SessionItemHistory | undefined;
  for (const item of history) {
    if (
      item.exerciseId === exerciseId &&
      EXECUTED_SESSION_ITEM_STATUSES.includes(item.status) &&
      !item.isWarmup
    ) {
      latest = item; // cronologico: mantem a ultima ocorrencia executada
    }
  }
  return latest;
}

/**
 * Devolve true se o exercicio deve progredir (regra: dupla progressao —
 * topo do rep_range em TODAS as series de trabalho na execucao mais recente).
 *
 * TRAVA (dono 2026-07-01): quando `prescribedSets` e conhecido, so progride se
 * a MAIORIA (~`PROGRESSION_MIN_SETS_FRACTION`) das series prescritas foi
 * cumprida — sessao pela metade nao ganha carga. Sem `prescribedSets` (NULL no
 * seed para salto/mobilidade/core), degrada pro criterio classico.
 *
 * I-7: itens com isWarmup=true sao ignorados (warmup nao conta).
 * I-15: a busca eh por `exerciseId` no campo ATUAL (`exerciseId`); itens
 *       cujo exercicio_id atual eh diferente do procurado nao entram.
 *       Logo, back_squat planejado mas substituido por leg_press => o
 *       item tem exerciseId='leg_press', status='substituted' — quando
 *       perguntado "progride back_squat?", retornamos false.
 *       Quando perguntado "progride leg_press?", o item entra (executed) e
 *       sua progressao depende das proprias series.
 */
export function shouldProgressExercise(
  exerciseId: string,
  history: ReadonlyArray<SessionItemHistory>,
  repRange: { readonly min: number; readonly max: number },
  prescribedSets?: number | null,
): boolean {
  // Marca expressa: items nao-executados (skipped/deferred) jamais progridem.
  // Nao precisamos filtrar — basta nao incluir; abaixo so includes statuses
  // de execucao.
  void NON_EXECUTED_STATUSES; // documentacao explicita; nao usado em runtime.

  // Usa a execucao mais recente (fonte unica da regra de "executado").
  const latest = latestExecutedOccurrence(exerciseId, history);
  if (!latest) return false;
  if (latest.sets.length === 0) return false;

  // TRAVA de sessao parcial: com alvo de series conhecido, exige a maioria das
  // series prescritas (~2/3). Sem alvo (NULL), pula a trava.
  if (prescribedSets != null && prescribedSets > 0) {
    const required = Math.ceil(PROGRESSION_MIN_SETS_FRACTION * prescribedSets);
    if (latest.sets.length < required) return false;
  }

  return latest.sets.every((s) => s.reps >= repRange.max);
}
