// =============================================================================
// Catalogo de exercicios — leitura para CONSULTA (Bloco 1).
//
// Separado de plan.ts (que cuida da INTENCAO: plan/work_block/work_block_item).
// Aqui e a IDENTIDADE do movimento (brief §3-4: o catalogo reusavel). Inclui as
// colunas da migration 004 — how_to / video_url / category — o "modo de fazer"
// que alimenta a tela de detalhe e a aba "Exercicios".
//
// SO LEITURA. A edicao do catalogo (Bloco 3) vivera em planEditor.ts, o unico
// modulo (alem do seed) autorizado a escrever no plano/catalogo.
// =============================================================================

import type { Database } from "../db/adapter.ts";

export interface ExerciseCatalogRow {
  id: string;
  name: string;
  progression_type: string;
  priority: string;
  load_type: string;
  rep_min: number | null;
  rep_max: number | null;
  acute_interference: number; // 0/1 — aviso de timing (I-13) p/ holds longos
  function_tag: string | null;
  how_to: string | null; // texto leigo offline; NULL ate o seed 005
  video_url: string | null; // link opcional
  category: string | null; // rotulo de agrupamento da UI (free-text)
}

const COLS =
  "id, name, progression_type, priority, load_type, rep_min, rep_max, " +
  "acute_interference, function_tag, how_to, video_url, category FROM exercise";

/** Todos os exercicios do catalogo, por nome (para a aba "Exercicios"). */
export function getExercises(db: Database): Promise<ExerciseCatalogRow[]> {
  return db.all<ExerciseCatalogRow>(`SELECT ${COLS} ORDER BY name`);
}

/** Um exercicio pelo id (para a tela de detalhe). undefined se nao existir. */
export function getExercise(
  db: Database,
  id: string,
): Promise<ExerciseCatalogRow | undefined> {
  return db.get<ExerciseCatalogRow>(`SELECT ${COLS} WHERE id = ?`, [id]);
}
