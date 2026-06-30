// =============================================================================
// Ponto de entrada do app. Monta o React. O service worker e registrado pelo
// registerSW.js que o vite-plugin-pwa INJETA no build (injectRegister 'auto') —
// nao aqui. Com registerType 'autoUpdate' (vite.config), o SW novo se ativa e
// recarrega o app sozinho; nao precisa de UI de update.
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
