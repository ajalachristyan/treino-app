import { useEffect, useMemo, useState } from "react";

import { getExercises, type ExerciseCatalogRow } from "../../data/catalog.ts";
import { useDb } from "../db/DbProvider.tsx";
import { CATEGORY_ORDER, categoryLabel, progressionLabel } from "../labels.ts";

// Aba "Exercicios": catalogo inteiro, agrupado por categoria, com busca por
// nome. Tocar um item abre o detalhe (modo de fazer). Reusa o padrao de filtro
// do ExercisePicker (filtro por nome), mas aqui e navegacao, nao selecao.
export function ExerciseLibraryScreen({
  onOpenExercise,
}: {
  onOpenExercise: (exerciseId: string) => void;
}) {
  const db = useDb();
  const [all, setAll] = useState<ExerciseCatalogRow[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    void getExercises(db).then((r) => {
      if (alive) setAll(r);
    });
    return () => {
      alive = false;
    };
  }, [db]);

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtered = term
      ? all.filter((e) => e.name.toLowerCase().includes(term))
      : all;
    const known = new Set<string>(CATEGORY_ORDER);
    const order: ReadonlyArray<string | null> = [...CATEGORY_ORDER, null];
    return order
      .map((cat) => ({
        cat,
        items: filtered.filter((e) =>
          cat === null
            ? e.category === null || !known.has(e.category)
            : e.category === cat,
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [all, q]);

  return (
    <div className="screen">
      <h1 className="h1">Exercícios</h1>
      <input
        className="field-input lib-search"
        type="search"
        placeholder="buscar exercício…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {groups.length === 0 ? (
        <p className="muted">Nada encontrado.</p>
      ) : (
        groups.map((g) => (
          <section key={g.cat ?? "outros"}>
            <h2 className="section-title">{categoryLabel(g.cat)}</h2>
            <div className="card lib-group">
              {g.items.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className="exrow exrow-tap"
                  onClick={() => onOpenExercise(e.id)}
                >
                  <span className="exrow-body">
                    <span className="exrow-name">{e.name}</span>
                    <span className="exrow-note muted">
                      {progressionLabel(e.progression_type)}
                    </span>
                  </span>
                  <span className="exrow-chevron" aria-hidden="true">
                    ›
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
