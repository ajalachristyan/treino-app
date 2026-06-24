import type { WorkBlockItemRow } from "../../data/plan.ts";

// Rotulo curto e leigo do tipo de progressao (so para contexto na leitura).
const TYPE_LABEL: Record<string, string> = {
  load_reps: "carga x reps",
  isometric_intent: "intencao iso",
  contact_quality: "qualidade do contato",
  contact_time: "tempo de contato",
  jump_height: "altura do salto",
  difficulty_tier: "degrau de dificuldade",
  assisted_load: "carga assistida",
  skill_acquisition: "skill",
  time_under_tension: "tempo sob tensao",
};

export function ExerciseRow({ item }: { item: WorkBlockItemRow }) {
  const meta: string[] = [];
  if (item.planned_sets !== null) meta.push(`${item.planned_sets} series`);
  meta.push(TYPE_LABEL[item.progression_type] ?? item.progression_type);

  return (
    <div className="exrow">
      <span className="exrow-seq">{item.planned_sequence}</span>
      <div className="exrow-body">
        <div className="exrow-name">
          {item.exercise_name}
          {item.is_warmup === 1 && (
            <>
              {" "}
              <span className="badge badge-warmup">aquecimento</span>
            </>
          )}
        </div>
        <div className="exrow-note">
          <span className="muted">{meta.join(" · ")}</span>
        </div>
        {item.notes !== null && item.notes !== "" && (
          <div className="exrow-note">{item.notes}</div>
        )}
      </div>
    </div>
  );
}
