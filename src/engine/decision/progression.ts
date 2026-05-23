// =============================================================================
// STUB PROVISORIO — progressao (I-7, I-15).
//   - I-7: itens com isWarmup=true sao EXCLUIDOS de progressao/volume.
//   - I-15: planejado-nao-feito NAO progride; substituto progride a si mesmo
//           se foi executado (status implica execucao).
// Expansao para item 6 do brief §12.
// =============================================================================

import type { SessionItemStatus } from "../../domain/types.ts";

export interface SetData {
  readonly reps: number;
  readonly loadKg: number;
}

export interface SessionItemHistory {
  readonly sessionId: string;
  readonly exerciseId: string; // exercicio ATUAL feito (substituto se substituicao)
  readonly status: SessionItemStatus;
  readonly isWarmup: boolean;
  readonly sets: ReadonlyArray<SetData>;
}

// Statuses que implicam EXECUCAO (item foi feito de fato, mesmo que seja
// substituicao do que era planejado):
const EXECUTED_STATUSES: ReadonlyArray<SessionItemStatus> = [
  "done",
  "substituted",
  "reordered",
  "added_adhoc",
];

const NON_EXECUTED_STATUSES: ReadonlyArray<SessionItemStatus> = [
  "skipped",
  "deferred",
];

/**
 * Devolve true se o exercicio deve progredir (regra: dupla progressao —
 * topo do rep_range em TODAS as series de trabalho na execucao mais recente).
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
): boolean {
  // Marca expressa: items nao-executados (skipped/deferred) jamais progridem.
  // Nao precisamos filtrar — basta nao incluir; abaixo so includes statuses
  // de execucao.
  void NON_EXECUTED_STATUSES; // documentacao explicita; nao usado em runtime.

  const executed = history.filter(
    (i) =>
      i.exerciseId === exerciseId &&
      EXECUTED_STATUSES.includes(i.status) &&
      !i.isWarmup,
  );
  if (executed.length === 0) return false;

  // Usa a execucao mais recente (assumimos history ordenada por tempo).
  const latest = executed[executed.length - 1];
  if (!latest) return false;
  if (latest.sets.length === 0) return false;

  return latest.sets.every((s) => s.reps >= repRange.max);
}
