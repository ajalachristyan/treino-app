// =============================================================================
// Pedido de armazenamento PERSISTENTE (durabilidade — Divida 3, mitigacao #1).
//
// navigator.storage.persist() pede ao navegador para NAO despejar o OPFS sob
// pressao de armazenamento. Ajuda no Chrome/Android (vira "persistent"); no iOS
// o que de fato protege e instalar na Tela de Inicio, mas pedir e barato e nao
// custa. Antes so o harness morto (src/App.tsx) chamava isto — o app real nunca
// pedia. Agora o DbProvider chama no boot.
//
// BEST-EFFORT: nunca lanca e nunca bloqueia o boot. Se a API faltar (navegador
// embutido) ou rejeitar, devolve false silenciosamente — a durabilidade real
// vem de instalar + BACKUP EXTERNO, nao deste pedido.
// =============================================================================

/**
 * Pede armazenamento persistente ao navegador. Retorna se foi concedido
 * (false tambem quando a API nao existe ou falha). Nunca lanca.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = navigator?.storage;
    if (storage && typeof storage.persist === "function") {
      return await storage.persist();
    }
  } catch (err) {
    console.warn(
      "persist(): pedido de armazenamento persistente falhou (best-effort):",
      err,
    );
  }
  return false;
}
