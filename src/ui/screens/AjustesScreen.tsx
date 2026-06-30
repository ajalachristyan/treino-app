// Tela de Ajustes do plano (P2.5): a ancora temporal editavel + faltas.
// Toda a logica de "que semana" vive em planConfig.ts; aqui so a UI.
import { useCallback, useEffect, useRef, useState } from "react";

import {
  getPlan,
  getPhases,
  currentWeek,
  phaseForWeek,
  type PlanRow,
  type PhaseRow,
} from "../../data/plan.ts";
import {
  isStartDateSet,
  localMidnight,
  setStartDate,
  setCurrentWeekToday,
  repeatCurrentWeek,
} from "../../data/planConfig.ts";
import {
  getMisses,
  deleteMiss,
  type MissedSessionRow,
} from "../../data/absences.ts";
import { useDb } from "../db/DbProvider.tsx";

const DAY_MS = 86400000;

/** epoch ms (meia-noite local) -> "YYYY-MM-DD" para o <input type=date>. */
function toDateInputValue(epochMs: number): string {
  const d = new Date(epochMs);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** "YYYY-MM-DD" do input -> epoch ms na meia-noite LOCAL (NAO UTC). */
function fromDateInputValue(v: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m === null) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

function fmtDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function AjustesScreen() {
  const db = useDb();
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [phases, setPhases] = useState<PhaseRow[]>([]);
  const [misses, setMisses] = useState<MissedSessionRow[]>([]);
  const [dateInput, setDateInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const reload = useCallback(async (): Promise<void> => {
    const p = await getPlan(db);
    if (!mounted.current || p === undefined) return;
    const [ph, ms] = await Promise.all([getPhases(db, p.id), getMisses(db)]);
    if (!mounted.current) return;
    setPlan(p);
    setPhases(ph);
    setMisses(ms);
    setDateInput(isStartDateSet(p) ? toDateInputValue(p.start_date) : "");
  }, [db]);

  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => {
      mounted.current = false;
    };
  }, [reload]);

  // Serializa escritas no nivel da UI (anti toque-rapido) + recarrega + erro na tela.
  async function run(fn: () => Promise<unknown>): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  if (plan === null) {
    return (
      <div className="screen">
        <p className="muted">Carregando…</p>
      </div>
    );
  }

  const now = Date.now();
  const started = isStartDateSet(plan);
  const future = started && plan.start_date > now;
  const week = currentWeek(plan, now);
  const phase = phaseForWeek(phases, week);
  const weeks = Array.from({ length: plan.duration_weeks }, (_, i) => i + 1);

  // Limites do date picker: barram um typo de ano (ex.: 2024 no lugar de 2026)
  // que o clamp de currentWeek esconderia jogando voce pra ultima semana.
  const nowMid = localMidnight(new Date());
  const minDate = toDateInputValue(nowMid - plan.duration_weeks * 7 * DAY_MS);
  const maxDate = toDateInputValue(nowMid + 365 * DAY_MS);

  const status = !started
    ? "Data de início ainda não definida."
    : future
      ? `Começa em ${Math.ceil((plan.start_date - now) / DAY_MS)} dia(s) — Semana 1.`
      : `Hoje: Semana ${week}${phase ? ` · ${phase.name}` : ""}.`;

  const saveDate = (): void => {
    const epoch = fromDateInputValue(dateInput);
    if (epoch === null) {
      setError("Escolha uma data válida.");
      return;
    }
    void run(() => setStartDate(db, epoch));
  };

  return (
    <div className="screen">
      <h1 className="h1">Ajustes do plano</h1>
      <p className="sub">{status}</p>
      {error !== null && <div className="error-box">{error}</div>}

      <h2 className="section-title">Data de início</h2>
      <label className="field">
        <span className="field-label">Dia que você começou (ou vai começar)</span>
        <input
          className="field-input"
          type="date"
          value={dateInput}
          min={minDate}
          max={maxDate}
          disabled={busy}
          onChange={(e) => setDateInput(e.target.value)}
        />
      </label>
      <div className="btn-row actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || dateInput === ""}
          onClick={saveDate}
        >
          Salvar data
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void run(() => setStartDate(db, localMidnight(new Date())))}
        >
          Comecei hoje
        </button>
      </div>

      <h2 className="section-title">Estou na semana</h2>
      <p className="card-meta">
        Toque a semana em que você está de verdade — o app re-ancora para hoje.
      </p>
      <div className="weekbar" aria-label="Semana atual">
        {weeks.map((w) => (
          <button
            key={w}
            type="button"
            className="weekchip"
            aria-pressed={started && !future && w === week}
            disabled={busy}
            onClick={() => void run(() => setCurrentWeekToday(db, plan, w, new Date()))}
          >
            {w}
          </button>
        ))}
      </div>

      {started && !future && (
        <>
          <h2 className="section-title">Não treinei essa semana</h2>
          <div className="btn-row">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void run(() => repeatCurrentWeek(db, new Date()))}
            >
              Repetir esta semana
            </button>
          </div>
          <p className="card-meta">
            Empurra o plano: você ganha a semana atual de novo a partir de hoje;
            deload e taper acompanham. Nada é pulado.
          </p>
        </>
      )}

      <h2 className="section-title">Faltas registradas</h2>
      {misses.length === 0 ? (
        <p className="muted">Nenhuma falta registrada.</p>
      ) : (
        misses.map((m) => (
          <div key={m.id} className="exrow">
            <div className="exrow-body">
              <div className="exrow-name">{fmtDate(m.missed_date)}</div>
              {m.reason !== null && <div className="exrow-note">{m.reason}</div>}
            </div>
            <button
              type="button"
              className="linkbtn"
              disabled={busy}
              onClick={() => void run(() => deleteMiss(db, m.id))}
            >
              Desfazer
            </button>
          </div>
        ))
      )}
    </div>
  );
}
