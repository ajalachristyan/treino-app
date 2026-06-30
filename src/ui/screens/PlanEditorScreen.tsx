import { useCallback, useEffect, useState } from "react";

import {
  getPlan,
  getPhases,
  getPlanBlocksForWeek,
  getAttachableRoutines,
  getRoutineBlocks,
  getWorkBlockItems,
  currentWeek,
  phaseForWeek,
  type PlanRow,
  type PhaseRow,
  type WorkBlockRow,
  type WorkBlockItemRow,
} from "../../data/plan.ts";
import {
  addItem,
  removeItem,
  reorderActive,
  setItemSets,
} from "../../data/planEditor.ts";
import { useDb } from "../db/DbProvider.tsx";
import { ExercisePicker } from "../session/ExercisePicker.tsx";
import { progressionLabel } from "../labels.ts";

// Um bloco editavel: lista os itens ATIVOS com series + reordenar/remover, e um
// "+ adicionar". Escritas serializadas (anti toque-rapido) + erro na tela.
function EditableBlock({ block }: { block: WorkBlockRow }) {
  const db = useDb();
  const [items, setItems] = useState<WorkBlockItemRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const reload = useCallback(async (): Promise<void> => {
    setItems(await getWorkBlockItems(db, block.id));
  }, [db, block.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function run(fn: () => Promise<unknown>): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function move(i: number, j: number): void {
    if (j < 0 || j >= items.length) return;
    const order = items.map((it) => it.id);
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
    void run(() => reorderActive(db, block.id, order));
  }

  function commitSets(it: WorkBlockItemRow, raw: string): void {
    const v = raw.trim();
    const n = v === "" ? null : Number(v);
    if (n === (it.planned_sets ?? null)) return; // sem mudanca
    void run(() => setItemSets(db, it.id, n));
  }

  return (
    <section className="card">
      <h2 className="card-title">{block.name}</h2>
      {error !== null && <div className="error-box">{error}</div>}

      {items.length === 0 && (
        <p className="muted">Sem exercícios. Adicione abaixo.</p>
      )}

      {items.map((it, i) => (
        <div className="edit-item" key={it.id}>
          <div className="edit-item-main">
            <div className="exrow-name">{it.exercise_name}</div>
            <div className="exrow-note muted">
              {progressionLabel(it.progression_type)}
            </div>
          </div>
          <label className="edit-sets">
            <span className="muted">séries</span>
            <input
              className="edit-sets-input"
              type="number"
              min="1"
              inputMode="numeric"
              defaultValue={it.planned_sets ?? ""}
              disabled={busy}
              onBlur={(e) => commitSets(it, e.target.value)}
            />
          </label>
          <div className="item-move">
            <button
              type="button"
              className="iconbtn"
              aria-label="subir"
              disabled={busy || i === 0}
              onClick={() => move(i, i - 1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="iconbtn"
              aria-label="descer"
              disabled={busy || i === items.length - 1}
              onClick={() => move(i, i + 1)}
            >
              ↓
            </button>
            <button
              type="button"
              className="iconbtn iconbtn-danger"
              aria-label="remover"
              disabled={busy}
              onClick={() => void run(() => removeItem(db, it.id))}
            >
              ×
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        className="btn add-ex"
        disabled={busy}
        onClick={() => setAdding(true)}
      >
        + adicionar exercício
      </button>

      {adding && (
        <ExercisePicker
          title={`Adicionar a ${block.name}`}
          onPick={(ex) => {
            setAdding(false);
            void run(() => addItem(db, { workBlockId: block.id, exerciseId: ex.exerciseId }));
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </section>
  );
}

// Tela de edicao do plano (Bloco 3). Separada do treino ao vivo (brief §10.2).
// Mostra os blocos da semana escolhida + as rotinas anexaveis (mobilidade/core/
// domingo, onde vivem PNF/alongamento). A weekbar troca a semana — util para os
// blocos de salto, que mudam por fase.
export function PlanEditorScreen({ onDone }: { onDone: () => void }) {
  const db = useDb();
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [phases, setPhases] = useState<PhaseRow[]>([]);
  const [week, setWeek] = useState(1);
  const [blocks, setBlocks] = useState<WorkBlockRow[]>([]);
  const [routineBlocks, setRoutineBlocks] = useState<WorkBlockRow[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const p = await getPlan(db);
      if (!alive || p === undefined) return;
      const [ph, routines] = await Promise.all([
        getPhases(db, p.id),
        getAttachableRoutines(db),
      ]);
      const rb = (
        await Promise.all(routines.map((r) => getRoutineBlocks(db, r.id)))
      ).flat();
      if (!alive) return;
      setPlan(p);
      setPhases(ph);
      setRoutineBlocks(rb);
      setWeek(currentWeek(p, Date.now()));
    })();
    return () => {
      alive = false;
    };
  }, [db]);

  useEffect(() => {
    if (plan === null) return;
    let alive = true;
    void getPlanBlocksForWeek(db, plan.id, week).then((b) => {
      if (alive) setBlocks(b);
    });
    return () => {
      alive = false;
    };
  }, [db, plan, week]);

  if (plan === null) {
    return (
      <div className="screen">
        <p className="muted">Carregando…</p>
      </div>
    );
  }

  const phase = phaseForWeek(phases, week);
  const weeks = Array.from({ length: plan.duration_weeks }, (_, i) => i + 1);

  return (
    <div className="screen">
      <button type="button" className="linkbtn back-link" onClick={onDone}>
        ‹ Concluir
      </button>
      <h1 className="h1">Editar plano</h1>
      <p className="sub">
        Adicione, remova, reordene e mude as séries. Vale do plano pra frente — seu
        histórico de treino fica intacto.
      </p>

      <div className="weekbar" role="tablist" aria-label="Semana do plano">
        {weeks.map((w) => (
          <button
            key={w}
            type="button"
            className="weekchip"
            aria-pressed={w === week}
            onClick={() => setWeek(w)}
          >
            {w}
          </button>
        ))}
      </div>
      <p className="card-meta">
        Semana {week}
        {phase ? ` · ${phase.name}` : ""}. Blocos fixos (Ter/Qui/etc.) valem para
        todas as semanas; os de salto mudam por fase.
      </p>

      {blocks.map((b) => (
        <EditableBlock key={b.id} block={b} />
      ))}

      <h2 className="section-title">Rotinas (mobilidade / core / domingo)</h2>
      {routineBlocks.map((b) => (
        <EditableBlock key={b.id} block={b} />
      ))}
    </div>
  );
}
