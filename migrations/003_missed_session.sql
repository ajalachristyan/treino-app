-- =============================================================================
-- 003_missed_session — REGISTRAR FALTAS (P2.5).
--
-- Tabela ADITIVA: nao toca os 13 schemas existentes, nem os invariantes, nem a
-- engine. Um FATO imutavel — "neste dia eu marquei que NAO treinei". Distinto da
-- sessao LAZY (item planejado intocado evapora com registro zero, anti-culpa
-- 6.3): a falta e um registro DELIBERADO do dono, pro historico/estatistica nao
-- mentir ("registrar faltas, sem prejuizo").
--
-- Sem trigger anti-UPDATE (YAGNI): o repositorio (src/data/absences.ts) so expoe
-- insert/get/delete — nao ha caminho de UPDATE. O delete existe so para desfazer
-- um toque errado. O backup (dump SQL generico em dump.ts) ja inclui esta tabela
-- automaticamente -> a falta vai junto no .sql, sem codigo novo.
--
-- work_block_id: FK opcional para o bloco planejado daquele dia (NULL = dia sem
-- bloco / falta avulsa). foreign_keys e ON no adapter -> id inexistente e barrado.
-- missed_date: epoch ms na meia-noite LOCAL do dia faltado (mesma ancora de
-- planConfig.localMidnight) -> getMissesForDate casa por igualdade exata.
-- =============================================================================

CREATE TABLE missed_session (
  id            TEXT PRIMARY KEY,
  missed_date   INTEGER NOT NULL,                         -- epoch ms, meia-noite local do dia faltado
  work_block_id TEXT REFERENCES work_block(id),           -- bloco planejado (opcional)
  reason        TEXT,                                     -- motivo curto (opcional)
  created_at    INTEGER NOT NULL                          -- epoch ms (quando foi registrado)
);

CREATE INDEX idx_missed_session_date ON missed_session(missed_date);

-- Uma falta de DIA (work_block_id NULL) e UNICA por data. O app assume "<=1 falta
-- avulsa/dia" (TodayScreen mostra/desfaz misses[0]); sem isto um restore/sync
-- (arquivo-LWW, I-11) poderia inserir uma 2a falta do mesmo dia e a UI esconderia
-- a duplicata. Indice PARCIAL: faltas de BLOCO (work_block_id NOT NULL) podem
-- coexistir no mesmo dia, entao a unicidade so vale para a falta avulsa.
CREATE UNIQUE INDEX idx_missed_session_day_unique
  ON missed_session(missed_date) WHERE work_block_id IS NULL;

-- Bumpa o schema para 3 (mesmo relogio de runtime das migrations anteriores).
INSERT INTO schema_version (version, applied_at)
VALUES (3, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER));
