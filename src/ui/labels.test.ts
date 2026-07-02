import { describe, it, expect } from "vitest";

import { formatMeasures } from "./labels.ts";

describe("labels — formatMeasures", () => {
  it("load_reps com carga => 'reps x carga kg'", () => {
    expect(
      formatMeasures({ progressionType: "load_reps", reps: 8, loadKg: 60 }),
    ).toBe("8 x 60 kg");
  });

  it("load_reps com carga 0 => 'peso corporal' (B3 — pull-up/dips)", () => {
    // Coerente com lastExecutionSummary: carga 0 = peso corporal, nao "0 kg".
    expect(
      formatMeasures({ progressionType: "load_reps", reps: 10, loadKg: 0 }),
    ).toBe("10 x peso corporal");
  });
});
