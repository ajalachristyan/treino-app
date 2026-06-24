import { useEffect, useState } from "react";

import {
  getPlan,
  getPhases,
  getPlanBlocksForWeek,
  currentWeek,
  isoDayOfWeek,
  phaseForWeek,
  type WorkBlockRow,
} from "../../data/plan.ts";
import { downloadBackup } from "../../data/backup.ts";
import { useDb } from "../db/DbProvider.tsx";
import { BlockCard } from "../components/BlockCard.tsx";

export function TodayScreen() {
  const db = useDb();
  const [blocks, setBlocks] = useState<WorkBlockRow[]>([]);
  const [label, setLabel] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const plan = await getPlan(db);
      if (!alive) return;
      if (plan === undefined) {
        setLoaded(true);
        return;
      }
      const phases = await getPhases(db, plan.id);
      const now = new Date();
      const week = currentWeek(plan, now.getTime()); // derivado na leitura
      const iso = isoDayOfWeek(now);
      const all = await getPlanBlocksForWeek(db, plan.id, week);
      if (!alive) return;
      const phase = phaseForWeek(phases, week);
      setLabel(`Semana ${week}${phase ? ` · ${phase.name}` : ""}`);
      setBlocks(all.filter((b) => b.day_of_week === iso));
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [db]);

  return (
    <div className="screen">
      <h1 className="h1">Hoje</h1>
      <p className="sub">{label || "—"}</p>

      {loaded && blocks.length === 0 && (
        <div className="card">
          <p className="muted">
            Nenhum bloco do plano para hoje. Dia de descanso, ginastica livre, ou
            a data de inicio do plano ainda nao foi ajustada.
          </p>
        </div>
      )}

      {blocks.map((b) => (
        <BlockCard key={b.id} block={b} />
      ))}

      <div className="backup btn-row">
        <button
          type="button"
          className="btn"
          onClick={() => void downloadBackup(db)}
        >
          Baixar backup (.sql)
        </button>
      </div>
    </div>
  );
}
