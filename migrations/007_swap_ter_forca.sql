-- =============================================================================
-- 007_swap_ter_forca — TROCA de exercicios no bloco Ter-FORCA (pedido do dono).
--
-- Duas trocas na terca (wb_ter_forca), modelo "plano = verdade atual":
--   1. Panturrilha SENTADA (soleo) -> Panturrilha EM PE (gastrocnemio).
--      (o "em pe" ja existe no catalogo, usado na quinta — so entra na terca.)
--   2. Nordic curl (posterior de coxa, redundante com o RDL do mesmo dia) ->
--      Hiperextensao / back extension (gluteo). Exercicio NOVO no catalogo.
--
-- MECANICA (igual ao editor de plano, respeitando o trigger de imutabilidade de
-- work_block_item.exercise_id da 006): NAO faz UPDATE de exercise_id. Em vez
-- disso DESCONTINUA (active=0) o item antigo — que NAO pode ser apagado porque a
-- sessao de terca ja logada referencia wbi_ter_6 (FK + recuperacao I-15) — e
-- ADICIONA um item novo no fim (planned_sequence 7/8; 5 e 6 seguem ocupados
-- pelos descontinuados por causa do UNIQUE(work_block_id, planned_sequence)).
-- Os exercicios antigos (nordic, panturrilha sentada) ficam no catalogo; so
-- saem do plano ATUAL. O Historico das sessoes passadas segue honesto.
-- Contagem de itens ATIVOS na terca fica igual (6): tira 2, poe 2.
--
-- Textos accent-free para casar a convencao do seed (002/005).
-- =============================================================================

-- 1. Exercicio novo: hiperextensao / back extension (gluteo). load_reps
--    (reps x carga; peso do corpo = 0 kg, ou segurando uma anilha).
INSERT INTO exercise
  (id, name, progression_type, priority, load_type, rep_min, rep_max,
   acute_interference, function_tag, created_at, how_to, video_url, category)
VALUES
  ('ex_back_extension', 'Hiperextensao / back extension (gluteo)', 'load_reps',
   'accessory', 'bodyweight', 10, 15, 0, 'gluteo_extensao_quadril',
   1735689600000,
   'Serve para: gluteo e extensao de quadril (complementa o RDL do mesmo dia, que trabalha mais o posterior de coxa).
Como fazer: no banco de hiperextensao (banco romano ou 45 graus), calcanhares presos e o apoio na dobra do quadril; com a COLUNA NEUTRA (sem arredondar nem arquear), desca dobrando pelo QUADRIL e suba estendendo o quadril, apertando o gluteo no topo e parando no alinhamento do tronco com as pernas. Faixa 10 a 15 reps; da para segurar uma anilha no peito para progredir.
Erro comum: jogar a lombar para tras no topo (passar do alinhamento) ou dobrar a coluna em vez do quadril. Se sentir na lombar, reduza a amplitude e foque em empurrar com o gluteo.
Obs: descricao geral de gluteo/posterior. Confira e edite aqui no app conforme a orientacao do seu treino.',
   NULL, 'forca');

-- 2. Terca: descontinua os antigos (NAO deleta — sessao logada os referencia).
--    UPDATE de `active` (nao de exercise_id) => nao dispara o trigger da 006.
UPDATE work_block_item SET active = 0 WHERE id = 'wbi_ter_5'; -- Nordic curl
UPDATE work_block_item SET active = 0 WHERE id = 'wbi_ter_6'; -- Panturrilha sentada

-- 3. Adiciona os substitutos no fim (seq 7 = back extension no lugar do Nordic;
--    seq 8 = panturrilha em pe no lugar da sentada).
INSERT INTO work_block_item
  (id, work_block_id, exercise_id, planned_sequence, planned_sets, notes,
   is_warmup, active)
VALUES
  ('wbi_ter_7', 'wb_ter_forca', 'ex_back_extension', 7, NULL,
   'Gluteo - troca do Nordic (posterior ja coberto pelo RDL).', 0, 1),
  ('wbi_ter_8', 'wb_ter_forca', 'ex_panturrilha_em_pe', 8, NULL,
   'Gastrocnemio - troca da panturrilha sentada.', 0, 1);

-- Bumpa o schema para 7 (mesmo relogio de runtime das migrations anteriores).
INSERT INTO schema_version (version, applied_at)
VALUES (7, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER));
