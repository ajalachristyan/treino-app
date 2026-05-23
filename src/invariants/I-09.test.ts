/**
 * I-9 — ACWR sem peso decisorio.
 * Brief §9: "Nenhuma decisao da engine depende da razao aguda:cronica."
 *
 * COBERTURA PARCIAL — sentinela estrutural via grep.
 * GATILHO: quando a engine de decisao real for construida (item 6 do brief
 * §12), adicionar sweep COMPORTAMENTAL — varia ACWR como input e verifica
 * que nenhuma decisao da engine muda. Por enquanto, o grep sobre
 * `src/engine/decision/**` cobre o caminho estrutural.
 */
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DECISION_DIR = join(__dirname, "..", "engine", "decision");

async function listTsFiles(dir: string): Promise<string[]> {
  const result: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const e of entries) {
      const full = join(current, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && e.name.endsWith(".ts")) result.push(full);
    }
  }
  await walk(dir);
  return result;
}

describe("I-09 — ACWR sem peso decisorio (COBERTURA PARCIAL)", () => {
  it("nenhum modulo em src/engine/decision/ menciona ACWR/acute_chronic/chronicLoad", async () => {
    const files = await listTsFiles(DECISION_DIR);
    // sentinela: a pasta da engine de decisao existe e tem arquivos.
    expect(
      files.length,
      "src/engine/decision/ vazio — sentinela do I-9 perdeu o alvo",
    ).toBeGreaterThan(0);

    const forbidden = /\bacwr\b|acute_chronic|acuteChronic|chronicLoad/i;
    for (const f of files) {
      const content = await readFile(f, "utf-8");
      const match = content.match(forbidden);
      expect(
        match,
        `Forbidden ACWR reference found in ${f}: ${match?.[0] ?? ""}`,
      ).toBeNull();
    }
  });
});
