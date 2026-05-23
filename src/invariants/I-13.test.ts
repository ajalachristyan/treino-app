/**
 * I-13 — Gate de timing `acute_interference`.
 * Brief §9 (refinado): "Exercicio com acute_interference=true agendado antes
 * de sessao de potencia dispara AVISO (nao bloqueio)." Refino acordado:
 * aviso por padrao + flag `interference_warned` para a estatistica; bloqueio
 * duro contradiz §6.3 (anti-culpa).
 *
 * Par positivo/negativo:
 *   #19: plano com acute_interference precedendo potencia => warning != null
 *   #20: plano sem acute_interference => warning === null
 */
import { describe, expect, it } from "vitest";

import {
  checkInterferenceGate,
  type SessionPlanItem,
} from "../engine/decision/interference.ts";

describe("I-13 — gate de interferencia (avisa, nao bloqueia)", () => {
  it("gate DISPARA warning quando acute_interference precede potencia", () => {
    const plan: SessionPlanItem[] = [
      {
        exerciseId: "hold_long",
        acuteInterference: true,
        progressionType: "time_under_tension",
        plannedSequence: 1,
      },
      {
        exerciseId: "depth_jump",
        acuteInterference: false,
        progressionType: "jump_height",
        plannedSequence: 2,
      },
    ];
    const w = checkInterferenceGate(plan);
    expect(w).not.toBeNull();
    expect(w?.precedingExerciseId).toBe("hold_long");
    expect(w?.potencyExerciseId).toBe("depth_jump");
  });

  it("gate NAO dispara em sessao sem acute_interference (sem falso-positivo)", () => {
    const plan: SessionPlanItem[] = [
      {
        exerciseId: "warmup",
        acuteInterference: false,
        progressionType: "time_under_tension",
        plannedSequence: 1,
      },
      {
        exerciseId: "depth_jump",
        acuteInterference: false,
        progressionType: "jump_height",
        plannedSequence: 2,
      },
    ];
    expect(checkInterferenceGate(plan)).toBeNull();
  });
});
