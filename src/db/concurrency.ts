// =============================================================================
// Primitivas de concorrencia do adapter OPFS (Bloco A).
//
// Existem porque o red team de concorrencia achou DOIS bugs bloqueantes na 1a
// versao do endurecimento: o `self.onmessage` do worker e async, entao dois
// handlers de mensagem interleavavam nos `await` — um 'release' (que fecha os
// handles do OPFS) podia rodar NO MEIO de uma op de leitura/escrita
// (use-after-close, possivel corrupcao silenciosa). O contador na main thread
// nao enxergava os pontos de await do worker.
//
// Sao PUROS (sem DOM/worker/OPFS) de proposito: rodam identicos no worker e num
// teste Node (concurrency.test.ts). A logica nao-trivial que escondeu os bugs
// agora tem verificacao rodavel — exigencia do projeto.
// =============================================================================

/**
 * Fila serial: garante que a `task` N+1 so COMECE quando a `task` N tiver
 * terminado por completo (todos os seus await resolvidos). Usada no worker para
 * tornar cada handler de mensagem (RPC) atomico em relacao aos outros — nenhum
 * 'release'/teardown interleava dentro de uma op.
 *
 * O encadeamento avanca mesmo se uma task rejeitar (a fila nao trava); o caller
 * ainda recebe a Promise da sua task para await/catch se quiser.
 */
export function createSerialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(() => task());
    // A cauda engole o resultado/erro: a proxima task roda independentemente de
    // esta ter dado certo, mas SO depois desta TER TERMINADO (sem interleave).
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

/**
 * "Portao de ocupacao": conta operacoes em voo e deixa esperar ate drenar.
 * Usado pelo adapter para `release()` so soltar os handles DEPOIS que as ops
 * (inclusive uma transacao multi-RPC inteira, via track aninhado) terminarem —
 * sem cortar uma escrita/COMMIT no meio.
 */
export interface BusyGate {
  /** Conta uma op em voo enquanto `op` roda (reentrante: track aninhado soma). */
  track<T>(op: () => Promise<T>): Promise<T>;
  /** Resolve quando nao ha nenhuma op em voo (imediatamente, se ja ocioso). */
  whenIdle(): Promise<void>;
}

export function createBusyGate(): BusyGate {
  let busy = 0;
  let waiters: Array<() => void> = [];
  return {
    async track<T>(op: () => Promise<T>): Promise<T> {
      busy++;
      try {
        return await op();
      } finally {
        if (--busy === 0) {
          const drained = waiters;
          waiters = [];
          for (const w of drained) w();
        }
      }
    },
    whenIdle(): Promise<void> {
      if (busy === 0) return Promise.resolve();
      return new Promise<void>((resolve) => waiters.push(resolve));
    },
  };
}
