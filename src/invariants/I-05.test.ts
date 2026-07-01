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
import type { PhaseInfo } from "../engine/decision/phase.ts";

const MIN = 60 * 1000;

// Uma fase real (Mes 1) para posicionar as sessoes. O baseline reativo agora
// conta a sequencia FINAL de quedas (conserto da Divida 2, §7.3 L3), entao o
// par discriminante de I-5 poe as quedas no FIM da serie — nao no meio.
const M1_PHASES: PhaseInfo[] = [
  { weekStart: 1, weekEnd: 5, isDeload: false, isTaper: false, emphasis: "m1" },
];

describe("I-05 — recall_late carimbado e excluido", () => {
  it("isRecallLate respeita o threshold (>30 min ⇒ true; ≤30 min ⇒ false)", () => {
    expect(isRecallLate(0, 31 * MIN)).toBe(true);
    expect(isRecallLate(0, 29 * MIN)).toBe(false);
    expect(isRecallLate(0, 30 * MIN)).toBe(false); // limite inclusivo
  });

  it("entrada recall_late=true eh EXCLUIDA do gatilho de deload", () => {
    // Quedas RECENTES (dias 25 e 29), mas ambas recall_late => excluidas => a
    // serie elegivel fica chapada em 500 => NAO dispara.
    const series: LoadEntry[] = [
      { day: 1, week: 1, load: 500, recallLate: false },
      { day: 5, week: 1, load: 500, recallLate: false },
      { day: 9, week: 2, load: 500, recallLate: false },
      { day: 13, week: 2, load: 500, recallLate: false },
      { day: 17, week: 3, load: 500, recallLate: false },
      { day: 21, week: 3, load: 500, recallLate: false },
      { day: 25, week: 4, load: 200, recallLate: true },
      { day: 29, week: 4, load: 200, recallLate: true },
    ];
    expect(shouldSuggestDeload(series, M1_PHASES)).toBe(false);
  });

  it("DISCRIMINANTE: serie identica SEM recall_late dispara deload", () => {
    const series: LoadEntry[] = [
      { day: 1, week: 1, load: 500, recallLate: false },
      { day: 5, week: 1, load: 500, recallLate: false },
      { day: 9, week: 2, load: 500, recallLate: false },
      { day: 13, week: 2, load: 500, recallLate: false },
      { day: 17, week: 3, load: 500, recallLate: false },
      { day: 21, week: 3, load: 500, recallLate: false },
      { day: 25, week: 4, load: 200, recallLate: false },
      { day: 29, week: 4, load: 200, recallLate: false },
    ];
    expect(shouldSuggestDeload(series, M1_PHASES)).toBe(true);
  });
});
