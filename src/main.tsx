// =============================================================================
// Ponto de entrada do app (P1). Monta o React e registra o service worker do
// vite-plugin-pwa (registerType: 'prompt' — fluxo de update explicito).
//
// O harness da spike (src/App.tsx) fica no repo para debug de OPFS no device,
// mas NAO e mais importado (tree-shaken do bundle). A UI real vive em src/ui/.
// =============================================================================

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./ui/tokens.css";
import { App } from "./ui/App.tsx";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("treino-app: #root nao encontrado no index.html");
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
