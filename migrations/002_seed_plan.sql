-- =============================================================================
-- 002_seed_plan.sql — Seed deterministico do plano de treino
--
-- Transcreve o plano (plano-vertical-grade-operacional.md +
-- rotina-flexibilidade-core-ginastica.md) para o schema de 001_init.sql.
--
-- DETERMINISTICO POR DESIGN:
--   - IDs sao literais fixos com prefixo (ex_*, pl_*, ph_*, rt_*, wb_*, wbi_*),
--     NAO uuids — reaplicar e idempotente e os IDs sao citaveis em revisao.
--   - created_at e a constante 1735689600000 (epoch ms) em TODAS as linhas.
--   - plan.start_date e placeholder (mesma constante) ate o dono fixar a data.
--
-- REVISAVEL NO CHECKPOINT 3: cada mapeamento que envolve julgamento (tipo de
--   progressao, load_type, faixas de rep, acute_interference de holds
--   limitrofes, data de inicio) esta marcado com `-- TODO checkpoint 3: ...`.
--   Sao decisoes do dono do plano, nao do schema.
--
-- ORDEM DE FK: exercise -> routine -> plan -> plan_phase -> work_block ->
--   work_block_item. Ultima linha bumpa schema_version para 2.
-- =============================================================================


-- =============================================================================
-- 1. EXERCISE — catalogo de movimentos
-- =============================================================================

-- --- Aquecimento (compartilhado por Ter/Qui/Sex) ----------------------------
INSERT INTO exercise (id, name, progression_type, priority, load_type, rep_min, rep_max, acute_interference, function_tag, created_at) VALUES
  ('ex_aquecimento_dinamico', 'Aquecimento dinamico 5 min (mobilidade + pogos)', 'skill_acquisition', 'bonus', 'bodyweight', NULL, NULL, 0, 'aquecimento', 1735689600000);

-- --- Ter — FORCA -------------------------------------------------------------
INSERT INTO exercise (id, name, progression_type, priority, load_type, rep_min, rep_max, acute_interference, function_tag, created_at) VALUES
  ('ex_back_squat',          'Back squat',                              'load_reps',        'primary',   'barbell',  5, 8, 0, 'forca_maxima_agachamento', 1735689600000),
  -- TODO checkpoint 3: clean pull como load_reps (vs. isometric_intent/contact_quality) — e tripla extensao explosiva por intencao, nao falha por rep
  ('ex_clean_pull',          'Clean pull',                              'load_reps',        'primary',   'barbell',  3, 5, 0, 'tripla_extensao_explosiva', 1735689600000),
  ('ex_rdl',                 'RDL (stiff/romeno)',                      'load_reps',        'accessory', 'barbell',  6, 10, 0, 'isquio_posterior', 1735689600000),
  -- TODO checkpoint 3: Nordic como difficulty_tier (vs. assisted_load) — plano diz "Nordic assistido"; se a assistencia e a metrica progredida, usar assisted_load + load_type assisted
  ('ex_nordic',              'Nordic curl (assistido)',                 'difficulty_tier',  'accessory', 'assisted', NULL, NULL, 0, 'isquio_posterior_excentrico', 1735689600000),
  -- TODO checkpoint 3: panturrilha sentada load_type barbell vs dumbbell (depende do equipamento disponivel)
  ('ex_panturrilha_sentada', 'Panturrilha sentada',                     'load_reps',        'accessory', 'barbell',  8, 12, 0, 'soleo', 1735689600000);

-- --- Qui — SUPERIOR + tornozelo ----------------------------------------------
INSERT INTO exercise (id, name, progression_type, priority, load_type, rep_min, rep_max, acute_interference, function_tag, created_at) VALUES
  ('ex_extensao_triceps_overhead', 'Extensao overhead / frances',       'load_reps',        'accessory', 'dumbbell', 8, 12, 0, 'triceps_cabeca_longa', 1735689600000),
  ('ex_elevacao_lateral',          'Elevacao lateral',                  'load_reps',        'accessory', 'dumbbell', 10, 15, 0, 'deltoide_lateral', 1735689600000),
  ('ex_desenvolvimento',           'Desenvolvimento (ombro)',           'load_reps',        'accessory', 'barbell',  6, 10, 0, 'empurrar_vertical', 1735689600000),
  ('ex_remada',                    'Remada',                            'load_reps',        'accessory', 'barbell',  8, 12, 0, 'puxar_horizontal', 1735689600000),
  ('ex_tibial',                    'Tibial anterior',                   'load_reps',        'finisher',  'bodyweight', 12, 20, 0, 'tibial_freio', 1735689600000),
  ('ex_panturrilha_em_pe',         'Panturrilha em pe',                 'load_reps',        'finisher',  'dumbbell', 8, 15, 0, 'gastrocnemio', 1735689600000);

-- --- Sex — SALTO / REATIVO + gluteo ------------------------------------------
INSERT INTO exercise (id, name, progression_type, priority, load_type, rep_min, rep_max, acute_interference, function_tag, created_at) VALUES
  -- I-6: pliometricos usam contact_quality (NAO contact_time, que vive em jump_test)
  ('ex_drop_landings',     'Drop Landings (degrau 1 — absorver/congelar)',     'contact_quality', 'primary',   'box_height', NULL, NULL, 0, 'plio_absorcao', 1735689600000),
  ('ex_bounce_drop_jumps', 'Bounce Drop Jumps 15-20 cm (degrau 2)',            'contact_quality', 'primary',   'box_height', NULL, NULL, 0, 'plio_reativo', 1735689600000),
  ('ex_depth_jumps',       'Depth Jumps 30-45 cm (degrau 3 — gate dor 0-2)',   'contact_quality', 'primary',   'box_height', NULL, NULL, 0, 'plio_reativo', 1735689600000),
  -- Approach jump = teste de altura -> jump_height (registra altura)
  ('ex_approach_jump',     'Approach jump (registrar altura)',                 'jump_height',     'primary',   'bodyweight', NULL, NULL, 0, 'salto_vertical_aproximacao', 1735689600000),
  ('ex_isometria_balistica', 'Isometria balistica no angulo do salto',         'isometric_intent','primary',   'barbell',    NULL, NULL, 0, 'rfd_isometrico', 1735689600000),
  ('ex_hip_thrust',        'Hip thrust',                                       'load_reps',       'accessory', 'barbell',    8, 12, 0, 'gluteo_extensao_quadril', 1735689600000),
  -- TODO checkpoint 3: jumping bulgarian como jump_height (potencia unilateral medida por altura) vs load_reps (se carregado e progredido por carga/rep)
  ('ex_jumping_bulgarian', 'Jumping Bulgarian split squat',                    'jump_height',     'accessory', 'dumbbell',   NULL, NULL, 0, 'potencia_unilateral', 1735689600000);

-- --- Sab — POTENCIACAO (bonus, complexo) -------------------------------------
INSERT INTO exercise (id, name, progression_type, priority, load_type, rep_min, rep_max, acute_interference, function_tag, created_at) VALUES
  ('ex_iso_explosiva_max', 'Isometria explosiva maxima (potenciacao)',         'isometric_intent','bonus',     'barbell',    NULL, NULL, 0, 'rfd_isometrico', 1735689600000),
  ('ex_salto_potenciado',  'Salto pos-potenciacao (PAP)',                      'jump_height',     'bonus',     'bodyweight', NULL, NULL, 0, 'plio_reativo', 1735689600000),
  ('ex_zercher_leve',      'Zercher squat leve (forca geral)',                 'load_reps',       'bonus',     'barbell',    5, 8, 0, 'forca_geral_zercher', 1735689600000);

-- --- Seg / Qua — GINASTICA ---------------------------------------------------
INSERT INTO exercise (id, name, progression_type, priority, load_type, rep_min, rep_max, acute_interference, function_tag, created_at) VALUES
  -- TODO checkpoint 3: skills de acrobacia agrupadas em 1 exercise; se quiser progredir tuck/rodante/estrela/flick separadamente, separar em exercises distintos
  ('ex_acrobacia',         'Acrobacia (tuck/mortal/rodante/estrela/flick)',    'skill_acquisition','primary',  'bodyweight', NULL, NULL, 0, 'skill_acrobatico', 1735689600000),
  -- TODO checkpoint 3: barra (pull-up) como load_reps (vs assisted_load se ainda assistido)
  ('ex_barra',             'Barra (pull-up — puxar vertical)',                 'load_reps',        'accessory', 'bodyweight', 4, 10, 0, 'puxar_vertical', 1735689600000),
  -- TODO checkpoint 3: dips como load_reps (vs assisted_load se ainda assistido)
  ('ex_dips',              'Dips (empurrar vertical)',                         'load_reps',        'accessory', 'bodyweight', 4, 10, 0, 'empurrar_vertical', 1735689600000),
  ('ex_banded_knee_drive', 'Banded Knee Drive (flexor de quadril, pre-aula)',  'difficulty_tier',  'accessory', 'band',       NULL, NULL, 0, 'flexor_quadril', 1735689600000),
  ('ex_abducao_faixa',     'Abducao de quadril com faixa (gluteo medio)',      'load_reps',        'finisher',  'band',       12, 20, 0, 'gluteo_medio_controle_valgo', 1735689600000);

-- --- §3 Nucleo diario de mobilidade/core (rt_mobilidade_nucleo) --------------
INSERT INTO exercise (id, name, progression_type, priority, load_type, rep_min, rep_max, acute_interference, function_tag, created_at) VALUES
  -- TODO checkpoint 3: couch stretch ativo como time_under_tension (hold 40s/lado); confirmar vs difficulty_tier
  ('ex_couch_stretch_ativo', 'Couch stretch ativo (bascula posterior + gluteo) 40s/lado', 'time_under_tension', 'accessory', 'bodyweight', NULL, NULL, 0, 'flexor_quadril', 1735689600000),
  -- TODO checkpoint 3: cossack squat como difficulty_tier (vs load_reps se carregado)
  ('ex_cossack_squat',       'Cossack squat 2x6/lado',                          'difficulty_tier',  'accessory', 'bodyweight', NULL, NULL, 0, 'adutor_tornozelo', 1735689600000),
  -- TODO checkpoint 3: extensao toracica e hold de 60s — acute_interference limitrofe (>60s e o gate; esta exatamente no limite). Marcado 0; reavaliar.
  ('ex_extensao_toracica_rolo', 'Extensao toracica sobre rolo (escapulas) 60s', 'time_under_tension', 'accessory', 'bodyweight', NULL, NULL, 0, 'extensao_toracica', 1735689600000),
  ('ex_shoulder_flexion',    'Shoulder flexion / cat stretch / dislocate com bastao 2x10', 'skill_acquisition', 'accessory', 'bodyweight', NULL, NULL, 0, 'ombro_overhead', 1735689600000),
  ('ex_elevacao_ativa_perna','Elevacao ativa de perna (frente + lateral) 2x8/lado', 'difficulty_tier', 'accessory', 'bodyweight', NULL, NULL, 0, 'amplitude_ativa_quadril', 1735689600000),
  ('ex_9090_hip_switches',   '90/90 hip switches 2x6/lado',                     'skill_acquisition',  'accessory', 'bodyweight', NULL, NULL, 0, 'rotacao_quadril', 1735689600000),
  ('ex_hollow_superman',     'Canoinha (hollow) + superman (arch)',             'difficulty_tier',    'accessory', 'bodyweight', NULL, NULL, 0, 'core_anti_extensao_extensao', 1735689600000),
  ('ex_wrist_rocks',         'Wrist rocks ajoelhado 30s',                       'difficulty_tier',    'accessory', 'bodyweight', NULL, NULL, 0, 'punho_apoio_mao', 1735689600000);

-- --- Sessao Domingo (rt_domingo) — mobilidade profunda + core + escadas ------
-- acute_interference=1 apenas em holds estaticos longos (>60s): espacato/pancake/PNF profundos.
INSERT INTO exercise (id, name, progression_type, priority, load_type, rep_min, rep_max, acute_interference, function_tag, created_at) VALUES
  -- §4 compressao ativa (core, holds curtos -> interferencia 0)
  ('ex_tuck_ups',            'Tuck-ups 2x8',                                    'difficulty_tier',    'accessory', 'bodyweight', NULL, NULL, 0, 'compressao_core', 1735689600000),
  ('ex_v_sit_compression',   'V-sit / compression hold 3x10s',                  'time_under_tension', 'accessory', 'bodyweight', NULL, NULL, 0, 'compressao_ativa_quadril', 1735689600000),
  ('ex_candlestick',         'Candlestick -> em pe 2x5',                        'difficulty_tier',    'accessory', 'bodyweight', NULL, NULL, 0, 'compressao_core', 1735689600000),
  -- §5 ombro/toracica/ponte
  ('ex_ponte_escada',        'Ponte (escada de seguranca lombar)',              'difficulty_tier',    'accessory', 'bodyweight', NULL, NULL, 0, 'extensao_distribuida_ponte', 1735689600000),
  ('ex_dislocates_wall_slides', 'Dislocates / wall slides 2x10',                'skill_acquisition',  'accessory', 'bodyweight', NULL, NULL, 0, 'ombro_overhead', 1735689600000),
  -- §6 core anti-movimento
  ('ex_dead_bug',            'Dead bug 2x8/lado',                               'difficulty_tier',    'accessory', 'bodyweight', NULL, NULL, 0, 'anti_extensao_core', 1735689600000),
  ('ex_bird_dog',            'Bird dog 2x8/lado',                               'difficulty_tier',    'accessory', 'bodyweight', NULL, NULL, 0, 'anti_extensao_anti_rotacao', 1735689600000),
  ('ex_ab_wheel',            'Ab wheel (ajoelhado -> completo)',                'difficulty_tier',    'accessory', 'bodyweight', NULL, NULL, 0, 'anti_extensao_core', 1735689600000),
  ('ex_pallof_press',        'Pallof press (faixa) 2x10/lado',                  'difficulty_tier',    'accessory', 'band',       NULL, NULL, 0, 'anti_rotacao_core', 1735689600000),
  -- §7 espacato/pancake — holds estaticos longos profundos -> interferencia 1
  -- TODO checkpoint 3: pancake (straddle) como time_under_tension; confirmar e a duracao-alvo do hold
  ('ex_pancake_straddle',    'Pancake / straddle (PNF + hold profundo)',        'time_under_tension', 'accessory', 'bodyweight', NULL, NULL, 1, 'pancake_isquio_adutor', 1735689600000),
  -- TODO checkpoint 3: espacato lateral como time_under_tension; confirmar
  ('ex_espacato_lateral',    'Espacato lateral (escada B + PNF + hold profundo)', 'time_under_tension', 'accessory', 'bodyweight', NULL, NULL, 1, 'espacato_adutor', 1735689600000),
  ('ex_escadas',             'Escadas (recuperacao ativa / condicionamento)',   'skill_acquisition',  'finisher',  'bodyweight', NULL, NULL, 0, 'condicionamento_aerobio', 1735689600000);


-- =============================================================================
-- 2. ROUTINE — rotinas anexaveis (mobilidade/core)
-- =============================================================================

INSERT INTO routine (id, name, attachable, recurring, created_at) VALUES
  ('rt_mobilidade_nucleo', 'Nucleo diario de mobilidade/core (~10-12 min)', 1, 1, 1735689600000),
  ('rt_domingo',           'Sessao Domingo (15 min) — mobilidade profunda + core + escadas', 1, 0, 1735689600000);


-- =============================================================================
-- 3. PLAN
-- =============================================================================

INSERT INTO plan (id, name, start_date, duration_weeks, created_at) VALUES
  -- TODO checkpoint 3: data real de inicio do plano (placeholder)
  ('pl_vertical_18w', 'Salto Vertical + Estetica + Ginastica', 1735689600000, 18, 1735689600000);


-- =============================================================================
-- 4. PLAN_PHASE — 7 fases cobrindo semanas 1-18 contiguas
-- =============================================================================

INSERT INTO plan_phase (id, plan_id, name, week_start, week_end, is_deload, is_taper) VALUES
  ('ph_m1',    'pl_vertical_18w', 'Mes 1 — Estrutura',     1,  5,  0, 0),
  ('ph_dl1',   'pl_vertical_18w', 'Deload 1',              6,  6,  1, 0),
  ('ph_m2',    'pl_vertical_18w', 'Mes 2 — Potencia/RFD',  7,  9,  0, 0),
  ('ph_dl2',   'pl_vertical_18w', 'Deload 2',              10, 10, 1, 0),
  ('ph_m3',    'pl_vertical_18w', 'Mes 3 — Peaking',       11, 15, 0, 0),
  -- TODO checkpoint 3: a fonte se contradiz (taper "16-17" em um trecho, "15-17"
  -- em outro). Escolhido 16-17 (Mes 3 = 11-15, sem sobreposicao). Confirmar.
  ('ph_taper', 'pl_vertical_18w', 'Taper',                 16, 17, 0, 1),
  ('ph_dl3',   'pl_vertical_18w', 'Deload 3',              18, 18, 1, 0);


-- =============================================================================
-- 5. WORK_BLOCK
-- =============================================================================

-- --- Blocos do PLANO (plan_id set, routine_id NULL) -------------------------
INSERT INTO work_block (id, plan_id, routine_id, name, day_of_week, week_start, week_end, ordered, internal_rest_s, created_at) VALUES
  ('wb_ter_forca',       'pl_vertical_18w', NULL, 'Ter — FORCA',                          2, NULL, NULL, 0, 0, 1735689600000),
  ('wb_qui_superior',    'pl_vertical_18w', NULL, 'Qui — SUPERIOR + tornozelo',           4, NULL, NULL, 0, 0, 1735689600000),
  ('wb_sex_salto_m1',    'pl_vertical_18w', NULL, 'Sex — SALTO Mes1 (Drop Landings)',     5, 1,    6,    0, 0, 1735689600000),
  ('wb_sex_salto_m2',    'pl_vertical_18w', NULL, 'Sex — SALTO Mes2 (Bounce Drop Jumps + Jumping Bulgarian)', 5, 7, 10, 0, 0, 1735689600000),
  ('wb_sex_salto_m3',    'pl_vertical_18w', NULL, 'Sex — SALTO Mes3 (Depth Jumps + Approach jumps)', 5, 11, 18, 0, 0, 1735689600000),
  ('wb_seg_ginastica',   'pl_vertical_18w', NULL, 'Seg — GINASTICA',                      1, NULL, NULL, 0, 0, 1735689600000),
  ('wb_qua_ginastica',   'pl_vertical_18w', NULL, 'Qua — GINASTICA',                      3, NULL, NULL, 0, 0, 1735689600000),
  ('wb_sab_bonus',       'pl_vertical_18w', NULL, 'Sab — POTENCIACAO (complexo iso->salto->Zercher)', 6, NULL, NULL, 1, 0, 1735689600000);

-- --- Blocos de ROTINA (routine_id set, plan_id NULL, day_of_week NULL) -------
INSERT INTO work_block (id, plan_id, routine_id, name, day_of_week, week_start, week_end, ordered, internal_rest_s, created_at) VALUES
  ('wb_rt_nucleo',  NULL, 'rt_mobilidade_nucleo', 'Nucleo diario de mobilidade/core', NULL, NULL, NULL, 1, 0, 1735689600000),
  ('wb_rt_domingo', NULL, 'rt_domingo',           'Sessao Domingo (15 min)',          NULL, NULL, NULL, 1, 0, 1735689600000);


-- =============================================================================
-- 6. WORK_BLOCK_ITEM — exercicios por bloco, na ordem (planned_sequence 1..n)
-- Primeiro item de cada bloco de treino (Ter/Qui/Sex) e o aquecimento (is_warmup=1).
-- =============================================================================

-- --- wb_ter_forca -----------------------------------------------------------
INSERT INTO work_block_item (id, work_block_id, exercise_id, planned_sequence, planned_sets, notes, is_warmup) VALUES
  ('wbi_ter_1', 'wb_ter_forca', 'ex_aquecimento_dinamico', 1, NULL, 'Aquecimento dinamico 5 min (mobilidade + pogos)', 1),
  ('wbi_ter_2', 'wb_ter_forca', 'ex_back_squat',           2, NULL, 'Primario pesado. Dupla progressao, faixas 5-8.', 0),
  ('wbi_ter_3', 'wb_ter_forca', 'ex_clean_pull',           3, NULL, 'Intencao maxima-rapida (RFD), nao grind.', 0),
  ('wbi_ter_4', 'wb_ter_forca', 'ex_rdl',                  4, NULL, 'Peca rotativa com Nordic. Se nao fizer RDL aqui, ver Sex.', 0),
  ('wbi_ter_5', 'wb_ter_forca', 'ex_nordic',               5, NULL, 'Peca rotativa com RDL. Nordic assistido (Mes 1).', 0),
  ('wbi_ter_6', 'wb_ter_forca', 'ex_panturrilha_sentada',  6, NULL, 'Soleo — mola do contato.', 0);

-- --- wb_qui_superior --------------------------------------------------------
INSERT INTO work_block_item (id, work_block_id, exercise_id, planned_sequence, planned_sets, notes, is_warmup) VALUES
  ('wbi_qui_1', 'wb_qui_superior', 'ex_aquecimento_dinamico',        1, NULL, 'Aquecimento dinamico 5 min.', 1),
  ('wbi_qui_2', 'wb_qui_superior', 'ex_extensao_triceps_overhead',   2, NULL, 'Cabeca longa do triceps em alongamento.', 0),
  ('wbi_qui_3', 'wb_qui_superior', 'ex_elevacao_lateral',            3, NULL, 'Largura de ombro.', 0),
  ('wbi_qui_4', 'wb_qui_superior', 'ex_desenvolvimento',             4, NULL, 'Empurrar vertical.', 0),
  ('wbi_qui_5', 'wb_qui_superior', 'ex_remada',                      5, NULL, 'Puxar horizontal (equilibrio postural).', 0),
  ('wbi_qui_6', 'wb_qui_superior', 'ex_tibial',                      6, NULL, 'Freio/equilibrio (rapido).', 0),
  ('wbi_qui_7', 'wb_qui_superior', 'ex_panturrilha_em_pe',           7, NULL, 'Gastrocnemio (finalizador).', 0);

-- --- wb_sex_salto_m1 (Mes 1, sem 1-6) ---------------------------------------
INSERT INTO work_block_item (id, work_block_id, exercise_id, planned_sequence, planned_sets, notes, is_warmup) VALUES
  ('wbi_sex1_1', 'wb_sex_salto_m1', 'ex_aquecimento_dinamico', 1, NULL, 'Aquecimento dinamico 5 min.', 1),
  ('wbi_sex1_2', 'wb_sex_salto_m1', 'ex_drop_landings',        2, NULL, 'Degrau 1: so absorver, congelar.', 0),
  ('wbi_sex1_3', 'wb_sex_salto_m1', 'ex_isometria_balistica',  3, NULL, 'Inamovivel, intencao explosiva. Teto de taxa / drive neural.', 0),
  ('wbi_sex1_4', 'wb_sex_salto_m1', 'ex_hip_thrust',           4, NULL, 'Gluteo + extensao de quadril (decolagem).', 0),
  ('wbi_sex1_5', 'wb_sex_salto_m1', 'ex_rdl',                  5, NULL, 'RDL se nao fez Ter, ou tibial.', 0);

-- --- wb_sex_salto_m2 (Mes 2, sem 7-10) --------------------------------------
INSERT INTO work_block_item (id, work_block_id, exercise_id, planned_sequence, planned_sets, notes, is_warmup) VALUES
  ('wbi_sex2_1', 'wb_sex_salto_m2', 'ex_aquecimento_dinamico', 1, NULL, 'Aquecimento dinamico 5 min.', 1),
  ('wbi_sex2_2', 'wb_sex_salto_m2', 'ex_bounce_drop_jumps',    2, NULL, 'Degrau 2: quicar, contato minimo (15-20 cm).', 0),
  ('wbi_sex2_3', 'wb_sex_salto_m2', 'ex_jumping_bulgarian',    3, NULL, 'Potencia unilateral. NUNCA no mesmo dia dos depth jumps.', 0),
  ('wbi_sex2_4', 'wb_sex_salto_m2', 'ex_isometria_balistica',  4, NULL, 'Inamovivel, intencao explosiva.', 0),
  ('wbi_sex2_5', 'wb_sex_salto_m2', 'ex_hip_thrust',           5, NULL, 'Gluteo + extensao de quadril.', 0),
  ('wbi_sex2_6', 'wb_sex_salto_m2', 'ex_rdl',                  6, NULL, 'RDL se nao fez Ter, ou tibial.', 0);

-- --- wb_sex_salto_m3 (Mes 3, sem 11-18) -------------------------------------
INSERT INTO work_block_item (id, work_block_id, exercise_id, planned_sequence, planned_sets, notes, is_warmup) VALUES
  ('wbi_sex3_1', 'wb_sex_salto_m3', 'ex_aquecimento_dinamico', 1, NULL, 'Aquecimento dinamico 5 min.', 1),
  ('wbi_sex3_2', 'wb_sex_salto_m3', 'ex_depth_jumps',          2, NULL, 'Degrau 3 (30-45 cm). Gate dor patelar 0-2/10.', 0),
  ('wbi_sex3_3', 'wb_sex_salto_m3', 'ex_approach_jump',        3, NULL, 'Teste — registrar altura.', 0),
  ('wbi_sex3_4', 'wb_sex_salto_m3', 'ex_isometria_balistica',  4, NULL, 'Inamovivel, intencao explosiva.', 0),
  ('wbi_sex3_5', 'wb_sex_salto_m3', 'ex_hip_thrust',           5, NULL, 'Gluteo + extensao de quadril.', 0);

-- --- wb_seg_ginastica -------------------------------------------------------
INSERT INTO work_block_item (id, work_block_id, exercise_id, planned_sequence, planned_sets, notes, is_warmup) VALUES
  ('wbi_seg_1', 'wb_seg_ginastica', 'ex_banded_knee_drive', 1, NULL, 'Pre-aula (flexor de quadril).', 0),
  ('wbi_seg_2', 'wb_seg_ginastica', 'ex_acrobacia',         2, NULL, 'Foco. Em ambiente com colchao/spotting.', 0),
  ('wbi_seg_3', 'wb_seg_ginastica', 'ex_barra',             3, NULL, 'Puxar vertical.', 0),
  ('wbi_seg_4', 'wb_seg_ginastica', 'ex_dips',              4, NULL, 'Empurrar vertical.', 0),
  ('wbi_seg_5', 'wb_seg_ginastica', 'ex_abducao_faixa',     5, NULL, 'Finalizador rapido — gluteo medio, controle de valgo.', 0);

-- --- wb_qua_ginastica (mesmos itens da Seg — blocos por-dia distintos) -------
INSERT INTO work_block_item (id, work_block_id, exercise_id, planned_sequence, planned_sets, notes, is_warmup) VALUES
  ('wbi_qua_1', 'wb_qua_ginastica', 'ex_banded_knee_drive', 1, NULL, 'Pre-aula (flexor de quadril).', 0),
  ('wbi_qua_2', 'wb_qua_ginastica', 'ex_acrobacia',         2, NULL, 'Foco. Em ambiente com colchao/spotting.', 0),
  ('wbi_qua_3', 'wb_qua_ginastica', 'ex_barra',             3, NULL, 'Puxar vertical.', 0),
  ('wbi_qua_4', 'wb_qua_ginastica', 'ex_dips',              4, NULL, 'Empurrar vertical.', 0),
  ('wbi_qua_5', 'wb_qua_ginastica', 'ex_abducao_faixa',     5, NULL, 'Finalizador rapido — gluteo medio.', 0);

-- --- wb_sab_bonus (ordered=1 — complexo de potenciacao em sequencia) --------
INSERT INTO work_block_item (id, work_block_id, exercise_id, planned_sequence, planned_sets, notes, is_warmup) VALUES
  ('wbi_sab_1', 'wb_sab_bonus', 'ex_iso_explosiva_max', 1, NULL, 'Iso explosiva maxima.', 0),
  ('wbi_sab_2', 'wb_sab_bonus', 'ex_salto_potenciado',  2, NULL, 'Descanso 3-4 min apos a iso, depois saltar (PAP).', 0),
  ('wbi_sab_3', 'wb_sab_bonus', 'ex_zercher_leve',      3, NULL, 'Zercher LEVE. Se ja levantou pesado na semana, nao empilhe carga.', 0);

-- --- wb_rt_nucleo (rt_mobilidade_nucleo) — §3 -------------------------------
INSERT INTO work_block_item (id, work_block_id, exercise_id, planned_sequence, planned_sets, notes, is_warmup) VALUES
  ('wbi_nuc_1', 'wb_rt_nucleo', 'ex_couch_stretch_ativo',     1, NULL, 'Flexor de quadril (versao segura). 40s/lado.', 0),
  ('wbi_nuc_2', 'wb_rt_nucleo', 'ex_cossack_squat',           2, NULL, 'Adutor + tornozelo carregado. 2x6/lado.', 0),
  ('wbi_nuc_3', 'wb_rt_nucleo', 'ex_extensao_toracica_rolo',  3, NULL, 'Ombro/coluna. 60s.', 0),
  ('wbi_nuc_4', 'wb_rt_nucleo', 'ex_shoulder_flexion',        4, NULL, 'Ombro overhead. 2x10.', 0),
  ('wbi_nuc_5', 'wb_rt_nucleo', 'ex_elevacao_ativa_perna',    5, NULL, 'Amplitude ativa. 2x8/lado.', 0),
  ('wbi_nuc_6', 'wb_rt_nucleo', 'ex_9090_hip_switches',       6, NULL, 'Rotacao de quadril. 2x6/lado.', 0),
  ('wbi_nuc_7', 'wb_rt_nucleo', 'ex_hollow_superman',         7, NULL, 'Core anti-extensao/extensao. Ver §6.', 0),
  ('wbi_nuc_8', 'wb_rt_nucleo', 'ex_wrist_rocks',             8, NULL, 'Apoio de mao — seguranca. 30s.', 0);

-- --- wb_rt_domingo (rt_domingo) — §4 compressao + §5 ombro/ponte + §6 core + §7 espacato
INSERT INTO work_block_item (id, work_block_id, exercise_id, planned_sequence, planned_sets, notes, is_warmup) VALUES
  ('wbi_dom_1',  'wb_rt_domingo', 'ex_tuck_ups',             1,  NULL, '§4 compressao ativa. 2x8.', 0),
  ('wbi_dom_2',  'wb_rt_domingo', 'ex_v_sit_compression',   2,  NULL, '§4 compressao. 3x10s.', 0),
  ('wbi_dom_3',  'wb_rt_domingo', 'ex_candlestick',         3,  NULL, '§4 candlestick -> em pe. 2x5.', 0),
  ('wbi_dom_4',  'wb_rt_domingo', 'ex_dead_bug',            4,  NULL, '§6 core profundo (faca PRIMEIRO). 2x8/lado.', 0),
  ('wbi_dom_5',  'wb_rt_domingo', 'ex_bird_dog',            5,  NULL, '§6 core profundo. 2x8/lado.', 0),
  ('wbi_dom_6',  'wb_rt_domingo', 'ex_ab_wheel',            6,  NULL, '§6 anti-extensao (progride apos prancha).', 0),
  ('wbi_dom_7',  'wb_rt_domingo', 'ex_pallof_press',        7,  NULL, '§6 anti-rotacao. 2x10/lado.', 0),
  ('wbi_dom_8',  'wb_rt_domingo', 'ex_extensao_toracica_rolo', 8, NULL, '§5 mobilizador. 60s.', 0),
  ('wbi_dom_9',  'wb_rt_domingo', 'ex_dislocates_wall_slides', 9, NULL, '§5 ombro overhead. 2x10.', 0),
  ('wbi_dom_10', 'wb_rt_domingo', 'ex_ponte_escada',        10, NULL, '§5 ponte — escada de seguranca lombar.', 0),
  ('wbi_dom_11', 'wb_rt_domingo', 'ex_pancake_straddle',    11, NULL, '§7 pancake (escada A) — PNF RPE 7-8, hold profundo.', 0),
  ('wbi_dom_12', 'wb_rt_domingo', 'ex_espacato_lateral',    12, NULL, '§7 espacato lateral (escada B) — PNF, hold profundo.', 0),
  ('wbi_dom_13', 'wb_rt_domingo', 'ex_escadas',             13, NULL, 'Escadas — recuperacao ativa.', 0);


-- =============================================================================
-- 7. SCHEMA VERSION
-- =============================================================================

INSERT INTO schema_version (version, applied_at)
VALUES (2, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER));
