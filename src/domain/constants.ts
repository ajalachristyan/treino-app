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
 * TODO: revisar (dono valida). Fracao da carga NORMAL a sugerir numa semana de
 * deload AGENDADO (0.85 = ~15% mais leve). So DELOAD reduz carga; o TAPER mantem
 * a intensidade (reduz volume, nao carga) — por isso a sugestao de carga nao se
 * aplica a taper.
 */
export const DELOAD_LOAD_FACTOR = 0.85;

/** TODO: revisar (dono valida). Quantas series a menos sugerir numa semana de deload/taper (reduz volume). */
export const DELOAD_SETS_DROP = 1;
