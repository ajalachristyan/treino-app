/**
 * L1 — classificador de fase (seam compartilhado §7.2 do plano do motor).
 *
 * Testes DISCRIMINANTES:
 *   - a FLAG (is_deload/is_taper) vence o NOME;
 *   - parentEmphasis resolve deload/taper ao bloco de treino que ele serve
 *     (DL1->m1, DL2->m2, taper/DL3->m3), pela fase real anterior.
 * Nunca valida numero magico de semana — valida a REGRA de classificacao.
 */
import { describe, expect, it } from "vitest";

import { classifyPhase, phaseContext, type ClassifiablePhase } from "./phase.ts";

// Fases do seed real (migrations/002_seed_plan.sql:140-149) como fixture.
const SEED_PHASES: ClassifiablePhase[] = [
  { name: "Mes 1 — Estrutura", week_start: 1, week_end: 5, is_deload: 0, is_taper: 0 },
  { name: "Deload 1", week_start: 6, week_end: 6, is_deload: 1, is_taper: 0 },
  { name: "Mes 2 — Potencia/RFD", week_start: 7, week_end: 9, is_deload: 0, is_taper: 0 },
  { name: "Deload 2", week_start: 10, week_end: 10, is_deload: 1, is_taper: 0 },
  { name: "Mes 3 — Peaking", week_start: 11, week_end: 15, is_deload: 0, is_taper: 0 },
  { name: "Taper", week_start: 16, week_end: 17, is_deload: 0, is_taper: 1 },
  { name: "Deload 3", week_start: 18, week_end: 18, is_deload: 1, is_taper: 0 },
];

describe("classifyPhase — a flag vence o nome", () => {
  it("is_deload=1 classifica 'deload' MESMO com nome de mes (par discriminante)", () => {
    const base = { name: "Mes 1 — Estrutura", week_start: 1, week_end: 5, is_taper: 0 };
    // Mesmo nome; so a flag muda o veredito.
    expect(classifyPhase({ ...base, is_deload: 1 })).toBe("deload");
    expect(classifyPhase({ ...base, is_deload: 0 })).toBe("m1");
  });

  it("is_taper=1 classifica 'taper' MESMO com nome de mes", () => {
    expect(
      classifyPhase({ name: "Mes 3 — Peaking", week_start: 16, week_end: 17, is_deload: 0, is_taper: 1 }),
    ).toBe("taper");
  });

  it("sem flag, classifica por nome (m1/m2/m3)", () => {
    expect(classifyPhase({ name: "Mes 1 — Estrutura", week_start: 1, week_end: 5, is_deload: 0, is_taper: 0 })).toBe("m1");
    expect(classifyPhase({ name: "Mes 2 — Potencia/RFD", week_start: 7, week_end: 9, is_deload: 0, is_taper: 0 })).toBe("m2");
    expect(classifyPhase({ name: "Mes 3 — Peaking", week_start: 11, week_end: 15, is_deload: 0, is_taper: 0 })).toBe("m3");
  });

  it("nome irreconhecivel sem flag => erro alto (surface drift do seed)", () => {
    expect(() =>
      classifyPhase({ name: "Fase Fantasma", week_start: 1, week_end: 2, is_deload: 0, is_taper: 0 }),
    ).toThrow();
  });
});

describe("phaseContext — parentEmphasis resolve ao bloco de treino", () => {
  it("fase real: emphasis == parentEmphasis", () => {
    expect(phaseContext(SEED_PHASES, 3)).toEqual({ emphasis: "m1", parentEmphasis: "m1" });
    expect(phaseContext(SEED_PHASES, 8)).toEqual({ emphasis: "m2", parentEmphasis: "m2" });
    expect(phaseContext(SEED_PHASES, 13)).toEqual({ emphasis: "m3", parentEmphasis: "m3" });
  });

  it("deload herda o bloco anterior (DL1->m1, DL2->m2)", () => {
    expect(phaseContext(SEED_PHASES, 6)).toEqual({ emphasis: "deload", parentEmphasis: "m1" });
    expect(phaseContext(SEED_PHASES, 10)).toEqual({ emphasis: "deload", parentEmphasis: "m2" });
  });

  it("taper e DL3 herdam m3", () => {
    expect(phaseContext(SEED_PHASES, 16)).toEqual({ emphasis: "taper", parentEmphasis: "m3" });
    expect(phaseContext(SEED_PHASES, 18)).toEqual({ emphasis: "deload", parentEmphasis: "m3" });
  });

  it("semana fora do plano => undefined", () => {
    expect(phaseContext(SEED_PHASES, 99)).toBeUndefined();
  });
});
