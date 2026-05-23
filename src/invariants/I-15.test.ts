/**
 * I-15 — Desvio nao progride o planejado.
 * Brief §9: "Item substituted/skipped nunca dispara progressao do exercicio
 * originalmente planejado."
 *
 * Refino R3 acordado: substituto SEMPRE progride a si mesmo se foi
 * executado (qualquer motivo); substitution_reason so protege a engine
 * de SUGESTAO de aprender preferencia falsa, NAO a progressao do executado.
 * I-15 protege apenas o PLANEJADO-NAO-FEITO.
 *
 * Par:
 *   #22 (planejado): back_squat planejado, leg_press feito => back_squat NAO progride
 *   #23 (substituto, R3): leg_press feito no topo => leg_press progride
 */
import { describe, expect, it } from "vitest";

import {
  shouldProgressExercise,
  type SessionItemHistory,
} from "../engine/decision/progression.ts";

describe("I-15 — desvio nao progride o planejado", () => {
  // Cenario base: back_squat planejado, leg_press feito no lugar.
  const substitutedHistory: SessionItemHistory[] = [
    {
      sessionId: "s1",
      exerciseId: "leg_press", // exercise_id ATUAL eh o substituto
      status: "substituted",
      isWarmup: false,
      sets: [
        { reps: 8, loadKg: 100 },
        { reps: 8, loadKg: 100 },
        { reps: 8, loadKg: 100 },
      ], // topo do rep_range
    },
  ];

  it("exercicio PLANEJADO substituido NAO progride", () => {
    // Procurando por back_squat — nao existe item com exerciseId='back_squat'
    expect(
      shouldProgressExercise("back_squat", substitutedHistory, {
        min: 5,
        max: 8,
      }),
    ).toBe(false);
  });

  it("DISCRIMINANTE R3: substituto PROGRIDE a si mesmo (executado de verdade)", () => {
    expect(
      shouldProgressExercise("leg_press", substitutedHistory, {
        min: 5,
        max: 8,
      }),
    ).toBe(true);
  });
});
