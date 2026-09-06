/**
 * R2-22 / Feature 22: Computerized Adaptive Testing — pure next-item engine.
 *
 * Pure functions only: no Firestore, no tx, no network.
 * Reads Round-1 analytics response fields (pValue/discrimination/irtDifficulty/
 * irtDiscrimination) + questionStats-derived inputs.
 *
 * Gates 2PL behind submittedCount>=30 (IRT_MIN_N); below that callers must
 * use p-value + discrimination only. Ability estimated via EAP single step
 * from own correct/total at pilot N (not full MLE).
 */

export const IRT_MIN_N = 30;

export interface CatItem {
  questionId: string;
  a?: number | null; // discrimination
  b?: number | null; // difficulty
  pValue?: number | null;
  discrimination?: number | null;
  submittedCount?: number | null;
}

export function twoPL(theta: number, a: number, b: number): number {
  const z = a * (theta - b);
  // Clamp to avoid exp overflow.
  const c = Math.max(-30, Math.min(30, z));
  return 1 / (1 + Math.exp(-c));
}

export function fisherInformation(theta: number, a: number, b: number): number {
  const p = twoPL(theta, a, b);
  return a * a * p * (1 - p);
}

/** EAP single-step ability estimate from own correct/total. Bounded [-3,3]. */
export function estimateAbility(correct: number, total: number): number {
  if (total <= 0) return 0;
  const p = Math.max(0.01, Math.min(0.99, correct / total));
  // Logit, clamped.
  const logit = Math.log(p / (1 - p));
  return Math.max(-3, Math.min(3, logit / 1.7));
}

export function isCalibrated(item: CatItem): boolean {
  const n = typeof item.submittedCount === 'number' ? item.submittedCount : 0;
  if (n < IRT_MIN_N) return false;
  if (typeof item.a !== 'number' || typeof item.b !== 'number') return false;
  if (!Number.isFinite(item.a) || !Number.isFinite(item.b)) return false;
  return true;
}

/**
 * Select next unanswered item maximizing Fisher information at estimated
 * ability. Falls back to lowest pValue (hardest informative) when no item
 * is calibrated. Never throws on empty bank (returns null).
 */
export function selectNextQuestion(
  ability: number,
  answeredIds: ReadonlySet<string> | readonly string[],
  bank: readonly CatItem[],
): CatItem | null {
  const answered: ReadonlySet<string> = Array.isArray(answeredIds)
    ? new Set<string>(answeredIds as readonly string[])
    : (answeredIds as ReadonlySet<string>);
  const pool = bank.filter((it) => !answered.has(it.questionId));
  if (pool.length === 0) return null;
  const calibrated = pool.filter(isCalibrated);
  if (calibrated.length > 0) {
    let best: CatItem | null = null;
    let bestI = -Infinity;
    for (const it of calibrated) {
      const info = fisherInformation(ability, it.a as number, it.b as number);
      if (info > bestI) {
        bestI = info;
        best = it;
      }
    }
    return best;
  }
  // Fallback: most informative by pValue distance from 0.5 (max variance),
  // i.e. prefer items with pValue closest to 0.5 among unanswered with data.
  let best: CatItem | null = null;
  let bestScore = Infinity;
  for (const it of pool) {
    const p = typeof it.pValue === 'number' && Number.isFinite(it.pValue) ? it.pValue : 0.5;
    const score = Math.abs(p - 0.5);
    if (score < bestScore) {
      bestScore = score;
      best = it;
    }
  }
  return best;
}
