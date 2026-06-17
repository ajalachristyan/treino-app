/**
 * I-2 — `role` nunca persiste.
 * Brief §9: "Não existe coluna `role` em tabela de dado. A mesma `height`
 * retorna papéis diferentes conforme o bloco/regra."
 *
 * Parte DB: SELECT role FROM <cada tabela de registro> falha (coluna não
 * existe). Parte puro-TS: engine.roleOfMetric resolve role distinto para a
 * MESMA observação (height) conforme a regra que está lendo.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { roleOfMetric } from "../engine/decision/role.ts";
import { applyMigrations } from "../db/runner.ts";
import { loadMigrations } from "../db/migrations.ts";
import { engines, type Database } from "./_helpers/engines.ts";

const REGISTRY_TABLES = [
  "exercise",
  "session",
  "session_item",
  "session_set",
  "jump_test",
  "session_load",
  "body_weight_log",
  "pain_log",
];

describe.each(engines)(
  "I-02 (DB) — role nao persiste em coluna (%s)",
  (_engineName, openDb) => {
    let db: Database;
    beforeEach(async () => {
      db = await openDb(":memory:");
      await applyMigrations(db, loadMigrations);
    });
    afterEach(async () => {
      await db.close();
    });

    it("SELECT role FROM <cada tabela de registro> falha — coluna nao existe", async () => {
      for (const t of REGISTRY_TABLES) {
        await expect(
          db.get(`SELECT role FROM ${t}`),
          `${t} aceita SELECT role — coluna interpretativa persistiu`,
        ).rejects.toThrow();
      }
    });
  },
);

describe("I-02 (puro-TS) — engine resolve role por contexto", () => {
  it("roleOfMetric resolve role diferente para a mesma height por regra", () => {
    const asProgression = roleOfMetric("height", { rule: "progression" });
    const asFatigue = roleOfMetric("height", { rule: "fatigue" });

    expect(asProgression).toBe("kpi_performance");
    expect(asFatigue).toBe("context");
    expect(asProgression).not.toBe(asFatigue);
  });

  it("rsi muda de role entre mes_1 e mes_3_peaking", () => {
    const inMes1 = roleOfMetric("rsi", { rule: "progression", phase: "mes_1" });
    const inMes3 = roleOfMetric("rsi", {
      rule: "progression",
      phase: "mes_3_peaking",
    });
    expect(inMes3).toBe("kpi_reactive");
    expect(inMes1).not.toBe("kpi_reactive");
  });
});
