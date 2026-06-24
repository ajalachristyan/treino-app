// =============================================================================
// Endurecimento do OPFS no iOS — ciclo de vida da pagina (Bloco A).
//
// PROBLEMA: o Safari iOS pode matar o processo do PWA em background (swipe-kill
// ou pressao de memoria). Se isso acontece com um FileSystemSyncAccessHandle
// ainda aberto, o handle vira ORFAO — sobrevive ao reload e segura o arquivo,
// bloqueando reabrir E apagar, ate REINICIAR o aparelho (WebKit #301520, aberto
// no iOS 26). Foi a dor central da saga da Fase 0.
//
// CURA (prevencao): ao ir para background, soltar o handle. A pesquisa de campo
// mostra que o jeito CONFIAVEL no iOS e `worker.terminate()` a partir da main
// thread (fechar handle dentro do worker NAO solta o lock de forma confiavel).
// Por isso release() = drena ops + termina o worker; a proxima op recria o
// worker e reabre (lazy). NAO reabrimos proativamente no 'visible': re-adquirir
// handle a cada foreground so aumenta a superficie de falha transitoria do iOS
// (o proprio bug que estamos evitando), sem ganho — as ops ja reabrem sozinhas.
//
// `visibilitychange:hidden` e o sinal mais confiavel no iOS (o `pagehide`
// costuma NAO disparar no swipe-kill); ouvimos os dois. NAO usamos
// `beforeunload` (hostil ao iOS / bfcache).
//
// BEST-EFFORT: release e assincrono (drena + termina); o iOS pode matar antes de
// concluir. A durabilidade do dado NAO depende disto — vem do flush-por-commit
// do VFS + instalar na tela + persist() + BACKUP EXTERNO (brief 10.5). Aqui so
// reduzimos a chance do handle orfao.
// =============================================================================

/** O minimo que o lifecycle precisa do adapter (so o OPFS implementa). */
export interface OpfsLifecycleTarget {
  release(): Promise<void>;
}

/**
 * Registra os listeners de ciclo de vida. `getTarget` devolve o adapter atual
 * (ou null se ainda nao aberto) — passamos uma funcao em vez do adapter direto
 * para o provider poder trocar/zerar a referencia sem religar os listeners.
 *
 * Retorna uma funcao de cleanup que remove os listeners (uso em testes/HMR).
 */
export function registerOpfsLifecycle(
  getTarget: () => OpfsLifecycleTarget | null,
): () => void {
  const release = (): void => {
    // Fire-and-forget: o evento nao espera Promise. Engole rejeicao — soltar
    // handle e best-effort; se falhar, a recuperacao no boot (acquireVfs) cobre.
    void getTarget()
      ?.release()
      .catch((err: unknown) => {
        console.error("lifecycle: falha no release do OPFS:", err);
      });
  };

  const onPageHide = (): void => release();
  const onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") release();
  };

  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("visibilitychange", onVisibilityChange);

  return (): void => {
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
