import { useEffect, useState } from "react";

import { useDb } from "../db/DbProvider.tsx";
import {
  adherenceOverview,
  type AdherenceOverview,
} from "../../data/adherence.ts";
import type { ExercisePriority } from "../../engine/decision/adherence.ts";

// Rotulos leigos dos tiers de importancia (exercise.priority).
const TIER_LABEL: Record<ExercisePriority, string> = {
  primary: "Exercícios-chave",
  accessory: "Acessórios",
  finisher: "Finalizadores",
  bonus: "Bônus",
};
const TIER_ORDER: readonly ExercisePriority[] = [
  "primary",
  "accessory",
  "finisher",
  "bonus",
];

// Rotulos que mapeiam a sugestao do motor a algo ACIONAVEL em Ajustes (repetir
// semana / reposicionar inicio). Evita prometer "estender a fase" — acao que nao
// existe em Ajustes (seria dead-end); "dar mais tempo a base" e o mesmo efeito
// pelas primitivas que existem (repeatCurrentWeek / setCurrentWeekToday).
const ADJUSTMENT_LABEL: Record<string, string> = {
  repeat_week: "repetir a semana",
  extend_phase: "dar mais tempo à base",
  shift_start: "ajustar a data de início",
};

type Load =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; overview: AdherenceOverview | null };

// Tela ADERENCIA (W5): dashboard read-only de "como voce seguiu o plano nesta
// fase" + os avisos de prontidao. NUNCA bloqueia nada; as acoes de rearranjo
// (repetir semana / mexer data) vivem em Ajustes — aqui so aponta pra la.
export function AderenciaScreen({
  onBack,
  onAjustes,
}: {
  onBack: () => void;
  onAjustes: () => void;
}) {
  const db = useDb();
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    let alive = true;
    void adherenceOverview(db, Date.now())
      .then((overview) => {
        if (alive) setLoad({ state: "ready", overview });
      })
      .catch(() => {
        // Erro de leitura NAO se disfarca de "plano nao comecou" (empty state):
        // estado de erro proprio, coerente com "erro nao some em silencio".
        if (alive) setLoad({ state: "error" });
      });
    return () => {
      alive = false;
    };
  }, [db]);

  return (
    <div className="screen">
      <div className="detail-top">
        <button type="button" className="linkbtn back-link" onClick={onBack}>
          ‹ Voltar
        </button>
      </div>
      <h1 className="h1">Aderência</h1>
      <p className="sub">Como você está seguindo o plano nesta fase.</p>

      {load.state === "loading" ? (
        <p className="muted">Carregando…</p>
      ) : load.state === "error" ? (
        <div className="error-box" role="status">
          Não consegui carregar a aderência agora. Tente abrir de novo.
        </div>
      ) : load.overview === null ? (
        <div className="card">
          <p className="muted">
            Sua aderência aparece aqui quando o plano estiver rodando (data de
            início definida e já começada).
          </p>
          <div className="btn-row">
            <button type="button" className="btn" onClick={onAjustes}>
              Ir para Ajustes
            </button>
          </div>
        </div>
      ) : (
        <Overview overview={load.overview} onAjustes={onAjustes} />
      )}
    </div>
  );
}

function Overview({
  overview,
  onAjustes,
}: {
  overview: AdherenceOverview;
  onAjustes: () => void;
}) {
  const { week, phaseName, summary, readiness } = overview;
  const tiers = TIER_ORDER.filter((t) => summary.byPriority[t].planned > 0);
  const hasAdvice =
    readiness.adherenceWarning ||
    readiness.riskPhaseGate ||
    readiness.neglectedPrimary.length > 0;

  return (
    <>
      <section className="card">
        <h2 className="card-title">
          Semana {week} · {phaseName}
        </h2>
        {summary.planned === 0 ? (
          <p className="muted">
            Fase começando — ainda sem treinos vencidos. Volte depois do primeiro
            treino da fase.
          </p>
        ) : (
          <>
            <p className="card-meta">
              {summary.done} de {summary.planned} feitos nesta fase (até hoje).
            </p>
            {tiers.map((t) => (
              <div key={t} className="hist-item">
                <div className="hist-item-name">{TIER_LABEL[t]}</div>
                <div className="hist-sets">
                  <span className="hist-set">
                    {summary.byPriority[t].done} de {summary.byPriority[t].planned}
                  </span>
                </div>
              </div>
            ))}
          </>
        )}
      </section>

      {hasAdvice && (
        <section className="card">
          <h2 className="card-title">Prontidão</h2>
          {readiness.riskPhaseGate && (
            <p className="card-meta">
              <b>Mês 3 (saltos profundos): atenção à base.</b> Você seguiu pouco
              os treinos-chave das fases anteriores.
            </p>
          )}
          {readiness.adherenceWarning && (
            <p className="card-meta">Você está um pouco atrás nesta fase.</p>
          )}
          {readiness.neglectedPrimary.length > 0 && (
            <p className="card-meta">
              Exercícios-chave largados seguidas vezes:{" "}
              {readiness.neglectedPrimary.join(", ")}.
            </p>
          )}
          {readiness.suggestedAdjustment !== null && (
            <>
              <p className="card-meta">
                Sugestão: <b>{ADJUSTMENT_LABEL[readiness.suggestedAdjustment]}</b>.
                Em Ajustes dá pra repetir a semana ou mover o início — sem
                prejuízo, o plano desliza junto. Você decide.
              </p>
              <div className="btn-row">
                <button type="button" className="btn" onClick={onAjustes}>
                  Ajustar o plano
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
