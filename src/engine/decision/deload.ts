// =============================================================================
// Deload — ramo objetivo (I-4) + baseline reativo por carga (Divida 2, §7.3 L3).
//   - I-4: ramo objetivo opera SO sobre instrumentado.
//   - I-5: entradas recall_late=true sao EXCLUIDAS do gatilho reativo.
//   - I-14 (+B2): sessoes de deload E de taper sao EXCLUIDAS do baseline
//     reativo — a carga baixa nelas e PLANO, nao fadiga.
//
// I-9 (NOT consulted): este modulo NAO le, importa ou computa razao
// aguda:cronica. A decisao de deload e tomada sobre carga absoluta e sinais
// objetivos, nunca sobre o ratio. O teste I-9 grepa este diretorio e exige
// zero ocorrencias.
// =============================================================================

import {
  BASELINE_MIN_SESSIONS,
  BASELINE_WINDOW_SESSIONS,
  CONSECUTIVE_LOAD_DROP_DAYS_FOR_DELOAD,
  LOAD_DROP_THRESHOLD_PCT,
  LOAD_SANITY_CAP,
  MAX_SESSION_GAP_DAYS,
  OBJECTIVE_DELOAD_JUMP_DROP_PCT,
} from "../../domain/constants.ts";
import type { PhaseEmphasis, PhaseInfo } from "./phase.ts";

export interface InstrumentedJumpEntry {
  readonly day: number;
  readonly heightCm: number;
}

export interface SubjectiveSignal {
  readonly day: number;
  readonly sorenessEnergy: number;
}

export interface LoadEntry {
  readonly day: number; // dia da sessao — ordena e mede gaps de calendario
  readonly week: number; // semana do plano (1..N) — mapeia a fase
  readonly load: number; // carga-de-sessao observada (Foster AU)
  readonly recallLate: boolean; // I-5: sRPE tardio -> excluido
}

/**
 * Ramo OBJETIVO do deload (I-4). Opera APENAS sobre dados instrumentados.
 * Sinais subjetivos sao ignorados deliberadamente (eles vivem no proprio
 * ramo subjetivo, nao neste).
 */
export function shouldSuggestObjectiveDeload(input: {
  instrumentedJumps?: ReadonlyArray<InstrumentedJumpEntry>;
  subjectiveSignals?: ReadonlyArray<SubjectiveSignal>; // ACEITO MAS IGNORADO
}): boolean {
  const jumps = input.instrumentedJumps ?? [];
  if (jumps.length < 2) return false;

  const half = Math.floor(jumps.length / 2);
  const baseline =
    jumps.slice(0, half).reduce((s, j) => s + j.heightCm, 0) / half;
  const recent =
    jumps.slice(half).reduce((s, j) => s + j.heightCm, 0) /
    (jumps.length - half);

  const drop = (baseline - recent) / baseline;
  return drop >= OBJECTIVE_DELOAD_JUMP_DROP_PCT;
}

interface EligibleSession {
  readonly day: number;
  readonly load: number;
  readonly emphasis: PhaseEmphasis;
}

function phaseForWeek(
  week: number,
  phases: ReadonlyArray<PhaseInfo>,
): PhaseInfo | undefined {
  return phases.find((p) => week >= p.weekStart && week <= p.weekEnd);
}

function median(values: ReadonlyArray<number>): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Sugestao de deload REATIVO por queda de carga (conserto da Divida 2, §7.3 L3).
 *
 * Baseline = MEDIANA de uma janela recente (`BASELINE_WINDOW_SESSIONS`) das
 * sessoes da MESMA enfase da sessao mais recente — nunca `max` global (red team
 * B1). Dispara quando as `CONSECUTIVE_LOAD_DROP_DAYS_FOR_DELOAD` sessoes FINAIS
 * dessa enfase ficam todas <= baseline*(1-`LOAD_DROP_THRESHOLD_PCT`) E sao
 * consecutivas no calendario (gap real > `MAX_SESSION_GAP_DAYS` quebra — S1).
 *
 * Exclui recall_late (I-5), deload e taper (I-14 + B2), e cargas absurdas
 * (`LOAD_SANITY_CAP`). Nao consulta razao aguda:cronica (I-9). Contamos a
 * sequencia FINAL (nao qualquer par no historico), entao um vale que ja
 * recuperou nao dispara.
 *
 * LIMITACOES CONHECIDAS (dono ciente — §7.7 / red team adversarial):
 *  - (C) O detector e POR ENFASE: nas primeiras sessoes de um bloco novo a
 *    coorte fica pequena demais e ele nao dispara, mesmo com fadiga vinda do
 *    bloco anterior. No plano real isso e coberto pelo DELOAD AGENDADO em toda
 *    virada (semanas 6/10/18) e pelo ramo objetivo (altura de salto), que nao
 *    reseta por fase.
 *  - (D) Em rampa de progressao agressiva a mediana ancora no meio da rampa e o
 *    gatilho fica sub-sensivel a um crash a partir do pico recente. Risco de
 *    CALIBRACAO (dono valida as constantes), nao bug logico.
 */
export function shouldSuggestDeload(
  entries: ReadonlyArray<LoadEntry>,
  phases: ReadonlyArray<PhaseInfo>,
): boolean {
  const eligible: EligibleSession[] = [];
  for (const e of entries) {
    if (e.recallLate) continue; // I-5
    if (e.load <= 0 || e.load > LOAD_SANITY_CAP) continue; // sanidade
    const phase = phaseForWeek(e.week, phases);
    if (phase === undefined) continue;
    if (phase.isDeload || phase.isTaper) continue; // I-14 + B2
    eligible.push({ day: e.day, load: e.load, emphasis: phase.emphasis });
  }
  eligible.sort((a, b) => a.day - b.day);

  const latest = eligible[eligible.length - 1];
  if (latest === undefined) return false;

  const cohort = eligible.filter((e) => e.emphasis === latest.emphasis);
  const streakLen = CONSECUTIVE_LOAD_DROP_DAYS_FOR_DELOAD;
  // Precisa da sequencia recente + uma referencia ROBUSTA (nao 1-2 pontos: um
  // dia duro real envenenaria um baseline de ponto unico — red team B).
  if (cohort.length < streakLen + BASELINE_MIN_SESSIONS) return false;

  const recent = cohort.slice(cohort.length - streakLen);
  const referencePool = cohort.slice(0, cohort.length - streakLen);
  const reference = referencePool.slice(
    Math.max(0, referencePool.length - BASELINE_WINDOW_SESSIONS),
  );

  const baseline = median(reference.map((e) => e.load));
  if (baseline <= 0) return false;
  const threshold = baseline * (1 - LOAD_DROP_THRESHOLD_PCT);

  // Todas as sessoes recentes precisam ficar <= threshold...
  if (!recent.every((e) => e.load <= threshold)) return false;

  // ...e a queda precisa ser CONTIGUA no calendario: um gap real
  // (>MAX_SESSION_GAP_DAYS) quebra, seja DENTRO da dupla recente (red team S1)
  // ou ENTRE a referencia e a primeira recente — volta de pausa nao-agendada
  // (red team adversarial A). Prende a ultima sessao de referencia na cadeia.
  const streak = [...referencePool.slice(referencePool.length - 1), ...recent];
  for (let i = 1; i < streak.length; i++) {
    const prev = streak[i - 1];
    const cur = streak[i];
    if (prev === undefined || cur === undefined) return false;
    if (cur.day - prev.day > MAX_SESSION_GAP_DAYS) return false;
  }
  return true;
}
