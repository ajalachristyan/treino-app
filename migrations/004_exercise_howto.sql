-- =============================================================================
-- 004_exercise_howto — CONSULTA DO "MODO DE FAZER" (Bloco 1).
--
-- Aditiva: 3 colunas em exercise. Nao toca invariantes, engine nem os triggers
-- (o de exercise so trava progression_type — UPDATE destas colunas e seguro).
-- Linhas existentes ficam NULL ate o seed 005 popular.
--
--   how_to    : texto leigo offline — tecnica + protocolo (PNF: contrai Xs /
--               relaxa / aprofunda / ciclos / RPE / hold). E a fonte PRIMARIA de
--               "como executar"; funciona sem internet.
--   video_url : link opcional (YouTube etc.). Offline-safe: o texto basta; o
--               video e complemento. NULL quando nao houver.
--   category  : rotulo LEIGO so para agrupar a aba "Exercicios" (forca / salto /
--               ginastica / flexibilidade / mobilidade). FREE-TEXT (sem CHECK,
--               p/ nao acoplar a check-vs-ts-enum-parity). A ENGINE NUNCA
--               ramifica nesta coluna — seria interpretacao dirigindo logica
--               (principio 1.2 do brief). E rotulo de navegacao, nada mais.
-- =============================================================================

ALTER TABLE exercise ADD COLUMN how_to TEXT;
ALTER TABLE exercise ADD COLUMN video_url TEXT;
ALTER TABLE exercise ADD COLUMN category TEXT;

-- Bumpa o schema para 4 (mesmo relogio de runtime das migrations anteriores).
INSERT INTO schema_version (version, applied_at)
VALUES (4, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER));
