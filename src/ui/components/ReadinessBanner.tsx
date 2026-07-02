import { useEffect, useState } from "react";

import { useDb } from "../db/DbProvider.tsx";
import { readinessNow, type ReadinessView } from "../../data/adherence.ts";

// Banner ADVISORY de prontidao (W4). Self-contained (busca sozinho, como o
// PhaseBanner) e renderizado logo APOS o PhaseBanner. AVISA e sugere rearranjo do
// plano (repetir semana / estender fase); NUNCA bloqueia nem desabilita o log
// (anti-culpa Secao 6.3 / I-12). Em erro/sem dado -> nao mostra nada.
export function ReadinessBanner() {
  const db = useDb();
  const [view, setView] = useState<ReadinessView | null>(null);

  useEffect(() => {
    let alive = true;
    void readinessNow(db, Date.now())
      .then((v) => {
        if (alive) setView(v);
      })
      .catch(() => {
        if (alive) setView(null); // degrada: sem banner, nunca quebra a tela
      });
    return () => {
      alive = false;
    };
  }, [db]);

  if (view === null) return null;
  const { adherenceWarning, riskPhaseGate, neglectedPrimary } = view;
  if (!adherenceWarning && !riskPhaseGate && neglectedPrimary.length === 0) {
    return null;
  }

  return (
    <>
      {riskPhaseGate ? (
        <div className="error-box" role="status">
          <strong>Mês 3 (saltos profundos): atenção à base.</strong>
          <p>
            Você seguiu pouco os treinos-chave das fases anteriores. Para o
            trabalho de alto risco, considere <b>estender a fase</b> pra chegar
            com base. É só um aviso — você decide (nada trava o treino).
          </p>
        </div>
      ) : (
        adherenceWarning && (
          <div className="error-box" role="status">
            <strong>Você está um pouco atrás nesta fase.</strong>
            <p>
              Considere <b>repetir a semana</b> — sem prejuízo, o plano desliza
              junto e nada é pulado. Só um aviso; você decide.
            </p>
          </div>
        )
      )}
      {neglectedPrimary.length > 0 && (
        <div className="error-box" role="status">
          <strong>Exercícios-chave largados seguidas vezes:</strong>{" "}
          {neglectedPrimary.join(", ")}.
          <p>Que tal priorizar no próximo treino? (só um lembrete)</p>
        </div>
      )}
    </>
  );
}
