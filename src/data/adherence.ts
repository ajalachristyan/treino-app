// =============================================================================
// Selector de ADERENCIA (W2b) — sintetiza as ocorrencias PLANEJADas de uma
// janela de semanas e marca cada uma como feita/nao-feita. Alimenta o nucleo
// puro `src/engine/decision/adherence.ts` (computeAdherence) e, por ele, a
// prontidao (readiness.ts) e a tela de aderencia.
//
// POR QUE SINTETIZA: nao ha "data de ocorrencia" no banco (principio-mae: o
// instante e fato, a estrutura do plano e intencao). Uma ocorrencia = um
// work_block_item ATIVO, nao-aquecimento, de um bloco que se aplica aquela
// semana. A data e derivada de plan.start_date + a janela de 7 dias da semana +
// o dia ISO do bloco. Epoch e ancorado via localMidnight (Brasil sem horario de
// verao desde 2019 -> a aritmetica de 7 dias fica alinhada a meia-noite local).
//
// GUARDAS (anti-culpa, espelham resolveSessionPhase / PhaseBanner):
//   - Sem data real fixada (placeholder do seed) ou inicio futuro => [] (nao
//     inventa aderencia sobre uma semana chutada).
//   - So conta semanas ja vencidas (<= semana atual) e, na semana corrente, so
//     ocorrencias cujo dia ja passou; dia de hoje/futuro nao-feito NAO vira
//     falta (mas feito no mesmo dia conta como credito).
//
// I-15: "done" e chaveado pelo work_block_item_id (o SLOT planejado). A
//   substituicao preserva esse id com status executado -> o slot conta como
//   cumprido, mesmo que o exercicio feito seja outro. A ocorrencia continua
//   chaveada pelo exercicio PLANEJADO (o que a aderencia mede).
// active=1: getWorkBlockItems so traz itens ativos -> aderencia sobre o plano
//   ATUAL (itens descontinuados nao viram ocorrencia).
// =============================================================================

import type { Database } from "../db/adapter.ts";
import {
  getPlan,
  getPlanBlocksForWeek,
  getWorkBlockItems,
  currentWeek,
  isoDayOfWeek,
} from "./plan.ts";
import { isStartDateSet, localMidnight } from "./planConfig.ts";
import type {
  PlannedOccurrence,
  ExercisePriority,
} from "../engine/decision/adherence.ts";

const WEEK_MS = 7 * 86_400_000;
const DAY_MS = 86_400_000;

/** Janela de aderencia em semanas do plano (1-indexado, inclusivo). */
export interface OccurrenceWindow {
  readonly fromWeek: number;
  readonly toWeek: number;
}

/**
 * Ocorrencias planejadas da janela `{fromWeek, toWeek}`, marcadas done pelo que
 * foi executado. `now` e injetado (determinismo/teste). Ordem cronologica
 * (semana asc, depois sequencia planejada) via `order`.
 */
export async function plannedOccurrences(
  db: Database,
  window: OccurrenceWindow,
  now: number,
): Promise<PlannedOccurrence[]> {
  const plan = await getPlan(db);
  if (plan === undefined) return [];
  if (!isStartDateSet(plan) || plan.start_date > now) return [];

  const curWeek = currentWeek(plan, now);
  const lo = Math.max(1, Math.floor(window.fromWeek));
  const hi = Math.min(Math.floor(window.toWeek), curWeek, plan.duration_weeks);
  if (lo > hi) return [];

  const todayMid = localMidnight(new Date(now));
  const occurrences: PlannedOccurrence[] = [];
  let order = 0;

  for (let week = lo; week <= hi; week++) {
    const windowStart = plan.start_date + (week - 1) * WEEK_MS;
    const windowEnd = windowStart + WEEK_MS;
    const windowStartDow = isoDayOfWeek(new Date(windowStart));

    // Slots executados nesta janela de 7 dias (I-15: substituicao preserva o
    // work_block_item_id e conta como cumprido).
    const doneRows = await db.all<{ work_block_item_id: string }>(
      `SELECT DISTINCT si.work_block_item_id
       FROM session_item si
       JOIN session s ON s.id = si.session_id
       WHERE s.started_at >= ? AND s.started_at < ?
         AND si.work_block_item_id IS NOT NULL
         AND si.status IN ('done', 'substituted', 'reordered', 'added_adhoc')`,
      [windowStart, windowEnd],
    );
    const doneSlots = new Set(doneRows.map((r) => r.work_block_item_id));

    const blocks = await getPlanBlocksForWeek(db, plan.id, week);
    for (const block of blocks) {
      if (block.day_of_week === null) continue;
      const offset = (block.day_of_week - windowStartDow + 7) % 7;
      const occMid = localMidnight(new Date(windowStart + offset * DAY_MS));

      const items = await getWorkBlockItems(db, block.id);
      for (const item of items) {
        if (item.is_warmup === 1) continue;
        const done = doneSlots.has(item.id);
        // Anti-culpa: dia de hoje/futuro nao-feito nao vira falta; feito conta.
        if (!done && occMid >= todayMid) continue;
        occurrences.push({
          exerciseId: item.exercise_id,
          priority: item.priority as ExercisePriority,
          done,
          order: order++,
        });
      }
    }
  }

  return occurrences;
}
