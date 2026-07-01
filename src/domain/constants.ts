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
 * Trava de progressao: fracao MINIMA das series prescritas que precisa ser
 * cumprida (todas no topo da faixa) para a carga progredir (+incremento). "A
 * maioria (~2/3)" — tolera perder 1 serie, mas sessao pela metade NAO ganha
 * carga (decisao do dono 2026-07-01: pular caminho nao conta como progressao).
 * So aplica quando ha `planned_sets` conhecido; senao degrada pro criterio
 * classico (todas as series feitas no topo). Placeholder; dono valida.
 */
export const PROGRESSION_MIN_SETS_FRACTION = 2 / 3;

// ----------------------------------------------------------------------------
// Camada de aderencia + prontidao (spec docs/superpowers/specs/2026-07-01).
// Avisos advisory (anti-culpa §6.3): sugerem, nunca punem nem bloqueiam o log.
// ----------------------------------------------------------------------------

/**
 * Aderencia da fase abaixo desta fracao dispara aviso suave ("voce esta atras").
 * Tambem serve de piso de BASE para liberar a fase de risco (Mes 3 / depth
 * jumps): base primary abaixo disto => aviso firme antes do trabalho perigoso.
 * Placeholder ~0.6; dono valida. Fonte: spec camada de aderencia 2026-07-01.
 */
export const PHASE_ADHERENCE_WARN_PCT = 0.6;

/**
 * Numero de vezes SEGUIDAS que um exercicio PRIMARY (back squat, saltos) pode
 * ser largado antes de o app avisar/sugerir. Largar accessory/finisher nao
 * conta (graus de importancia). Placeholder; dono valida. Fonte: spec 2026-07-01.
 */
export const KEY_EXERCISE_NEGLECT_STREAK = 3;

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

// ----------------------------------------------------------------------------
// Molde de prescricao por fase (prescription.ts — plano do motor §7.3 L6).
// Overlay de LEITURA na forca primaria; o dono digita o kg (sem e1RM). Numeros
// ⚑ = ciencia/decisao do dono, validados pelo COMPORTAMENTO nos testes (nunca
// pelo valor cru).
// ----------------------------------------------------------------------------

/**
 * M1 (Estrutura, sem 1-5) — faixa de reps da fase para a FORCA PRIMARIA (back
 * squat, zercher). Minimo 5 e do DONO (plano-vertical), NAO os 6 do Rivera;
 * topo 8 = Rivera "6-8". Dupla progressao: sobe carga ao bater o topo na maioria
 * das series (ver PROGRESSION_MIN_SETS_FRACTION).
 * Fonte: plano-vertical-grade-operacional.md:58 ("Back squat pesado, faixas 5-8,
 * dupla progressao") + pesquisa-rivera-transcricoes.md:54-55 ("three to four sets
 * of six to eight reps, week one eight week two seven week three six"). Ciencia — dono valida.
 */
export const M1_REP_RANGE: { readonly min: number; readonly max: number } = {
  min: 5,
  max: 8,
};

/**
 * M2 (Potencia/RFD, sem 7-9) — faixa PESADA da fase para a forca primaria (onda
 * 6->5->4). Decisao do DONO em 2026-07-01 (handoff §2) SOBREPOE o "VBT 3x3 leve
 * @60-70%" escrito em plano-vertical-grade-operacional.md:63: o dono trocou pelo
 * Rivera pesado. SEM % (o dono digita o kg; nao ha e1RM).
 * Fonte: pesquisa-rivera-transcricoes.md:58-59 ("four to six reps, week one six
 * week two five week three four"). Ciencia + decisao do dono — dono valida.
 */
export const M2_REP_RANGE: { readonly min: number; readonly max: number } = {
  min: 4,
  max: 6,
};

/**
 * M3 (Peaking, sem 11-15) — PAP (potenciacao pos-ativacao) na forca primaria:
 * 2 series x 2 reps, dica @~85% (so lembrete de tela; NAO ha e1RM — o dono
 * digita o kg). Esquema do DONO, nao os triplos pesados do Rivera (o dono so
 * trocou o M2). Fixo: nao entra na dupla progressao.
 * Fonte: plano-vertical-grade-operacional.md:68 ("PAP: agachamento 2x2 @ ~85%").
 * Dono valida.
 */
export const M3_PAP_SETS = 2;
export const M3_PAP_REPS = 2;

/**
 * Dica de intensidade do PAP (M3). So exibicao — nunca vira carga por e1RM.
 * Fonte: plano-vertical-grade-operacional.md:68 ("@ ~85%"). Ciencia — dono valida.
 */
export const M3_PAP_INTENSITY_PCT = 0.85;

/**
 * Incremento de carga quando a dupla progressao dispara (bateu o topo da faixa
 * na maioria das series). Menor salto do "+2,5-5 kg" do plano — conservador.
 * Fonte: plano-vertical-grade-operacional.md:11 ("+2,5-5 kg na proxima"). Dono valida.
 */
export const LOAD_INCREMENT_KG = 2.5;

/**
 * function_tags que marcam a FORCA PRIMARIA que recebe o molde por fase
 * (M1/M2/M3). No seed: back squat (forca_maxima_agachamento, Ter/FORCA) e
 * zercher leve (forca_geral_zercher, Sab). O bucket e por TAG, nao por priority
 * — ex.: drop landing e priority=primary mas e plio, e NAO entra aqui.
 * Fonte: migrations/002_seed_plan.sql:33,68 + handoff §2. Dono valida.
 */
export const PRIMARY_STRENGTH_FUNCTION_TAGS: readonly string[] = [
  "forca_maxima_agachamento",
  "forca_geral_zercher",
];
