// =============================================================================
// Hook da sessao ao vivo (Bloco D parte 2). Faz a I/O (persiste cada acao,
// SEMPRE com await — red team: fire-and-forget perderia a ultima escrita ao ir
// pra background no iOS) e mantem o estado em memoria (LiveItem[]).
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
  start: () => Promise<void>;
  resume: () => Promise<void>;
  logSet: (localKey: string, measures: SetMeasures, rpe: number | null) => Promise<void>;
  skip: (localKey: string, reason: DeviationReason) => Promise<void>;
  substitute: (localKey: string, sub: ExerciseChoice, reason: DeviationReason) => Promise<void>;
  addAdhoc: (ex: ExerciseChoice) => Promise<void>;
  move: (from: number, to: number) => Promise<void>;
  finalize: () => Promise<void>;
}

const nowMs = (): number => Date.now();

export function useLiveSession(): LiveSessionApi {
  const db = useDb();
  const [phase, setPhase] = useState<SessionPhase>("checking");
  const [hasActive, setHasActive] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [items, setItems] = useState<LiveItem[]>([]);
  const [warning, setWarning] = useState<InterferenceWarning | null>(null);
  const [todayLabel, setTodayLabel] = useState("");

  // Guarda contra duplo-persist do MESMO item (ex.: dois toques rapidos no
  // "salvar serie" de um item planejado criariam duas session_item).
  const inFlight = useRef<Set<string>>(new Set());

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

  // Sequencia (actual_sequence) do proximo item persistido = ordem de execucao.
  const nextSequence = useCallback(
    (list: readonly LiveItem[]): number =>
      list.filter((i) => i.sessionItemId !== null).length + 1,
    [],
  );

  const start = useCallback(async () => {
    const plan = await getPlan(db);
    const now = new Date();
    if (plan === undefined) {
      const sid = await sessions.startTodaySession(db, { planId: null, workBlockId: null, now: now.getTime() });
      setSessionId(sid);
      setItems([]);
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

    // I-13: gate sobre os itens planejados (avisa, nao bloqueia).
    const planItems: SessionPlanItem[] = planned.map((p) => ({
      exerciseId: p.exercise_id,
      acuteInterference: p.acute_interference === 1,
      progressionType: p.progression_type,
      plannedSequence: p.planned_sequence,
    }));
    const w = await sessions.applyInterferenceGate(db, sid, planItems);

    setSessionId(sid);
    setItems(plannedToLiveItems(planned));
    setWarning(w);
    setTodayLabel(block ? `Semana ${week} · ${phaseName}` : "Sessao livre (sem bloco hoje)");
    setPhase("active");
  }, [db]);

  const resume = useCallback(async () => {
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

    // Itens persistidos viram LiveItem com seus sets reconstruidos.
    const persistedLive: LiveItem[] = [];
    const coveredWbi = new Set<string>();
    for (const si of persisted) {
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
    // Planejados ainda nao tocados ficam como 'planned'.
    const untouched = plannedToLiveItems(
      planned.filter((p) => !coveredWbi.has(p.id)),
    );

    setSessionId(active.id);
    setItems([...persistedLive, ...untouched]);
    setWarning(null);
    setTodayLabel("Sessao retomada");
    setPhase("active");
  }, [db]);

  const logSet = useCallback(
    async (localKey: string, measures: SetMeasures, rpe: number | null) => {
      const sid = sessionId;
      if (sid === null || inFlight.current.has(localKey)) return;
      const item = items.find((i) => i.localKey === localKey);
      if (item === undefined) return;
      inFlight.current.add(localKey);
      try {
        const now = nowMs();
        let sessionItemId = item.sessionItemId;
        if (sessionItemId === null) {
          sessionItemId = await sessions.markItemDone(db, {
            sessionId: sid,
            exerciseId: item.exerciseId,
            workBlockItemId: item.workBlockItemId,
            actualSequence: nextSequence(items),
            isWarmup: item.isWarmup,
            now,
          });
        }
        const setIndex = item.sets.length + 1;
        await sessions.writeSet(db, { sessionItemId, setIndex, measures, rpe, now });
        const persistedId = sessionItemId;
        setItems((prev) =>
          patchItem(prev, localKey, (it) => ({
            ...it,
            sessionItemId: persistedId,
            status: it.status === "planned" ? "done" : it.status,
            sets: [...it.sets, { setIndex, measures, rpe }],
          })),
        );
      } finally {
        inFlight.current.delete(localKey);
      }
    },
    [db, sessionId, items, nextSequence],
  );

  const skip = useCallback(
    async (localKey: string, reason: DeviationReason) => {
      const sid = sessionId;
      if (sid === null) return;
      const item = items.find((i) => i.localKey === localKey);
      if (item === undefined || item.status !== "planned") return;
      await sessions.skipItem(db, {
        sessionId: sid,
        exerciseId: item.exerciseId,
        workBlockItemId: item.workBlockItemId,
        actualSequence: nextSequence(items),
        reason,
        isWarmup: item.isWarmup,
        now: nowMs(),
      });
      setItems((prev) =>
        patchItem(prev, localKey, (it) => ({ ...it, status: "skipped" })),
      );
    },
    [db, sessionId, items, nextSequence],
  );

  const substitute = useCallback(
    async (localKey: string, sub: ExerciseChoice, reason: DeviationReason) => {
      const sid = sessionId;
      if (sid === null) return;
      const item = items.find((i) => i.localKey === localKey);
      if (item === undefined || item.workBlockItemId === null) return;
      const newId = await sessions.substituteItem(db, {
        sessionId: sid,
        substituteExerciseId: sub.exerciseId,
        plannedWorkBlockItemId: item.workBlockItemId,
        actualSequence: nextSequence(items),
        reason,
        isWarmup: item.isWarmup,
        now: nowMs(),
      });
      setItems((prev) =>
        patchItem(prev, localKey, (it) => ({
          ...it,
          sessionItemId: newId,
          exerciseId: sub.exerciseId,
          exerciseName: sub.exerciseName,
          progressionType: sub.progressionType,
          status: "substituted",
          sets: [],
        })),
      );
    },
    [db, sessionId, items, nextSequence],
  );

  const addAdhoc = useCallback(
    async (ex: ExerciseChoice) => {
      const sid = sessionId;
      if (sid === null) return;
      const id = await sessions.addAdhocItem(db, {
        sessionId: sid,
        exerciseId: ex.exerciseId,
        actualSequence: nextSequence(items),
        now: nowMs(),
      });
      setItems((prev) => [
        ...prev,
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
    },
    [db, sessionId, items, nextSequence],
  );

  const move = useCallback(
    async (from: number, to: number) => {
      const sid = sessionId;
      const reordered = moveItem(items, from, to);
      setItems(reordered);
      const persistedIds = reordered
        .filter((i) => i.sessionItemId !== null)
        .map((i) => i.sessionItemId as string);
      if (sid !== null && persistedIds.length > 0) {
        await sessions.resequenceItems(db, sid, persistedIds);
      }
    },
    [db, sessionId, items],
  );

  const finalize = useCallback(async () => {
    const sid = sessionId;
    if (sid === null) return;
    await sessions.endSession(db, sid, nowMs());
    setPhase("ended");
    setHasActive(false);
  }, [db, sessionId]);

  return {
    phase,
    hasActive,
    todayLabel,
    items,
    warning,
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
