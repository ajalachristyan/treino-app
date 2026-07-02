import { describe, it, expect, afterEach, vi } from "vitest";

import { requestPersistentStorage } from "./persist.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestPersistentStorage", () => {
  it("retorna true quando o navegador concede armazenamento persistente", async () => {
    vi.stubGlobal("navigator", {
      storage: { persist: () => Promise.resolve(true) },
    });
    expect(await requestPersistentStorage()).toBe(true);
  });

  it("retorna false quando o navegador nega", async () => {
    vi.stubGlobal("navigator", {
      storage: { persist: () => Promise.resolve(false) },
    });
    expect(await requestPersistentStorage()).toBe(false);
  });

  it("engole erro do persist() e retorna false (best-effort, NUNCA lanca)", async () => {
    vi.stubGlobal("navigator", {
      storage: {
        persist: () => Promise.reject(new Error("boom")),
      },
    });
    await expect(requestPersistentStorage()).resolves.toBe(false);
  });

  it("retorna false quando a API nao existe (sem navigator.storage)", async () => {
    vi.stubGlobal("navigator", {});
    expect(await requestPersistentStorage()).toBe(false);
  });

  it("retorna false quando storage existe mas persist NAO e funcao", async () => {
    // Realidade de WebViews embutidos: navigator.storage existe (p/ estimate())
    // mas sem persist(). O typeof guard tem de segurar isso sem lancar.
    vi.stubGlobal("navigator", { storage: { estimate: () => Promise.resolve({}) } });
    expect(await requestPersistentStorage()).toBe(false);
  });
});
