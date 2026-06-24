import { describe, it, expect } from "vitest";
import { backupFilename } from "./backup.ts";

describe("backupFilename", () => {
  it("formata data/hora local com zero-padding e segundos", () => {
    // 2026-06-24 09:05:07 local
    const name = backupFilename(new Date(2026, 5, 24, 9, 5, 7));
    expect(name).toBe("treino-backup-2026-06-24-090507.sql");
  });

  it("usa o mes 1-baseado e padroniza dezembro/dia 31", () => {
    const name = backupFilename(new Date(2026, 11, 31, 23, 59, 59));
    expect(name).toBe("treino-backup-2026-12-31-235959.sql");
  });
});
