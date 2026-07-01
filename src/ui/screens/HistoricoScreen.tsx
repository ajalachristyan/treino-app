import { useEffect, useState } from "react";

import { useDb } from "../db/DbProvider.tsx";
import {
  getFinishedSessions,
  getSessionItems,
  getSessionSets,
  setRowToMeasures,
  type FinishedSessionRow,
  type SessionItemRow,
} from "../../data/sessions.ts";
import type { SetMeasures } from "../../data/sessions.ts";
import { formatMeasures, formatSessionDate } from "../labels.ts";

// Um item da sessao ja com suas series resolvidas (para exibir).
interface ItemView {
  item: SessionItemRow;
  sets: SetMeasures[];
}

const STATUS_LABEL: Record<string, string> = {
  skipped: "pulado",
  substituted: "substituido",
  added_adhoc: "adicionado",
};

// Cada sessao finalizada carrega seus itens+series sob demanda (poucas por
// vez; N+1 e irrelevante num app pessoal e mantem o codigo simples).
function SessionCard({ session }: { session: FinishedSessionRow }) {
  const db = useDb();
  const [items, setItems] = useState<ItemView[] | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const rows = await getSessionItems(db, session.id);
      const views: ItemView[] = [];
      for (const it of rows) {
        const setRows = await getSessionSets(db, it.id);
        views.push({ item: it, sets: setRows.map(setRowToMeasures) });
      }
      if (alive) setItems(views);
    })();
    return () => {
      alive = false;
    };
  }, [db, session.id]);

  const logged = items?.filter((v) => v.sets.length > 0).length ?? 0;

  return (
    <section className="card">
      <h2 className="card-title">{formatSessionDate(session.started_at)}</h2>
      <p className="card-meta">
        {session.work_block_name ?? "Sessao livre"}
        {items !== null ? ` · ${logged} exercicio(s)` : ""}
      </p>

      {items === null ? (
        <p className="muted">—</p>
      ) : items.length === 0 ? (
        <p className="muted">Nenhuma serie registrada.</p>
      ) : (
        items.map((v) => (
          <div key={v.item.id} className="hist-item">
            <div className="hist-item-name">
              {v.item.exercise_name}
              {STATUS_LABEL[v.item.status] !== undefined && (
                <span className="badge">{STATUS_LABEL[v.item.status]}</span>
              )}
            </div>
            {v.sets.length > 0 && (
              <div className="hist-sets">
                {v.sets.map((m, i) => (
                  <span key={i} className="hist-set">
                    {formatMeasures(m)}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </section>
  );
}

// Tela Historico: lista os treinos FINALIZADOS com suas series. Fecha o buraco
// que fazia o treino "sumir" apos finalizar (ele sempre esteve salvo; faltava
// onde ve-lo). Read-only — apagar treino e acao explicita na tela Treino.
export function HistoricoScreen({ onBack }: { onBack: () => void }) {
  const db = useDb();
  const [sessions, setSessions] = useState<FinishedSessionRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    void getFinishedSessions(db).then((s) => {
      if (alive) setSessions(s);
    });
    return () => {
      alive = false;
    };
  }, [db]);

  return (
    <div className="screen">
      <div className="detail-top">
        <button type="button" className="linkbtn back-link" onClick={onBack}>
          ‹ Voltar
        </button>
      </div>

      <h1 className="h1">Histórico</h1>
      <p className="sub">Seus treinos registrados, do mais recente ao mais antigo.</p>

      {sessions === null ? (
        <p className="muted">Carregando…</p>
      ) : sessions.length === 0 ? (
        <div className="card">
          <p className="muted">
            Nenhum treino finalizado ainda. Quando você finalizar um treino, ele
            aparece aqui.
          </p>
        </div>
      ) : (
        sessions.map((s) => <SessionCard key={s.id} session={s} />)
      )}
    </div>
  );
}
