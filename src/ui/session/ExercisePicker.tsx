import { useEffect, useMemo, useState } from "react";

import { getAllExercises, type ExerciseRow } from "../../data/plan.ts";
import { useDb } from "../db/DbProvider.tsx";
import type { ExerciseChoice } from "./useLiveSession.ts";
import type { ProgressionType } from "../../domain/types.ts";

/**
 * Seletor de exercicio (para adicionar ad-hoc ou substituir). Lista o catalogo
 * com filtro de texto. `suggestedFirst` (ids) sobem ao topo (sugestao por funcao).
 */
export function ExercisePicker({
  title,
  suggestedFirst,
  onPick,
  onCancel,
}: {
  title: string;
  suggestedFirst?: readonly string[];
  onPick: (ex: ExerciseChoice) => void;
  onCancel: () => void;
}) {
  const db = useDb();
  const [all, setAll] = useState<ExerciseRow[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    void getAllExercises(db).then((r) => {
      if (alive) setAll(r);
    });
    return () => {
      alive = false;
    };
  }, [db]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtered = term
      ? all.filter((e) => e.name.toLowerCase().includes(term))
      : all;
    const sug = new Set(suggestedFirst ?? []);
    return [...filtered].sort((x, y) => {
      const sx = sug.has(x.id) ? 0 : 1;
      const sy = sug.has(y.id) ? 0 : 1;
      return sx - sy || x.name.localeCompare(y.name);
    });
  }, [all, q, suggestedFirst]);

  return (
    <div className="picker-overlay" role="dialog" aria-label={title}>
      <div className="picker">
        <div className="picker-head">
          <strong>{title}</strong>
          <button type="button" className="picker-x" onClick={onCancel}>
            fechar
          </button>
        </div>
        <input
          className="field-input"
          type="search"
          placeholder="buscar exercicio…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="picker-list">
          {shown.map((e) => (
            <button
              key={e.id}
              type="button"
              className="picker-item"
              onClick={() =>
                onPick({
                  exerciseId: e.id,
                  exerciseName: e.name,
                  progressionType: e.progression_type as ProgressionType,
                })
              }
            >
              {suggestedFirst?.includes(e.id) ? "★ " : ""}
              {e.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
