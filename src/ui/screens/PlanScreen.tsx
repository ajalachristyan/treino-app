import { useEffect, useState } from "react";

import {
  getPlan,
  getPhases,
  getPlanBlocksForWeek,
  currentWeek,
  phaseForWeek,
  type PlanRow,
  type PhaseRow,
  type WorkBlockRow,
} from "../../data/plan.ts";
import { useDb } from "../db/DbProvider.tsx";
import { BlockCard } from "../components/BlockCard.tsx";

export function PlanScreen({
  onOpenExercise,
}: {
  onOpenExercise: (exerciseId: string) => void;
}) {
  const db = useDb();
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [phases, setPhases] = useState<PhaseRow[]>([]);
  const [week, setWeek] = useState(1);
  const [blocks, setBlocks] = useState<WorkBlockRow[]>([]);

  // Carrega o plano + fases uma vez; arranca na semana derivada de hoje.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const p = await getPlan(db);
      if (!alive || p === undefined) return;
      const ph = await getPhases(db, p.id);
      if (!alive) return;
      setPlan(p);
      setPhases(ph);
      setWeek(currentWeek(p, Date.now()));
    })();
    return () => {
      alive = false;
    };
  }, [db]);

  // Recarrega os blocos quando a semana muda.
  useEffect(() => {
    if (plan === null) return;
    let alive = true;
    void getPlanBlocksForWeek(db, plan.id, week).then((b) => {
      if (alive) setBlocks(b);
    });
    return () => {
      alive = false;
    };
  }, [db, plan, week]);

  if (plan === null) {
    return (
      <div className="screen">
        <p className="muted">Carregando plano…</p>
      </div>
    );
  }

  const phase = phaseForWeek(phases, week);
  const weeks = Array.from({ length: plan.duration_weeks }, (_, i) => i + 1);

  return (
    <div className="screen">
      <h1 className="h1">{plan.name}</h1>
      <p className="sub">
        {plan.duration_weeks} semanas
        {phase ? ` · ${phase.name}` : ""}
        {phase?.is_deload === 1 ? (
          <>
            {" "}
            <span className="badge badge-deload">deload</span>
          </>
        ) : null}
        {phase?.is_taper === 1 ? (
          <>
            {" "}
            <span className="badge badge-deload">taper</span>
          </>
        ) : null}
      </p>

      <div className="weekbar" role="tablist" aria-label="Semana do plano">
        {weeks.map((w) => (
          <button
            key={w}
            type="button"
            className="weekchip"
            aria-pressed={w === week}
            onClick={() => setWeek(w)}
          >
            {w}
          </button>
        ))}
      </div>

      {blocks.map((b) => (
        <BlockCard key={b.id} block={b} onOpenExercise={onOpenExercise} />
      ))}
    </div>
  );
}
