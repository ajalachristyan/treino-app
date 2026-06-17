/**
 * I-3 — Teste de salto grava observação pura.
 * Brief §9: campos exatos {height, time_to_takeoff, contact_time, jump_type,
 * measurement_source, timestamp}. RSI/RSI-mod NÃO são colunas; derivam na
 * leitura.
 *
 * Parte DB: PRAGMA jump_test não tem `rsi` nem `rsi_mod`.
 * Parte puro-TS: funcoes `rsi`/`rsiMod` existem e computam corretamente.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { rsi, rsiMod } from "../engine/derivations.ts";
import { applyMigrations } from "../db/runner.ts";
import { loadMigrations } from "../db/migrations.ts";
import { engines, type Database } from "./_helpers/engines.ts";

describe.each(engines)(
  "I-03 (DB) — jump_test sem RSI/RSI-mod como coluna (%s)",
  (_engineName, openDb) => {
    let db: Database;
    beforeEach(async () => {
      db = await openDb(":memory:");
      await applyMigrations(db, loadMigrations);
    });
    afterEach(async () => {
      await db.close();
    });

    it("jump_test nao tem coluna rsi nem rsi_mod (em nenhuma variante)", async () => {
      const cols = await db.all<{ name: string }>(
        `PRAGMA table_info(jump_test)`,
      );
      const names = cols.map((c) => c.name);
      for (const n of names) {
        expect(
          /^rsi(_mod)?$/i.test(n),
          `coluna "${n}" em jump_test parece RSI/RSI-mod — derivacao foi gravada`,
        ).toBe(false);
      }
    });
  },
);

describe("I-03 (puro-TS) — RSI/RSI-mod sao funcoes derivadas", () => {
  it("rsi(height, contact_time) computa height/contact_time", () => {
    const r = rsi(30, 200);
    expect(r).toBeCloseTo(0.15, 5);
    expect(Number.isFinite(r)).toBe(true);
  });

  it("rsiMod(height, time_to_takeoff) computa height/time_to_takeoff", () => {
    const r = rsiMod(30, 300);
    expect(r).toBeCloseTo(0.1, 5);
    expect(Number.isFinite(r)).toBe(true);
  });
});
