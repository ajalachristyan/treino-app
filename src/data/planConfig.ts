// =============================================================================
// Configuracao do PLANO — a ancora temporal EDITAVEL (P2.5).
//
// `plan.start_date` (epoch ms) e a ancora de "que semana e agora" (derivada na
// leitura por currentWeek, em plan.ts — que NAO muda aqui). Este modulo deixa o
// dono MOVER essa ancora: definir o dia que comecou, dizer "estou na semana N",
// ou "repetir esta semana" (o empurrao do modelo Calendario-com-empurrao). Isso
// mata a rigidez do RepCount sem perder a periodizacao (deload/taper/pico
// deslizam junto, nada e pulado).
//
// POR QUE AQUI E NAO EM sessions.ts: o repositorio da sessao tem trava estatica
// I-12 (sessions.test.ts le o source e proibe escrita em plan/catalogo). Mover a
// ancora e um ato DELIBERADO e separado — vive neste modulo proprio, fora do
// alcance daquele guard, que e exatamente onde o projeto quer escrita no plano.
// Nenhum gatilho protege `plan` (os 4 triggers sao so em exercise/session_set/
// jump_test/body_weight_log), entao UPDATE e seguro.
//
// PRINCIPIO-MAE intacto: o instante e fato; "que semana" e interpretacao. Aqui so
// mexemos no rotulo DERIVADO — nunca tocamos um treino ja logado (session/_set).
// =============================================================================

import type { Database } from "../db/adapter.ts";
import { currentWeek, getPlan, type PlanRow } from "./plan.ts";

const WEEK_MS = 7 * 86400000;

// Valor que o seed (002_seed_plan.sql) grava em plan.start_date enquanto o dono
// nao fixou a data real. Igualdade exata = "ainda nao definido". O dono ancora na
// meia-noite LOCAL de Porto Alegre (UTC-3), que nunca casa com este instante UTC
// -> sem colisao pratica. Constante unica; planConfig.test.ts guarda a paridade
// com o seed (se um divergir do outro, o teste falha).
export const SEED_PLACEHOLDER_START_DATE = 1735689600000;

/** A data de inicio ainda e o placeholder do seed (o dono nao escolheu)? */
export function isStartDateSet(plan: PlanRow): boolean {
  return plan.start_date !== SEED_PLACEHOLDER_START_DATE;
}

/** Meia-noite LOCAL do dia de `d`, em epoch ms. A ancora de inicio do plano. */
export function localMidnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Define a data de inicio (epoch ms). Trust boundary: rejeita valor nao-finito —
 * um date picker vazio vira NaN, que NAO pode virar uma ancora silenciosa (que
 * jogaria currentWeek pro clamp e mentiria a semana).
 */
export async function setStartDate(db: Database, epochMs: number): Promise<void> {
  if (!Number.isFinite(epochMs)) {
    throw new Error(`setStartDate: epochMs invalido (${String(epochMs)})`);
  }
  await db.run("UPDATE plan SET start_date = ?", [Math.round(epochMs)]);
}

/**
 * Re-ancora para que HOJE (`now`) seja o inicio da semana `week`. Clampa week ao
 * intervalo valido [1, duration_weeks]. Primitiva unica de realinhamento:
 *   - "estou na semana N"   -> setCurrentWeekToday(db, plan, N, now)
 *   - "repetir esta semana" -> repeatCurrentWeek (abaixo)
 */
export async function setCurrentWeekToday(
  db: Database,
  plan: PlanRow,
  week: number,
  now: Date,
): Promise<void> {
  const clamped = Math.min(Math.max(Math.round(week), 1), plan.duration_weeks);
  await setStartDate(db, localMidnight(now) - (clamped - 1) * WEEK_MS);
}

/**
 * "Nao treinei essa semana -> repetir": re-ancora hoje no inicio da semana
 * ATUAL. Voce ganha a semana corrente de novo, fresca a partir de hoje; o resto
 * do plano (deload/taper/pico) desliza junto; nunca pula conteudo. Idempotente
 * no mesmo dia.
 *
 * LE o plano INTERNAMENTE (getPlan) em vez de receber do caller: a semana atual
 * deriva de plan.start_date, e um snapshot STALE do caller (entre dois toques —
 * ex.: corrigiu "estou na semana 5" e logo tocou "Repetir") reverteria a ancora
 * em silencio. E a classe de bug historica deste app (estado velho + escrita =
 * estado errado mudo). Lendo aqui dentro, leitura e escrita passam pela mesma
 * fila serial do worker sem nada do caller entre elas (mesmo principio do
 * useLiveSession).
 */
export async function repeatCurrentWeek(db: Database, now: Date): Promise<void> {
  const plan = await getPlan(db);
  if (plan === undefined) {
    throw new Error("repeatCurrentWeek: nenhum plano no banco (seed ausente?)");
  }
  await setCurrentWeekToday(db, plan, currentWeek(plan, now.getTime()), now);
}
