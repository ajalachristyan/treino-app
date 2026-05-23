/**
 * I-4 — Só `instrumented` dispara gatilho objetivo.
 * Brief §9: "Série só de dados subjetivos nunca dispara o ramo objetivo de
 * deload."
 *
 * Par discriminante: serie sem instrumentado retorna false; serie COM
 * instrumentado (queda inequivoca de 50%) retorna true. Discrimina
 * comportamento, nao o threshold numerico (que vive em constants.ts como
 * TODO).
 */
import { describe, expect, it } from "vitest";

import { shouldSuggestObjectiveDeload } from "../engine/decision/deload.ts";

describe("I-04 — so instrumented dispara deload objetivo", () => {
  it("serie SO de subjetivos NAO dispara objetivo", () => {
    const result = shouldSuggestObjectiveDeload({
      instrumentedJumps: [],
      subjectiveSignals: [
        { day: 1, sorenessEnergy: 2 },
        { day: 2, sorenessEnergy: 2 },
        { day: 3, sorenessEnergy: 2 },
        { day: 4, sorenessEnergy: 2 },
        { day: 5, sorenessEnergy: 2 },
      ],
    });
    expect(result).toBe(false);
  });

  it("DISCRIMINANTE: serie COM instrumentado em queda de 50% dispara objetivo", () => {
    const result = shouldSuggestObjectiveDeload({
      instrumentedJumps: [
        { day: 1, heightCm: 60 },
        { day: 2, heightCm: 60 },
        { day: 3, heightCm: 30 },
        { day: 4, heightCm: 30 },
      ],
    });
    expect(result).toBe(true);
  });
});
