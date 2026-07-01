/**
 * Trava de progressao (decisao do dono 2026-07-01): a carga so sobe se a
 * MAIORIA (~2/3) das series PRESCRITAS foi cumprida no topo da faixa — sessao
 * pela metade nao progride ("pular caminho nao conta"). So aplica quando ha
 * `planned_sets` conhecido; senao degrada pro criterio classico da dupla
 * progressao (todas as series feitas no topo).
 *
 * Testes DISCRIMINANTES: isolam a contagem de series (2 de 3 vs 1 de 3) e o
 * degrade (sem planned_sets). Nunca validam a fracao 2/3 diretamente.
 */
import { describe, expect, it } from "vitest";

import {
  shouldProgressExercise,
  type SessionItemHistory,
} from "./progression.ts";

const RANGE = { min: 5, max: 8 } as const;

// Uma execucao do back_squat com N series de trabalho, cada uma com `reps`.
function session(reps: number[]): SessionItemHistory {
  return {
    sessionId: "s1",
    exerciseId: "back_squat",
    status: "done",
    isWarmup: false,
    sets: reps.map((r) => ({ reps: r, loadKg: 100 })),
  };
}

describe("trava de progressao — maioria (~2/3) das series prescritas no topo", () => {
  it("3 de 3 series no topo => progride", () => {
    expect(shouldProgressExercise("back_squat", [session([8, 8, 8])], RANGE, 3)).toBe(true);
  });

  it("2 de 3 series no topo (perdeu 1) => AINDA progride (maioria)", () => {
    expect(shouldProgressExercise("back_squat", [session([8, 8])], RANGE, 3)).toBe(true);
  });

  it("TRAVA: 1 de 3 series no topo => NAO progride", () => {
    expect(shouldProgressExercise("back_squat", [session([8])], RANGE, 3)).toBe(false);
  });

  it("DEGRADE: sem planned_sets (null), 1 serie no topo => progride (sem trava)", () => {
    expect(shouldProgressExercise("back_squat", [session([8])], RANGE, null)).toBe(true);
  });

  it("series completas mas fora do topo => NAO progride (dupla progressao intacta)", () => {
    expect(shouldProgressExercise("back_squat", [session([8, 8, 7])], RANGE, 3)).toBe(false);
  });
});
