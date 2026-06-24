// =============================================================================
// Hook da sessao ao vivo (Bloco D parte 2). Faz a I/O (persiste cada acao,
// SEMPRE com await) e mantem o estado em memoria (LiveItem[]).
//
// CONCORRENCIA (red team — bugs de perda de dado): toques rapidos no iPhone
// disparam acoes antes do setItems re-renderizar. Para nao colidir o
// UNIQUE(session_id, actual_sequence) nem ler estado velho:
//   1) `run()` SERIALIZA toda mutacao (uma de cada vez) e CAPTURA erro (surface
//      em `error` — nada de unhandled rejection invisivel no PWA).
//   2) `itemsRef` e a fonte fresca (lida dentro da mutacao, nao do closure).
//   3) `seqRef` da o proximo actual_sequence de forma SINCRONA e monotonica
//      (sem derivar de items velho) — dois persists nunca pegam a mesma seq.
//   4) start() so cria UMA sessao (guarda sessionIdRef).
// =============================================================================

import { useCallback, useEffect, useRef, useState } from "react";

import { useDb } from "../db/DbProvider.tsx";
import {
  getPlan,
  getPhases,
  getPlanBlocksForWeek,
  getWorkBlockItems,
  currentWeek,
  isoDayOfWeek,
  phaseForWeek,
} from "../../data/plan.ts";
import * as sessions from "../../data/sessions.ts";
import type { SetMeasures } from "../../data/sessions.ts";
import { createSerialQueue } from "../../db/concurrency.ts";
import {
  plannedToLiveItems,
  moveItem,
  patchItem,
  type LiveItem,
} from "./sessionModel.ts";
import type {
  InterferenceWarning,
  SessionPlanItem,
} from "../../engine/decision/interference.ts";
import type { DeviationReason, ProgressionType } from "../../domain/types.ts";

export type SessionPhase = "checking" | "idle" | "active" | "ended";

export interface ExerciseChoice {
  exerciseId: string;
  exerciseName: string;
  progressionType: ProgressionType;
}

export interface LiveSessionApi {
  phase: SessionPhase;
  hasActive: boolean;
  todayLabel: string;
  items: LiveItem[];
  warning: InterferenceWarning | null;
  error: string | null;
  clearError: () => void;
  start: () => void;
  resume: () => void;
  logSet: (localKey: string, measures: SetMeasures, rpe: number | null) => Promise<void>;
  skip: (localKey: string, reason: DeviationReason) => void;
  substitute: (localKey: string, sub: ExerciseChoice, reason: DeviationReason) => void;
  addAdhoc: (ex: ExerciseChoice) => void;
  move: (from: number, to: number) => void;
  finalize: () => void;
}

export function useLiveSession(): LiveSessionApi {
  const db = useDb();
  const [phase, setPhase] = useState<SessionPhase>("checking");
  const [hasActive, setHasActive] = useState(false);
  const [items, setItems] = useState<LiveItem[]>([]);
  const [warning, setWarning] = useState<InterferenceWarning | null>(null);
  const [todayLabel, setTodayLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const itemsRef = useRef<LiveItem[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const seqRef = useRef(1); // proximo actual_sequence (monotonico)
  // Serializa as mutacoes via a primitiva TESTADA (concurrency.test.ts).
  const enqueueRef = useRef(createSerialQueue());

  // Atualiza o ref (fresco) E o estado (render) juntos.
  const commit = useCallback((next: LiveItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  // Proximo actual_sequence — sincrono (le+incrementa sem await no meio).
  const takeSeq = useCallback((): number => {
    const s = seqRef.current;
    seqRef.current = s + 1;
    return s;
  }, []);

  // Serializa qualquer mutacao + captura erro (surface em `error`). NAO limpa o
  // erro no sucesso (red team): um save bem-sucedido nao pode apagar o aviso de
  // uma falha anterior cujo dado se perdeu — so clearError()/nova falha trocam.
  const run = useCallback((fn: () => Promise<void>): Promise<void> => {
    return enqueueRef.current(async () => {
      try {
        await fn();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Nao consegui salvar: ${msg}`);
      }
    });
  }, []);

  const clearError = useCallback((): void => setError(null), []);

  useEffect(() => {
    let alive = true;
    void sessions.getActiveSession(db).then((s) => {
      if (!alive) return;
      setHasActive(s !== undefined);
      setPhase("idle");
    });
    return () => {
      alive = false;
    };
  }, [db]);

  const start = useCallback((): void => {
    void run(async () => {
      if (sessionIdRef.current !== null) return; // ja iniciada (anti duplo-start)
      const plan = await getPlan(db);
      const now = new Date();
      if (plan === undefined) {
        const sid = await sessions.startTodaySession(db, { planId: null, workBlockId: null, now: now.getTime() });
        sessionIdRef.current = sid;
        seqRef.current = 1;
        commit([]);
        setWarning(null);
        setTodayLabel("Sessao livre");
        setPhase("active");
        return;
      }
      const phases = await getPhases(db, plan.id);
      const week = currentWeek(plan, now.getTime());
      const iso = isoDayOfWeek(now);
      const blocks = await getPlanBlocksForWeek(db, plan.id, week);
      const block = blocks.find((b) => b.day_of_week === iso) ?? null;
      const phaseName = phaseForWeek(phases, week)?.name ?? "";
      const planned = block ? await getWorkBlockItems(db, block.id) : [];

      const sid = await sessions.startTodaySession(db, {
        planId: plan.id,
        workBlockId: block?.id ?? null,
        now: now.getTime(),
      });
      const planItems: SessionPlanItem[] = planned.map((p) => ({
        exerciseId: p.exercise_id,
        acuteInterference: p.acute_interference === 1,
        progressionType: p.progression_type,
        plannedSequence: p.planned_sequence,
      }));
      const w = await sessions.applyInterferenceGate(db, sid, planItems);

      sessionIdRef.current = sid;
      seqRef.current = 1;
      commit(plannedToLiveItems(planned));
      setWarning(w);
      setTodayLabel(block ? `Semana ${week} · ${phaseName}` : "Sessao livre (sem bloco hoje)");
      setPhase("active");
    });
  }, [db, run, commit]);

  const resume = useCallback((): void => {
    void run(async () => {
      if (sessionIdRef.current !== null) return; // ja retomada/ativa
      const active = await sessions.getActiveSession(db);
      if (active === undefined) {
        setPhase("idle");
        setHasActive(false);
        return;
      }
      const planned = active.work_block_id
        ? await getWorkBlockItems(db, active.work_block_id)
        : [];
      const persisted = await sessions.getSessionItems(db, active.id);

      const persistedLive: LiveItem[] = [];
      const coveredWbi = new Set<string>();
      let maxSeq = 0;
      for (const si of persisted) {
        maxSeq = Math.max(maxSeq, si.actual_sequence);
        const setRows = await sessions.getSessionSets(db, si.id);
        const status =
          si.status === "added_adhoc"
            ? ("added" as const)
            : si.status === "substituted"
              ? ("substituted" as const)
              : si.status === "skipped"
                ? ("skipped" as const)
                : ("done" as const);
        if (si.work_block_item_id) coveredWbi.add(si.work_block_item_id);
        persistedLive.push({
          localKey: si.id,
          sessionItemId: si.id,
          exerciseId: si.exercise_id,
          exerciseName: si.exercise_name,
          progressionType: si.progression_type,
          workBlockItemId: si.work_block_item_id,
          isWarmup: si.is_warmup === 1,
          status,
          sets: setRows.map((r) => ({
            setIndex: r.set_index,
            measures: sessions.setRowToMeasures(r),
            rpe: r.rpe,
          })),
        });
      }
      const untouched = plannedToLiveItems(
        planned.filter((p) => !coveredWbi.has(p.id)),
      );

      sessionIdRef.current = active.id;
      seqRef.current = maxSeq + 1; // proximo seq fica acima de tudo que existe
      commit([...persistedLive, ...untouched]);
      setWarning(null);
      setTodayLabel("Sessao retomada");
      setPhase("active");
    });
  }, [db, run, commit]);

  const logSet = useCallback(
    (localKey: string, measures: SetMeasures, rpe: number | null): Promise<void> =>
      run(async () => {
        const sid = sessionIdRef.current;
        if (sid === null) throw new Error("A sessao nao esta ativa — recomece o treino.");
        const item = itemsRef.current.find((i) => i.localKey === localKey);
        if (item === undefined) return;
        const now = Date.now();
        let sessionItemId = item.sessionItemId;
        if (sessionItemId === null) {
          sessionItemId = await sessions.markItemDone(db, {
            sessionId: sid,
            exerciseId: item.exerciseId,
            workBlockItemId: item.workBlockItemId,
            actualSequence: takeSeq(),
            isWarmup: item.isWarmup,
            now,
          });
        }
        const setIndex = item.sets.length + 1;
        await sessions.writeSet(db, { sessionItemId, setIndex, measures, rpe, now });
        const persistedId = sessionItemId;
        commit(
          patchItem(itemsRef.current, localKey, (it) => ({
            ...it,
            sessionItemId: persistedId,
            status: it.status === "planned" ? "done" : it.status,
            sets: [...it.sets, { setIndex, measures, rpe }],
          })),
        );
      }),
    [db, run, commit, takeSeq],
  );

  const skip = useCallback(
    (localKey: string, reason: DeviationReason): void => {
      void run(async () => {
        const sid = sessionIdRef.current;
        if (sid === null) return;
        const item = itemsRef.current.find((i) => i.localKey === localKey);
        if (item === undefined || item.status !== "planned") return;
        await sessions.skipItem(db, {
          sessionId: sid,
          exerciseId: item.exerciseId,
          workBlockItemId: item.workBlockItemId,
          actualSequence: takeSeq(),
          reason,
          isWarmup: item.isWarmup,
          now: Date.now(),
        });
        commit(patchItem(itemsRef.current, localKey, (it) => ({ ...it, status: "skipped" })));
      });
    },
    [db, run, commit, takeSeq],
  );

  const substitute = useCallback(
    (localKey: string, sub: ExerciseChoice, reason: DeviationReason): void => {
      void run(async () => {
        const sid = sessionIdRef.current;
        if (sid === null) return;
        const item = itemsRef.current.find((i) => i.localKey === localKey);
        // So substitui PLANEJADO intocado (anti orfao de session_set).
        if (item === undefined || item.workBlockItemId === null || item.status !== "planned") return;
        const newItemId = await sessions.substituteItem(db, {
          sessionId: sid,
          substituteExerciseId: sub.exerciseId,
          plannedWorkBlockItemId: item.workBlockItemId,
          actualSequence: takeSeq(),
          reason,
          isWarmup: item.isWarmup,
          now: Date.now(),
        });
        commit(
          patchItem(itemsRef.current, localKey, (it) => ({
            ...it,
            sessionItemId: newItemId,
            exerciseId: sub.exerciseId,
            exerciseName: sub.exerciseName,
            progressionType: sub.progressionType,
            status: "substituted",
            sets: [],
          })),
        );
      });
    },
    [db, run, commit, takeSeq],
  );

  const addAdhoc = useCallback(
    (ex: ExerciseChoice): void => {
      void run(async () => {
        const sid = sessionIdRef.current;
        if (sid === null) return;
        const id = await sessions.addAdhocItem(db, {
          sessionId: sid,
          exerciseId: ex.exerciseId,
          actualSequence: takeSeq(),
          now: Date.now(),
        });
        commit([
          ...itemsRef.current,
          {
            localKey: id,
            sessionItemId: id,
            exerciseId: ex.exerciseId,
            exerciseName: ex.exerciseName,
            progressionType: ex.progressionType,
            workBlockItemId: null,
            isWarmup: false,
            status: "added",
            sets: [],
          },
        ]);
      });
    },
    [db, run, commit, takeSeq],
  );

  const move = useCallback(
    (from: number, to: number): void => {
      void run(async () => {
        const sid = sessionIdRef.current;
        const before = itemsRef.current;
        const reordered = moveItem(before, from, to);
        commit(reordered);
        const persistedIds = reordered
          .filter((i) => i.sessionItemId !== null)
          .map((i) => i.sessionItemId as string);
        if (sid !== null && persistedIds.length > 0) {
          try {
            await sessions.resequenceItems(db, sid, persistedIds);
          } catch (e) {
            commit(before); // reverte o reorder otimista se a persistencia falhar
            throw e;
          }
        }
      });
    },
    [db, run, commit],
  );

  const finalize = useCallback((): void => {
    void run(async () => {
      const sid = sessionIdRef.current;
      if (sid === null) return;
      await sessions.endSession(db, sid, Date.now());
      sessionIdRef.current = null;
      setPhase("ended");
      setHasActive(false);
    });
  }, [db, run]);

  return {
    phase,
    hasActive,
    todayLabel,
    items,
    warning,
    error,
    clearError,
    start,
    resume,
    logSet,
    skip,
    substitute,
    addAdhoc,
    move,
    finalize,
  };
}
