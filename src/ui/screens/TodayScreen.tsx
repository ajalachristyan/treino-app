import { useEffect, useRef, useState } from "react";

import {
  getPlan,
  getPhases,
  getPlanBlocksForWeek,
  currentWeek,
  isoDayOfWeek,
  phaseForWeek,
  type WorkBlockRow,
} from "../../data/plan.ts";
import {
  isStartDateSet,
  localMidnight,
  setStartDate,
} from "../../data/planConfig.ts";
import {
  getMissesForDate,
  recordMiss,
  deleteMiss,
  type MissedSessionRow,
} from "../../data/absences.ts";
import { downloadBackup } from "../../data/backup.ts";
import { useDb } from "../db/DbProvider.tsx";
import { BlockCard } from "../components/BlockCard.tsx";
import { PhaseBanner } from "../components/PhaseBanner.tsx";
import { ReadinessBanner } from "../components/ReadinessBanner.tsx";

const DAY_MS = 86400000;

// Estados da tela Hoje. A data de inicio (ancora editavel da P2.5) decide qual:
// nao definida -> pede pra configurar; futura -> conta os dias; ativa -> normal.
type View =
  | { kind: "loading" }
  | { kind: "no-plan" }
  | { kind: "unset" }
  | { kind: "future"; days: number }
  | { kind: "active"; label: string; blocks: WorkBlockRow[]; todayMid: number };

export function TodayScreen({
  onStart,
  onAjustes,
  onHistorico,
  onOpenExercise,
}: {
  onStart: () => void;
  onAjustes: () => void;
  onHistorico: () => void;
  onOpenExercise: (exerciseId: string) => void;
}) {
  const db = useDb();
  const [view, setView] = useState<View>({ kind: "loading" });
  const [todayMiss, setTodayMiss] = useState<MissedSessionRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  async function load(): Promise<void> {
    const plan = await getPlan(db);
    if (!mounted.current) return;
    if (plan === undefined) {
      setView({ kind: "no-plan" });
      return;
    }
    const now = Date.now();
    if (!isStartDateSet(plan)) {
      setView({ kind: "unset" });
      return;
    }
    if (plan.start_date > now) {
      setView({ kind: "future", days: Math.ceil((plan.start_date - now) / DAY_MS) });
      return;
    }
    const phases = await getPhases(db, plan.id);
    const week = currentWeek(plan, now);
    const iso = isoDayOfWeek(new Date());
    const all = await getPlanBlocksForWeek(db, plan.id, week);
    const todayMid = localMidnight(new Date());
    const misses = await getMissesForDate(db, todayMid);
    if (!mounted.current) return;
    const phase = phaseForWeek(phases, week);
    setTodayMiss(misses[0] ?? null);
    setView({
      kind: "active",
      label: `Semana ${week}${phase ? ` · ${phase.name}` : ""}`,
      blocks: all.filter((b) => b.day_of_week === iso),
      todayMid,
    });
  }

  useEffect(() => {
    mounted.current = true;
    void load();
    // Recarrega ao voltar pro app (virada de meia-noite / volta do background):
    // sem isto, view.todayMid/week/blocos ficam congelados do mount e "Nao treinei
    // hoje" gravaria o dia errado num app aberto de um dia pro outro.
    const onWake = (): void => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  // Serializa as escritas no nivel da UI (anti toque-rapido), recarrega e expoe
  // o erro na tela (escrita/backup que falha NAO pode sumir em silencio).
  async function run(fn: () => Promise<unknown>): Promise<void> {
    if (busy) return;
    setBusy(true);
    if (mounted.current) setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className="screen">
      <h1 className="h1">Hoje</h1>

      {error !== null && <div className="error-box">{error}</div>}

      {view.kind === "loading" && <p className="sub">—</p>}

      {view.kind === "no-plan" && (
        <div className="card">
          <p className="muted">
            Nenhum plano no banco. Reinstale o app ou restaure um backup.
          </p>
        </div>
      )}

      {view.kind === "unset" && (
        <div className="card">
          <h2 className="card-title">Quando você começou?</h2>
          <p className="card-meta">
            O app precisa do dia em que você começou (ou vai começar) o plano para
            mostrar a semana certa. Sem isso, ele não sabe onde você está.
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() =>
                void run(() => setStartDate(db, localMidnight(new Date())))
              }
            >
              Comecei hoje
            </button>
            <button type="button" className="btn" onClick={onAjustes}>
              Escolher outra data
            </button>
          </div>
        </div>
      )}

      {view.kind === "future" && (
        <>
          <p className="sub">
            Semana 1 começa em {view.days} {view.days === 1 ? "dia" : "dias"}.
          </p>
          <div className="card">
            <p className="muted">
              O plano ainda não começou. No dia, os blocos de hoje aparecem aqui.
            </p>
          </div>
          <div className="btn-row">
            <button type="button" className="btn" onClick={onAjustes}>
              Ajustar a data
            </button>
          </div>
        </>
      )}

      {view.kind === "active" && (
        <>
          <p className="sub">{view.label}</p>
          <PhaseBanner />
          <ReadinessBanner />
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={onStart}>
              Iniciar treino
            </button>
          </div>

          {view.blocks.length === 0 && (
            <div className="card">
              <p className="muted">
                Nenhum bloco do plano para hoje. Dia de descanso ou ginástica
                livre.
              </p>
            </div>
          )}

          {view.blocks.map((b) => (
            <BlockCard key={b.id} block={b} onOpenExercise={onOpenExercise} />
          ))}

          <div className="card">
            {todayMiss !== null ? (
              <>
                <p className="muted">Falta de hoje registrada.</p>
                <button
                  type="button"
                  className="linkbtn"
                  disabled={busy}
                  onClick={() => void run(() => deleteMiss(db, todayMiss.id))}
                >
                  Desfazer
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    recordMiss(db, { missedDate: view.todayMid, now: Date.now() }),
                  )
                }
              >
                Não treinei hoje
              </button>
            )}
          </div>
        </>
      )}

      <div className="backup btn-row">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={onHistorico}
        >
          Treinos anteriores (Histórico)
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || view.kind === "loading" || view.kind === "no-plan"}
          onClick={() => void run(() => downloadBackup(db))}
        >
          Baixar backup (.sql)
        </button>
      </div>
    </div>
  );
}
