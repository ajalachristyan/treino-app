-- =============================================================================
-- 011_half_squat — W6: half-squat @70% (velocidade) no Sex/M3.
--
-- Fonte (ciencia do dono, validada): Isaiah Rivera —
-- pesquisa-rivera-transcricoes.md:60-64 — no Mes 3, substituindo o front squat,
-- "half squats keep it at 70% load do 5x4 and move the weight fast … take one
-- rep away each week add a set each week … last week cut sets and reps in half".
-- Colocacao (dono, 2026-07-02): Sex/M3 (wb_sex_salto_m3), junto dos depth jumps.
-- Natureza (dono, sourced): VELOCIDADE @70%, NAO progride carga.
--
-- MODELAGEM NO MOTOR = PASS-THROUGH:
--   - progression_type='load_reps' (loga carga x reps) mas rep_min/rep_max NULL
--     => suggestPrescription cai no ramo pass_through (nao sugere/progride carga).
--   - function_tag='velocidade_agachamento' FORA de PRIMARY_STRENGTH_FUNCTION_TAGS
--     => nunca vira PAP no M3.
--   - acute_interference=0: @70% RAPIDO e balistico (potencia), nao segurada longa
--     (nao dispara o gate I-13 antes dos saltos).
--   - A onda "-1 rep/+1 serie por semana" e o @70% vivem na NOTA (o motor nao
--     scripta a onda; pass-through nao inventa numero).
-- =============================================================================

-- 1) Novo exercicio de catalogo. how_to + category preenchidos (invariante do
--    catalogo: todo exercicio tem modo-de-fazer leigo e categoria valida).
INSERT INTO exercise
  (id, name, progression_type, priority, load_type, rep_min, rep_max,
   acute_interference, function_tag, created_at, how_to, video_url, category)
VALUES
  ('ex_half_squat', 'Half squat @70% rapido (velocidade)', 'load_reps',
   'accessory', 'barbell', NULL, NULL, 0, 'velocidade_agachamento', 1735689600000,
   'Agachamento parcial (meia amplitude) com barra. Desca ate ~meio agachamento e suba EXPLOSIVO — a intencao e a VELOCIDADE da barra, nao a carga maxima. Carga fixa em ~70% do 1RM; 5 series de 4 reps movendo rapido, com descanso completo entre as series. Onda semanal: tire 1 rep e some 1 serie a cada semana; na ultima semana corte series e reps pela metade (taper). Faca ANTES dos saltos, fresco. Erro comum: buscar carga maxima ou descer/subir devagar — aqui o ganho esta na velocidade, nao no peso.',
   NULL, 'forca');

-- 2) Entra no bloco Sex/M3 (semanas 11-18), logo APOS o aquecimento e ANTES dos
--    saltos (velocidade se faz fresco). Abre a sequencia 2 com offset alto para
--    nao colidir o UNIQUE(work_block_id, planned_sequence) (padrao do
--    resequenceItems). SQLite resolve UPDATE de coluna indexada em duas passadas,
--    entao o WHERE casa os valores ORIGINAIS (sem re-scan).
UPDATE work_block_item SET planned_sequence = planned_sequence + 100
  WHERE work_block_id = 'wb_sex_salto_m3' AND planned_sequence >= 2;

INSERT INTO work_block_item
  (id, work_block_id, exercise_id, planned_sequence, planned_sets, notes, is_warmup)
VALUES
  ('wbi_sex3_halfsquat', 'wb_sex_salto_m3', 'ex_half_squat', 2, NULL,
   'Rivera M3: @70% do 1RM, 5x4, MOVA RAPIDO (velocidade, nao carga). Onda semanal: -1 rep / +1 serie; ultima semana pela metade (taper).',
   0);

UPDATE work_block_item SET planned_sequence = planned_sequence - 99
  WHERE work_block_id = 'wb_sex_salto_m3' AND planned_sequence >= 102;

-- Bumpa o schema para 11 (mesmo relogio de runtime das migrations anteriores).
INSERT INTO schema_version (version, applied_at)
VALUES (11, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER));
