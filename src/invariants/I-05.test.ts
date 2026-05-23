/**
 * I-5 — sRPE carimbado + recall_late.
 * Brief §9: "Todo `session_load` tem timestamp_server. Fora da janela →
 * recall_late = true. Entrada recall_late = true eh EXCLUIDA de gatilho
 * (deterministica, nao 'menos confiavel')."
 *
 * Threshold de 30 min vive em constants.ts (revisavel). Testes validam
 * COMPORTAMENTO: cruza/nao cruza o limiar; recall_late filtra mesmo quando
 * o dado e que dispararia.
 *
 * Par discriminante em #8/#8b: a UNICA entrada que dispararia tem recall_late=true
 * vs SEM recall_late.
 */
import { describe, expect, it } from "vitest";

import { isRecallLate } from "../engine/derivations.ts";
import {
  shouldSuggestDeload,
  type LoadEntry,
} from "../engine/decision/deload.ts";

const MIN = 60 * 1000;

describe("I-05 — recall_late carimbado e excluido", () => {
  it("isRecallLate respeita o threshold (>30 min ⇒ true; ≤30 min ⇒ false)", () => {
    expect(isRecallLate(0, 31 * MIN)).toBe(true);
    expect(isRecallLate(0, 29 * MIN)).toBe(false);
    expect(isRecallLate(0, 30 * MIN)).toBe(false); // limite inclusivo
  });

  it("entrada recall_late=true eh EXCLUIDA do gatilho de deload", () => {
    // Quedas estao nos dias 3 e 4, mas ambos marcados recall_late.
    const series: LoadEntry[] = [
      { day: 1, load: 500, recallLate: false },
      { day: 2, load: 500, recallLate: false },
      { day: 3, load: 200, recallLate: true },
      { day: 4, load: 200, recallLate: true },
      { day: 5, load: 500, recallLate: false },
      { day: 6, load: 500, recallLate: false },
      { day: 7, load: 500, recallLate: false },
    ];
    expect(shouldSuggestDeload(series)).toBe(false);
  });

  it("DISCRIMINANTE: serie identica SEM recall_late dispara deload", () => {
    const series: LoadEntry[] = [
      { day: 1, load: 500, recallLate: false },
      { day: 2, load: 500, recallLate: false },
      { day: 3, load: 200, recallLate: false },
      { day: 4, load: 200, recallLate: false },
      { day: 5, load: 500, recallLate: false },
      { day: 6, load: 500, recallLate: false },
      { day: 7, load: 500, recallLate: false },
    ];
    expect(shouldSuggestDeload(series)).toBe(true);
  });
});
