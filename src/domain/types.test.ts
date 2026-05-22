import { describe, it, expect } from "vitest";

import {
  DEVIATION_REASONS,
  JUMP_TYPES,
  LOAD_TYPES,
  MEASUREMENT_SOURCES,
  PRIORITIES,
  PROGRESSION_TYPES,
  QUALITY_PER_SETS,
  SESSION_ITEM_STATUSES,
  asFunctionTag,
  assertValidDeviation,
  newId,
} from "./types.ts";

import type {
  DeviationReason,
  ExerciseId,
  FunctionTag,
  JumpType,
  LoadType,
  MeasurementSource,
  Priority,
  ProgressionType,
  QualityPerSet,
  SessionId,
  SessionItemStatus,
} from "./types.ts";

// ============================================================================
// 1. Os arrays de enum cobrem os valores acordados do brief.
// ============================================================================

describe("enum arrays — valores do brief", () => {
  it("PROGRESSION_TYPES tem 9 valores (Seção 4.1)", () => {
    expect(PROGRESSION_TYPES).toHaveLength(9);
    expect(PROGRESSION_TYPES).toContain("load_reps");
    expect(PROGRESSION_TYPES).toContain("time_under_tension");
  });

  it("PRIORITIES tem 4 valores", () => {
    expect(PRIORITIES).toEqual(["primary", "accessory", "finisher", "bonus"]);
  });

  it("LOAD_TYPES tem 6 valores", () => {
    expect(LOAD_TYPES).toHaveLength(6);
  });

  it("SESSION_ITEM_STATUSES tem 6 valores", () => {
    expect(SESSION_ITEM_STATUSES).toEqual([
      "done",
      "skipped",
      "substituted",
      "reordered",
      "deferred",
      "added_adhoc",
    ]);
  });

  it("DEVIATION_REASONS tem 4 valores (sem low_energy, sem out_of_time)", () => {
    expect(DEVIATION_REASONS).toEqual([
      "equipment_busy",
      "injury_avoidance",
      "user_choice",
      "engine_suggested",
    ]);
  });

  it("MEASUREMENT_SOURCES tem 2 valores", () => {
    expect(MEASUREMENT_SOURCES).toEqual(["instrumented", "subjective"]);
  });

  it("JUMP_TYPES tem 5 valores", () => {
    expect(JUMP_TYPES).toEqual(["CMJ", "SJ", "DJ", "approach", "bounce"]);
  });

  it("QUALITY_PER_SETS tem 3 valores", () => {
    expect(QUALITY_PER_SETS).toEqual(["stable", "tremor", "joint_pain"]);
  });
});

// ============================================================================
// 2. assertValidDeviation — regra cross-field status -> deviation_reason
//    Fonte ÚNICA de verdade desta regra (não está no schema).
// ============================================================================

describe("assertValidDeviation — regra status -> deviation_reason", () => {
  it("status=done com reason=null passa", () => {
    expect(() => assertValidDeviation("done", null)).not.toThrow();
  });

  it("status=done com reason!=null lança", () => {
    expect(() => assertValidDeviation("done", "equipment_busy")).toThrow(
      /must have null deviation_reason/,
    );
  });

  it("status=skipped sem reason lança", () => {
    expect(() => assertValidDeviation("skipped", null)).toThrow(
      /requires a deviation_reason/,
    );
  });

  it("status=substituted sem reason lança", () => {
    expect(() => assertValidDeviation("substituted", null)).toThrow();
  });

  it("status=deferred sem reason lança", () => {
    expect(() => assertValidDeviation("deferred", null)).toThrow();
  });

  it("status=skipped com reason válido passa", () => {
    expect(() => assertValidDeviation("skipped", "user_choice")).not.toThrow();
    expect(() =>
      assertValidDeviation("substituted", "equipment_busy"),
    ).not.toThrow();
  });

  it("status=reordered aceita reason=null (opcional)", () => {
    expect(() => assertValidDeviation("reordered", null)).not.toThrow();
  });

  it("status=added_adhoc aceita reason=null (opcional)", () => {
    expect(() => assertValidDeviation("added_adhoc", null)).not.toThrow();
    expect(() =>
      assertValidDeviation("added_adhoc", "engine_suggested"),
    ).not.toThrow();
  });
});

// ============================================================================
// 3. newId — UUID v7: string não-vazia, ordenável por tempo.
// ============================================================================

describe("newId — UUID v7", () => {
  it("retorna string não-vazia", () => {
    const id = newId<ExerciseId>();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("dois IDs gerados em sequência são monotonicamente crescentes (v7)", () => {
    const a = newId<SessionId>();
    const b = newId<SessionId>();
    expect(b >= a).toBe(true);
  });
});

// ============================================================================
// 4. Assertões ESTÁTICAS de tipo — validadas por tsc, não por vitest.
//
// Cada `@ts-expect-error` abaixo SUPRIME um erro esperado na linha seguinte.
// Se TypeScript parar de flaggá-lo (porque alguém ampliou o tipo, p.ex.),
// tsc emite TS2578 "Unused '@ts-expect-error' directive" e
// `npm run typecheck` falha. É assim que essas asserções viram rede de
// verdade, e não decoração.
// ============================================================================

describe("asserções estáticas (capturadas por tsc, não por vitest em runtime)", () => {
  it("union literal rejeita valor fora do conjunto", () => {
    // @ts-expect-error - "running" não é ProgressionType
    const bad: ProgressionType = "running";
    void bad;
  });

  it("DeviationReason não aceita valores removidos", () => {
    // @ts-expect-error - low_energy foi removido em favor do canal daily_signal
    const a: DeviationReason = "low_energy";
    // @ts-expect-error - out_of_time colapsa em user_choice sem perda funcional
    const b: DeviationReason = "out_of_time";
    void a;
    void b;
  });

  it("IDs brandados não são intercambiáveis", () => {
    const session = newId<SessionId>();
    // @ts-expect-error - SessionId não é atribuível a ExerciseId
    const ex: ExerciseId = session;
    void ex;
  });

  it("FunctionTag exige construtor (não aceita string crua)", () => {
    // @ts-expect-error - string crua não é FunctionTag
    const t: FunctionTag = "tripla extensao explosiva";
    void t;
    // caminho correto:
    const ok: FunctionTag = asFunctionTag("tripla extensao explosiva");
    expect(typeof ok).toBe("string");
  });

  it("tipos válidos compilam (smoke)", () => {
    const p: ProgressionType = "load_reps";
    const l: LoadType = "barbell";
    const pr: Priority = "primary";
    const s: SessionItemStatus = "added_adhoc";
    const m: MeasurementSource = "instrumented";
    const j: JumpType = "CMJ";
    const q: QualityPerSet = "tremor";
    expect([p, l, pr, s, m, j, q]).toHaveLength(7);
  });
});
