-- =============================================================================
-- 010_cheat_reps — B4: registrar reps "roubadas" (cheat) numa serie.
--
-- Aditiva: 1 coluna SECUNDARIA UNIVERSAL em session_set, no mesmo balde de
-- rpe/notes — sempre opcional (NULL), sem default. FICA FORA do CHECK exaustivo
-- (o CASE por progression_type nao a referencia, entao segue valido apos o ADD
-- COLUMN) e fora da lista de NULL do ramo load_reps. So o CHECK proprio da
-- coluna (>= 0) a governa.
--
-- Semantica: cheat_reps = quantas reps sairam com "roubo" (impulso/forma
-- quebrada) na serie. E REGISTRO/HISTORICO ("o que superar" pode exibir
-- "8 (+2 cheat)"); NAO conta pra subir carga — a dupla progressao le so as reps
-- limpas (progression.ts intocado).
-- =============================================================================

ALTER TABLE session_set ADD COLUMN cheat_reps INTEGER
  CHECK (cheat_reps IS NULL OR cheat_reps >= 0);

-- Bumpa o schema para 10 (mesmo relogio de runtime das migrations anteriores).
INSERT INTO schema_version (version, applied_at)
VALUES (10, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER));
