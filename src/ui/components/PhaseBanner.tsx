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
  DELOAD_VOLUME_FACTOR,
  TAPER_VOLUME_FACTOR,
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

  // % derivados das constantes (fonte unica) — nunca chumbar no texto.
  const deloadLoadDrop = Math.round((1 - DELOAD_LOAD_FACTOR) * 100);
  const deloadVolDrop = Math.round((1 - DELOAD_VOLUME_FACTOR) * 100);
  const taperVolDrop = Math.round((1 - TAPER_VOLUME_FACTOR) * 100);

  return (
    <div className="phase-banner" role="status">
      {kind === "deload" ? (
        <>
          <strong>Semana de deload (recuperação do sistema nervoso).</strong>
          <p>
            Corte forte: cerca de <b>{deloadVolDrop}% menos volume</b> e{" "}
            <b>{deloadLoadDrop}% menos carga</b>. <b>Nada de pliometria nem
            explosivo</b> — troque por técnica leve de ginástica. Não é semana de
            recorde: pegar leve aqui é o que faz você voltar mais forte.
          </p>
        </>
      ) : (
        <>
          <strong>Semana de taper (afiar pro pico).</strong>
          <p>
            <b>Mantenha a carga</b> (a intensidade), mas corte cerca de{" "}
            <b>{taperVolDrop}% do volume</b> de pesos. Não persiga máximo — a meta
            é chegar com o sistema nervoso descansado pro pico de salto.
          </p>
        </>
      )}
    </div>
  );
}
