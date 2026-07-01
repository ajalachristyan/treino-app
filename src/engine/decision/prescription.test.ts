// =============================================================================
// prescription.ts — overlay de LEITURA (memoria de carga x intencao da fase).
// Nunca muta o plano (I-12). Testes DISCRIMINANTES: afirmam a REGRA (ordenacao
// entre fases, bucket por tag, reducao na recuperacao), nunca o numero cru
// (5/8, 4/6, 2, 2.5, 0.5, 0.85). Ver plano do motor §7.3 / §8 e handoff §5.
// =============================================================================

import { describe, expect, it } from "vitest";
import {
  modifyForRecovery,
  suggestPrescription,
  type PrescriptionItem,
} from "./prescription.ts";
import type { SessionItemHistory } from "./progression.ts";

// --- fixtures ----------------------------------------------------------------

/** Forca primaria por TAG (back squat, Ter/FORCA). Recebe o molde da fase. */
const BACK_SQUAT: PrescriptionItem = {
  exerciseId: "ex_back_squat",
  functionTag: "forca_maxima_agachamento",
  progressionType: "load_reps",
  repMin: 5,
  repMax: 8,
  plannedSets: 3,
};

/** Forca primaria pela OUTRA tag (zercher, Sab). Prova que o bucket e por tag. */
const ZERCHER: PrescriptionItem = {
  exerciseId: "ex_zercher_leve",
  functionTag: "forca_geral_zercher",
  progressionType: "load_reps",
  repMin: 5,
  repMax: 8,
  plannedSets: 3,
};

/** Acessorio load_reps (hip thrust). Dupla progressao na PROPRIA faixa. */
const HIP_THRUST: PrescriptionItem = {
  exerciseId: "ex_hip_thrust",
  functionTag: "gluteo_extensao_quadril",
  progressionType: "load_reps",
  repMin: 8,
  repMax: 12,
  plannedSets: 3,
};

/** Plio (depth jumps). Pass-through: o app nunca inventa carga. */
const DEPTH_JUMPS: PrescriptionItem = {
  exerciseId: "ex_depth_jumps",
  functionTag: "plio_reativo",
  progressionType: "contact_quality",
  repMin: null,
  repMax: null,
  plannedSets: null,
};

const NO_HISTORY: ReadonlyArray<SessionItemHistory> = [];

function sessionOf(
  exerciseId: string,
  sets: ReadonlyArray<readonly [reps: number, loadKg: number]>,
): SessionItemHistory {
  return {
    sessionId: `s_${exerciseId}_${String(sets.length)}`,
    exerciseId,
    status: "done",
    isWarmup: false,
    sets: sets.map(([reps, loadKg]) => ({ reps, loadKg })),
  };
}

// --- overlay de fase (forca primaria) ---------------------------------------

describe("suggestPrescription — molde de fase na forca primaria", () => {
  it("reps caem de M1 -> M2 -> M3 (ordena a fase, nao afirma 8/6/2)", () => {
    const r1 = suggestPrescription(BACK_SQUAT, "m1", NO_HISTORY).repRange;
    const r2 = suggestPrescription(BACK_SQUAT, "m2", NO_HISTORY).repRange;
    const r3 = suggestPrescription(BACK_SQUAT, "m3", NO_HISTORY).repRange;
    if (r1 === null || r2 === null || r3 === null) {
      throw new Error("faixa nula inesperada na forca primaria");
    }
    expect(r1.max).toBeGreaterThan(r2.max);
    expect(r2.max).toBeGreaterThan(r3.max);
    expect(r1.min).toBeGreaterThan(r2.min);
    expect(r2.min).toBeGreaterThan(r3.min);
  });

  it("overlay por TAG: a primaria acompanha a fase; o acessorio ignora a fase", () => {
    const primM1 = suggestPrescription(BACK_SQUAT, "m1", NO_HISTORY).repRange;
    const primM2 = suggestPrescription(BACK_SQUAT, "m2", NO_HISTORY).repRange;
    expect(primM2).not.toEqual(primM1); // primaria: a fase sobrescreve a faixa

    const accM1 = suggestPrescription(HIP_THRUST, "m1", NO_HISTORY).repRange;
    const accM2 = suggestPrescription(HIP_THRUST, "m2", NO_HISTORY).repRange;
    expect(accM2).toEqual(accM1); // acessorio: a fase nao mexe na faixa dele
  });

  it("bucket: primaria=molde de fase, acessorio=dupla progressao, plio=pass-through", () => {
    expect(suggestPrescription(BACK_SQUAT, "m1", NO_HISTORY).mode).toBe(
      "double_progression",
    );
    expect(suggestPrescription(BACK_SQUAT, "m3", NO_HISTORY).mode).toBe(
      "peak_pap",
    );
    expect(suggestPrescription(ZERCHER, "m2", NO_HISTORY).mode).toBe(
      "double_progression",
    );
    expect(suggestPrescription(HIP_THRUST, "m2", NO_HISTORY).mode).toBe(
      "double_progression",
    );
    expect(suggestPrescription(DEPTH_JUMPS, "m3", NO_HISTORY).mode).toBe(
      "pass_through",
    );
  });

  it("so o M3 (PAP) mostra dica de intensidade; M1/M2 nao", () => {
    expect(
      suggestPrescription(BACK_SQUAT, "m3", NO_HISTORY).intensityHintPct,
    ).not.toBeNull();
    expect(
      suggestPrescription(BACK_SQUAT, "m1", NO_HISTORY).intensityHintPct,
    ).toBeNull();
    expect(
      suggestPrescription(BACK_SQUAT, "m2", NO_HISTORY).intensityHintPct,
    ).toBeNull();
  });
});

// --- carga = memoria (nunca inventa) ----------------------------------------

describe("suggestPrescription — carga vem da memoria, nunca inventa", () => {
  it("sem historico => carga em branco (null), zero estimativa", () => {
    expect(
      suggestPrescription(BACK_SQUAT, "m1", NO_HISTORY).suggestedLoadKg,
    ).toBeNull();
    expect(
      suggestPrescription(HIP_THRUST, "m1", NO_HISTORY).suggestedLoadKg,
    ).toBeNull();
  });

  it("dupla progressao: bateu o topo => sobe; nao bateu => repete a memoria", () => {
    const REF = 100;
    const topo = [sessionOf("ex_back_squat", [[8, REF], [8, REF], [8, REF]])];
    const abaixo = [sessionOf("ex_back_squat", [[7, REF], [7, REF], [7, REF]])];
    const subiu = suggestPrescription(BACK_SQUAT, "m1", topo).suggestedLoadKg;
    const repetiu = suggestPrescription(BACK_SQUAT, "m1", abaixo).suggestedLoadKg;
    expect(repetiu).toBe(REF); // repete a ultima carga (memoria), sem inventar
    expect(subiu).not.toBeNull();
    expect(subiu as number).toBeGreaterThan(REF); // subiu acima da memoria
  });

  it("M3 (PAP) NAO auto-progride a carga, mesmo batendo o topo (dono digita)", () => {
    const REF = 100;
    const topo = [sessionOf("ex_back_squat", [[8, REF], [8, REF], [8, REF]])];
    const m1 = suggestPrescription(BACK_SQUAT, "m1", topo).suggestedLoadKg;
    const m3 = suggestPrescription(BACK_SQUAT, "m3", topo).suggestedLoadKg;
    expect(m1 as number).toBeGreaterThan(REF); // M1 progride
    expect(m3).toBe(REF); // M3 mantem a memoria (PAP fixo; % e so dica)
  });

  it("pass-through (plio) nunca sugere carga nem faixa, mesmo com historico", () => {
    const hist = [sessionOf("ex_depth_jumps", [[5, 40]])];
    const p = suggestPrescription(DEPTH_JUMPS, "m1", hist);
    expect(p.suggestedLoadKg).toBeNull();
    expect(p.repRange).toBeNull();
  });
});

// --- recuperacao encolhe (um fator, nao empilha) ----------------------------

describe("modifyForRecovery — recuperacao encolhe; um fator unico (B3)", () => {
  const base = suggestPrescription(BACK_SQUAT, "m1", [
    sessionOf("ex_back_squat", [[8, 100], [8, 100], [8, 100]]),
  ]);

  it("sem recuperacao: base inalterada", () => {
    const ctx = {
      isScheduledDeload: false,
      isScheduledTaper: false,
      isReactiveDeload: false,
    };
    expect(modifyForRecovery(base, ctx)).toEqual(base);
  });

  it("deload agendado: menos series E menos carga", () => {
    const d = modifyForRecovery(base, {
      isScheduledDeload: true,
      isScheduledTaper: false,
      isReactiveDeload: false,
    });
    expect(d.sets as number).toBeLessThan(base.sets as number);
    expect(d.suggestedLoadKg as number).toBeLessThan(
      base.suggestedLoadKg as number,
    );
    expect(d.recovery).toBe("deload");
  });

  it("taper: menos series, mas MANTEM a carga", () => {
    const t = modifyForRecovery(base, {
      isScheduledDeload: false,
      isScheduledTaper: true,
      isReactiveDeload: false,
    });
    expect(t.sets as number).toBeLessThan(base.sets as number);
    expect(t.suggestedLoadKg).toBe(base.suggestedLoadKg); // carga mantida
    expect(t.recovery).toBe("taper");
  });

  it("reativo sozinho reduz; agendado SUPRIME o reativo (nao empilha 0.5x0.5)", () => {
    const soReativo = {
      isScheduledDeload: false,
      isScheduledTaper: false,
      isReactiveDeload: true,
    };
    const deloadMaisReativo = {
      isScheduledDeload: true,
      isScheduledTaper: false,
      isReactiveDeload: true,
    };
    const soDeload = {
      isScheduledDeload: true,
      isScheduledTaper: false,
      isReactiveDeload: false,
    };

    const r = modifyForRecovery(base, soReativo);
    expect(r.suggestedLoadKg as number).toBeLessThan(
      base.suggestedLoadKg as number,
    );
    expect(r.recovery).toBe("reactive_deload");

    // deload + reativo == so deload (um fator unico, nao dois multiplicados)
    expect(modifyForRecovery(base, deloadMaisReativo)).toEqual(
      modifyForRecovery(base, soDeload),
    );
    expect(modifyForRecovery(base, deloadMaisReativo).recovery).toBe("deload");
  });
});
