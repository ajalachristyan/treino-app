import { useEffect, useState } from "react";

import { getExercise, type ExerciseCatalogRow } from "../../data/catalog.ts";
import { useDb } from "../db/DbProvider.tsx";
import { progressionLabel, categoryLabel } from "../labels.ts";

// Uma linha do how_to. Se comeca com "Rotulo: ...", destaca o rotulo.
function HowToLine({ line }: { line: string }) {
  const t = line.trim();
  if (t === "") return null;
  const m = /^([A-Za-zÀ-ÿ ]{3,20}):\s*(.*)$/.exec(t);
  if (m !== null) {
    return (
      <p className="howto-line">
        <strong>{m[1]}:</strong> {m[2]}
      </p>
    );
  }
  return <p className="howto-line">{t}</p>;
}

// Tela de detalhe do exercicio — o "modo de fazer". Tocada a partir de qualquer
// linha de exercicio (Hoje/Plano/Rotinas) ou da aba Exercicios.
export function ExerciseDetailScreen({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) {
  const db = useDb();
  const [ex, setEx] = useState<ExerciseCatalogRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void getExercise(db, id).then((r) => {
      if (!alive) return;
      setEx(r ?? null);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [db, id]);

  return (
    <div className="screen">
      <button type="button" className="linkbtn back-link" onClick={onBack}>
        ‹ Voltar
      </button>

      {loading ? (
        <p className="sub">Carregando…</p>
      ) : ex === null ? (
        <p className="muted">Exercício não encontrado.</p>
      ) : (
        <>
          <h1 className="h1">{ex.name}</h1>

          <div className="detail-tags">
            {ex.category !== null && (
              <span className="badge">{categoryLabel(ex.category)}</span>
            )}
            <span className="badge">{progressionLabel(ex.progression_type)}</span>
            {ex.rep_min !== null && ex.rep_max !== null && (
              <span className="badge">
                {ex.rep_min}–{ex.rep_max} reps
              </span>
            )}
            {ex.acute_interference === 1 && (
              <span className="badge badge-warmup">hold longo</span>
            )}
          </div>

          {ex.acute_interference === 1 && (
            <p className="card-meta">
              Segura muito tempo: o app avisa se você colocar isto perto de um
              treino pesado de pernas (interferência).
            </p>
          )}

          {ex.how_to !== null && ex.how_to !== "" ? (
            <div className="howto">
              {ex.how_to.split("\n").map((line, i) => (
                <HowToLine key={i} line={line} />
              ))}
            </div>
          ) : (
            <p className="muted">Sem descrição ainda.</p>
          )}

          {ex.video_url !== null && ex.video_url !== "" && (
            <div className="btn-row video-row">
              <a
                className="btn"
                href={ex.video_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver vídeo (abre fora do app)
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
