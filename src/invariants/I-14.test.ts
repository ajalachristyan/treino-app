/**
 * I-14 — Deload nao eh regressao.
 * Brief §9: "Semana marcada como deload eh excluida do calculo de
 * tendencia de performance."
 *
 * Par discriminante: semana de queda marcada como deload => NAO classifica
 * regressao; MESMA queda fora de deload => CLASSIFICA regressao.
 * Discrimina comportamento (exclusao funciona), nao o threshold.
 */
import { describe, expect, it } from "vitest";

import {
  computeTrend,
  type PhaseInfo,
  type WeeklyVolume,
} from "../engine/decision/trend.ts";

describe("I-14 — deload excluido da tendencia", () => {
  it("semana marcada is_deload com carga baixa NAO classifica regressao", () => {
    const volumes: WeeklyVolume[] = [
      { week: 1, volume: 400 },
      { week: 2, volume: 400 },
      { week: 3, volume: 400 },
      { week: 4, volume: 400 },
      { week: 5, volume: 400 },
      { week: 6, volume: 200 }, // <-- queda na semana de deload
      { week: 7, volume: 400 },
      { week: 8, volume: 400 },
    ];
    const phases: PhaseInfo[] = [
      { weekStart: 1, weekEnd: 5, isDeload: false },
      { weekStart: 6, weekEnd: 6, isDeload: true }, // <-- deload aqui
      { weekStart: 7, weekEnd: 8, isDeload: false },
    ];
    expect(computeTrend(volumes, phases)).not.toBe("regression");
  });

  it("DISCRIMINANTE: queda real (fora de deload) CLASSIFICA regressao", () => {
    const volumes: WeeklyVolume[] = [
      { week: 1, volume: 400 },
      { week: 2, volume: 400 },
      { week: 3, volume: 400 },
      { week: 4, volume: 200 },
      { week: 5, volume: 200 },
      { week: 6, volume: 200 },
      { week: 7, volume: 200 },
      { week: 8, volume: 200 },
    ];
    const phases: PhaseInfo[] = [
      { weekStart: 1, weekEnd: 8, isDeload: false }, // nada eh deload
    ];
    expect(computeTrend(volumes, phases)).toBe("regression");
  });
});
