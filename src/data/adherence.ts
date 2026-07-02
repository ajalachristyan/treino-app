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
  getPhases,
  getPlanBlocksForWeek,
  getWorkBlockItems,
  getAllExercises,
  currentWeek,
  phaseForWeek,
  isoDayOfWeek,
} from "./plan.ts";
import { isStartDateSet, localMidnight } from "./planConfig.ts";
import { EXECUTED_SESSION_ITEM_STATUSES } from "../domain/types.ts";
import {
  computeAdherence,
  type PlannedOccurrence,
  type ExercisePriority,
} from "../engine/decision/adherence.ts";
import {
  assessReadiness,
  type SuggestedAdjustment,
} from "../engine/decision/readiness.ts";
import { phaseContext, classifyPhase } from "../engine/decision/phase.ts";

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
         AND si.status IN (${EXECUTED_SESSION_ITEM_STATUSES.map(() => "?").join(", ")})`,
      [windowStart, windowEnd, ...EXECUTED_SESSION_ITEM_STATUSES],
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

// ---------------------------------------------------------------------------
// PRONTIDAO (W4) — orquestrador que monta o ReadinessInput a partir do banco e
// roda o nucleo puro assessReadiness. ADVISORY: devolve so booleanos/sugestao de
// rearranjo; NUNCA um "bloqueado". A tela renderiza banner e nada gateia o log
// (anti-culpa §6.3 / I-12). null => nenhum banner (sem plano / data placeholder /
// inicio futuro / semana fora do plano).
// ---------------------------------------------------------------------------

/** Visao pronta pra tela: os avisos + a lista de primary largado JA em nome leigo. */
export interface ReadinessView {
  readonly adherenceWarning: boolean;
  readonly riskPhaseGate: boolean;
  readonly neglectedPrimary: readonly string[]; // nomes leigos (nao ids)
  readonly suggestedAdjustment: SuggestedAdjustment | null;
}

export async function readinessNow(
  db: Database,
  now: number,
): Promise<ReadinessView | null> {
  const plan = await getPlan(db);
  if (plan === undefined) return null;
  if (!isStartDateSet(plan) || plan.start_date > now) return null;

  const phases = await getPhases(db, plan.id);
  const week = currentWeek(plan, now);
  const curPhase = phaseForWeek(phases, week);
  if (curPhase === undefined) return null;

  // Aderencia da fase corrente.
  const phaseOcc = await plannedOccurrences(
    db,
    { fromWeek: curPhase.week_start, toWeek: curPhase.week_end },
    now,
  );
  const phaseAdherence = computeAdherence(phaseOcc);

  // Fase de risco = o Mes 3 REAL (peaking / depth jumps, sem 11-15). Usa
  // `emphasis` (classificacao crua), NAO `parentEmphasis` — senao taper (16-17) e
  // deload3 (18) herdariam "m3" e dispariam o gate depois do pico. classifyPhase
  // pode lancar em fase drift do seed -> degrada para "nao e risco" (nunca bloqueia).
  let enteringRiskPhase = false;
  try {
    enteringRiskPhase = phaseContext(phases, week)?.emphasis === "m3";
  } catch {
    enteringRiskPhase = false;
  }

  // Base = aderencia PRIMARY das semanas ANTES do Mes 3. Sem primary planejado
  // ainda (0) => base neutra (1): nao acusa falta de base sem dado.
  let baseAdherencePct = 1;
  const m3 = phases.find((p) => {
    try {
      return classifyPhase(p) === "m3";
    } catch {
      return false;
    }
  });
  if (m3 !== undefined && m3.week_start > 1) {
    const baseOcc = await plannedOccurrences(
      db,
      { fromWeek: 1, toWeek: m3.week_start - 1 },
      now,
    );
    const primary = computeAdherence(baseOcc).byPriority.primary;
    baseAdherencePct = primary.planned === 0 ? 1 : primary.done / primary.planned;
  }

  const assessment = assessReadiness({
    phaseAdherence,
    enteringRiskPhase,
    baseAdherencePct,
  });

  // Deload/taper treinam menos DE PROPOSITO (phase.ts exclui recuperacao dos
  // calculos reativos) -> nao cobra aderencia de uma semana deliberadamente leve
  // (nao sugerir "repita o deload"). O gate de risco (extend_phase) nao entra
  // aqui: enteringRiskPhase ja e so o Mes 3 real, nunca deload/taper.
  const isRecoveryPhase = curPhase.is_deload === 1 || curPhase.is_taper === 1;
  const adherenceWarning = !isRecoveryPhase && assessment.adherenceWarning;
  const suggestedAdjustment = assessment.riskPhaseGate
    ? assessment.suggestedAdjustment // extend_phase (seguranca primeiro)
    : adherenceWarning
      ? assessment.suggestedAdjustment // repeat_week
      : null;

  return {
    adherenceWarning,
    riskPhaseGate: assessment.riskPhaseGate,
    neglectedPrimary: await exerciseNames(db, assessment.neglectedPrimary),
    suggestedAdjustment,
  };
}

/** Traduz ids de exercicio para o nome leigo do catalogo (id cru se sumir). */
async function exerciseNames(
  db: Database,
  ids: readonly string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const all = await getAllExercises(db);
  const byId = new Map(all.map((e) => [e.id, e.name]));
  return ids.map((id) => byId.get(id) ?? id);
}
