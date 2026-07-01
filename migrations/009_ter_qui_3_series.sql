-- =============================================================================
-- 009_ter_qui_3_series — alvo de 3 series nos dias de FORCA (pedido do dono:
-- "4 series e muito, 3 e mais realista"). So UPDATE de planned_sets nos itens
-- de trabalho (nao-aquecimento, ativos) da terca (wb_ter_forca) e quinta
-- (wb_qui_superior). Antes era NULL (o app nao mostrava alvo de series); agora
-- mostra "3 series". Nao toca aquecimento (tem esquema proprio) nem os blocos de
-- salto/mobilidade/core (naturezas diferentes: reps/tempo/qualidade).
--
-- planned_sets nao e imutavel; nenhum trigger dispara. Nao toca plano estrutural
-- (exercicios/ordem) nem sessao — so o alvo de series.
-- =============================================================================

UPDATE work_block_item SET planned_sets = 3
WHERE work_block_id IN ('wb_ter_forca', 'wb_qui_superior')
  AND is_warmup = 0
  AND active = 1;

-- Bumpa o schema para 9 (mesmo relogio de runtime das migrations anteriores).
INSERT INTO schema_version (version, applied_at)
VALUES (9, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER));
