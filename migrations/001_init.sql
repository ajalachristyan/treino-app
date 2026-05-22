-- =============================================================================
-- 001_init.sql — Schema inicial do treino-app
--
-- LEIA brief-data-model-fase0.md Secao 9 antes de modificar este arquivo.
-- Cada CHECK / TRIGGER / decisao de coluna existe para honrar um invariante
-- nomeado. Relaxar um deles eh quebrar o contrato; o caminho certo eh
-- escrever o teste que trava a violacao.
--
-- Principio-mae (1.2): "O registro guarda apenas o que foi observado.
-- A interpretacao mora na engine. Nunca grave no dado uma decisao que
-- pertence a logica."
--
-- Idiomas SQLite escolhidos (D6, D7 do Passo 3):
--   - Timestamps: INTEGER (epoch ms). EpochMs brandado em TS.
--   - Booleanos: INTEGER 0/1 com CHECK (col IN (0, 1)).
--   - Enums: TEXT com CHECK (col IN (...)). Os valores espelham os arrays
--     em src/domain/types.ts; Passo 5 vai automatizar a verificacao.
--   - UUIDs: TEXT (gerados em TS via uuid v7).
--
-- Foreign keys: o runner de migrations (Passo 4) habilita por conexao com
--   PRAGMA foreign_keys = ON. Sem isso, FK eh declarativa apenas.
-- =============================================================================


-- =============================================================================
-- META: versao do schema
-- =============================================================================

CREATE TABLE schema_version (
  version    INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL   -- epoch ms
);


-- =============================================================================
-- CATALOGO
-- =============================================================================

-- exercise: a identidade de um movimento. Reutilizavel.
-- progression_type aqui eh IMUTAVEL (trigger abaixo) — derivacao de D1:
-- desnormalizamos progression_type para session_set; para a copia ser segura
-- a origem nao pode mudar. "Mudou o tipo" => crie um novo exercicio.
CREATE TABLE exercise (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  progression_type   TEXT NOT NULL CHECK (progression_type IN (
                       'load_reps', 'isometric_intent', 'contact_quality',
                       'contact_time', 'jump_height', 'difficulty_tier',
                       'assisted_load', 'skill_acquisition', 'time_under_tension'
                     )),
  priority           TEXT NOT NULL CHECK (priority IN (
                       'primary', 'accessory', 'finisher', 'bonus'
                     )),
  load_type          TEXT NOT NULL CHECK (load_type IN (
                       'barbell', 'dumbbell', 'band', 'bodyweight',
                       'assisted', 'box_height'
                     )),
  rep_min            INTEGER,
  rep_max            INTEGER,
  acute_interference INTEGER NOT NULL DEFAULT 0
                       CHECK (acute_interference IN (0, 1)),
  function_tag       TEXT,
  created_at         INTEGER NOT NULL,
  CHECK (
    (rep_min IS NULL AND rep_max IS NULL)
    OR (rep_min IS NOT NULL AND rep_max IS NOT NULL
        AND rep_min > 0 AND rep_min <= rep_max)
  )
);

-- I-10 derivado (D1): progression_type imutavel apos criacao.
CREATE TRIGGER exercise_progression_type_immutable
BEFORE UPDATE OF progression_type ON exercise
WHEN OLD.progression_type IS NOT NEW.progression_type
BEGIN
  SELECT RAISE(ABORT,
    'exercise.progression_type is immutable (derived from I-10). '
    'To change the type, create a new exercise.'
  );
END;


-- routine: catalogo de rotinas anexaveis (mobilidade, core, etc.).
-- Brief 7.1: "uma rotina referenciada tres vezes, NAO tres copias".
-- A definicao vive aqui (id unico); cada sessao que anexa eh uma referencia.
CREATE TABLE routine (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  attachable INTEGER NOT NULL DEFAULT 1 CHECK (attachable IN (0, 1)),
  recurring  INTEGER NOT NULL DEFAULT 0 CHECK (recurring IN (0, 1)),
  created_at INTEGER NOT NULL
);


-- =============================================================================
-- INTENCAO (plano, fases, blocos)
-- =============================================================================

-- plan: a periodizacao. Comeca em start_date, dura duration_weeks.
-- Engine deriva "que semana eh agora" via session.started_at - plan.start_date.
CREATE TABLE plan (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  start_date      INTEGER NOT NULL,   -- epoch ms (ancora temporal)
  duration_weeks  INTEGER NOT NULL CHECK (duration_weeks > 0),
  created_at      INTEGER NOT NULL
);


-- plan_phase: fases dentro do plano (Mes 1, Mes 2, Mes 3, deload, taper).
-- D4: is_deload eh propriedade da FASE, nao da sessao. Se a periodizacao for
-- corrigida, sessoes antigas reclassificam corretamente (I-14 estrutural).
CREATE TABLE plan_phase (
  id           TEXT PRIMARY KEY,
  plan_id      TEXT NOT NULL REFERENCES plan(id),
  name         TEXT NOT NULL,        -- 'Mes 1 — Estrutura', 'Mes 3 — Peaking', etc.
  week_start   INTEGER NOT NULL CHECK (week_start >= 1),
  week_end     INTEGER NOT NULL CHECK (week_end >= week_start),
  is_deload    INTEGER NOT NULL DEFAULT 0 CHECK (is_deload IN (0, 1)),
  is_taper     INTEGER NOT NULL DEFAULT 0 CHECK (is_taper IN (0, 1))
);


-- work_block: unidade de prescricao dentro de um plano OU dentro de uma rotina.
-- Pertence a um plano (agendado) OU a uma rotina (anexavel), nunca a ambos.
CREATE TABLE work_block (
  id              TEXT PRIMARY KEY,
  plan_id         TEXT REFERENCES plan(id),
  routine_id      TEXT REFERENCES routine(id),
  name            TEXT NOT NULL,
  day_of_week     INTEGER CHECK (day_of_week IS NULL
                                 OR (day_of_week BETWEEN 1 AND 7)),  -- ISO: Seg=1..Dom=7
  week_start      INTEGER,
  week_end        INTEGER,
  ordered         INTEGER NOT NULL DEFAULT 0 CHECK (ordered IN (0, 1)),
  internal_rest_s INTEGER NOT NULL DEFAULT 0 CHECK (internal_rest_s >= 0),
  created_at      INTEGER NOT NULL,
  CHECK (
    (plan_id IS NOT NULL AND routine_id IS NULL)
    OR (plan_id IS NULL AND routine_id IS NOT NULL)
  ),
  CHECK (
    (week_start IS NULL AND week_end IS NULL)
    OR (week_start IS NOT NULL AND week_end IS NOT NULL
        AND week_start >= 1 AND week_end >= week_start)
  )
);


-- work_block_item: exercicio planejado dentro de um bloco.
-- is_warmup (I-7): itens marcados como aquecimento ficam fora de progressao/volume.
CREATE TABLE work_block_item (
  id                TEXT PRIMARY KEY,
  work_block_id     TEXT NOT NULL REFERENCES work_block(id),
  exercise_id       TEXT NOT NULL REFERENCES exercise(id),
  planned_sequence  INTEGER NOT NULL CHECK (planned_sequence > 0),
  planned_sets      INTEGER CHECK (planned_sets IS NULL OR planned_sets > 0),
  notes             TEXT,
  is_warmup         INTEGER NOT NULL DEFAULT 0 CHECK (is_warmup IN (0, 1)),
  UNIQUE (work_block_id, planned_sequence)
);


-- =============================================================================
-- OBSERVACAO (sessao, itens, series)
-- =============================================================================

-- session: o que aconteceu numa ida a academia. Semeada pelo plano, MUTAVEL.
-- I-12: a sessao eh observacao independente; o work_block_id que a semeou
-- continua intacto no plano (basta nao escrever em work_block/work_block_item
-- ao mexer na sessao).
-- I-13: interference_warned registra que o gate de timing acionou nesta sessao
-- (aviso, nao bloqueio — Secao 6.3 eh anti-culpa).
-- I-11: timestamp_server eh a chave de last-write-wins no sync.
CREATE TABLE session (
  id                   TEXT PRIMARY KEY,
  plan_id              TEXT REFERENCES plan(id),
  work_block_id        TEXT REFERENCES work_block(id),
  attached_routine_id  TEXT REFERENCES routine(id),
  started_at           INTEGER NOT NULL,   -- epoch ms
  ended_at             INTEGER,            -- NULL enquanto em andamento
  interference_warned  INTEGER NOT NULL DEFAULT 0
                         CHECK (interference_warned IN (0, 1)),
  timestamp_server     INTEGER NOT NULL,
  notes                TEXT,
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);


-- session_item: o item observado dentro de uma sessao.
-- exercise_id eh o exercicio ATUAL feito. Se status='substituted', o planejado
-- eh recuperado via work_block_item_id JOIN work_block_item.exercise_id.
-- from_routine_id !=NULL marca proveniencia "veio de rotina anexada".
-- A regra cross-field status -> deviation_reason eh validada em TS
-- (src/domain/types.ts: assertValidDeviation) — fonte unica, ver
-- feedback-single-source-of-truth.
CREATE TABLE session_item (
  id                  TEXT PRIMARY KEY,
  session_id          TEXT NOT NULL REFERENCES session(id),
  exercise_id         TEXT NOT NULL REFERENCES exercise(id),
  work_block_item_id  TEXT REFERENCES work_block_item(id),
  from_routine_id     TEXT REFERENCES routine(id),
  actual_sequence     INTEGER NOT NULL CHECK (actual_sequence > 0),
  status              TEXT NOT NULL CHECK (status IN (
                        'done', 'skipped', 'substituted',
                        'reordered', 'deferred', 'added_adhoc'
                      )),
  deviation_reason    TEXT CHECK (
                        deviation_reason IS NULL
                        OR deviation_reason IN (
                          'equipment_busy', 'injury_avoidance',
                          'user_choice', 'engine_suggested'
                        )
                      ),
  data_origin         TEXT NOT NULL CHECK (data_origin IN ('live', 'narrated')),
  is_warmup           INTEGER NOT NULL DEFAULT 0 CHECK (is_warmup IN (0, 1)),
  timestamp_server    INTEGER NOT NULL,
  notes               TEXT,
  UNIQUE (session_id, actual_sequence)
);


-- session_set: a observacao atomica de uma serie.
--
-- DECISAO CRITICA (D1): a tabela eh polimorfica por progression_type, e o
-- tipo eh DESNORMALIZADO aqui (snapshot do exercise.progression_type imutavel).
-- Isso permite o CHECK exaustivo abaixo ser self-contained — CHECK do SQLite
-- nao cruza tabela. Justificativa:
--
--   1. exercise.progression_type eh imutavel (trigger acima): a copia eh
--      snapshot de um fato congelado, nao duplicacao de estado mutavel.
--   2. session_set.progression_type tambem eh imutavel (trigger abaixo),
--      pelo mesmo motivo.
--   3. Filosoficamente, "que tipo de medida eu estava fazendo" eh parte
--      irredutivel da observacao da serie — nao eh interpretacao importada.
--
-- I-6 estrutural: a tabela NAO tem coluna contact_time. Para exercicios com
-- progression_type='contact_time', o ramo do CHECK abaixo eh sempre FALSE,
-- tornando impossivel inserir session_set para esse tipo. Os dados vao para
-- jump_test (a unica casa de contact_time instrumentado).
--
-- COLUNAS DE MEDIDA — convencoes:
--   - PRIMARIAS POLIMORFICAS (mutuamente exclusivas via CASE):
--     reps, load_kg, seconds, height_cm, intent_pct, difficulty_step,
--     assisted_load_kg, skill_achieved.
--
--   - quality (TEXT enum stable/tremor/joint_pain) tem PAPEL DUPLO,
--     deliberado, coerente com o brief — e justificado pela regua de 1.2.
--     UMA OBSERVACAO, UMA COLUNA; o PAPEL eh interpretacao da engine, nao
--     propriedade do dado. Voce sente `tremor` — esse eh o fato; se aquele
--     tremor conta como medida primaria (qualidade da aterrissagem, Tabela
--     4.1) ou como sinal de regressao (Secao 7.4) varia com quem le.
--       * Para progression_type='contact_quality', `quality` EH a medida
--         primaria — o CHECK exaustivo exige NOT NULL nesse ramo.
--       * Para os outros tipos, `quality` eh observacao secundaria opcional
--         (sinal de regressao por serie) — fica FORA do CASE, livre.
--     Duas colunas teriam congelado o papel no fato (erro 3 do brief em
--     miniatura) e aberto buraco de coerencia.
--
--   - rpe, notes: secundarios universais, sempre opcionais.
CREATE TABLE session_set (
  id                TEXT PRIMARY KEY,
  session_item_id   TEXT NOT NULL REFERENCES session_item(id),
  set_index         INTEGER NOT NULL CHECK (set_index > 0),

  -- desnormalizado, imutavel (ver trigger abaixo)
  progression_type  TEXT NOT NULL CHECK (progression_type IN (
                      'load_reps', 'isometric_intent', 'contact_quality',
                      'contact_time', 'jump_height', 'difficulty_tier',
                      'assisted_load', 'skill_acquisition',
                      'time_under_tension'
                    )),

  -- medidas primarias (polimorficas, exclusivas por tipo)
  reps              INTEGER CHECK (reps IS NULL OR reps > 0),
  load_kg           REAL    CHECK (load_kg IS NULL OR load_kg >= 0),
  assisted_load_kg  REAL    CHECK (assisted_load_kg IS NULL OR assisted_load_kg >= 0),
  seconds           REAL    CHECK (seconds IS NULL OR seconds > 0),
  height_cm         REAL    CHECK (height_cm IS NULL OR height_cm > 0),
  intent_pct        REAL    CHECK (intent_pct IS NULL
                                  OR (intent_pct >= 0 AND intent_pct <= 100)),
  difficulty_step   INTEGER CHECK (difficulty_step IS NULL OR difficulty_step > 0),
  skill_achieved    INTEGER CHECK (skill_achieved IS NULL
                                  OR skill_achieved IN (0, 1)),

  -- quality: papel duplo (ver comentario do cabecalho). Universal opcional;
  -- obrigatoria via CASE quando progression_type='contact_quality'.
  quality           TEXT    CHECK (quality IS NULL
                                  OR quality IN ('stable', 'tremor', 'joint_pain')),

  -- secundarias universais
  rpe               REAL    CHECK (rpe IS NULL OR (rpe >= 0 AND rpe <= 10)),
  notes             TEXT,

  timestamp_server  INTEGER NOT NULL,

  UNIQUE (session_item_id, set_index),

  -- CHECK EXAUSTIVO: para cada progression_type, listar EXATAMENTE quais
  -- colunas primarias devem ser NOT NULL e quais devem ser NULL. `quality`
  -- so aparece no ramo `contact_quality` (medida primaria desse ramo);
  -- nos outros ramos fica fora — eh secundaria opcional universal.
  -- `rpe` e `notes` sao secundarias universais e ficam sempre fora do CASE.
  CHECK (
    CASE progression_type

      WHEN 'load_reps' THEN
        reps IS NOT NULL AND load_kg IS NOT NULL
        AND seconds IS NULL AND height_cm IS NULL
        AND intent_pct IS NULL AND difficulty_step IS NULL
        AND assisted_load_kg IS NULL AND skill_achieved IS NULL

      WHEN 'isometric_intent' THEN
        intent_pct IS NOT NULL
        AND reps IS NULL AND load_kg IS NULL AND seconds IS NULL
        AND height_cm IS NULL AND difficulty_step IS NULL
        AND assisted_load_kg IS NULL AND skill_achieved IS NULL

      WHEN 'contact_quality' THEN
        quality IS NOT NULL
        AND reps IS NULL AND load_kg IS NULL AND seconds IS NULL
        AND height_cm IS NULL AND intent_pct IS NULL
        AND difficulty_step IS NULL AND assisted_load_kg IS NULL
        AND skill_achieved IS NULL

      -- I-6 estrutural: contact_time NUNCA tem session_set;
      -- os dados vao para jump_test.
      WHEN 'contact_time' THEN
        0  -- sempre falha

      WHEN 'jump_height' THEN
        height_cm IS NOT NULL
        AND reps IS NULL AND load_kg IS NULL AND seconds IS NULL
        AND intent_pct IS NULL AND difficulty_step IS NULL
        AND assisted_load_kg IS NULL AND skill_achieved IS NULL

      WHEN 'difficulty_tier' THEN
        difficulty_step IS NOT NULL
        AND reps IS NULL AND load_kg IS NULL AND seconds IS NULL
        AND height_cm IS NULL AND intent_pct IS NULL
        AND assisted_load_kg IS NULL AND skill_achieved IS NULL

      WHEN 'assisted_load' THEN
        assisted_load_kg IS NOT NULL AND reps IS NOT NULL
        AND load_kg IS NULL AND seconds IS NULL AND height_cm IS NULL
        AND intent_pct IS NULL AND difficulty_step IS NULL
        AND skill_achieved IS NULL

      WHEN 'skill_acquisition' THEN
        skill_achieved IS NOT NULL
        AND reps IS NULL AND load_kg IS NULL AND seconds IS NULL
        AND height_cm IS NULL AND intent_pct IS NULL
        AND difficulty_step IS NULL AND assisted_load_kg IS NULL

      WHEN 'time_under_tension' THEN
        seconds IS NOT NULL
        AND reps IS NULL AND load_kg IS NULL AND height_cm IS NULL
        AND intent_pct IS NULL AND difficulty_step IS NULL
        AND assisted_load_kg IS NULL AND skill_achieved IS NULL

    END
  )
);

-- I-10 derivado (D1): progression_type em session_set tambem imutavel.
CREATE TRIGGER session_set_progression_type_immutable
BEFORE UPDATE OF progression_type ON session_set
WHEN OLD.progression_type IS NOT NEW.progression_type
BEGIN
  SELECT RAISE(ABORT,
    'session_set.progression_type is immutable (derived from I-10).'
  );
END;


-- =============================================================================
-- TESTE DE SALTO (entidade propria — I-3, I-6)
-- =============================================================================

-- jump_test: observacao PURA. Colunas EXATAS do brief I-3:
--   height, time_to_takeoff, contact_time, jump_type, measurement_source,
--   timestamp.
--
-- DELIBERADAMENTE AUSENTES (I-3): rsi, rsi_mod. Sao DERIVADOS na leitura:
--   rsi_mod = height / time_to_takeoff (CMJ, SSC lento) — fatigue_sensor
--   rsi     = height / contact_time   (DJ, SSC rapido <250ms) — kpi_reactive
-- O role muda com bloco e regra; gravar como coluna seria gravar interpretacao.
--
-- session_id eh NULLABLE: voce pode testar de manha, fora de qualquer sessao.
CREATE TABLE jump_test (
  id                  TEXT PRIMARY KEY,
  session_id          TEXT REFERENCES session(id),
  jump_type           TEXT NOT NULL CHECK (jump_type IN (
                        'CMJ', 'SJ', 'DJ', 'approach', 'bounce'
                      )),
  height_cm           REAL NOT NULL CHECK (height_cm > 0),
  time_to_takeoff_ms  REAL CHECK (time_to_takeoff_ms IS NULL
                                  OR time_to_takeoff_ms > 0),
  contact_time_ms     REAL CHECK (contact_time_ms IS NULL
                                  OR contact_time_ms > 0),
  measurement_source  TEXT NOT NULL CHECK (measurement_source IN (
                        'instrumented', 'subjective'
                      )),
  performed_at        INTEGER NOT NULL,
  timestamp_server    INTEGER NOT NULL,
  notes               TEXT
);

-- I-10: measurement_source imutavel.
CREATE TRIGGER jump_test_measurement_source_immutable
BEFORE UPDATE OF measurement_source ON jump_test
WHEN OLD.measurement_source IS NOT NEW.measurement_source
BEGIN
  SELECT RAISE(ABORT,
    'jump_test.measurement_source is immutable (I-10).'
  );
END;


-- =============================================================================
-- CARGA INTERNA (Foster — Secao 5)
-- =============================================================================

-- session_load: 1 por sessao (UNIQUE). recall_late eh derivado no momento do
-- INSERT pela camada TS, comparando recorded_at - session.ended_at contra
-- RECALL_LATE_THRESHOLD_MIN (constants.ts).
-- (Generated column nao serve aqui — SQLite GENERATED nao referencia outras
-- tabelas. Por isso a derivacao mora no insert path; teste I-5 valida.)
CREATE TABLE session_load (
  id                TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL UNIQUE REFERENCES session(id),
  srpe              REAL NOT NULL CHECK (srpe >= 0 AND srpe <= 10),
  duration_min      REAL NOT NULL CHECK (duration_min > 0),
  recorded_at       INTEGER NOT NULL,
  recall_late       INTEGER NOT NULL DEFAULT 0 CHECK (recall_late IN (0, 1)),
  timestamp_server  INTEGER NOT NULL
);


-- =============================================================================
-- OBSERVACOES INDEPENDENTES DE SESSAO
-- =============================================================================

-- body_weight_log: necessario para o pivo de enfase (Secao 8.4) e para
-- razao agachamento / peso corporal. measurement_source imutavel (I-10).
CREATE TABLE body_weight_log (
  id                  TEXT PRIMARY KEY,
  weight_kg           REAL NOT NULL CHECK (weight_kg > 0),
  measured_at         INTEGER NOT NULL,
  measurement_source  TEXT NOT NULL CHECK (measurement_source IN (
                        'instrumented', 'subjective'
                      )),
  timestamp_server    INTEGER NOT NULL,
  notes               TEXT
);

CREATE TRIGGER body_weight_log_measurement_source_immutable
BEFORE UPDATE OF measurement_source ON body_weight_log
WHEN OLD.measurement_source IS NOT NEW.measurement_source
BEGIN
  SELECT RAISE(ABORT,
    'body_weight_log.measurement_source is immutable (I-10).'
  );
END;


-- pain_log: gate de seguranca (Secao 8.5). score 0-10. `location` eh string
-- livre (free text — 'knee', 'lower_back', etc.). DIVIDA NOMEADA da engine de
-- gates: o gate de dor patelar vai precisar resolver 'knee' / 'joelho' /
-- 'patela' para uma localizacao canonica (analogo ao function_tag). Registro
-- esta divida no DECISIONS.md; nao eh problema do schema.
CREATE TABLE pain_log (
  id                TEXT PRIMARY KEY,
  location          TEXT NOT NULL,
  score             INTEGER NOT NULL CHECK (score >= 0 AND score <= 10),
  measured_at       INTEGER NOT NULL,
  timestamp_server  INTEGER NOT NULL,
  notes             TEXT
);


-- =============================================================================
-- INDEXES (acelerar queries frequentes da engine)
-- =============================================================================

CREATE INDEX idx_session_started_at      ON session(started_at);
CREATE INDEX idx_session_item_session    ON session_item(session_id);
CREATE INDEX idx_session_item_exercise   ON session_item(exercise_id);
CREATE INDEX idx_session_set_item        ON session_set(session_item_id);
CREATE INDEX idx_jump_test_performed_at  ON jump_test(performed_at);
CREATE INDEX idx_jump_test_jump_type     ON jump_test(jump_type);
CREATE INDEX idx_exercise_function_tag   ON exercise(function_tag);
CREATE INDEX idx_plan_phase_plan         ON plan_phase(plan_id);
CREATE INDEX idx_work_block_plan         ON work_block(plan_id);
CREATE INDEX idx_work_block_routine      ON work_block(routine_id);
CREATE INDEX idx_body_weight_measured_at ON body_weight_log(measured_at);
CREATE INDEX idx_pain_log_measured_at    ON pain_log(measured_at);


-- =============================================================================
-- REGISTRA VERSAO
-- =============================================================================

-- O runner de migrations (Passo 4) executa este arquivo dentro de transacao;
-- esta linha sera o ultimo statement antes do COMMIT.
INSERT INTO schema_version (version, applied_at)
VALUES (1, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER));
