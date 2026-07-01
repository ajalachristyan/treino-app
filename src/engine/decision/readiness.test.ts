/**
 * Prontidao (peca 3 da camada de aderencia+prontidao — spec 2026-07-01).
 *
 * Puro e ADVISORY: pega o resumo de aderencia + contexto de fase e decide
 * avisos + uma sugestao de ajuste (so rearranjo do plano — repetir/estender/
 * mexer data; NUNCA inventa treino). Anti-culpa: sugere, nao pune.
 *
 * Testes DISCRIMINANTES: aderencia baixa vs alta; entrar em fase de risco com
 * base fraca vs forte; primary largado acima vs abaixo do limiar. Sem numero
 * magico (as series ficam nos dois lados do limiar).
 */
import { describe, expect, it } from "vitest";

import type { AdherenceSummary } from "./adherence.ts";
import { assessReadiness } from "./readiness.ts";

const ZERO_TIERS = {
  primary: { planned: 0, done: 0 },
  accessory: { planned: 0, done: 0 },
  finisher: { planned: 0, done: 0 },
  bonus: { planned: 0, done: 0 },
} as const;

function summary(
  pct: number,
  neglect: Record<string, number> = {},
): AdherenceSummary {
  return {
    planned: 10,
    done: Math.round(pct * 10),
    pct,
    byPriority: ZERO_TIERS,
    primaryNeglectStreak: neglect,
  };
}

describe("assessReadiness — aviso de aderencia + sugestao", () => {
  it("aderencia baixa => avisa e sugere repetir a semana", () => {
    const r = assessReadiness({
      phaseAdherence: summary(0.4),
      enteringRiskPhase: false,
      baseAdherencePct: 0.9,
    });
    expect(r.adherenceWarning).toBe(true);
    expect(r.suggestedAdjustment).toBe("repeat_week");
  });

  it("aderencia alta => sem aviso, sem sugestao", () => {
    const r = assessReadiness({
      phaseAdherence: summary(0.9),
      enteringRiskPhase: false,
      baseAdherencePct: 0.9,
    });
    expect(r.adherenceWarning).toBe(false);
    expect(r.suggestedAdjustment).toBeNull();
  });
});

describe("assessReadiness — trava da fase de risco (nao pular caminho)", () => {
  it("entrar na fase de risco com base FRACA => gate + sugere estender a fase", () => {
    const r = assessReadiness({
      phaseAdherence: summary(0.9),
      enteringRiskPhase: true,
      baseAdherencePct: 0.3,
    });
    expect(r.riskPhaseGate).toBe(true);
    expect(r.suggestedAdjustment).toBe("extend_phase");
  });

  it("DISCRIMINANTE: entrar na fase de risco com base FORTE => sem gate", () => {
    const r = assessReadiness({
      phaseAdherence: summary(0.9),
      enteringRiskPhase: true,
      baseAdherencePct: 0.9,
    });
    expect(r.riskPhaseGate).toBe(false);
  });

  it("gate de risco tem precedencia sobre aviso de aderencia na sugestao", () => {
    const r = assessReadiness({
      phaseAdherence: summary(0.4), // tambem baixa
      enteringRiskPhase: true,
      baseAdherencePct: 0.3,
    });
    expect(r.riskPhaseGate).toBe(true);
    expect(r.adherenceWarning).toBe(true);
    expect(r.suggestedAdjustment).toBe("extend_phase"); // seguranca primeiro
  });
});

describe("assessReadiness — negligencia de exercicio primary", () => {
  it("primary largado >= limiar entra em neglectedPrimary", () => {
    const r = assessReadiness({
      phaseAdherence: summary(0.9, { back_squat: 3 }),
      enteringRiskPhase: false,
      baseAdherencePct: 0.9,
    });
    expect(r.neglectedPrimary).toContain("back_squat");
  });

  it("DISCRIMINANTE: primary largado abaixo do limiar NAO entra", () => {
    const r = assessReadiness({
      phaseAdherence: summary(0.9, { back_squat: 1 }),
      enteringRiskPhase: false,
      baseAdherencePct: 0.9,
    });
    expect(r.neglectedPrimary).not.toContain("back_squat");
  });
});
