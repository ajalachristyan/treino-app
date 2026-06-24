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
