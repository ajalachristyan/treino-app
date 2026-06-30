import { useEffect, useState } from "react";

import {
  getAttachableRoutines,
  getRoutineBlocks,
  type RoutineRow,
  type WorkBlockRow,
} from "../../data/plan.ts";
import { useDb } from "../db/DbProvider.tsx";
import { BlockCard } from "../components/BlockCard.tsx";

function RoutineSection({
  routine,
  onOpenExercise,
}: {
  routine: RoutineRow;
  onOpenExercise: (exerciseId: string) => void;
}) {
  const db = useDb();
  const [blocks, setBlocks] = useState<WorkBlockRow[]>([]);

  useEffect(() => {
    let alive = true;
    void getRoutineBlocks(db, routine.id).then((b) => {
      if (alive) setBlocks(b);
    });
    return () => {
      alive = false;
    };
  }, [db, routine.id]);

  return (
    <>
      <h2 className="section-title">
        {routine.name}
        {routine.recurring === 1 ? (
          <>
            {" "}
            <span className="badge">recorrente</span>
          </>
        ) : null}
      </h2>
      {blocks.map((b) => (
        <BlockCard key={b.id} block={b} onOpenExercise={onOpenExercise} />
      ))}
    </>
  );
}

export function RoutineScreen({
  onOpenExercise,
}: {
  onOpenExercise: (exerciseId: string) => void;
}) {
  const db = useDb();
  const [routines, setRoutines] = useState<RoutineRow[]>([]);

  useEffect(() => {
    let alive = true;
    void getAttachableRoutines(db).then((r) => {
      if (alive) setRoutines(r);
    });
    return () => {
      alive = false;
    };
  }, [db]);

  return (
    <div className="screen">
      <h1 className="h1">Rotinas</h1>
      <p className="sub">
        Mobilidade / core anexavel ao fim de Ter/Qui/Sex (e a sessao maior de
        domingo).
      </p>
      {routines.map((r) => (
        <RoutineSection key={r.id} routine={r} onOpenExercise={onOpenExercise} />
      ))}
    </div>
  );
}
