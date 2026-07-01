/**
 * Divida 2 — baseline reativo do deload (plano do motor §7.3 L3).
 *
 * Testes DISCRIMINANTES do conserto:
 *  - base estavel + queda RECENTE dispara (hoje o mean afundava junto e NAO
 *    disparava — o bug real);
 *  - vale que JA recuperou NAO dispara (contamos a sequencia final, nao
 *    qualquer par no historico);
 *  - cada ENFASE tem seu proprio baseline (red team B1);
 *  - deload/taper/recall/gap-de-calendario/typo nao envenenam (I-14+B2 / S1 /
 *    guarda de sanidade).
 *
 * As series sao GROSSAS de proposito: disparam numa banda larga de limiar, nao
 * por causa do 0.30 (red team N1). NUNCA validar contra o numero.
 */
import { describe, expect, it } from "vitest";

import { shouldSuggestDeload, type LoadEntry } from "./deload.ts";
import type { PhaseInfo } from "./phase.ts";

// Uma unica fase real (Mes 1, sem recuperacao) cobre a maioria dos casos.
const M1_ONLY: PhaseInfo[] = [
  { weekStart: 1, weekEnd: 5, isDeload: false, isTaper: false, emphasis: "m1" },
];

// Sessoes de forca ~2x/sem dentro do Mes 1: dia +4 (gap 4 < MAX_SESSION_GAP),
// semana derivada (2/sem), clampada ao fim do Mes 1.
function m1(loads: number[]): LoadEntry[] {
  return loads.map((load, i) => ({
    day: i * 4 + 1,
    week: Math.min(1 + Math.floor(i / 2), 5),
    load,
    recallLate: false,
  }));
}

describe("Divida 2 — base estavel + queda recente DISPARA", () => {
  it("headline: seis sessoes em 100 e duas recentes em ~65 => true", () => {
    // Hoje (mean) NAO disparava: o mean afundava com a propria queda. Mediana
    // da janela recente = 100; as 2 ultimas ficam bem abaixo. Banda ~(0, 0.35].
    expect(shouldSuggestDeload(m1([100, 100, 100, 100, 100, 100, 65, 64]), M1_ONLY)).toBe(true);
  });

  it("banda diferente (quedas em 50) tambem dispara — prova o desacoplamento do 0.30", () => {
    expect(shouldSuggestDeload(m1([100, 100, 100, 100, 100, 100, 50, 50]), M1_ONLY)).toBe(true);
  });
});

describe("Divida 2 — negativos que NAO podem disparar", () => {
  it("serie chapada => false", () => {
    expect(shouldSuggestDeload(m1([100, 100, 100, 100, 100]), M1_ONLY)).toBe(false);
  });

  it("vale que JA recuperou (baixo no meio, alto no fim) => false", () => {
    expect(shouldSuggestDeload(m1([100, 40, 40, 100, 100]), M1_ONLY)).toBe(false);
  });
});

describe("baseline POR ENFASE (red team B1)", () => {
  it("virada de fase (M1 pesado -> M2 mais leve, estavel) NAO dispara", () => {
    // Baseline GLOBAL (max=150 do M1) leria o M2 estavel em 100 como 'queda' e
    // dispararia falso. Por enfase: o M2 e chapado no proprio baseline.
    const phases: PhaseInfo[] = [
      { weekStart: 1, weekEnd: 5, isDeload: false, isTaper: false, emphasis: "m1" },
      { weekStart: 6, weekEnd: 6, isDeload: true, isTaper: false, emphasis: "m1" },
      { weekStart: 7, weekEnd: 9, isDeload: false, isTaper: false, emphasis: "m2" },
    ];
    const entries: LoadEntry[] = [
      { day: 1, week: 1, load: 150, recallLate: false },
      { day: 5, week: 1, load: 150, recallLate: false },
      { day: 9, week: 2, load: 150, recallLate: false },
      { day: 13, week: 2, load: 150, recallLate: false },
      // M2 estavel em 100, com sessoes suficientes para um baseline proprio.
      { day: 45, week: 7, load: 100, recallLate: false },
      { day: 49, week: 7, load: 100, recallLate: false },
      { day: 53, week: 8, load: 100, recallLate: false },
      { day: 57, week: 8, load: 100, recallLate: false },
      { day: 61, week: 9, load: 100, recallLate: false },
      { day: 65, week: 9, load: 100, recallLate: false },
    ];
    expect(shouldSuggestDeload(entries, phases)).toBe(false);
  });
});

describe("pausa longa ANTES da dupla recente tambem quebra (red team adversarial A)", () => {
  const base = m1([100, 100, 100, 100, 100, 100]); // dias 1..21

  it("volta de pausa (25 dias) com 2 sessoes leves NAO dispara => false", () => {
    // Pausa nao-agendada (doenca/viagem): a fase NAO e deload, mas o calendario
    // pulou. Voltar destreinado com 2 sessoes leves != fadiga persistente agora.
    const entries: LoadEntry[] = [
      ...base,
      { day: 46, week: 4, load: 60, recallLate: false }, // 25 dias apos a ultima
      { day: 50, week: 4, load: 60, recallLate: false },
    ];
    expect(shouldSuggestDeload(entries, M1_ONLY)).toBe(false);
  });

  it("DISCRIMINANTE: sem a pausa (contiguo) as MESMAS quedas => true", () => {
    const entries: LoadEntry[] = [
      ...base,
      { day: 25, week: 4, load: 60, recallLate: false }, // 4 dias apos — contiguo
      { day: 29, week: 4, load: 60, recallLate: false },
    ];
    expect(shouldSuggestDeload(entries, M1_ONLY)).toBe(true);
  });
});

describe("baseline exige referencia robusta, nao 1 ponto (red team adversarial B)", () => {
  it("coorte minima (1 dia duro + 2 normais) NAO dispara sobre baseline de 1 ponto => false", () => {
    // 600 e um dia duro REAL (nao typo — passa o sanity cap). Com so 1 sessao de
    // referencia, a mediana viraria 600 e leria 2 dias normais como 'queda'.
    const entries: LoadEntry[] = [
      { day: 1, week: 1, load: 600, recallLate: false },
      { day: 5, week: 1, load: 400, recallLate: false },
      { day: 9, week: 2, load: 400, recallLate: false },
    ];
    expect(shouldSuggestDeload(entries, M1_ONLY)).toBe(false);
  });

  it("DISCRIMINANTE: com referencia robusta, a MESMA queda dispara => true", () => {
    const entries: LoadEntry[] = [
      ...m1([600, 600, 600, 600, 600, 600]), // baseline robusto em 600
      { day: 25, week: 4, load: 400, recallLate: false },
      { day: 29, week: 4, load: 400, recallLate: false },
    ];
    expect(shouldSuggestDeload(entries, M1_ONLY)).toBe(true);
  });
});

describe("deload/taper NAO envenenam o baseline reativo (I-14 estendido / B2)", () => {
  const base = m1([100, 100, 100, 100, 100, 100]); // dias 1..21, semanas 1-3

  it("sessoes baixas numa semana de DELOAD sao excluidas => false", () => {
    const phases: PhaseInfo[] = [
      { weekStart: 1, weekEnd: 5, isDeload: false, isTaper: false, emphasis: "m1" },
      { weekStart: 6, weekEnd: 6, isDeload: true, isTaper: false, emphasis: "m1" },
    ];
    const entries: LoadEntry[] = [
      ...base,
      { day: 25, week: 6, load: 40, recallLate: false }, // deload — excluido
      { day: 29, week: 6, load: 40, recallLate: false }, // deload — excluido
    ];
    expect(shouldSuggestDeload(entries, phases)).toBe(false);
  });

  it("DISCRIMINANTE: as MESMAS quedas fora de deload => true", () => {
    const entries: LoadEntry[] = [
      ...base,
      { day: 25, week: 4, load: 40, recallLate: false },
      { day: 29, week: 4, load: 40, recallLate: false },
    ];
    expect(shouldSuggestDeload(entries, M1_ONLY)).toBe(true);
  });
});

describe("gap de calendario quebra a sequencia (red team S1)", () => {
  const base = m1([100, 100, 100, 100, 100, 100]); // dias 1..21

  it("duas quedas MUITO distantes no calendario NAO sao consecutivas => false", () => {
    const entries: LoadEntry[] = [
      ...base,
      { day: 25, week: 4, load: 65, recallLate: false },
      { day: 60, week: 5, load: 64, recallLate: false }, // 35 dias depois — pausa
    ];
    expect(shouldSuggestDeload(entries, M1_ONLY)).toBe(false);
  });

  it("DISCRIMINANTE: as MESMAS quedas juntas no calendario => true", () => {
    const entries: LoadEntry[] = [
      ...base,
      { day: 25, week: 4, load: 65, recallLate: false },
      { day: 29, week: 4, load: 64, recallLate: false }, // 4 dias — consecutivas
    ];
    expect(shouldSuggestDeload(entries, M1_ONLY)).toBe(true);
  });
});

describe("carga absurda (typo) e ignorada na ingestao (guarda de sanidade)", () => {
  it("typo gigante no meio de serie estavel NAO inventa queda => false", () => {
    expect(shouldSuggestDeload(m1([100, 100, 99999, 100, 100, 100, 100, 100]), M1_ONLY)).toBe(false);
  });

  it("typo gigante na referencia NAO esconde uma queda real => true", () => {
    expect(shouldSuggestDeload(m1([100, 99999, 100, 100, 100, 100, 65, 64]), M1_ONLY)).toBe(true);
  });
});
