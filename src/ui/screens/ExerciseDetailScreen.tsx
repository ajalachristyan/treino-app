import { useCallback, useEffect, useState } from "react";

import { getExercise, type ExerciseCatalogRow } from "../../data/catalog.ts";
import { updateExerciseText } from "../../data/planEditor.ts";
import { useDb } from "../db/DbProvider.tsx";
import {
  progressionLabel,
  categoryLabel,
  CATEGORY_ORDER,
} from "../labels.ts";

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

// Formulario de edicao do catalogo (nome, categoria, modo de fazer, video).
function EditForm({
  ex,
  onSaved,
  onCancel,
}: {
  ex: ExerciseCatalogRow;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const db = useDb();
  const [name, setName] = useState(ex.name);
  const [category, setCategory] = useState(ex.category ?? "");
  const [howTo, setHowTo] = useState(ex.how_to ?? "");
  const [videoUrl, setVideoUrl] = useState(ex.video_url ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateExerciseText(db, ex.id, {
        name,
        category: category === "" ? null : category,
        howTo,
        videoUrl,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="edit-form">
      {error !== null && <div className="error-box">{error}</div>}
      <label className="field">
        <span className="field-label">Nome</span>
        <input
          className="field-input"
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="field">
        <span className="field-label">Categoria (aba)</span>
        <select
          className="field-input"
          value={category}
          disabled={busy}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">—</option>
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">Modo de fazer (texto)</span>
        <textarea
          className="field-input howto-textarea"
          value={howTo}
          rows={10}
          disabled={busy}
          onChange={(e) => setHowTo(e.target.value)}
        />
      </label>
      <label className="field">
        <span className="field-label">Link de vídeo (opcional)</span>
        <input
          className="field-input"
          type="url"
          inputMode="url"
          placeholder="https://…"
          value={videoUrl}
          disabled={busy}
          onChange={(e) => setVideoUrl(e.target.value)}
        />
      </label>
      <div className="btn-row actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || name.trim() === ""}
          onClick={() => void save()}
        >
          Salvar
        </button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

// Tela de detalhe do exercicio — o "modo de fazer". Tocada a partir de qualquer
// linha de exercicio (Hoje/Plano/Rotinas) ou da aba Exercicios. Tem modo de
// edicao (nome/categoria/how_to/video) via planEditor.updateExerciseText.
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
  const [editing, setEditing] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    const r = await getExercise(db, id);
    setEx(r ?? null);
    setLoading(false);
  }, [db, id]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await getExercise(db, id);
      if (!alive) return;
      setEx(r ?? null);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [db, id]);

  return (
    <div className="screen">
      <div className="detail-top">
        <button type="button" className="linkbtn back-link" onClick={onBack}>
          ‹ Voltar
        </button>
        {ex !== null && !editing && (
          <button
            type="button"
            className="linkbtn"
            onClick={() => setEditing(true)}
          >
            editar
          </button>
        )}
      </div>

      {loading ? (
        <p className="sub">Carregando…</p>
      ) : ex === null ? (
        <p className="muted">Exercício não encontrado.</p>
      ) : editing ? (
        <>
          <h1 className="h1">{ex.name}</h1>
          <EditForm
            ex={ex}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              void load();
            }}
          />
        </>
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
            <p className="muted">Sem descrição ainda. Toque em “editar”.</p>
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
