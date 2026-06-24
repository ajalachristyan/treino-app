import { describe, it, expect } from "vitest";

import type { WorkBlockItemRow } from "../../data/plan.ts";
import {
  plannedToLiveItems,
  moveItem,
  patchItem,
  type LiveItem,
} from "./sessionModel.ts";

function wbi(over: Partial<WorkBlockItemRow>): WorkBlockItemRow {
  return {
    id: "wbi_x",
    exercise_id: "ex_x",
    exercise_name: "Exercicio X",
    progression_type: "load_reps",
    priority: "primary",
    planned_sequence: 1,
    planned_sets: null,
    notes: null,
    is_warmup: 0,
    acute_interference: 0,
    function_tag: null,
    ...over,
  };
}

describe("sessionModel", () => {
  it("plannedToLiveItems: mapeia campos, status planned, sem linha, chaves unicas", () => {
    const items = plannedToLiveItems([
      wbi({ id: "wbi_1", exercise_id: "ex_a", exercise_name: "A", is_warmup: 1 }),
      wbi({ id: "wbi_2", exercise_id: "ex_b", exercise_name: "B" }),
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
  });

  it("moveItem: reordena imutavelmente; indices invalidos -> copia inalterada", () => {
    const base: LiveItem[] = ["a", "b", "c"].map((k) => ({
      localKey: k,
      sessionItemId: null,
      exerciseId: k,
      exerciseName: k,
      progressionType: "load_reps",
      workBlockItemId: null,
      isWarmup: false,
      status: "planned",
      sets: [],
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
      workBlockItemId: null,
      isWarmup: false,
      status: "planned",
      sets: [],
    }));
    const next = patchItem(base, "b", (it) => ({ ...it, status: "skipped" }));
    expect(next[0]?.status).toBe("planned");
    expect(next[1]?.status).toBe("skipped");
    expect(base[1]?.status).toBe("planned"); // original intacto
  });
});
