import { describe, it, expect } from "vitest";
import { createSerialQueue, createBusyGate } from "./concurrency.ts";

// Flush de macrotask: garante que todas as microtasks pendentes rodaram.
const tick = (): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

// Deferred manual: controla quando uma "op" termina, para testar timing.
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("createSerialQueue", () => {
  it("serializa: a task N+1 so comeca quando a N termina por completo", async () => {
    const enqueue = createSerialQueue();
    const log: string[] = [];
    const block1 = deferred();

    const p1 = enqueue(async () => {
      log.push("1:start");
      await block1.promise;
      log.push("1:end");
    });
    const p2 = enqueue(async () => {
      log.push("2:start");
      log.push("2:end");
    });

    await tick();
    // task1 esta presa no await; task2 NAO pode ter comecado (sem interleave).
    expect(log).toEqual(["1:start"]);

    block1.resolve();
    await Promise.all([p1, p2]);
    expect(log).toEqual(["1:start", "1:end", "2:start", "2:end"]);
  });

  it("preserva a ordem FIFO", async () => {
    const enqueue = createSerialQueue();
    const order: number[] = [];
    await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        enqueue(async () => {
          order.push(n);
        }),
      ),
    );
    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it("uma task que rejeita NAO quebra a fila para as proximas", async () => {
    const enqueue = createSerialQueue();
    const p1 = enqueue(async () => {
      throw new Error("boom");
    });
    const p2 = enqueue(async () => "ok");

    await expect(p1).rejects.toThrow("boom");
    await expect(p2).resolves.toBe("ok");
  });

  it("devolve o resultado da task ao caller", async () => {
    const enqueue = createSerialQueue();
    await expect(enqueue(async () => 42)).resolves.toBe(42);
  });

  it("uma task lenta que rejeita ainda bloqueia a proxima ate terminar", async () => {
    const enqueue = createSerialQueue();
    const log: string[] = [];
    const block1 = deferred();

    const p1 = enqueue(async () => {
      log.push("1:start");
      await block1.promise;
      log.push("1:reject");
      throw new Error("falhou");
    });
    const p2 = enqueue(async () => {
      log.push("2:start");
    });

    await tick();
    expect(log).toEqual(["1:start"]); // task2 espera mesmo a task1 indo falhar

    block1.resolve();
    await Promise.allSettled([p1, p2]);
    expect(log).toEqual(["1:start", "1:reject", "2:start"]);
  });
});

describe("createBusyGate", () => {
  it("whenIdle resolve imediatamente quando ocioso", async () => {
    const gate = createBusyGate();
    await expect(gate.whenIdle()).resolves.toBeUndefined();
  });

  it("whenIdle so resolve depois que a op em voo drena", async () => {
    const gate = createBusyGate();
    const block = deferred();
    let opDone = false;
    let idleResolved = false;

    const opP = gate.track(async () => {
      await block.promise;
      opDone = true;
    });
    const idleP = gate.whenIdle().then(() => {
      idleResolved = true;
    });

    await tick();
    expect(idleResolved).toBe(false); // ainda ocupado -> release esperaria aqui

    block.resolve();
    await Promise.all([opP, idleP]);
    expect(opDone).toBe(true);
    expect(idleResolved).toBe(true);
  });

  it("track aninhado (busy>=2): whenIdle so resolve quando TODAS drenam", async () => {
    const gate = createBusyGate();
    const blockOuter = deferred();
    const blockInner = deferred();
    let idleResolved = false;

    const outer = gate.track(async () => {
      // op interna (ex.: exec dentro de uma transacao) eleva busy para 2.
      const inner = gate.track(async () => {
        await blockInner.promise;
      });
      await blockOuter.promise;
      await inner;
    });
    const idleP = gate.whenIdle().then(() => {
      idleResolved = true;
    });

    await tick();
    expect(idleResolved).toBe(false);

    // libera a externa primeiro: ainda ha a interna em voo -> segue ocupado.
    blockOuter.resolve();
    await tick();
    expect(idleResolved).toBe(false);

    blockInner.resolve();
    await Promise.all([outer, idleP]);
    expect(idleResolved).toBe(true);
  });

  it("track devolve o resultado e, ao rejeitar, ainda volta a ocioso", async () => {
    const gate = createBusyGate();
    await expect(gate.track(async () => 7)).resolves.toBe(7);
    await expect(
      gate.track(async () => {
        throw new Error("x");
      }),
    ).rejects.toThrow("x");
    // o finally do track decrementa mesmo na rejeicao -> ocioso de novo.
    await expect(gate.whenIdle()).resolves.toBeUndefined();
  });

  it("multiplos waiters de whenIdle resolvem todos ao drenar", async () => {
    const gate = createBusyGate();
    const block = deferred();
    const op = gate.track(async () => {
      await block.promise;
    });
    const waiters = Promise.all([gate.whenIdle(), gate.whenIdle(), gate.whenIdle()]);
    block.resolve();
    await op;
    await expect(waiters).resolves.toEqual([undefined, undefined, undefined]);
  });
});
