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
