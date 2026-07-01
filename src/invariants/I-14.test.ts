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
      { weekStart: 1, weekEnd: 5, isDeload: false, isTaper: false, emphasis: "m1" },
      { weekStart: 6, weekEnd: 6, isDeload: true, isTaper: false, emphasis: "m1" }, // <-- deload aqui
      { weekStart: 7, weekEnd: 8, isDeload: false, isTaper: false, emphasis: "m2" },
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
      { weekStart: 1, weekEnd: 8, isDeload: false, isTaper: false, emphasis: "m1" }, // nada eh deload
    ];
    expect(computeTrend(volumes, phases)).toBe("regression");
  });
});

/**
 * I-14 estendido a TAPER (red team B2). O taper (sem 16-17) corta ~60% do
 * volume de pesos DE PROPOSITO (pico) — a queda e PLANO, nao regressao. Mesmo
 * par discriminante do deload, agora com is_taper.
 */
describe("I-14+B2 — taper tambem excluido da tendencia", () => {
  const volumes: WeeklyVolume[] = [
    { week: 1, volume: 400 },
    { week: 2, volume: 400 },
    { week: 3, volume: 400 },
    { week: 4, volume: 400 },
    { week: 5, volume: 160 }, // queda...
    { week: 6, volume: 160 }, // ...nas 2 semanas de taper
  ];

  it("queda nas semanas de TAPER NAO classifica regressao", () => {
    const phases: PhaseInfo[] = [
      { weekStart: 1, weekEnd: 4, isDeload: false, isTaper: false, emphasis: "m3" },
      { weekStart: 5, weekEnd: 6, isDeload: false, isTaper: true, emphasis: "m3" }, // <-- taper
    ];
    expect(computeTrend(volumes, phases)).not.toBe("regression");
  });

  it("DISCRIMINANTE: MESMA queda SEM taper CLASSIFICA regressao", () => {
    const phases: PhaseInfo[] = [
      { weekStart: 1, weekEnd: 6, isDeload: false, isTaper: false, emphasis: "m3" }, // nada eh taper
    ];
    expect(computeTrend(volumes, phases)).toBe("regression");
  });
});
