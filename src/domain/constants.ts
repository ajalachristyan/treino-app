// ============================================================================
// Constantes nomeadas e configuráveis. Toda decisão numérica do domínio mora
// aqui — nunca número solto no código. Cada uma é revisável; os testes de
// invariante validam o COMPORTAMENTO derivado, não o valor.
// ============================================================================

/**
 * Janela em minutos após o fim da sessão. sRPE inserido depois dela vira
 * recall_late=true (I-5). Brief: "~15-30 min pós-sessão"; fixado em 30.
 */
export const RECALL_LATE_THRESHOLD_MIN = 30;

/**
 * Piso de desvio-padrão na monotony para evitar divisão por ~zero (I-8).
 * Carga diária típica fica em centenas de UA, então 1.0 é ruído desprezível
 * quando há variação real.
 */
export const MONOTONY_SD_FLOOR = 1.0;

/**
 * Dor patelar (escala 0-10) acima deste limiar bloqueia/avisa depth jump.
 * Gate de segurança da Seção 8.5.
 */
export const KNEE_PAIN_DEPTH_JUMP_GATE_MAX = 2;

/**
 * Hold estático maior que este valor (segundos) imediatamente antes de sessão
 * de potência dispara o gate I-13. Refinamento acordado: gate AVISA, não
 * bloqueia (Seção 6.3 é anti-culpa). Fonte: Behm/Warneke 2024.
 */
export const ACUTE_INTERFERENCE_HOLD_SECONDS = 60;

/** Backup versionado (10.5): snapshots recentes mantidos integralmente. */
export const BACKUP_KEEP_RECENT = 30;

/** Backup versionado: idade em dias a partir da qual entra rotação fina. */
export const BACKUP_AGE_DAYS_BEFORE_THIN = 90;

/** Backup versionado: após a idade acima, mantém este número por semana. */
export const BACKUP_THINNED_KEEP_PER_WEEK = 1;

// ============================================================================
// TODO — constantes de engine ainda nao calibradas empiricamente.
// Os testes de invariante usam entradas GROSSEIRAS (50% drop, etc.) bem alem
// destes thresholds, validando COMPORTAMENTO de discriminacao, nao o numero.
// Os valores aqui sao placeholders sensatos; revisar quando dados reais
// chegarem. NUNCA validar testes contra estes numeros diretamente.
// ============================================================================

/** TODO: revisar com dados reais. Queda de jump_height (vs baseline) que sugere deload objetivo. */
export const OBJECTIVE_DELOAD_JUMP_DROP_PCT = 0.10;

/** TODO: revisar. Numero de dias consecutivos de queda de carga para sugerir deload (Secao 8.3). */
export const CONSECUTIVE_LOAD_DROP_DAYS_FOR_DELOAD = 2;

/** TODO: revisar. Queda relativa de carga diaria considerada "queda" no gatilho de deload. */
export const LOAD_DROP_THRESHOLD_PCT = 0.30;

/** TODO: revisar. Queda relativa em tendencia que classifica "regressao" (fora de deload). */
export const TREND_REGRESSION_THRESHOLD_PCT = 0.15;

/**
 * Deload AGENDADO (semanas 6/10/18). O plano manda corte FORTE: ~50% de volume
 * E de carga, trocando o estimulo por tecnica leve (sem pliometria/explosivo) —
 * e recuperacao de SNC, nao um alivio pequeno.
 * Fonte: plano-vertical-grade-operacional.md:13 ("corta ~50% de volume e carga;
 * ginastica tecnica"). Ainda "dono valida" (DECISIONS, Divida 2), mas agora
 * derivado do doc, nao chutado.
 */
export const DELOAD_LOAD_FACTOR = 0.5; // ~50% da carga normal
export const DELOAD_VOLUME_FACTOR = 0.5; // ~50% do volume normal

/**
 * Taper (semanas 16-17, pico). Diferente do deload: MANTEM a carga/intensidade
 * e corta ~60% do VOLUME de pesos, pra pico de excitabilidade do SNC.
 * Fonte: plano-vertical-grade-operacional.md:70 ("corta ~60% do volume de pesos").
 */
export const TAPER_VOLUME_FACTOR = 0.4; // mantem ~40% do volume = corta ~60%

// ----------------------------------------------------------------------------
// Baseline reativo do deload (conserto da Divida 2 — plano do motor §7.3 L3).
// O gatilho NAO usa max global (envenenado por 1 outlier / leitura errada da
// fase — red team B1): usa a MEDIANA de uma janela recente POR ENFASE.
// ----------------------------------------------------------------------------

/**
 * Tamanho da JANELA RECENTE (em sessoes da mesma enfase) de onde sai a mediana
 * de referencia do baseline. Recente = reflete a fase atual; limitada = robusta
 * a historico antigo. Placeholder sensato (~3 semanas de forca 2x/sem); dono
 * valida com dados reais. Fonte: plano do motor §7.3 L3.
 */
export const BASELINE_WINDOW_SESSIONS = 6;

/**
 * Minimo de sessoes de REFERENCIA (por enfase, fora a sequencia recente) para
 * o baseline ser confiavel. Abaixo disto a mediana viraria 1-2 pontos e um dia
 * duro real (nao typo) envenenaria o baseline (red team adversarial B). Placeholder;
 * dono valida. Fonte: plano do motor §7.3 L3 / red team.
 */
export const BASELINE_MIN_SESSIONS = 3;

/**
 * Gap de calendario (dias) entre duas sessoes acima do qual a sequencia de
 * quedas QUEBRA — contar por semana de calendario real, nao por adjacencia de
 * array (red team S1). Forca e ~2x/sem (gap tipico 3-4 dias); >14 dias e uma
 * interrupcao (pausa/volta), nao "quedas consecutivas". Placeholder; dono
 * valida. Fonte: plano do motor §7.3 L3 / red team S1.
 */
export const MAX_SESSION_GAP_DAYS = 14;

/**
 * Teto de sanidade da carga-de-sessao (Foster AU = sRPE x duracao) na INGESTAO
 * do baseline. Cargas acima disto sao erro de digitacao (duration_min nao tem
 * teto no schema) e sao IGNORADAS — cinto+suspensorio, ja que a mediana tambem
 * protege (red team: guarda de sanidade). ~3000 AU fica bem acima de qualquer
 * sessao real (sRPE 10 x 300 min). Placeholder; dono valida. Fonte: §7.3 L3.
 */
export const LOAD_SANITY_CAP = 3000;
