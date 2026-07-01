// =============================================================================
// Rotulos leigos compartilhados (apresentacao do catalogo). SO texto de UI —
// nenhuma logica de engine depende disto. progression_type -> rotulo curto;
// category -> rotulo e ordem das abas/grupos da tela "Exercicios".
// =============================================================================

import type { SetMeasures } from "../data/sessions.ts";

/**
 * Uma serie em texto curto (ex.: "7 x 60 kg", "45 cm"), por progression_type.
 * Fonte unica usada na sessao ao vivo e no Historico.
 */
export function formatMeasures(m: SetMeasures): string {
  switch (m.progressionType) {
    case "load_reps":
      return `${m.reps} x ${m.loadKg} kg`;
    case "assisted_load":
      return `${m.reps} x assist. ${m.assistedLoadKg} kg`;
    case "isometric_intent":
      return `${m.intentPct}% intencao`;
    case "contact_quality":
      return m.quality;
    case "jump_height":
      return `${m.heightCm} cm`;
    case "difficulty_tier":
      return `degrau ${m.difficultyStep}`;
    case "skill_acquisition":
      return m.skillAchieved ? "fez" : "nao fez";
    case "time_under_tension":
      return `${m.seconds} s`;
  }
}

/** Duracao a partir de ms: "M:SS" ate 1h, senao "Hh MMm". Clampa negativos a 0. */
export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const WEEKDAYS_PT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Data/hora local de uma sessao, leiga (ex.: "ter 30/06 · 14:32"). */
export function formatSessionDate(epochMs: number): string {
  const d = new Date(epochMs);
  const p = (n: number): string => String(n).padStart(2, "0");
  return (
    `${WEEKDAYS_PT[d.getDay()]} ${p(d.getDate())}/${p(d.getMonth() + 1)} · ` +
    `${p(d.getHours())}:${p(d.getMinutes())}`
  );
}

const PROGRESSION_LABEL: Record<string, string> = {
  load_reps: "carga x reps",
  isometric_intent: "intenção iso",
  contact_quality: "qualidade do contato",
  contact_time: "tempo de contato",
  jump_height: "altura do salto",
  difficulty_tier: "degrau de dificuldade",
  assisted_load: "carga assistida",
  skill_acquisition: "skill",
  time_under_tension: "tempo sob tensão",
};

export function progressionLabel(type: string): string {
  return PROGRESSION_LABEL[type] ?? type;
}

// Ordem em que as categorias aparecem na tela "Exercicios".
export const CATEGORY_ORDER = [
  "forca",
  "salto",
  "ginastica",
  "flexibilidade",
  "mobilidade",
  "core",
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  forca: "Força",
  salto: "Salto",
  ginastica: "Ginástica",
  flexibilidade: "Flexibilidade",
  mobilidade: "Mobilidade",
  core: "Core",
};

/** Rotulo de exibicao da categoria. null/desconhecida -> "Outros". */
export function categoryLabel(cat: string | null): string {
  if (cat === null) return "Outros";
  return CATEGORY_LABEL[cat] ?? cat;
}
