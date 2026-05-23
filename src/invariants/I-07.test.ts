/**
 * I-7 — Aquecimento fora do log de progressao.
 * Brief §9: "Itens de aquecimento nao entram em calculo de progressao/volume."
 *
 * Par discriminante em #12/#12b: warmup-only NAO progride vs trabalho-no-topo
 * progride. Prova que a funcao discrimina, nao nega tudo.
 */
import { describe, expect, it } from "vitest";

import { volumeByBlock } from "../engine/derivations.ts";
import {
  shouldProgressExercise,
  type SessionItemHistory,
} from "../engine/decision/progression.ts";

describe("I-07 — warmup fora de progressao/volume", () => {
  it("volumeByBlock EXCLUI itens com isWarmup=true", () => {
    const items = [
      {
        isWarmup: true,
        sets: [
          { reps: 10, loadKg: 50 },
          { reps: 10, loadKg: 50 },
        ],
      }, // warmup: 500+500 = 1000 (deveria ser ignorado)
      {
        isWarmup: false,
        sets: [
          { reps: 5, loadKg: 100 },
          { reps: 5, loadKg: 100 },
        ],
      }, // work: 500+500 = 1000
      { isWarmup: false, sets: [{ reps: 5, loadKg: 100 }] }, // work: 500
    ];
    expect(volumeByBlock(items)).toBe(1500); // 1000 + 500
  });

  it("shouldProgressExercise ignora itens warmup (warmup-only NAO progride)", () => {
    const history: SessionItemHistory[] = [
      {
        sessionId: "s1",
        exerciseId: "back_squat",
        status: "done",
        isWarmup: true,
        sets: [
          { reps: 8, loadKg: 100 },
          { reps: 8, loadKg: 100 },
          { reps: 8, loadKg: 100 },
        ], // topo do rep_range em todas
      },
    ];
    expect(
      shouldProgressExercise("back_squat", history, { min: 5, max: 8 }),
    ).toBe(false);
  });

  it("DISCRIMINANTE: item com series de TRABALHO no topo do rep_range PROGRIDE", () => {
    const history: SessionItemHistory[] = [
      {
        sessionId: "s1",
        exerciseId: "back_squat",
        status: "done",
        isWarmup: false,
        sets: [
          { reps: 8, loadKg: 100 },
          { reps: 8, loadKg: 100 },
          { reps: 8, loadKg: 100 },
        ],
      },
    ];
    expect(
      shouldProgressExercise("back_squat", history, { min: 5, max: 8 }),
    ).toBe(true);
  });
});
