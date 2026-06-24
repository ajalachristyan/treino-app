import { useEffect, useState } from "react";

import { useDb } from "../db/DbProvider.tsx";
import { downloadBackup } from "../../data/backup.ts";
import { suggestSubstitutes, lastMeasuresFor } from "../../data/sessions.ts";
import type { SetMeasures } from "../../data/sessions.ts";
import {
  useLiveSession,
  type ExerciseChoice,
} from "../session/useLiveSession.ts";
import { type LiveItem } from "../session/sessionModel.ts";
import { SetInput } from "../session/SetInput.tsx";
import { ExercisePicker } from "../session/ExercisePicker.tsx";
import type { DeviationReason } from "../../domain/types.ts";

function formatMeasures(m: SetMeasures): string {
  switch (m.progressionType) {
    case "load_reps":
      return `${m.reps} x ${m.loadKg} kg`;
    case "assisted_load":
      return `${m.reps} x assist. ${m.assistedLoadKg} kg`;
    case "isometric_intent":
      return `${m.intentPct}% intencao`;
    case "contact_quality":
      return m.quality;
    case "jump_height":
      return `${m.heightCm} cm`;
    case "difficulty_tier":
      return `degrau ${m.difficultyStep}`;
    case "skill_acquisition":
      return m.skillAchieved ? "fez" : "nao fez";
    case "time_under_tension":
      return `${m.seconds} s`;
  }
}

const SKIP_REASONS: ReadonlyArray<readonly [DeviationReason, string]> = [
  ["equipment_busy", "equip. ocupado"],
  ["injury_avoidance", "evitar lesao"],
  ["user_choice", "escolha"],
];

function ItemCard({
  item,
  index,
  total,
  api,
}: {
  item: LiveItem;
  index: number;
  total: number;
  api: ReturnType<typeof useLiveSession>;
}) {
  const db = useDb();
  const [skipping, setSkipping] = useState(false);
  const [picking, setPicking] = useState(false);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [prefill, setPrefill] = useState<{
    loaded: boolean;
    measures: SetMeasures | undefined;
  }>({ loaded: false, measures: undefined });

  // Memoria de carga: pre-preenche o input com a ultima execucao do exercicio.
  useEffect(() => {
    let alive = true;
    setPrefill({ loaded: false, measures: undefined });
    void lastMeasuresFor(db, item.exerciseId).then((m) => {
      if (alive) setPrefill({ loaded: true, measures: m });
    });
    return () => {
      alive = false;
    };
  }, [db, item.exerciseId]);

  const isSkipped = item.status === "skipped";
  const isPlanned = item.status === "planned";

  async function openSubstitute(): Promise<void> {
    const subs = await suggestSubstitutes(db, item.exerciseId);
    setSuggested(subs.map((s) => s.id));
    setPicking(true);
  }

  function onPickSubstitute(ex: ExerciseChoice): void {
    setPicking(false);
    void api.substitute(item.localKey, ex, "user_choice");
  }

  return (
    <section className={`card item ${isSkipped ? "item-skipped" : ""}`}>
      <div className="item-head">
        <div className="item-title">
          {item.exerciseName}
          {item.isWarmup && <span className="badge badge-warmup">aquecimento</span>}
          {item.status === "substituted" && <span className="badge">substituido</span>}
          {item.status === "added" && <span className="badge">adicionado</span>}
          {isSkipped && <span className="badge">pulado</span>}
        </div>
        <div className="item-move">
          <button type="button" className="iconbtn" aria-label="subir" disabled={index === 0} onClick={() => void api.move(index, index - 1)}>
            ↑
          </button>
          <button type="button" className="iconbtn" aria-label="descer" disabled={index === total - 1} onClick={() => void api.move(index, index + 1)}>
            ↓
          </button>
        </div>
      </div>

      {item.sets.length > 0 && (
        <ol className="setlist">
          {item.sets.map((s) => (
            <li key={s.setIndex}>
              {formatMeasures(s.measures)}
              {s.rpe !== null ? ` · RPE ${s.rpe}` : ""}
            </li>
          ))}
        </ol>
      )}

      {!isSkipped && prefill.loaded && (
        <SetInput
          key={item.exerciseId}
          progressionType={item.progressionType}
          prefill={prefill.measures}
          onSave={(m, rpe) => api.logSet(item.localKey, m, rpe)}
        />
      )}

      {isPlanned && (
        <div className="item-actions">
          {skipping ? (
            <div className="choice-row">
              <span className="muted">pular por:</span>
              {SKIP_REASONS.map(([r, label]) => (
                <button key={r} type="button" className="choice" onClick={() => void api.skip(item.localKey, r)}>
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <>
              <button type="button" className="linkbtn" onClick={() => setSkipping(true)}>
                pular
              </button>
              <button type="button" className="linkbtn" onClick={() => void openSubstitute()}>
                substituir
              </button>
            </>
          )}
        </div>
      )}

      {picking && (
        <ExercisePicker
          title={`Substituir ${item.exerciseName}`}
          suggestedFirst={suggested}
          onPick={onPickSubstitute}
          onCancel={() => setPicking(false)}
        />
      )}
    </section>
  );
}

export function SessionScreen({ goHome }: { goHome: () => void }) {
  const db = useDb();
  const api = useLiveSession();
  const [adding, setAdding] = useState(false);

  // Auto-retoma uma sessao em andamento ao entrar na tela.
  useEffect(() => {
    if (api.phase === "idle" && api.hasActive) void api.resume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.phase, api.hasActive]);

  if (api.phase === "checking") {
    return (
      <div className="screen">
        <p className="muted">Carregando…</p>
      </div>
    );
  }

  if (api.phase === "idle") {
    return (
      <div className="screen">
        <h1 className="h1">Treino</h1>
        <p className="sub">Inicie o treino de hoje. O plano so semeia — a sessao e sua.</p>
        <div className="btn-row">
          <button type="button" className="btn btn-primary" onClick={() => void api.start()}>
            Iniciar treino de hoje
          </button>
        </div>
      </div>
    );
  }

  if (api.phase === "ended") {
    const logged = api.items.filter((i) => i.sets.length > 0).length;
    return (
      <div className="screen">
        <h1 className="h1">Treino registrado ✓</h1>
        <p className="sub">{logged} exercicio(s) com series. Bom trabalho.</p>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => void downloadBackup(db)}>
            Baixar backup (.sql)
          </button>
          <button type="button" className="btn btn-primary" onClick={goHome}>
            Voltar ao inicio
          </button>
        </div>
      </div>
    );
  }

  // active
  return (
    <div className="screen">
      <h1 className="h1">Treino</h1>
      <p className="sub">{api.todayLabel}</p>

      {api.warning !== null && (
        <div className="error-box" role="status">
          <strong>Aviso de interferencia.</strong>
          <p>
            Um exercicio de segurada longa precede um de potencia nesta sessao —
            pode reduzir o salto. So um aviso; voce decide (anti-culpa).
          </p>
        </div>
      )}

      {api.error !== null && (
        <div className="error-box" role="alert">
          <div>{api.error}</div>
          <button type="button" className="linkbtn" onClick={api.clearError}>
            dispensar
          </button>
        </div>
      )}

      {api.items.map((it, i) => (
        <ItemCard key={it.localKey} item={it} index={i} total={api.items.length} api={api} />
      ))}

      <div className="btn-row backup">
        <button type="button" className="btn" onClick={() => setAdding(true)}>
          + adicionar exercicio
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void api.finalize()}>
          Finalizar treino
        </button>
        <button type="button" className="btn" onClick={() => void downloadBackup(db)}>
          Baixar backup (.sql)
        </button>
      </div>

      {adding && (
        <ExercisePicker
          title="Adicionar exercicio"
          onPick={(ex) => {
            setAdding(false);
            void api.addAdhoc(ex);
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  );
}
