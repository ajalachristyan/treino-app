// =============================================================================
// STUB PROVISORIO — Foster (Secao 5.2).
// Implementa apenas a monotony com piso de SD (I-8). Strain e demais derivados
// ficam para item 6 do brief §12.
// =============================================================================

import { MONOTONY_SD_FLOOR } from "../domain/constants.ts";

/**
 * Monotony = media diaria / desvio-padrao (janela 7d).
 * I-8: aplica PISO de SD para nao explodir em carga uniforme (SD ~ 0).
 *
 * O numero MONOTONY_SD_FLOOR fica em constants.ts; o teste valida COMPORTAMENTO
 * (uniforme -> finito; varied -> menor que uniforme), nunca o numero exato.
 */
export function monotony(dailyLoads: ReadonlyArray<number>): number {
  if (dailyLoads.length === 0) return 0;

  const mean = dailyLoads.reduce((a, b) => a + b, 0) / dailyLoads.length;
  const variance =
    dailyLoads.reduce((sum, x) => sum + (x - mean) ** 2, 0) / dailyLoads.length;
  const sd = Math.sqrt(variance);

  const sdWithFloor = Math.max(sd, MONOTONY_SD_FLOOR);
  return mean / sdWithFloor;
}
