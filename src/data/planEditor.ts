// =============================================================================
// Editor de plano (Bloco 3) — edicao DELIBERADA da prescricao. Tela separada do
// treino ao vivo (brief §10.2). UNICO modulo, alem do seed, que escreve
// estrutura do plano (work_block_item) e texto do catalogo (exercise).
//
// MODELO "plano = verdade atual" (DECISIONS §H): editar series/ordem muda so a
// ordem do plano ATUAL — nao toca o historico (sessoes guardam actual_sequence e
// recuperam o planejado por work_block_item_id -> exercise_id, por id). O que e
// PROIBIDO e corromper a recuperacao I-15: o exercise_id de um item ja
// referenciado NUNCA muda. Por isso a API NAO TEM "trocar exercicio do item":
// trocar = removeItem(antigo) + addItem(novo). Nenhuma funcao aqui faz
// `UPDATE work_block_item SET exercise_id` (planEditor.test.ts trava isso).
//
// Escritas serializadas no nivel da chamada (a UI usa run(), como Ajustes).
// =============================================================================

import type { Database } from "../db/adapter.ts";
import { newId, type WorkBlockItemId } from "../domain/types.ts";

/**
 * Adiciona um exercicio (ja existente no catalogo) ao fim do bloco. A nova
 * planned_sequence e MAX(todas) + 1 — unica e acima de qualquer item (ativo ou
 * descontinuado), entao nao colide com o UNIQUE(work_block_id, planned_sequence).
 */
export async function addItem(
  db: Database,
  a: {
    workBlockId: string;
    exerciseId: string;
    plannedSets?: number | null;
    notes?: string | null;
    isWarmup?: boolean;
  },
): Promise<WorkBlockItemId> {
  if (
    a.plannedSets !== undefined &&
    a.plannedSets !== null &&
    (!Number.isInteger(a.plannedSets) || a.plannedSets <= 0)
  ) {
    throw new Error(`addItem: planned_sets invalido (${String(a.plannedSets)})`);
  }
  const id = newId<WorkBlockItemId>();
  const row = await db.get<{ maxSeq: number | null }>(
    "SELECT MAX(planned_sequence) AS maxSeq FROM work_block_item WHERE work_block_id = ?",
    [a.workBlockId],
  );
  const seq = (row?.maxSeq ?? 0) + 1;
  await db.run(
    `INSERT INTO work_block_item
       (id, work_block_id, exercise_id, planned_sequence, planned_sets, notes, is_warmup, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      id,
      a.workBlockId,
      a.exerciseId,
      seq,
      a.plannedSets ?? null,
      a.notes?.trim() || null,
      a.isWarmup ? 1 : 0,
    ],
  );
  return id;
}

/**
 * Remove um item do plano. Se ja foi tocado por alguma sessao (referenciado por
 * session_item), DESCONTINUA (active=0) — preserva o historico e a recuperacao
 * I-15 (a FK barraria o delete de qualquer forma). Se nunca foi tocado, apaga.
 */
export async function removeItem(db: Database, itemId: string): Promise<void> {
  const ref = await db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM session_item WHERE work_block_item_id = ?",
    [itemId],
  );
  if ((ref?.n ?? 0) > 0) {
    await db.run("UPDATE work_block_item SET active = 0 WHERE id = ?", [itemId]);
  } else {
    await db.run("DELETE FROM work_block_item WHERE id = ?", [itemId]);
  }
}

/** Muda as series planejadas de um item (null = sem alvo de series). */
export async function setItemSets(
  db: Database,
  itemId: string,
  plannedSets: number | null,
): Promise<void> {
  if (
    plannedSets !== null &&
    (!Number.isInteger(plannedSets) || plannedSets <= 0)
  ) {
    throw new Error(
      `setItemSets: planned_sets invalido (${String(plannedSets)}) — inteiro > 0 ou null`,
    );
  }
  await db.run("UPDATE work_block_item SET planned_sets = ? WHERE id = ?", [
    plannedSets,
    itemId,
  ]);
}

/** Muda a nota de um item (so-espacos vira NULL). */
export async function setItemNotes(
  db: Database,
  itemId: string,
  notes: string | null,
): Promise<void> {
  await db.run("UPDATE work_block_item SET notes = ? WHERE id = ?", [
    notes?.trim() || null,
    itemId,
  ]);
}

/**
 * Reordena os itens ATIVOS do bloco para a ordem dada (lista de ids). Renumera
 * todos: ativos recebem 1..N na ordem pedida; descontinuados vao para o fim
 * (N+1..M, estaveis). Duas fases (offset alto) para nao colidir com o
 * UNIQUE(work_block_id, planned_sequence). Tudo numa transacao. planned_sequence
 * e a ordem do plano ATUAL — mexer nela nao toca o historico.
 */
export async function reorderActive(
  db: Database,
  workBlockId: string,
  orderedActiveIds: readonly string[],
): Promise<void> {
  await db.transaction(async () => {
    const all = await db.all<{ id: string }>(
      "SELECT id FROM work_block_item WHERE work_block_id = ? ORDER BY planned_sequence, id",
      [workBlockId],
    );
    const wanted = new Set(orderedActiveIds);
    // Quaisquer itens nao listados (descontinuados, ou ativos omitidos por
    // seguranca) vao para o fim, na ordem atual.
    const tail = all.map((r) => r.id).filter((id) => !wanted.has(id));
    const finalOrder = [...orderedActiveIds, ...tail];

    const OFFSET = 1_000_000;
    for (let i = 0; i < finalOrder.length; i++) {
      await db.run(
        "UPDATE work_block_item SET planned_sequence = ? WHERE id = ? AND work_block_id = ?",
        [OFFSET + i, finalOrder[i], workBlockId],
      );
    }
    for (let i = 0; i < finalOrder.length; i++) {
      await db.run(
        "UPDATE work_block_item SET planned_sequence = ? WHERE id = ? AND work_block_id = ?",
        [i + 1, finalOrder[i], workBlockId],
      );
    }
  });
}

/**
 * Edita o TEXTO do catalogo de um exercicio (modo de fazer, nome, video,
 * categoria). NAO toca progression_type (identidade cientifica; o trigger de
 * 001_init barraria, e o repropósito correto e criar outro exercicio). So
 * atualiza os campos passados.
 */
export async function updateExerciseText(
  db: Database,
  id: string,
  patch: {
    name?: string;
    howTo?: string | null;
    videoUrl?: string | null;
    category?: string | null;
  },
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (n === "") throw new Error("updateExerciseText: nome vazio");
    sets.push("name = ?");
    params.push(n);
  }
  if (patch.howTo !== undefined) {
    sets.push("how_to = ?");
    params.push(patch.howTo?.trim() || null);
  }
  if (patch.videoUrl !== undefined) {
    sets.push("video_url = ?");
    params.push(patch.videoUrl?.trim() || null);
  }
  if (patch.category !== undefined) {
    sets.push("category = ?");
    params.push(patch.category?.trim() || null);
  }
  if (sets.length === 0) return;
  params.push(id);
  await db.run(`UPDATE exercise SET ${sets.join(", ")} WHERE id = ?`, params);
}
