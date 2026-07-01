import { useEffect, useState } from "react";

import {
  getPlan,
  getPhases,
  currentWeek,
  phaseForWeek,
} from "../../data/plan.ts";
import { isStartDateSet } from "../../data/planConfig.ts";
import {
  DELOAD_LOAD_FACTOR,
  DELOAD_SETS_DROP,
} from "../../domain/constants.ts";
import { useDb } from "../db/DbProvider.tsx";

type Kind = "none" | "deload" | "taper";

// Aviso PROEMINENTE de deload/taper — antes so aparecia como rotulo pequeno no
// subtitulo. Self-contained (busca plano/fase por conta propria); nao toca a
// sessao ao vivo. Periodizacao: DELOAD alivia CARGA; TAPER mantem a carga e
// reduz VOLUME (afiar pro pico). O % de deload e constante nomeada (o dono valida).
export function PhaseBanner() {
  const db = useDb();
  const [kind, setKind] = useState<Kind>("none");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const plan = await getPlan(db);
      const now = Date.now();
      // So avisa se o plano esta REALMENTE ativo (data definida e ja comecou) —
      // senao a semana derivada nao vale (placeholder cairia em deload da sem 18).
      if (
        !alive ||
        plan === undefined ||
        !isStartDateSet(plan) ||
        plan.start_date > now
      ) {
        setKind("none");
        return;
      }
      const phases = await getPhases(db, plan.id);
      const ph = phaseForWeek(phases, currentWeek(plan, now));
      if (!alive) return;
      setKind(ph?.is_deload === 1 ? "deload" : ph?.is_taper === 1 ? "taper" : "none");
    })();
    return () => {
      alive = false;
    };
  }, [db]);

  if (kind === "none") return null;

  const sets = DELOAD_SETS_DROP === 1 ? "1 série" : `${DELOAD_SETS_DROP} séries`;
  // % de alivio derivado da constante (fonte unica) — nao chumbar no texto.
  const loadDropPct = Math.round((1 - DELOAD_LOAD_FACTOR) * 100);

  return (
    <div className="phase-banner" role="status">
      {kind === "deload" ? (
        <>
          <strong>Semana de deload (recuperação).</strong>
          <p>
            Não é semana de recorde. Alivie: cerca de{" "}
            <b>{loadDropPct}% menos carga</b> e <b>{sets} a menos</b> por
            exercício. É a semana em que o corpo
            assimila o treino — pegar leve aqui faz você voltar mais forte.
          </p>
        </>
      ) : (
        <>
          <strong>Semana de taper (afiar pro pico).</strong>
          <p>
            <b>Mantenha a carga</b> (a intensidade), mas reduza o <b>volume</b>:{" "}
            {sets} a menos por exercício. A ideia é chegar descansado e forte,
            não cansado.
          </p>
        </>
      )}
    </div>
  );
}
