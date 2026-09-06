/**
 * R2-24 / Feature 24: Behavioral anomaly scoring — pure telemetry scorer.
 *
 * Telemetry-only: S_cheat = w1·σ²(t_keystroke) + w2·I_focus_lost
 *   + w3·max(0, 1 - t_elapsed/t_reading_min).
 * Callers log the score async to security_logs; never block submissions.
 * `warn_only` unless commander escalates anti_cheat_strictness (existing
 * governance mapping in LiveQuiz/WaitingRoom stays authoritative).
 */

export interface AnomalyVector {
  keystrokeDeltasMs: number[];
  focusLostCount: number;
  elapsedMs: number;
  readingMinMs: number;
}

export const ANOMALY_WEIGHTS = { w1: 0.000001, w2: 1.0, w3: 0.5 } as const;

export function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  let acc = 0;
  for (const x of xs) acc += (x - mean) * (x - mean);
  return acc / (xs.length - 1);
}

export function scoreAnomaly(v: AnomalyVector): number {
  const keyVar = variance(v.keystrokeDeltasMs);
  const focus = v.focusLostCount > 0 ? 1 : 0;
  const readingFloor =
    v.readingMinMs > 0 ? Math.max(0, 1 - v.elapsedMs / v.readingMinMs) : 0;
  const score =
    ANOMALY_WEIGHTS.w1 * keyVar + ANOMALY_WEIGHTS.w2 * focus + ANOMALY_WEIGHTS.w3 * readingFloor;
  return Number.isFinite(score) ? Math.max(0, score) : 0;
}
