// =============================================================================
// HARNESS DA SPIKE DE PERSISTENCIA (Fase 0) — DESCARTAVEL.
//
// Objetivo unico: provar, num browser real (idealmente no iPhone), que
// wa-sqlite + OPFS (AccessHandlePoolVFS, build sincrono) consegue:
//   1. aplicar o schema REAL (migrations/001_init.sql) sob OPFS;
//   2. escrever e reler uma linha que sobrevive a reload/fechar-abrir;
//   3. reportar o estado de persistencia/quota do Storage.
//
// Correcao > polimento. Estilo inline, alvos de toque grandes, dark mode.
// =============================================================================

import { useState } from "react";

import { WaSqliteOpfsAdapter } from "./db/adapters/wa-sqlite-opfs.ts";
import type { ProbeResult } from "./db/adapters/wa-sqlite-opfs.ts";
import { applyMigrations } from "./db/runner.ts";
import { loadMigrationsBrowser } from "./db/migrations.browser.ts";

// Caminho passado ao adapter por paridade de interface; o nome real em OPFS e
// fixo dentro do adapter (ver DB_FILENAME).
const DB_PATH = "treino.sqlite";

type Status =
  | { kind: "idle" }
  | { kind: "running"; msg: string }
  | { kind: "ok"; msg: string }
  | { kind: "error"; msg: string };

// Ambiente do navegador, calculado UMA vez. Serve para detectar o sintoma real
// do iPhone do dono: app aberto num NAVEGADOR EMBUTIDO (in-app browser) em vez
// do Safari — onde nao da para "Adicionar a Tela de Inicio" nem persistir.
interface BrowserEnv {
  standalone: boolean;
  embedded: boolean;
  userAgent: string;
}

// Marcadores de UA de navegadores embutidos conhecidos (in-app browsers).
const EMBEDDED_MARKERS = [
  "FBAN",
  "FBAV",
  "Instagram",
  "Line/",
  "Twitter",
  "WhatsApp",
  "Telegram",
  "MicroMessenger",
  "GSA/",
  "Snapchat",
  "Pinterest",
];

function detectEnv(): BrowserEnv {
  const ua = navigator.userAgent;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  const embedded = EMBEDDED_MARKERS.some((m) => ua.includes(m));
  return { standalone, embedded, userAgent: ua };
}

// "Safari puro" no iOS: tem "Safari" e "Version/" e NAO carrega marcador de
// outro motor/app (CriOS=Chrome, FxiOS=Firefox, EdgiOS=Edge). Usado so para o
// banner de aviso (heuristica, nao gate de funcionalidade).
function looksLikeRealSafari(ua: string): boolean {
  return (
    /Safari/.test(ua) &&
    /Version\//.test(ua) &&
    !/(CriOS|FxiOS|EdgiOS|OPiOS)/.test(ua) &&
    !EMBEDDED_MARKERS.some((m) => ua.includes(m))
  );
}

export function App(): React.JSX.Element {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Calculado uma vez (initializer de useState nao reroda em re-render).
  const [env] = useState<BrowserEnv>(detectEnv);

  async function withDb<T>(fn: (db: WaSqliteOpfsAdapter) => Promise<T>): Promise<T> {
    const db = await WaSqliteOpfsAdapter.open(DB_PATH);
    try {
      return await fn(db);
    } finally {
      await db.close();
    }
  }

  async function onMigrarEscrever(): Promise<void> {
    setStatus({ kind: "running", msg: "Migrando schema real + escrevendo..." });
    try {
      const result = await withDb(async (db) => {
        // Aplica o schema REAL sob OPFS — o teste de fogo da spike.
        await applyMigrations(db, loadMigrationsBrowser);

        const id = crypto.randomUUID();
        const now = Date.now();
        // Peso ficticio plausivel; measured_at e timestamp_server = agora.
        await db.run(
          `INSERT INTO body_weight_log
             (id, weight_kg, measured_at, measurement_source, timestamp_server, notes)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, 82.5, now, "instrumented", now, "spike fase-0"],
        );
        return { id, now };
      });
      setStatus({
        kind: "ok",
        msg:
          `Schema aplicado e linha gravada em body_weight_log.\n` +
          `id=${result.id}\n` +
          `measured_at=${new Date(result.now).toISOString()}`,
      });
    } catch (err) {
      setStatus({ kind: "error", msg: errMsg(err) });
    }
  }

  async function onLer(): Promise<void> {
    setStatus({ kind: "running", msg: "Lendo body_weight_log..." });
    try {
      const row = await withDb((db) =>
        db.get<{ n: number; last: number | null }>(
          `SELECT count(*) AS n, MAX(measured_at) AS last FROM body_weight_log`,
        ),
      );
      const n = row?.n ?? 0;
      const last =
        row?.last != null ? new Date(row.last).toISOString() : "(nenhum)";
      setStatus({ kind: "ok", msg: `Linhas: ${n}\nUltima medicao: ${last}` });
    } catch (err) {
      setStatus({ kind: "error", msg: errMsg(err) });
    }
  }

  async function onPersistencia(): Promise<void> {
    setStatus({ kind: "running", msg: "Consultando Storage..." });
    try {
      const before = await navigator.storage.persisted();
      const granted = await navigator.storage.persist();
      const est = await navigator.storage.estimate();
      const usageMb = est.usage != null ? (est.usage / 1e6).toFixed(2) : "?";
      const quotaMb = est.quota != null ? (est.quota / 1e6).toFixed(0) : "?";
      setStatus({
        kind: "ok",
        msg:
          `persisted() antes: ${before}\n` +
          `persist() agora concedeu: ${granted}\n` +
          `uso: ${usageMb} MB / quota: ${quotaMb} MB`,
      });
    } catch (err) {
      setStatus({ kind: "error", msg: errMsg(err) });
    }
  }

  async function onReset(): Promise<void> {
    setStatus({ kind: "running", msg: "Apagando OPFS..." });
    try {
      await WaSqliteOpfsAdapter.deleteDatabase();
      setStatus({
        kind: "ok",
        msg: "OPFS apagado (best-effort). Recarregue a pagina antes de remigrar.",
      });
    } catch (err) {
      setStatus({ kind: "error", msg: errMsg(err) });
    }
  }

  async function onDiagnostico(): Promise<void> {
    setStatus({ kind: "running", msg: "Rodando diagnostico..." });
    try {
      const probe: ProbeResult = await WaSqliteOpfsAdapter.probe();
      // estimate() e best-effort: nem todo contexto suporta.
      let estimateLine = "estimate(): indisponivel";
      try {
        const est = await navigator.storage.estimate();
        const usageMb = est.usage != null ? (est.usage / 1e6).toFixed(2) : "?";
        const quotaMb = est.quota != null ? (est.quota / 1e6).toFixed(0) : "?";
        estimateLine = `uso: ${usageMb} MB / quota: ${quotaMb} MB`;
      } catch {
        // mantem a linha "indisponivel".
      }
      setStatus({
        kind: "ok",
        msg:
          `userAgent: ${env.userAgent}\n` +
          `standalone (app instalado): ${env.standalone}\n` +
          `embedded (navegador embutido): ${env.embedded}\n` +
          `hasGetDirectory: ${probe.hasGetDirectory}\n` +
          `hasCreateSyncAccessHandle: ${probe.hasCreateSyncAccessHandle}\n` +
          `${estimateLine}`,
      });
    } catch (err) {
      setStatus({ kind: "error", msg: errMsg(err) });
    }
  }

  const busy = status.kind === "running";
  // Banner so quando faz sentido para o sintoma do iPhone: (a) marcador de
  // navegador embutido no UA; OU (b) e iOS, nao-instalado, e o UA nao parece
  // Safari puro (provavel in-app browser sem marcador conhecido). O gate de iOS
  // evita falso-positivo em Chrome/Firefox DESKTOP (que tambem nao tem
  // "Version/" e cairiam na clausula (b) sem ele).
  const isIOS = /iPhone|iPad|iPod/.test(env.userAgent);
  const showEmbeddedWarning =
    env.embedded ||
    (isIOS && !env.standalone && !looksLikeRealSafari(env.userAgent));

  return (
    <main style={S.main}>
      {showEmbeddedWarning && (
        <section style={S.embeddedBanner}>
          ⚠️ Você não parece estar no Safari (talvez um navegador embutido,
          aberto de dentro de outro app). No iPhone, abra no Safari: toque em
          ••• / Compartilhar → "Abrir no Safari". Só no Safari dá para Adicionar
          à Tela de Início e salvar os dados.
        </section>
      )}

      <h1 style={S.h1}>Treino — spike de persistência (Fase 0)</h1>
      <p style={S.sub}>
        wa-sqlite + OPFS (AccessHandlePoolVFS, build síncrono) rodando o schema
        real.
      </p>
      <p style={S.installedLine}>
        Modo app instalado: {env.standalone ? "sim" : "não"}
      </p>

      <div style={S.buttons}>
        <button style={S.btn} disabled={busy} onClick={onMigrarEscrever}>
          Migrar + Escrever
        </button>
        <button style={S.btn} disabled={busy} onClick={onLer}>
          Ler
        </button>
        <button style={S.btn} disabled={busy} onClick={onPersistencia}>
          Status de persistência
        </button>
        <button style={S.btn} disabled={busy} onClick={onDiagnostico}>
          Diagnóstico
        </button>
        <button style={{ ...S.btn, ...S.btnDanger }} disabled={busy} onClick={onReset}>
          Reset (apagar OPFS)
        </button>
      </div>

      <section style={statusStyle(status)}>
        <strong style={S.statusLabel}>{statusLabel(status)}</strong>
        <pre style={S.pre}>{statusMsg(status)}</pre>
      </section>

      <p style={S.note}>
        ⚠️ Para persistência confiável no iPhone: Compartilhar → Adicionar à Tela
        de Início.
      </p>
    </main>
  );
}

function errMsg(err: unknown): string {
  if (err instanceof Error) {
    // Surfaca a causa encadeada (ex.: o OPFS_INIT_FAILED cru vindo do worker),
    // sem o stack inteiro — so a mensagem.
    const cause =
      err.cause instanceof Error ? `\n[causa] ${err.cause.message}` : "";
    return `${err.message}${cause}`;
  }
  return String(err);
}

function statusLabel(s: Status): string {
  switch (s.kind) {
    case "idle":
      return "Pronto";
    case "running":
      return "Executando…";
    case "ok":
      return "OK";
    case "error":
      return "ERRO";
  }
}

function statusMsg(s: Status): string {
  switch (s.kind) {
    case "idle":
      return "Toque em um botão para começar.";
    case "running":
    case "ok":
    case "error":
      return s.msg;
  }
}

function statusStyle(s: Status): React.CSSProperties {
  const base = S.status;
  if (s.kind === "error") return { ...base, borderColor: "#f85149", color: "#ffa198" };
  if (s.kind === "ok") return { ...base, borderColor: "#3fb950", color: "#7ee787" };
  return base;
}

const S = {
  main: {
    minHeight: "100vh",
    margin: 0,
    padding: "24px 16px calc(24px + env(safe-area-inset-bottom))",
    background: "#0d1117",
    color: "#e6edf3",
    fontFamily: "system-ui, -apple-system, sans-serif",
    boxSizing: "border-box",
  },
  embeddedBanner: {
    fontSize: 15,
    lineHeight: 1.5,
    background: "#3a2d10",
    border: "1px solid #9e6a1f",
    color: "#f5d98b",
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  h1: { fontSize: 22, margin: "0 0 4px" },
  sub: { fontSize: 14, color: "#8b949e", margin: "0 0 8px", lineHeight: 1.4 },
  installedLine: { fontSize: 13, color: "#8b949e", margin: "0 0 24px" },
  buttons: { display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 },
  btn: {
    appearance: "none",
    border: "1px solid #30363d",
    background: "#21262d",
    color: "#e6edf3",
    fontSize: 18,
    fontWeight: 600,
    padding: "16px 20px",
    borderRadius: 12,
    cursor: "pointer",
    minHeight: 56,
  },
  btnDanger: { borderColor: "#6e2b2b", background: "#2d1414", color: "#ffa198" },
  status: {
    border: "1px solid #30363d",
    borderRadius: 12,
    padding: 16,
    background: "#161b22",
    marginBottom: 24,
  },
  statusLabel: { display: "block", fontSize: 13, letterSpacing: 1, marginBottom: 8 },
  pre: {
    margin: 0,
    fontSize: 14,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: "ui-monospace, monospace",
  },
  note: {
    fontSize: 15,
    lineHeight: 1.5,
    background: "#1f2a18",
    border: "1px solid #3d5722",
    color: "#d3f5b8",
    padding: 14,
    borderRadius: 12,
  },
} satisfies Record<string, React.CSSProperties>;
