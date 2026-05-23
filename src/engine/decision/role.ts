// =============================================================================
// STUB PROVISORIO — mapa de role (I-2, brief Secao 8.1 + 1.2).
// Implementa apenas o que I-2 exige: mesma observacao tem role diferente
// conforme quem le. Expansao para item 6 do brief §12.
// =============================================================================

export type Rule = "progression" | "fatigue" | "deload";
export type Phase = "mes_1" | "mes_2" | "mes_3_peaking" | "mes_3_taper";
export type MetricRole =
  | "kpi_performance"
  | "kpi_reactive"
  | "fatigue_sensor"
  | "context";
export type Metric =
  | "height"
  | "rsi"
  | "rsi_mod"
  | "time_to_takeoff"
  | "contact_time";

/**
 * Resolve o ROLE de uma metrica conforme a REGRA que esta lendo (brief 1.2:
 * "a mesma altura eh KPI para uma regra e contexto para outra").
 *
 * Brief Secao 8.1:
 *   - rsi_mod -> fatigue_sensor sempre
 *   - rsi -> kpi_reactive em mes_3_peaking, context fora disso
 *   - height -> kpi_performance para a regra de progressao, context para outras
 */
export function roleOfMetric(
  metric: Metric,
  context: { rule: Rule; phase?: Phase },
): MetricRole {
  if (metric === "rsi_mod") return "fatigue_sensor";

  if (metric === "rsi") {
    return context.phase === "mes_3_peaking" ? "kpi_reactive" : "context";
  }

  if (metric === "height") {
    return context.rule === "progression" ? "kpi_performance" : "context";
  }

  return "context";
}
