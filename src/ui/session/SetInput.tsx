import { useState } from "react";

import type { SetMeasures } from "../../data/sessions.ts";
import type { LoadType, ProgressionType, QualityPerSet } from "../../domain/types.ts";

// Campo numerico controlado (string para permitir digitar/limpar).
function NumField({
  label,
  value,
  onChange,
  step,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
  min?: string;
  max?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="field-input"
        type="number"
        inputMode="decimal"
        step={step ?? "any"}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

const QUALITIES: ReadonlyArray<readonly [QualityPerSet, string]> = [
  ["stable", "estavel"],
  ["tremor", "tremor"],
  ["joint_pain", "dor articular"],
];

/**
 * Entrada polimorfica de UMA serie. Renderiza os campos do progression_type e,
 * no "salvar", monta o SetMeasures tipado e chama onSave. Devolve null se a
 * entrada estiver incompleta/invalida (o botao fica desabilitado).
 */
export function SetInput({
  progressionType,
  loadType,
  prefill,
  onSave,
}: {
  progressionType: ProgressionType;
  loadType?: LoadType | undefined;
  prefill?: SetMeasures | undefined;
  onSave: (measures: SetMeasures, rpe: number | null) => void | Promise<void>;
}) {
  // Exercicio de peso corporal (pull-up/dips): a "carga" vira toggle "peso
  // corporal" (loadKg 0) vs "+ lastro" (kg extra). So no load_reps.
  const isBodyweight = loadType === "bodyweight" && progressionType === "load_reps";
  const [weighted, setWeighted] = useState(
    isBodyweight &&
      prefill?.progressionType === "load_reps" &&
      prefill.loadKg > 0,
  );
  // Valores iniciais a partir do prefill (memoria de carga), por TIPO — `a` e o
  // 1o campo do tipo, `b` o 2o (quando ha). Mapear por tipo evita o erro de
  // pegar reps onde o 1o campo e assist.kg (assisted_load).
  const pf = prefill as Record<string, number | undefined> | undefined;
  const s = (v: number | undefined): string => (typeof v === "number" ? String(v) : "");
  const initA = ((): string => {
    switch (progressionType) {
      case "load_reps":
        return s(pf?.["reps"]);
      case "assisted_load":
        return s(pf?.["assistedLoadKg"]);
      case "isometric_intent":
        return s(pf?.["intentPct"]);
      case "jump_height":
        return s(pf?.["heightCm"]);
      case "difficulty_tier":
        return s(pf?.["difficultyStep"]);
      case "time_under_tension":
        return s(pf?.["seconds"]);
      default:
        return "";
    }
  })();
  const initB =
    progressionType === "load_reps"
      ? s(pf?.["loadKg"])
      : progressionType === "assisted_load"
        ? s(pf?.["reps"])
        : "";
  const [a, setA] = useState(initA);
  const [b, setB] = useState(initB);
  const [quality, setQuality] = useState<QualityPerSet | null>(
    prefill?.progressionType === "contact_quality" ? prefill.quality : null,
  );
  const [skill, setSkill] = useState<boolean | null>(
    prefill?.progressionType === "skill_acquisition" ? prefill.skillAchieved : null,
  );
  const [rpe, setRpe] = useState("");
  const [saving, setSaving] = useState(false);

  const num = (s: string): number | null => {
    const n = Number(s);
    return s.trim() !== "" && Number.isFinite(n) ? n : null;
  };

  function build(): SetMeasures | null {
    switch (progressionType) {
      case "load_reps": {
        const reps = num(a);
        if (reps === null || reps <= 0) return null;
        // Peso corporal sem lastro: carga 0 (sempre valida — nao exige o campo).
        if (isBodyweight && !weighted) return { progressionType, reps, loadKg: 0 };
        const loadKg = num(b);
        return loadKg !== null && loadKg >= 0
          ? { progressionType, reps, loadKg }
          : null;
      }
      case "isometric_intent": {
        const intentPct = num(a);
        return intentPct !== null && intentPct >= 0 && intentPct <= 100
          ? { progressionType, intentPct }
          : null;
      }
      case "contact_quality":
        return quality !== null ? { progressionType, quality } : null;
      case "jump_height": {
        const heightCm = num(a);
        return heightCm !== null && heightCm > 0 ? { progressionType, heightCm } : null;
      }
      case "difficulty_tier": {
        const difficultyStep = num(a);
        return difficultyStep !== null && difficultyStep > 0
          ? { progressionType, difficultyStep }
          : null;
      }
      case "assisted_load": {
        const assistedLoadKg = num(a);
        const reps = num(b);
        return assistedLoadKg !== null && assistedLoadKg >= 0 && reps !== null && reps > 0
          ? { progressionType, assistedLoadKg, reps }
          : null;
      }
      case "skill_acquisition":
        return skill !== null ? { progressionType, skillAchieved: skill } : null;
      case "time_under_tension": {
        const seconds = num(a);
        return seconds !== null && seconds > 0 ? { progressionType, seconds } : null;
      }
      case "contact_time":
        return null; // I-6: nunca tem session_set
    }
  }

  const measures = build();
  const r = num(rpe);
  // RPE e opcional; se preenchido, precisa estar em 0-10 (CHECK do schema).
  const rpeValid = rpe.trim() === "" || (r !== null && r >= 0 && r <= 10);
  const canSave = measures !== null && rpeValid && !saving;

  return (
    <div className="setinput">
      {progressionType === "load_reps" && !isBodyweight && (
        <div className="field-row">
          <NumField label="reps" value={a} onChange={setA} step="1" />
          <NumField label="carga (kg)" value={b} onChange={setB} />
        </div>
      )}
      {isBodyweight && (
        <>
          <div className="field-row">
            <NumField label="reps" value={a} onChange={setA} step="1" />
            {weighted && (
              <NumField label="+kg (lastro)" value={b} onChange={setB} />
            )}
          </div>
          <div className="choice-row">
            <button
              type="button"
              className="choice"
              aria-pressed={!weighted}
              onClick={() => setWeighted(false)}
            >
              peso corporal
            </button>
            <button
              type="button"
              className="choice"
              aria-pressed={weighted}
              onClick={() => setWeighted(true)}
            >
              + lastro
            </button>
          </div>
        </>
      )}
      {progressionType === "assisted_load" && (
        <div className="field-row">
          <NumField label="assist. (kg)" value={a} onChange={setA} />
          <NumField label="reps" value={b} onChange={setB} step="1" />
        </div>
      )}
      {progressionType === "isometric_intent" && (
        <NumField label="intencao (%)" value={a} onChange={setA} />
      )}
      {progressionType === "jump_height" && (
        <NumField label="altura (cm)" value={a} onChange={setA} />
      )}
      {progressionType === "difficulty_tier" && (
        <NumField label="degrau" value={a} onChange={setA} step="1" />
      )}
      {progressionType === "time_under_tension" && (
        <NumField label="tempo (s)" value={a} onChange={setA} />
      )}
      {progressionType === "contact_quality" && (
        <div className="choice-row">
          {QUALITIES.map(([q, label]) => (
            <button
              key={q}
              type="button"
              className="choice"
              aria-pressed={quality === q}
              onClick={() => setQuality(q)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {progressionType === "skill_acquisition" && (
        <div className="choice-row">
          <button type="button" className="choice" aria-pressed={skill === true} onClick={() => setSkill(true)}>
            fez
          </button>
          <button type="button" className="choice" aria-pressed={skill === false} onClick={() => setSkill(false)}>
            nao fez
          </button>
        </div>
      )}

      <div className="field-row">
        <NumField label="RPE 0-10 (opc.)" value={rpe} onChange={setRpe} step="0.5" min="0" max="10" />
        <button
          type="button"
          className="btn btn-primary setinput-save"
          disabled={!canSave}
          onClick={async () => {
            if (measures === null || !rpeValid) return;
            setSaving(true);
            try {
              await onSave(measures, r);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "…" : "+ serie"}
        </button>
      </div>
      {!rpeValid && <p className="field-hint">RPE deve ser de 0 a 10.</p>}
    </div>
  );
}
