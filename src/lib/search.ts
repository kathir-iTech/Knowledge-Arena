/**
 * Phase 3 shared search helpers — executive + commander.
 *
 * Pattern: `searchTokens` array-contains first-term (server-side narrowing)
 * + residual in-memory filter for remaining terms.
 *
 * TF-IDF weighting with recency decay:
 *   Score(d,q) = sum_tf TF * log(N / DF) * e^{-lambda * dt}
 * where lambda = 0.05, dt = age in days derived from `created_at`/`createdAt`.
 *
 * DF is computed in-memory from the fetched (<=200) docs — no new collection.
 * Gladiator search (collectionGroup) is intentionally untouched.
 */

export const SEARCH_RECENCY_LAMBDA = 0.05;

const DAY_MS = 86400000;

/** Lowercased alphanumeric tokens (>=2 chars), same shape as buildSearchTokens. */
export function tokenizeQuery(raw: string): string[] {
  const words = raw.toLowerCase().match(/[a-z0-9]+/g) || [];
  return words.filter((w) => w.length >= 2);
}

/** Tokenize concatenated doc fields for TF/DF. */
export function tokenizeDocText(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) || [];
  return words.filter((w) => w.length >= 2);
}

/** Legacy base relevance: 4 = exact, 3 = startsWith, 2 = includes, -1 = no match. */
export function baseRelevance(query: string, ...fields: Array<string | undefined | null>): number {
  let score = -1;
  for (const raw of fields) {
    const field = (raw || '').toLowerCase();
    if (!field) continue;
    if (field === query) score = Math.max(score, 4);
    else if (field.startsWith(query)) score = Math.max(score, 3);
    else if (field.includes(query)) score = Math.max(score, 2);
  }
  return score;
}

/** Extract millis from Firestore Timestamp | number | Date | null. */
export function createdAtMs(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Heuristic: seconds vs millis — Firestore millis are 13 digits.
    if (value > 0 && value < 1e11) return Math.round(value * 1000);
    return Math.round(value);
  }
  if (typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    try {
      const ms = (value as { toMillis: () => number }).toMillis();
      return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
    } catch {
      return null;
    }
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/** Pick the first available created-at field from a doc. */
export function docCreatedAtMs(data: Record<string, unknown>): number | null {
  const candidates = [
    data.created_at,
    data.createdAt,
    data.timestamp,
    data.lastActivity,
    data.updatedAt,
  ];
  for (const c of candidates) {
    const ms = createdAtMs(c);
    if (ms !== null) return ms;
  }
  return null;
}

/** Recency decay factor e^{-lambda * dtDays}. Missing timestamp => 1 (no penalty). */
export function recencyFactor(createdMs: number | null, nowMs?: number, lambda = SEARCH_RECENCY_LAMBDA): number {
  if (createdMs == null) return 1;
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  const dtDays = Math.max(0, (now - createdMs) / DAY_MS);
  return Math.exp(-lambda * dtDays);
}

/** DF table computed in-memory from fetched docs' token arrays. */
export function computeDf(docsTokens: string[][], queryTokens: string[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const qt of queryTokens) df.set(qt, 0);
  for (const tokens of docsTokens) {
    const set = new Set(tokens);
    for (const qt of queryTokens) {
      if (set.has(qt)) df.set(qt, (df.get(qt) || 0) + 1);
    }
  }
  return df;
}

/**
 * Sum over query terms of TF * log(N / DF).
 * TF = raw occurrence count of the term in the doc tokens.
 * Returns 0 when N == 0 or no term overlaps (avoids +Inf when DF == 0).
 */
export function tfidf(docTokens: string[], queryTokens: string[], df: Map<string, number>, n: number): number {
  if (n <= 0 || !queryTokens.length || !docTokens.length) return 0;
  const counts = new Map<string, number>();
  for (const t of docTokens) counts.set(t, (counts.get(t) || 0) + 1);
  let sum = 0;
  for (const qt of queryTokens) {
    const tf = counts.get(qt) || 0;
    if (tf <= 0) continue;
    const d = df.get(qt) || 0;
    if (d <= 0 || d >= n) {
      // DF == 0 => term absent from corpus (shouldn't happen for matched docs);
      // DF == N => log(1) == 0, no discrimination. Both contribute 0.
      continue;
    }
    sum += tf * Math.log(n / d);
  }
  return sum;
}

/**
 * Full Phase 3 score: TF-IDF * recency decay.
 * Callers add this to the legacy base relevance (4/3/2) so existing
 * thresholds/ordering are preserved with TF-IDF as tie-breaker + recency.
 */
export function tfidfRecencyScore(
  docTokens: string[],
  queryTokens: string[],
  df: Map<string, number>,
  n: number,
  createdMs: number | null,
  nowMs?: number,
): number {
  const tf = tfidf(docTokens, queryTokens, df, n);
  if (tf <= 0) return 0;
  return tf * recencyFactor(createdMs, nowMs);
}

/** Residual filter: every query token must appear as substring (lenient, matches legacy includes). */
export function passesResidualFilter(searchableLower: string, queryTokens: string[]): boolean {
  for (const t of queryTokens) {
    if (!searchableLower.includes(t)) return false;
  }
  return true;
}
