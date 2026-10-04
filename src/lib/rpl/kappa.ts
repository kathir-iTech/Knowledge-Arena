// SIH-26242 RPL — inter-assessor agreement (kappa) math.
// Pure TypeScript/math, no dependencies.

import type { KappaInterpretation } from '@/lib/rpl/types';

const NUM_CATEGORIES = 4;
const MIN_RATING = 1;
const MAX_RATING = 4;

function linearWeight(i: number, j: number, k: number = NUM_CATEGORIES): number {
  // i, j are 0-based category indices.
  if (k <= 1) return i === j ? 1 : 0;
  return 1 - Math.abs(i - j) / (k - 1);
}

export function interpretKappa(kappa: number): KappaInterpretation {
  // Landis & Koch: negatives fall in Poor.
  if (kappa < 0.2) return 'Poor';
  if (kappa < 0.4) return 'Fair';
  if (kappa < 0.6) return 'Moderate';
  if (kappa < 0.8) return 'Substantial';
  return 'Almost perfect';
}

function validatePairedRatings(ratingsA: number[], ratingsB: number[]): void {
  if (!Array.isArray(ratingsA) || !Array.isArray(ratingsB)) {
    throw new Error('ratingsA and ratingsB must be arrays');
  }
  if (ratingsA.length !== ratingsB.length) {
    throw new Error('ratingsA and ratingsB must have equal lengths');
  }
  const n = ratingsA.length;
  if (n < 2) {
    throw new Error('at least 2 paired ratings are required');
  }
  for (let idx = 0; idx < n; idx++) {
    const a = ratingsA[idx];
    const b = ratingsB[idx];
    if (!Number.isInteger(a) || a < MIN_RATING || a > MAX_RATING) {
      throw new Error(`ratingsA[${idx}] out of range (expected 1-4 integer)`);
    }
    if (!Number.isInteger(b) || b < MIN_RATING || b > MAX_RATING) {
      throw new Error(`ratingsB[${idx}] out of range (expected 1-4 integer)`);
    }
  }
}

/**
 * Cohen's linear-weighted kappa for 4 ordered categories (ratings 1-4).
 *
 * Po = weighted observed agreement, Pe = weighted chance agreement from
 * marginals, kappa = (Po - Pe) / (1 - Pe).
 * 95% CI uses the Fleiss/Cohen/Everitt (1969) large-sample variance for
 * weighted kappa (the same estimator implemented by statsmodels'
 * cohens_kappa), clamped to [-1, 1].
 */
export function computeKappa(
  ratingsA: number[],
  ratingsB: number[]
): { kappa: number; interpretation: KappaInterpretation; confidence: [number, number] } {
  validatePairedRatings(ratingsA, ratingsB);
  const n = ratingsA.length;
  const k = NUM_CATEGORIES;

  // Perfect pairwise agreement short-circuit guarantees kappa exactly 1.0.
  let allEqual = true;
  for (let s = 0; s < n; s++) {
    if (ratingsA[s] !== ratingsB[s]) {
      allEqual = false;
      break;
    }
  }

  // Contingency counts (rows = A, cols = B), 0-based.
  const counts: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let s = 0; s < n; s++) {
    counts[ratingsA[s] - 1][ratingsB[s] - 1] += 1;
  }

  const p: number[][] = counts.map((row) => row.map((c) => c / n));
  const rowMarginal: number[] = new Array<number>(k).fill(0);
  const colMarginal: number[] = new Array<number>(k).fill(0);
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      rowMarginal[i] += p[i][j];
      colMarginal[j] += p[i][j];
    }
  }

  const w: number[][] = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) => linearWeight(i, j, k))
  );

  let po = 0;
  let pe = 0;
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      po += w[i][j] * p[i][j];
      pe += w[i][j] * rowMarginal[i] * colMarginal[j];
    }
  }

  // Degenerate marginals: chance agreement is certain.
  if (Math.abs(1 - pe) < 1e-12) {
    const kappa = Math.abs(1 - po) < 1e-12 || allEqual ? 1 : 0;
    const interpretation = interpretKappa(kappa);
    const clamped = Math.max(-1, Math.min(1, kappa));
    return { kappa, interpretation, confidence: [clamped, clamped] };
  }

  let kappa = (po - pe) / (1 - pe);
  if (allEqual) {
    // Force exact 1.0 for identical rating vectors (avoids 0.9999... float dust).
    kappa = 1;
  }
  // Clamp tiny float overshoot.
  if (kappa > 1 && kappa < 1 + 1e-12) kappa = 1;
  if (kappa < -1 && kappa > -1 - 1e-12) kappa = -1;

  const interpretation = interpretKappa(kappa);

  // Fleiss/Cohen/Everitt (1969) Eq. 8 large-sample variance for weighted kappa:
  //   wRow[i] = sum_j w_ij p_.j            (mean weight given row i)
  //   wCol[j] = sum_i w_ij p_i.            (mean weight given col j)
  //   var = ( sum_ij p_ij [w_ij - (wRow[i]+wCol[j])(1-k)]^2
  //           - (k - pe(1-k))^2 ) / ((1-pe)^2 n)
  const wRow: number[] = new Array<number>(k).fill(0);
  const wCol: number[] = new Array<number>(k).fill(0);
  for (let i = 0; i < k; i++) {
    let s = 0;
    for (let j = 0; j < k; j++) s += w[i][j] * colMarginal[j];
    wRow[i] = s;
  }
  for (let j = 0; j < k; j++) {
    let s = 0;
    for (let i = 0; i < k; i++) s += w[i][j] * rowMarginal[i];
    wCol[j] = s;
  }

  const oneMinusK = 1 - kappa;
  let termA = 0;
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const d = w[i][j] - (wRow[i] + wCol[j]) * oneMinusK;
      termA += p[i][j] * d * d;
    }
  }
  const termC = kappa - pe * oneMinusK;
  let variance = (termA - termC * termC) / ((1 - pe) * (1 - pe) * n);
  if (!Number.isFinite(variance) || variance < 0) variance = 0;

  const se = Math.sqrt(variance);
  const lower = Math.max(-1, kappa - 1.96 * se);
  const upper = Math.min(1, kappa + 1.96 * se);
  return { kappa, interpretation, confidence: [lower, upper] };
}

/**
 * Fleiss' kappa for >2 raters.
 * rows = subjects, cols = raters, values are categories 1-4.
 */
export function computeMultiRaterKappa(ratingsMatrix: number[][]): number {
  if (!Array.isArray(ratingsMatrix) || ratingsMatrix.length < 2) {
    throw new Error('ratingsMatrix must have at least 2 subjects (rows)');
  }
  const numSubjects = ratingsMatrix.length;
  const first = ratingsMatrix[0];
  if (!Array.isArray(first) || first.length < 2) {
    throw new Error('ratingsMatrix must have at least 2 raters (columns)');
  }
  const numRaters = first.length;

  // Rectangular + completeness validation.
  for (let i = 0; i < numSubjects; i++) {
    const row = ratingsMatrix[i];
    if (!Array.isArray(row) || row.length !== numRaters) {
      throw new Error('ratingsMatrix must be rectangular');
    }
    for (let j = 0; j < numRaters; j++) {
      const v = row[j];
      if (v === null || v === undefined || !Number.isInteger(v) || v < MIN_RATING || v > MAX_RATING) {
        throw new Error(`ratingsMatrix[${i}][${j}] is incomplete or out of range (expected 1-4 integer)`);
      }
    }
  }

  const k = NUM_CATEGORIES;
  // n_ij: raters assigning subject i to category j.
  const pCat: number[] = new Array<number>(k).fill(0);
  const pSubject: number[] = new Array<number>(numSubjects).fill(0);

  for (let i = 0; i < numSubjects; i++) {
    const counts = new Array<number>(k).fill(0);
    for (let j = 0; j < numRaters; j++) {
      const cat = ratingsMatrix[i][j] - 1;
      counts[cat] += 1;
      pCat[cat] += 1;
    }
    let sumSq = 0;
    for (let c = 0; c < k; c++) sumSq += counts[c] * counts[c];
    pSubject[i] = (sumSq - numRaters) / (numRaters * (numRaters - 1));
  }

  for (let c = 0; c < k; c++) pCat[c] /= numSubjects * numRaters;
  const pBar = pSubject.reduce((s, v) => s + v, 0) / numSubjects;
  const peBar = pCat.reduce((s, v) => s + v * v, 0);

  if (Math.abs(1 - peBar) < 1e-12) {
    return Math.abs(1 - pBar) < 1e-12 ? 1 : 0;
  }
  const kappa = (pBar - peBar) / (1 - peBar);
  if (kappa > 1 && kappa < 1 + 1e-12) return 1;
  return kappa;
}

export function computeKappaImprovement(
  unassistedKappa: number,
  assistedKappa: number
): { improvementPct: number; isSignificant: boolean } {
  if (!Number.isFinite(unassistedKappa) || !Number.isFinite(assistedKappa)) {
    throw new Error('kappa values must be finite numbers');
  }
  let improvementPct: number;
  if (unassistedKappa === 0) {
    if (assistedKappa === 0) improvementPct = 0;
    else improvementPct = assistedKappa > 0 ? 100 : -100;
  } else {
    improvementPct = ((assistedKappa - unassistedKappa) / Math.abs(unassistedKappa)) * 100;
  }
  const isSignificant = assistedKappa - unassistedKappa > 0.1;
  return { improvementPct, isSignificant };
}
