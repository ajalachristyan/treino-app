import { describe, it, expect } from "vitest";

import type { WorkBlockItemRow } from "../../data/plan.ts";
import type { SetMeasures } from "../../data/sessions.ts";
import type { Prescription } from "../../engine/decision/prescription.ts";
import type { SessionItemHistory } from "../../engine/decision/progression.ts";
import {
  plannedToLiveItems,
  moveItem,
  patchItem,
  liveItemToPrescriptionItem,
  sessionSuggestion,
  applyPrescriptionToPrefill,
  applySubstitution,
  lastExecutionSummary,
  type LiveItem,
} from "./sessionModel.ts";

function wbi(over: Partial<WorkBlockItemRow>): WorkBlockItemRow {
  return {
    id: "wbi_x",
    exercise_id: "ex_x",
    exercise_name: "Exercicio X",
    progression_type: "load_reps",
    load_type: "barbell",
    priority: "primary",
    planned_sequence: 1,
    planned_sets: null,
    notes: null,
    is_warmup: 0,
    acute_interference: 0,
    function_tag: null,
    rep_min: null,
    rep_max: null,
    ...over,
  };
}

describe("sessionModel", () => {
  it("plannedToLiveItems: mapeia campos, status planned, sem linha, chaves unicas", () => {
    const items = plannedToLiveItems([
      wbi({ id: "wbi_1", exercise_id: "ex_a", exercise_name: "A", is_warmup: 1 }),
      wbi({
        id: "wbi_2",
        exercise_id: "ex_b",
        exercise_name: "B",
        function_tag: "forca_maxima_agachamento",
        planned_sets: 3,
        rep_min: 5,
        rep_max: 8,
      }),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      sessionItemId: null,
      exerciseId: "ex_a",
      exerciseName: "A",
      workBlockItemId: "wbi_1",
      isWarmup: true,
      status: "planned",
    });
    expect(items[0]?.sets).toEqual([]);
    // chaves de React unicas
    expect(items[0]?.localKey).not.toBe(items[1]?.localKey);
    // W3.1: os campos que a prescricao por fase consome sao threaded pro LiveItem
    expect(items[1]).toMatchObject({
      functionTag: "forca_maxima_agachamento",
      plannedSets: 3,
      repMin: 5,
      repMax: 8,
    });
    // sem faixa/tag no cadastro => null (defaults do wbi)
    expect(items[0]?.functionTag).toBeNull();
    expect(items[0]?.plannedSets).toBeNull();
    expect(items[0]?.repMin).toBeNull();
    expect(items[0]?.repMax).toBeNull();
  });

  it("plannedToLiveItems: threada o load_type do cadastro pro LiveItem (B3)", () => {
    const items = plannedToLiveItems([
      wbi({ id: "wbi_barra", exercise_id: "ex_barra", load_type: "bodyweight" }),
      wbi({ id: "wbi_squat", exercise_id: "ex_squat", load_type: "barbell" }),
    ]);
    expect(items[0]?.loadType).toBe("bodyweight");
    expect(items[1]?.loadType).toBe("barbell");
  });

  it("moveItem: reordena imutavelmente; indices invalidos -> copia inalterada", () => {
    const base: LiveItem[] = ["a", "b", "c"].map((k) => ({
      localKey: k,
      sessionItemId: null,
      exerciseId: k,
      exerciseName: k,
      progressionType: "load_reps",
      loadType: "barbell",
      workBlockItemId: null,
      isWarmup: false,
      status: "planned",
      sets: [],
      functionTag: null,
      plannedSets: null,
      repMin: null,
      repMax: null,
    }));
    expect(moveItem(base, 0, 2).map((i) => i.localKey)).toEqual(["b", "c", "a"]);
    expect(moveItem(base, 2, 0).map((i) => i.localKey)).toEqual(["c", "a", "b"]);
    expect(moveItem(base, 0, 9).map((i) => i.localKey)).toEqual(["a", "b", "c"]);
    expect(moveItem(base, 1, 1).map((i) => i.localKey)).toEqual(["a", "b", "c"]);
    // imutavel: nao muta o original
    moveItem(base, 0, 2);
    expect(base.map((i) => i.localKey)).toEqual(["a", "b", "c"]);
  });

  it("patchItem: aplica o patch so no item alvo", () => {
    const base: LiveItem[] = ["a", "b"].map((k) => ({
      localKey: k,
      sessionItemId: null,
      exerciseId: k,
      exerciseName: k,
      progressionType: "load_reps",
      loadType: "barbell",
      workBlockItemId: null,
      isWarmup: false,
      status: "planned",
      sets: [],
      functionTag: null,
      plannedSets: null,
      repMin: null,
      repMax: null,
    }));
    const next = patchItem(base, "b", (it) => ({ ...it, status: "skipped" }));
    expect(next[0]?.status).toBe("planned");
    expect(next[1]?.status).toBe("skipped");
    expect(base[1]?.status).toBe("planned"); // original intacto
  });
});

describe("sessionModel — prescricao por fase (W3b)", () => {
  const SQUAT_ITEM: LiveItem = {
    localKey: "k1",
    sessionItemId: null,
    exerciseId: "ex_back_squat",
    exerciseName: "Back squat",
    progressionType: "load_reps",
    loadType: "barbell",
    workBlockItemId: "wbi_ter_2",
    isWarmup: false,
    status: "planned",
    sets: [],
    functionTag: "forca_maxima_agachamento",
    plannedSets: 3,
    repMin: 5,
    repMax: 8,
  };

  it("liveItemToPrescriptionItem: extrai os campos que o motor consome", () => {
    expect(liveItemToPrescriptionItem(SQUAT_ITEM)).toEqual({
      exerciseId: "ex_back_squat",
      functionTag: "forca_maxima_agachamento",
      progressionType: "load_reps",
      repMin: 5,
      repMax: 8,
      plannedSets: 3,
    });
  });

  it("sessionSuggestion: sem fase (phaseEmphasis null) => null (nao sugere)", () => {
    expect(sessionSuggestion(SQUAT_ITEM, null, null, [])).toBeNull();
  });

  it("sessionSuggestion: M1 na forca primaria => dupla progressao, sem recuperacao", () => {
    const s = sessionSuggestion(SQUAT_ITEM, "m1", "m1", []);
    expect(s?.mode).toBe("double_progression");
    expect(s?.recovery).toBe("none");
  });

  it("sessionSuggestion: semana de deload encolhe (recovery=deload)", () => {
    const s = sessionSuggestion(SQUAT_ITEM, "m1", "deload", []);
    expect(s?.recovery).toBe("deload");
  });

  it("applyPrescriptionToPrefill: sobrescreve SO a carga do load_reps pela sugestao", () => {
    const base: SetMeasures = { progressionType: "load_reps", reps: 5, loadKg: 100 };
    const presc: Prescription = {
      mode: "double_progression",
      sets: 3,
      repRange: { min: 5, max: 8 },
      suggestedLoadKg: 110,
      intensityHintPct: null,
      recovery: "none",
    };
    expect(applyPrescriptionToPrefill(base, presc)).toEqual({
      progressionType: "load_reps",
      reps: 5,
      loadKg: 110,
    });
  });

  it("applyPrescriptionToPrefill: sem carga sugerida nao mexe; base undefined => em branco", () => {
    const presc: Prescription = {
      mode: "double_progression",
      sets: 3,
      repRange: { min: 5, max: 8 },
      suggestedLoadKg: null,
      intensityHintPct: null,
      recovery: "none",
    };
    const base: SetMeasures = { progressionType: "load_reps", reps: 5, loadKg: 100 };
    expect(applyPrescriptionToPrefill(base, presc)).toEqual(base);
    expect(applyPrescriptionToPrefill(undefined, presc)).toBeUndefined();
  });

  it("applySubstitution: troca o exercicio, zera series e RESETA insumos de prescricao (I-15)", () => {
    const sub = applySubstitution(
      SQUAT_ITEM,
      {
        exerciseId: "ex_leg_press",
        exerciseName: "Leg press",
        progressionType: "load_reps",
        loadType: "barbell",
      },
      "si_new",
    );
    expect(sub.exerciseId).toBe("ex_leg_press");
    expect(sub.status).toBe("substituted");
    expect(sub.sessionItemId).toBe("si_new");
    expect(sub.sets).toEqual([]);
    expect(sub.workBlockItemId).toBe("wbi_ter_2"); // preserva o planejado (I-15)
    // o substituto NAO herda a tag/faixa do agachamento planejado:
    expect(sub.functionTag).toBeNull();
    expect(sub.plannedSets).toBeNull();
    expect(sub.repMin).toBeNull();
    expect(sub.repMax).toBeNull();
  });

  it("applySubstitution: threada o loadType do substituto (B3 — substituto pode ser peso corporal)", () => {
    const sub = applySubstitution(
      SQUAT_ITEM,
      {
        exerciseId: "ex_pistol",
        exerciseName: "Pistol squat",
        progressionType: "load_reps",
        loadType: "bodyweight",
      },
      "si_new",
    );
    expect(sub.loadType).toBe("bodyweight"); // nao herda o 'barbell' do agachamento
  });
});

describe("sessionModel — lastExecutionSummary (B1: o que superar)", () => {
  const hist = (
    sets: ReadonlyArray<{ reps: number; loadKg: number }>,
  ): SessionItemHistory => ({
    sessionId: "s",
    exerciseId: "ex_x",
    status: "done",
    isWarmup: false,
    sets,
  });

  it("sem historico => null", () => {
    expect(lastExecutionSummary([])).toBeNull();
  });

  it("execucao sem series => null", () => {
    expect(lastExecutionSummary([hist([])])).toBeNull();
  });

  it("carga uniforme => 'X kg · reps por serie'", () => {
    const h = [
      hist([
        { reps: 8, loadKg: 40 },
        { reps: 8, loadKg: 40 },
        { reps: 7, loadKg: 40 },
      ]),
    ];
    expect(lastExecutionSummary(h)).toBe("40 kg · 8, 8, 7");
  });

  it("cargas variando => 'carga×reps' por serie", () => {
    const h = [
      hist([
        { reps: 8, loadKg: 40 },
        { reps: 6, loadKg: 42.5 },
      ]),
    ];
    expect(lastExecutionSummary(h)).toBe("40 kg×8, 42.5 kg×6");
  });

  it("carga 0 (bodyweight) => 'peso corporal'", () => {
    const h = [
      hist([
        { reps: 10, loadKg: 0 },
        { reps: 8, loadKg: 0 },
      ]),
    ];
    expect(lastExecutionSummary(h)).toBe("peso corporal · 10, 8");
  });

  it("usa a execucao MAIS RECENTE (ultima do array ascendente)", () => {
    const h = [hist([{ reps: 5, loadKg: 100 }]), hist([{ reps: 8, loadKg: 110 }])];
    expect(lastExecutionSummary(h)).toBe("110 kg · 8");
  });
});
