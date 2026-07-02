// =============================================================================
// Modelo da sessao ao vivo (estado em memoria) — Bloco D parte 2.
//
// LiveItem espelha o que o usuario ve/edita. sessionItemId=null => ainda nao
// persistido (lazy). O hook (useLiveSession) faz a I/O; este modulo e PURO
// (tipos + transformacoes), testavel sem React/DB.
// =============================================================================

import { newId, type ProgressionType } from "../../domain/types.ts";
import type { SetMeasures } from "../../data/sessions.ts";
import type { WorkBlockItemRow } from "../../data/plan.ts";
import {
  modifyForRecovery,
  suggestPrescription,
  type Prescription,
  type PrescriptionItem,
} from "../../engine/decision/prescription.ts";
import type { PhaseEmphasis, PhaseKind } from "../../engine/decision/phase.ts";
import type { SessionItemHistory } from "../../engine/decision/progression.ts";

export interface LiveSet {
  setIndex: number;
  measures: SetMeasures;
  rpe: number | null;
}

// "planned" = semeado do plano, intocado (sem linha no banco — evapora).
// Os outros = tocado (tem linha): done/skipped/substituted/added.
export type LiveStatus = "planned" | "done" | "skipped" | "substituted" | "added";

export interface LiveItem {
  localKey: string; // chave estavel de React, existe antes de persistir
  sessionItemId: string | null;
  exerciseId: string;
  exerciseName: string;
  progressionType: ProgressionType;
  workBlockItemId: string | null; // o planejado (preserva p/ I-15 / recuperar)
  isWarmup: boolean;
  status: LiveStatus;
  sets: LiveSet[];
  // Insumos da prescricao por fase (W3). null quando fora do plano (ad-hoc) ou
  // quando o cadastro nao tem o dado.
  functionTag: string | null;
  plannedSets: number | null;
  repMin: number | null;
  repMax: number | null;
}

/** Monta os LiveItems planejados (status 'planned', sem linha) do bloco do dia. */
export function plannedToLiveItems(
  planned: readonly WorkBlockItemRow[],
): LiveItem[] {
  return planned.map((p) => ({
    localKey: newId<string>(),
    sessionItemId: null,
    exerciseId: p.exercise_id,
    exerciseName: p.exercise_name,
    progressionType: p.progression_type as ProgressionType,
    workBlockItemId: p.id,
    isWarmup: p.is_warmup === 1,
    status: "planned",
    sets: [],
    functionTag: p.function_tag,
    plannedSets: p.planned_sets,
    repMin: p.rep_min,
    repMax: p.rep_max,
  }));
}

/** Move um item de `from` para `to`, devolvendo uma nova lista (imutavel). */
export function moveItem(
  items: readonly LiveItem[],
  from: number,
  to: number,
): LiveItem[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return [...items];
  next.splice(to, 0, moved);
  return next;
}

/** Substitui o LiveItem de `localKey` por uma versao atualizada (imutavel). */
export function patchItem(
  items: readonly LiveItem[],
  localKey: string,
  patch: (it: LiveItem) => LiveItem,
): LiveItem[] {
  return items.map((it) => (it.localKey === localKey ? patch(it) : it));
}

// ---------------------------------------------------------------------------
// Prescricao por fase (W3b) — presenter PURO. O motor decide; aqui so ligamos
// o LiveItem + a fase + o historico ao motor e convertemos pro prefill.
// ---------------------------------------------------------------------------

/** Extrai do LiveItem os campos que o motor de prescricao consome. */
export function liveItemToPrescriptionItem(item: LiveItem): PrescriptionItem {
  return {
    exerciseId: item.exerciseId,
    functionTag: item.functionTag,
    progressionType: item.progressionType,
    repMin: item.repMin,
    repMax: item.repMax,
    plannedSets: item.plannedSets,
  };
}

/**
 * Sugestao da fase pra UM item. Null quando nao ha fase (sessao livre / data
 * nao fixada). Aplica o redutor de recuperacao (deload/taper agendado) — fator
 * unico, sem reativo aqui.
 */
export function sessionSuggestion(
  item: LiveItem,
  phaseEmphasis: PhaseEmphasis | null,
  phaseKind: PhaseKind | null,
  history: readonly SessionItemHistory[],
): Prescription | null {
  if (phaseEmphasis === null) return null;
  const base = suggestPrescription(
    liveItemToPrescriptionItem(item),
    phaseEmphasis,
    history,
  );
  return modifyForRecovery(base, {
    isScheduledDeload: phaseKind === "deload",
    isScheduledTaper: phaseKind === "taper",
    isReactiveDeload: false,
  });
}

/**
 * Converte a sugestao no prefill do SetInput: sobrescreve SO a carga do
 * load_reps pela sugestao da fase; mantem o resto da memoria. Sem carga sugerida
 * (sem historico) => devolve o base intacto (em branco se undefined).
 */
export function applyPrescriptionToPrefill(
  base: SetMeasures | undefined,
  prescription: Prescription | null,
): SetMeasures | undefined {
  if (
    prescription === null ||
    prescription.suggestedLoadKg === null ||
    base === undefined ||
    base.progressionType !== "load_reps"
  ) {
    return base;
  }
  return { ...base, loadKg: prescription.suggestedLoadKg };
}

/**
 * Aplica a substituicao a um LiveItem planejado. RESETA os insumos de prescricao
 * (functionTag/plannedSets/repMin/repMax) pra null: o substituto e tratado como
 * ELE MESMO (I-15 — nao herda a prescricao do planejado). Preserva o
 * workBlockItemId (recupera o planejado).
 */
export function applySubstitution(
  it: LiveItem,
  sub: {
    exerciseId: string;
    exerciseName: string;
    progressionType: ProgressionType;
  },
  newItemId: string,
): LiveItem {
  return {
    ...it,
    sessionItemId: newItemId,
    exerciseId: sub.exerciseId,
    exerciseName: sub.exerciseName,
    progressionType: sub.progressionType,
    status: "substituted",
    sets: [],
    functionTag: null,
    plannedSets: null,
    repMin: null,
    repMax: null,
  };
}

// ---------------------------------------------------------------------------
// "O QUE SUPERAR" (B1) — resumo da execucao mais recente pra referencia na tela.
// ---------------------------------------------------------------------------

function formatLoad(kg: number): string {
  return kg === 0 ? "peso corporal" : `${String(kg)} kg`;
}

/**
 * Resumo da execucao MAIS RECENTE (ultima do historico ASCENDENTE) — "o que
 * superar" na proxima. Carga uniforme -> "40 kg · 8, 8, 7"; cargas variando ->
 * "40 kg×8, 42.5 kg×6". null sem historico / sem series. So load_reps (o
 * executionHistoryFor so traz reps+carga; carga 0 = peso corporal).
 */
export function lastExecutionSummary(
  history: readonly SessionItemHistory[],
): string | null {
  const last = history.length > 0 ? history[history.length - 1] : undefined;
  if (last === undefined || last.sets.length === 0) return null;
  const sets = last.sets;
  const first = sets[0];
  if (first === undefined) return null;
  const uniform = sets.every((s) => s.loadKg === first.loadKg);
  if (uniform) {
    return `${formatLoad(first.loadKg)} · ${sets.map((s) => String(s.reps)).join(", ")}`;
  }
  return sets.map((s) => `${formatLoad(s.loadKg)}×${String(s.reps)}`).join(", ");
}

/** Rotulo curto e leigo do tipo (compartilhado com a leitura). */
export const PROGRESSION_LABEL: Record<ProgressionType, string> = {
  load_reps: "carga x reps",
  isometric_intent: "intencao iso (%)",
  contact_quality: "qualidade do contato",
  contact_time: "tempo de contato",
  jump_height: "altura do salto (cm)",
  difficulty_tier: "degrau de dificuldade",
  assisted_load: "carga assistida + reps",
  skill_acquisition: "skill (fez?)",
  time_under_tension: "tempo sob tensao (s)",
};
