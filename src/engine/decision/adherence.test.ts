/**
 * Aderencia (peca 1 da camada de aderencia+prontidao — spec 2026-07-01).
 *
 * Puro: recebe ocorrencias PLANEJADAS de exercicio (cada uma com priority e se
 * foi feita) e resume — geral, por prioridade, e a sequencia FINAL de
 * "largou exercicio primary" (pro aviso de negligencia).
 *
 * Testes DISCRIMINANTES: isolam a ponderacao por prioridade (mesmas faltas em
 * primary vs accessory) e a contagem de sequencia final. Sem numero magico.
 */
import { describe, expect, it } from "vitest";

import {
  computeAdherence,
  type PlannedOccurrence,
} from "./adherence.ts";

function occ(
  exerciseId: string,
  priority: PlannedOccurrence["priority"],
  done: boolean,
  order: number,
): PlannedOccurrence {
  return { exerciseId, priority, done, order };
}

describe("computeAdherence — contagem geral e por prioridade", () => {
  it("vazio => tudo zero, sem negligencia", () => {
    const s = computeAdherence([]);
    expect(s.planned).toBe(0);
    expect(s.done).toBe(0);
    expect(s.pct).toBe(0);
    expect(s.byPriority.primary).toEqual({ planned: 0, done: 0 });
    expect(s.primaryNeglectStreak).toEqual({});
  });

  it("conta planejado/feito, pct geral e separa por prioridade", () => {
    const s = computeAdherence([
      occ("back_squat", "primary", true, 1),
      occ("back_squat", "primary", true, 2),
      occ("hip_thrust", "accessory", false, 3),
      occ("tibial", "finisher", true, 4),
    ]);
    expect(s.planned).toBe(4);
    expect(s.done).toBe(3);
    expect(s.pct).toBeCloseTo(0.75);
    expect(s.byPriority.primary).toEqual({ planned: 2, done: 2 });
    expect(s.byPriority.accessory).toEqual({ planned: 1, done: 0 });
    expect(s.byPriority.finisher).toEqual({ planned: 1, done: 1 });
  });
});

describe("computeAdherence — negligencia de exercicio primary (sequencia final)", () => {
  it("primary largado nas 2 ultimas vezes => streak 2", () => {
    const s = computeAdherence([
      occ("back_squat", "primary", true, 1),
      occ("back_squat", "primary", false, 2),
      occ("back_squat", "primary", false, 3),
    ]);
    expect(s.primaryNeglectStreak["back_squat"]).toBe(2);
  });

  it("primary largado e depois RETOMADO => sem streak (nao acumula do passado)", () => {
    const s = computeAdherence([
      occ("back_squat", "primary", false, 1),
      occ("back_squat", "primary", false, 2),
      occ("back_squat", "primary", true, 3), // retomou na ultima
    ]);
    expect(s.primaryNeglectStreak["back_squat"] ?? 0).toBe(0);
  });

  it("DISCRIMINANTE: as MESMAS faltas num ACCESSORY nao entram em primaryNeglectStreak", () => {
    const s = computeAdherence([
      occ("hip_thrust", "accessory", false, 1),
      occ("hip_thrust", "accessory", false, 2),
    ]);
    expect(s.primaryNeglectStreak["hip_thrust"]).toBeUndefined();
  });
});
