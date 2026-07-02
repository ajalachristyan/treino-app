import { useEffect, useState } from "react";

import { useDb } from "../db/DbProvider.tsx";
import { downloadBackup } from "../../data/backup.ts";
import {
  suggestSubstitutes,
  lastMeasuresFor,
  executionHistoryFor,
} from "../../data/sessions.ts";
import type { SetMeasures } from "../../data/sessions.ts";
import {
  useLiveSession,
  type ExerciseChoice,
} from "../session/useLiveSession.ts";
import {
  type LiveItem,
  sessionSuggestion,
  applyPrescriptionToPrefill,
  lastExecutionSummary,
} from "../session/sessionModel.ts";
import type {
  Prescription,
  RecoveryReason,
} from "../../engine/decision/prescription.ts";
import type { PhaseEmphasis, PhaseKind } from "../../engine/decision/phase.ts";
import { SetInput } from "../session/SetInput.tsx";
import { ExercisePicker } from "../session/ExercisePicker.tsx";
import { PhaseBanner } from "../components/PhaseBanner.tsx";
import { ReadinessBanner } from "../components/ReadinessBanner.tsx";
import type { DeviationReason } from "../../domain/types.ts";
import { formatMeasures, formatDuration } from "../labels.ts";

// Cronometro que anda: mostra o tempo decorrido desde `since` (ms), atualizando
// a cada segundo. Usado para o tempo total de treino e para o descanso.
function LiveClock({ since, label }: { since: number; label: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="timer">
      <span className="timer-label">{label}</span>
      <span className="timer-value">{formatDuration(now - since)}</span>
    </div>
  );
}

const SKIP_REASONS: ReadonlyArray<readonly [DeviationReason, string]> = [
  ["equipment_busy", "equip. ocupado"],
  ["injury_avoidance", "evitar lesao"],
  ["user_choice", "escolha"],
];

// Quantas execucoes recentes o motor olha (so a mais recente pesa na sugestao;
// margem por seguranca).
const SUGGESTION_HISTORY_N = 8;

const PHASE_LABEL: Record<PhaseEmphasis, string> = {
  m1: "Mês 1",
  m2: "Mês 2",
  m3: "Mês 3",
};

const RECOVERY_NOTE: Record<RecoveryReason, string> = {
  none: "",
  deload: "deload — leve, ajuste à vontade",
  taper: "taper — mantém a carga, menos volume",
  reactive_deload: "recuo — pegou leve",
};

// "Sugestão de hoje" = overlay da fase (memoria x intencao). SO exibe; o dono
// confirma logando (ou ajusta) no SetInput abaixo. Nunca bloqueia (anti-culpa).
function SuggestionLine({
  suggestion,
  phaseEmphasis,
}: {
  suggestion: Prescription;
  phaseEmphasis: PhaseEmphasis | null;
}) {
  const { mode, sets, repRange, suggestedLoadKg, intensityHintPct, recovery } =
    suggestion;
  const phaseLabel = phaseEmphasis !== null ? PHASE_LABEL[phaseEmphasis] : "";
  const setsPart = sets !== null ? `${String(sets)}×` : "";
  const repsPart =
    repRange !== null
      ? repRange.min === repRange.max
        ? String(repRange.max)
        : `${String(repRange.min)}–${String(repRange.max)}`
      : "";
  const loadPart =
    suggestedLoadKg !== null
      ? `${String(suggestedLoadKg)} kg`
      : intensityHintPct !== null
        ? `@~${String(Math.round(intensityHintPct * 100))}% · defina o kg`
        : "defina o kg";
  const recoveryNote = RECOVERY_NOTE[recovery];
  return (
    <div className="suggestion">
      <strong>Sugestão de hoje</strong>
      <span className="suggestion-body">
        {phaseLabel !== "" ? `${phaseLabel} · ` : ""}
        {mode === "peak_pap" ? "PAP " : ""}
        {setsPart} {repsPart} · {loadPart}
      </span>
      {recoveryNote !== "" && (
        <span className="badge badge-deload">{recoveryNote}</span>
      )}
      <span className="suggestion-hint">confirme ou ajuste abaixo</span>
    </div>
  );
}

function ItemCard({
  item,
  index,
  total,
  api,
  phaseEmphasis,
  phaseKind,
}: {
  item: LiveItem;
  index: number;
  total: number;
  api: ReturnType<typeof useLiveSession>;
  phaseEmphasis: PhaseEmphasis | null;
  phaseKind: PhaseKind | null;
}) {
  const db = useDb();
  const [skipping, setSkipping] = useState(false);
  const [picking, setPicking] = useState(false);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [prefill, setPrefill] = useState<{
    loaded: boolean;
    measures: SetMeasures | undefined;
  }>({ loaded: false, measures: undefined });
  const [suggestion, setSuggestion] = useState<Prescription | null>(null);
  const [lastExec, setLastExec] = useState<string | null>(null);

  // Memoria de carga X intencao da fase: pre-preenche o input com a ultima
  // execucao, sobrescrevendo SO a carga pela sugestao da fase (se houver). Sem
  // historico => em branco. Deps por exerciseId (o substituto muda o id e
  // re-dispara). SO exibe/pre-preenche; o dono confirma logando.
  useEffect(() => {
    let alive = true;
    setPrefill({ loaded: false, measures: undefined });
    setSuggestion(null);
    setLastExec(null);
    void Promise.all([
      lastMeasuresFor(db, item.exerciseId),
      executionHistoryFor(db, item.exerciseId, SUGGESTION_HISTORY_N),
    ]).then(([base, history]) => {
      if (!alive) return;
      const presc = sessionSuggestion(item, phaseEmphasis, phaseKind, history);
      setSuggestion(presc);
      setLastExec(lastExecutionSummary(history));
      setPrefill({
        loaded: true,
        measures: applyPrescriptionToPrefill(base, presc),
      });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, item.exerciseId, phaseEmphasis, phaseKind]);

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

      {!isSkipped && lastExec !== null && (
        <p className="muted lastexec">Última vez: {lastExec}</p>
      )}

      {!isSkipped &&
        suggestion !== null &&
        suggestion.mode !== "pass_through" && (
          <SuggestionLine suggestion={suggestion} phaseEmphasis={phaseEmphasis} />
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
              <button type="button" className="linkbtn" onClick={() => api.markDone(item.localKey)}>
                fez
              </button>
              <button type="button" className="linkbtn" onClick={() => api.skip(item.localKey, "user_choice")}>
                não fez
              </button>
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
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  // Finaliza e, na sequencia, tenta salvar um backup externo (copia de
  // seguranca automatica). Se o iOS nao abrir a folha de salvar (a ativacao do
  // toque some depois do await), o botao "Baixar backup" da tela final resolve.
  async function finalizeAndBackup(): Promise<void> {
    await api.finalize();
    try {
      await downloadBackup(db);
    } catch {
      // silencioso — o botao manual continua disponivel na tela "registrado".
    }
  }

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
        <p className="sub">
          {logged} exercicio(s) com series
          {api.startedAt !== null && api.endedAt !== null
            ? ` · durou ${formatDuration(api.endedAt - api.startedAt)}`
            : ""}
          . Salvo no aparelho — aparece em Histórico. Se a folha de salvar não
          abriu, baixe a cópia aqui.
        </p>
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

      {api.startedAt !== null && (
        <div className="timers">
          <LiveClock since={api.startedAt} label="treino" />
          <LiveClock since={api.lastSetAt ?? api.startedAt} label="descanso" />
        </div>
      )}

      <PhaseBanner />
      <ReadinessBanner />

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
        <ItemCard
          key={it.localKey}
          item={it}
          index={i}
          total={api.items.length}
          api={api}
          phaseEmphasis={api.phaseEmphasis}
          phaseKind={api.phaseKind}
        />
      ))}

      <div className="btn-row backup">
        <button type="button" className="btn" onClick={() => setAdding(true)}>
          + adicionar exercicio
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void finalizeAndBackup()}>
          Finalizar treino
        </button>
        <button type="button" className="btn" onClick={() => void downloadBackup(db)}>
          Baixar backup (.sql)
        </button>

        {confirmingDiscard ? (
          <div className="choice-row">
            <span className="muted">apagar este treino de vez?</span>
            <button
              type="button"
              className="choice"
              onClick={() => {
                setConfirmingDiscard(false);
                void api.discard();
              }}
            >
              sim, apagar
            </button>
            <button type="button" className="choice" onClick={() => setConfirmingDiscard(false)}>
              nao
            </button>
          </div>
        ) : (
          <button type="button" className="linkbtn" onClick={() => setConfirmingDiscard(true)}>
            descartar treino (teste/engano)
          </button>
        )}
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
