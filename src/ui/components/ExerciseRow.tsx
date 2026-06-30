import type { WorkBlockItemRow } from "../../data/plan.ts";
import { progressionLabel } from "../labels.ts";

// Linha de exercicio dentro de um bloco. Tocavel: abre o detalhe ("modo de
// fazer"). E um <button>, entao o conteudo usa <span> (button so aceita
// phrasing content) — o layout de coluna vem do CSS (.exrow-body).
export function ExerciseRow({
  item,
  onOpen,
}: {
  item: WorkBlockItemRow;
  onOpen: (exerciseId: string) => void;
}) {
  const meta: string[] = [];
  if (item.planned_sets !== null) meta.push(`${item.planned_sets} séries`);
  meta.push(progressionLabel(item.progression_type));

  return (
    <button
      type="button"
      className="exrow exrow-tap"
      onClick={() => onOpen(item.exercise_id)}
    >
      <span className="exrow-seq">{item.planned_sequence}</span>
      <span className="exrow-body">
        <span className="exrow-name">
          {item.exercise_name}
          {item.is_warmup === 1 && (
            <>
              {" "}
              <span className="badge badge-warmup">aquecimento</span>
            </>
          )}
        </span>
        <span className="exrow-note muted">{meta.join(" · ")}</span>
        {item.notes !== null && item.notes !== "" && (
          <span className="exrow-note">{item.notes}</span>
        )}
      </span>
      <span className="exrow-chevron" aria-hidden="true">
        ›
      </span>
    </button>
  );
}
