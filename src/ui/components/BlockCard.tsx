import { useEffect, useState } from "react";

import {
  getWorkBlockItems,
  type WorkBlockRow,
  type WorkBlockItemRow,
} from "../../data/plan.ts";
import { useDb } from "../db/DbProvider.tsx";
import { ExerciseRow } from "./ExerciseRow.tsx";

// Card read-only de um bloco: nome + itens (busca os itens por conta propria).
export function BlockCard({ block }: { block: WorkBlockRow }) {
  const db = useDb();
  const [items, setItems] = useState<WorkBlockItemRow[]>([]);

  useEffect(() => {
    let alive = true;
    void getWorkBlockItems(db, block.id).then((rows) => {
      if (alive) setItems(rows);
    });
    return () => {
      alive = false;
    };
  }, [db, block.id]);

  return (
    <section className="card">
      <h2 className="card-title">{block.name}</h2>
      {block.ordered === 1 && (
        <p className="card-meta">Sequencia fixa (faca na ordem).</p>
      )}
      {items.map((it) => (
        <ExerciseRow key={it.id} item={it} />
      ))}
    </section>
  );
}
