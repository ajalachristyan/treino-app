// =============================================================================
// Rotulos leigos compartilhados (apresentacao do catalogo). SO texto de UI —
// nenhuma logica de engine depende disto. progression_type -> rotulo curto;
// category -> rotulo e ordem das abas/grupos da tela "Exercicios".
// =============================================================================

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
