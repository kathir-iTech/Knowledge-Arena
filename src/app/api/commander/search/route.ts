import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';
import {
  SEARCH_RECENCY_LAMBDA,
  tokenizeQuery,
  tokenizeDocText,
  baseRelevance,
  docCreatedAtMs,
  computeDf,
  tfidfRecencyScore,
  passesResidualFilter,
} from '@/lib/search';

export const runtime = 'nodejs';

const MAX_PER_COLLECTION = 200;
// Recency decay weight for Score(d,q) = sum TF*log(N/DF) * e^{-lambda*dt}.
const RECENCY_LAMBDA = SEARCH_RECENCY_LAMBDA; // 0.05

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'commander');
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const rl = await enforceRateLimit(`commander:search:${auth.uid}`, Limits.SEARCH_PER_USER);
    if (rl) return rl;

    const { searchParams } = new URL(req.url);
    const raw = searchParams.get('q')?.trim() || '';
    if (!raw || raw.length < 2) {
      return NextResponse.json({ results: [] });
    }
    const q = raw.toLowerCase();
    const queryTokens = tokenizeQuery(raw);
    const firstTerm = queryTokens[0];
    const nowMs = Date.now();
    const db = getAdminDb();

    // Server-side narrowing: searchTokens array-contains first-term scoped by
    // created_by == uid, with residual in-memory filter for remaining terms.
    // Quizzes written before searchTokens existed (or substring queries that
    // are not whole-word tokens) fall back to the scoped select() scan so
    // recall never drops — scoping by created_by is preserved on both paths
    // and this route never leaks other commanders' arenas.
    const scopedSelect = () =>
      db.collection('quizzes')
        .where('created_by', '==', auth.uid)
        .select('title', 'status', 'created_at', 'createdAt', 'question_count', 'searchTokens');

    let snap;
    try {
      if (firstTerm) {
        const tokenSnap = await scopedSelect()
          .where('searchTokens', 'array-contains', firstTerm)
          .limit(MAX_PER_COLLECTION)
          .get();
        snap = tokenSnap.empty
          ? await scopedSelect().limit(MAX_PER_COLLECTION).get()
          : tokenSnap;
      } else {
        snap = await scopedSelect().limit(MAX_PER_COLLECTION).get();
      }
    } catch {
      // Missing composite index (created_by + searchTokens) or any other
      // query failure: fall back to the scoped scan. Still per-uid scoped.
      snap = await scopedSelect().limit(MAX_PER_COLLECTION).get();
    }

    const searchables = snap.docs.map(d => {
      const data = d.data() as Record<string, unknown>;
      const title = String(data.title || 'Untitled');
      const text = [title, d.id].join(' ');
      const lower = text.toLowerCase();
      return { id: d.id, data, title, lower, tokens: tokenizeDocText(lower), createdMs: docCreatedAtMs(data) };
    });
    // DF in-memory from the fetched docs — no new collection.
    const df = computeDf(searchables.map(s => s.tokens), queryTokens);
    const n = searchables.length;
    void RECENCY_LAMBDA;

    const results = snap.docs
      .map(d => {
        const s = searchables.find(x => x.id === d.id)!;
        const data = s.data;
        const title = s.title;
        const id = d.id;
        const searchable = [title, id].join(' ').toLowerCase();
        // Residual in-memory filter: legacy phrase match OR all-tokens AND.
        const phraseHit = searchable.includes(q);
        const tokenHit = queryTokens.length > 0 && passesResidualFilter(searchable, queryTokens);
        if (!phraseHit && !tokenHit) return null;
        // Score: exact > startsWith > includes (legacy 4/3/2 preserved).
        let base = 0;
        if (title.toLowerCase() === q) base = 4;
        else if (title.toLowerCase().startsWith(q)) base = 3;
        else if (phraseHit || tokenHit) {
          let best = 2;
          for (const t of queryTokens) {
            const tb = baseRelevance(t, title, id);
            if (tb > best) best = tb;
          }
          base = best;
        }
        // TF-IDF * recency boost (additive tie-breaker).
        const boost = queryTokens.length
          ? tfidfRecencyScore(s.tokens, queryTokens, df, n, s.createdMs, nowMs)
          : 0;
        const score = base + boost;
        const titleLower = title.toLowerCase();
        const matchIndex = titleLower.indexOf(queryTokens[0] || q);
        const highlight = matchIndex >= 0
          ? { start: matchIndex, end: matchIndex + (queryTokens[0] || q).length }
          : null;
        return {
          type: 'Arena',
          id,
          title,
          subtitle: `${String(data.status || 'unknown')} · ${Number(data.question_count || 0)} questions · Code: ${id}`,
          href: `/battle/${id}`,
          score,
          highlight,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b!.score as number) - (a!.score as number))
      .slice(0, 12);

    return NextResponse.json({ results });
  } catch (err: unknown) {
    console.error('[Commander Search] Error', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
