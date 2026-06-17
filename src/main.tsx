// =============================================================================
// Ponto de entrada do harness da spike de persistencia (Fase 0). Monta o React
// e registra o service worker do vite-plugin-pwa (registerType: 'prompt' — o
// fluxo de update e explicito; aqui so registramos, sem UI de prompt nesta
// spike descartavel).
// =============================================================================

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("treino-app: #root nao encontrado no index.html");
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
