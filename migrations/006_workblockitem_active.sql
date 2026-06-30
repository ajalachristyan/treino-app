-- =============================================================================
-- 006_workblockitem_active — EDITOR DE PLANO: soft-discontinue (Bloco 3).
--
-- Aditiva: 1 coluna em work_block_item. `active=0` = item REMOVIDO do plano pelo
-- editor, mas preservado porque sessoes passadas o referenciam (FK barraria o
-- delete; e a recuperacao I-15 le o exercise_id desse item por id). Linhas
-- existentes viram active=1 (backfill seguro pelo DEFAULT).
--
-- Leitura do plano ATUAL (getWorkBlockItems) passa a filtrar active=1; a
-- recuperacao de historico (por work_block_item_id) NAO filtra — pega a linha
-- especifica, ativa ou nao. I-15 ESTRUTURAL: o trigger abaixo torna
-- work_block_item.exercise_id imutavel (igual ao de exercise.progression_type) —
-- o banco RECUSA trocar o exercicio planejado; trocar = descontinuar + adicionar
-- novo. O editor (src/data/planEditor.ts) e o unico caminho que escreve aqui.
-- =============================================================================

ALTER TABLE work_block_item ADD COLUMN active INTEGER NOT NULL DEFAULT 1
  CHECK (active IN (0, 1));

-- I-15 estrutural: a identidade do exercicio planejado e imutavel. Trocar o
-- exercicio = remover o item + adicionar outro, NUNCA UPDATE exercise_id (que
-- reescreveria retroativamente o "planejado" que sessoes passadas recuperam por
-- id). Espelha exercise.progression_type (001_init). exercise_id e NOT NULL ->
-- nunca e NULL; IS NOT casa o estilo do trigger existente.
CREATE TRIGGER work_block_item_exercise_immutable
BEFORE UPDATE OF exercise_id ON work_block_item
WHEN OLD.exercise_id IS NOT NEW.exercise_id
BEGIN
  SELECT RAISE(ABORT, 'work_block_item.exercise_id is immutable (I-15: the planned exercise must never change retroactively). To change it, remove the item and add a new one.');
END;

-- Bumpa o schema para 6 (mesmo relogio de runtime das migrations anteriores).
INSERT INTO schema_version (version, applied_at)
VALUES (6, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER));
