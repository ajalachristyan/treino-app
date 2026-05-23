/**
 * I-8 — Piso de SD na monotony.
 * Brief §9: "Carga perfeitamente uniforme nao produz monotony
 * infinita/explosiva."
 *
 * Par discriminante: uniforme retorna FINITO; varied retorna valor MENOR
 * que uniforme. Discrimina comportamento (a funcao reflete variancia)
 * sem amarrar ao numero exato do piso.
 */
import { describe, expect, it } from "vitest";

import { monotony } from "../engine/foster.ts";

describe("I-08 — monotony com piso de SD", () => {
  it("input uniforme retorna valor FINITO (nao Infinity, nao NaN)", () => {
    const r = monotony([100, 100, 100, 100, 100, 100, 100]);
    expect(Number.isFinite(r)).toBe(true);
    expect(Number.isNaN(r)).toBe(false);
  });

  it("DISCRIMINANTE: input variado tem monotony MENOR que uniforme (funcao reflete variancia)", () => {
    const varied = monotony([10, 50, 100, 150, 200, 250, 300]);
    const uniform = monotony([100, 100, 100, 100, 100, 100, 100]);
    expect(varied).toBeLessThan(uniform);
  });
});
