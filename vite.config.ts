// =============================================================================
// Config do Vite para a spike de persistencia (Fase 0).
//
//   - @vitejs/plugin-react: JSX/Fast Refresh para o harness React.
//   - vite-plugin-pwa: service worker + manifest (PWA instalavel; essencial
//     para o "Adicionar a Tela de Inicio" do iPhone, onde OPFS so persiste
//     de forma confiavel no app instalado).
//   - base: "./" (RELATIVO) — o deploy alvo e GitHub Pages sob subpath
//     (/<repo>/); base relativa faz os assets resolverem sob qualquer prefixo.
//   - WASM: o adapter importa wa-sqlite.wasm via "?url"; o Vite ja o trata como
//     asset e emite o arquivo no dist. .sql idem via "?raw" no loader browser.
// =============================================================================

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      // 'autoUpdate': o SW novo faz skipWaiting + clientsClaim e o app recarrega
      // sozinho na proxima abertura. O 'prompt' anterior exigia uma UI de "nova
      // versao, atualizar?" que NUNCA foi implementada -> o SW novo ficava em
      // espera e o app instalado (iPhone) travava na versao antiga (a spike Fase
      // 0) para sempre, deploy apos deploy. App single-user leigo TEM que se
      // atualizar sozinho. Sessao ao vivo autosalva cada serie -> reload seguro.
      registerType: "autoUpdate",
      manifest: {
        name: "Treino",
        short_name: "Treino",
        display: "standalone",
        theme_color: "#0d1117",
        background_color: "#0d1117",
        start_url: ".",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
});
