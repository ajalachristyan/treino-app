import { useRef, useState } from "react";
import type { ChangeEvent } from "react";

import { useDb } from "../db/DbProvider.tsx";
import { assertLooksLikeBackup, restoreFromDump } from "../../data/restore.ts";

// UI de RESTAURAR backup (.sql) — a metade destrutiva do backup (dump.ts so
// EXPORTA). Fluxo anti-culpa (Secao 6.3):
//   1. escolher arquivo  -> valida NA HORA (recusa arquivo errado sem susto)
//   2. confirmar         -> deixa CLARO que vai APAGAR o estado atual
//   3. restaurar         -> reset + import (data/restore.ts, testado nos 2 engines)
//   4. recarregar        -> reabre tudo a partir do banco restaurado
// A logica pesada vive/testada em data/restore.ts; aqui e so a cola (smoke).
//
// onBusyChange sobe o "ocupado" pro pai (TodayScreen) durante a operacao
// destrutiva, para TODOS os irmaos (baixar backup, navegar, "nao treinei")
// congelarem — senao dava pra navegar/exportar NO MEIO do wipe, e navegar
// desmonta este componente e engole o erro (banco vazio, sem aviso).
export function RestoreBackup({
  disabled = false,
  onBusyChange,
}: {
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const db = useDb();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ name: string; sql: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-escolher o mesmo arquivo se cancelar
    if (!file) return;
    setError(null);
    setPending(null);
    try {
      const sql = await file.text();
      // Recusa arquivo errado ANTES de qualquer confirmacao destrutiva.
      assertLooksLikeBackup(sql);
      setPending({ name: file.name, sql });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function confirmRestore(): Promise<void> {
    if (pending === null) return;
    setBusy(true);
    onBusyChange?.(true); // congela a tela toda durante o passo destrutivo.
    setError(null);
    try {
      await restoreFromDump(db, pending.sql);
      // O db e singleton de modulo e cada tela tem estado proprio; reabrir do
      // zero e o jeito limpo de tudo passar a ler o banco restaurado.
      window.location.reload();
    } catch (err) {
      // Falhou (ex.: pos-condicao): NAO recarrega — o dono ve o erro na tela.
      // O snapshot de seguranca em restoreFromDump ja recolocou o estado anterior.
      setBusy(false);
      onBusyChange?.(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".sql,text/plain"
        hidden
        onChange={(e) => void onPick(e)}
      />
      <button
        type="button"
        className="btn"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        Restaurar backup (.sql)
      </button>

      {error !== null && <div className="error-box">{error}</div>}

      {pending !== null && (
        <div className="card" role="alertdialog" aria-label="Confirmar restauração">
          <h2 className="card-title">Restaurar “{pending.name}”?</h2>
          <p className="card-meta">
            Isso <strong>apaga os dados atuais</strong> deste app e coloca no
            lugar o que está no backup. Não dá pra desfazer.
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void confirmRestore()}
            >
              Apagar e restaurar
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
