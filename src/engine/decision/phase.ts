// =============================================================================
// L1 — Classificador de fase (seam compartilhado §7.2 do plano do motor).
//
// Puro: sem DB, sem IO. E a fonte unica de "que fase e esta semana", consumida
// por (1) a prescricao, (2) o redutor de recuperacao e (3) o conserto do
// baseline reativo (deload.ts) — todos precisam saber a ENFASE de cada sessao.
//
// I-9 (NOT consulted): este modulo NAO le, importa ou computa razao
// aguda:cronica. O grep do I-9 (src/invariants/I-09.test.ts) varre esta pasta.
// =============================================================================

/** Os tres blocos reais de treino do plano-vertical (Mes 1 / 2 / 3). */
export type PhaseEmphasis = "m1" | "m2" | "m3";

/** Classificacao de uma fase: um bloco real, ou uma semana de recuperacao. */
export type PhaseKind = PhaseEmphasis | "deload" | "taper";

/**
 * Subconjunto estrutural de plan_phase (ver plan.ts:PhaseRow) que basta para
 * classificar. O PhaseRow do banco e atribuivel a isto (tipagem estrutural).
 */
export interface ClassifiablePhase {
  readonly name: string;
  readonly week_start: number;
  readonly week_end: number;
  readonly is_deload: number; // 0/1
  readonly is_taper: number; // 0/1
}

export interface PhaseContext {
  /** Classificacao crua da fase que contem a semana. */
  readonly emphasis: PhaseKind;
  /** Bloco de treino que a fase serve — deload/taper caem no Mes anterior. */
  readonly parentEmphasis: PhaseEmphasis;
}

/**
 * Janela de uma fase ja resolvida para os motores reativos: intervalo de
 * semanas + flags de recuperacao + a enfase do BLOCO (m1/m2/m3). Deload/taper
 * carregam a enfase do bloco que servem (parentEmphasis), mas suas sessoes sao
 * EXCLUIDAS dos calculos — a enfase deles so posiciona a janela.
 *
 * `computeTrend` (trend.ts) e o baseline reativo (deload.ts) consomem
 * `PhaseInfo[]` e resolvem a fase de cada semana/sessao internamente — mesmo
 * padrao de plumbing, contando por semana de calendario (red team S1), nao por
 * adjacencia de array.
 */
export interface PhaseInfo {
  readonly weekStart: number;
  readonly weekEnd: number;
  readonly isDeload: boolean;
  readonly isTaper: boolean;
  readonly emphasis: PhaseEmphasis;
}

/**
 * Classifica uma fase. A FLAG vence o NOME: uma semana marcada is_deload/
 * is_taper e recuperacao, ainda que o nome diga "Mes 1". Sem flag, deriva do
 * nome ("Mes 1/2/3"). Nome irreconhecivel sem flag => erro alto, de proposito:
 * surface drift do seed. O wiring degrada para pass-through e NUNCA bloqueia o
 * log de uma sessao (I-12); a dureza aqui e do nucleo puro, nao da tela.
 */
export function classifyPhase(phase: ClassifiablePhase): PhaseKind {
  if (phase.is_deload) return "deload";
  if (phase.is_taper) return "taper";
  const emphasis = emphasisFromName(phase.name);
  if (emphasis === undefined) {
    throw new Error(
      `classifyPhase: fase sem flag e com nome irreconhecivel: "${phase.name}"`,
    );
  }
  return emphasis;
}

function emphasisFromName(name: string): PhaseEmphasis | undefined {
  const match = name.match(/m[eê]s\s*([123])/i);
  if (!match) return undefined;
  switch (match[1]) {
    case "1":
      return "m1";
    case "2":
      return "m2";
    case "3":
      return "m3";
    default:
      return undefined;
  }
}

/**
 * Contexto de fase da semana `week`: a classificacao crua (`emphasis`) e o
 * bloco de treino que ela serve (`parentEmphasis`). Deload/taper herdam a
 * enfase da ultima fase REAL (m1/m2/m3) que os precede por semana — e assim
 * que o plano decide O QUE prescrever numa semana de recuperacao (§7.1).
 * Retorna undefined se `week` cai fora de todas as fases do plano.
 */
export function phaseContext(
  phases: readonly ClassifiablePhase[],
  week: number,
): PhaseContext | undefined {
  const current = phases.find((p) => week >= p.week_start && week <= p.week_end);
  if (current === undefined) return undefined;

  const emphasis = classifyPhase(current);
  if (emphasis === "m1" || emphasis === "m2" || emphasis === "m3") {
    return { emphasis, parentEmphasis: emphasis };
  }

  const parentEmphasis = precedingRealEmphasis(phases, current.week_start);
  if (parentEmphasis === undefined) {
    throw new Error(
      `phaseContext: semana de recuperacao (${week}) sem bloco real anterior`,
    );
  }
  return { emphasis, parentEmphasis };
}

/** Enfase (m1/m2/m3) da fase REAL mais recente antes de `weekStart`. */
function precedingRealEmphasis(
  phases: readonly ClassifiablePhase[],
  weekStart: number,
): PhaseEmphasis | undefined {
  const earlier = phases
    .filter((p) => p.week_end < weekStart)
    .sort((a, b) => b.week_end - a.week_end);
  for (const phase of earlier) {
    const kind = classifyPhase(phase);
    if (kind === "m1" || kind === "m2" || kind === "m3") return kind;
  }
  return undefined;
}
