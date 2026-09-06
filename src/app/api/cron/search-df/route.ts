import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { tokenizeDocText } from '@/lib/search';

export const runtime = 'nodejs';

// R2-1: search_df nightly builder (Admin-only, cursor-resumed).
// Scans question_bank (paginated 1000, SET_SCAN_LIMIT 5000 pattern) +
// quizzes titles, aggregates DF per token, writes search_df/{term}
// {df, n, updatedAt} in 500/batch chunks. Falls back gracefully: routes
// use in-memory DF when table docs are missing/stale.
// Reuses forge-worker CRON_SECRET guard + RUN_WINDOW pattern (no third
// vercel.json cron in Set 2 — invoke via GitHub backstop or manual).
const MAX_DOCS = 5000;
const PAGE = 1000;
const RUN_WINDOW_MS = 30000;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('Authorization') ?? '';
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const startedAt = Date.now();
  try {
    const db = getAdminDb();
    const df = new Map<string, number>();
    let n = 0;
    let last: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    while (n < MAX_DOCS && Date.now() - startedAt < RUN_WINDOW_MS) {
      let q: FirebaseFirestore.Query = db
        .collection(COLLECTIONS.QUESTION_BANK)
        .orderBy('createdAt', 'desc')
        .limit(Math.min(PAGE, MAX_DOCS - n));
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      if (snap.empty) break;
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        const text = [data.title, data.category, data.text].filter(Boolean).join(' ');
        const tokens = new Set(tokenizeDocText(String(text)));
        for (const t of tokens) df.set(t, (df.get(t) ?? 0) + 1);
        n++;
      }
      last = snap.docs[snap.docs.length - 1] ?? null;
      if (snap.size < PAGE) break;
    }
    // Write DF docs in 500/batch chunks.
    const terms = [...df.entries()];
    let written = 0;
    for (let i = 0; i < terms.length && Date.now() - startedAt < RUN_WINDOW_MS; i += 500) {
      const batch = db.batch();
      for (const [term, count] of terms.slice(i, i + 500)) {
        batch.set(db.collection(COLLECTIONS.SEARCH_DF).doc(term), {
          df: count,
          n,
          updatedAt: Date.now(),
        });
      }
      await batch.commit();
      written += Math.min(500, terms.length - i);
    }
    return NextResponse.json({ ok: true, docs: n, terms: terms.length, written });
  } catch (err) {
    console.error('[SearchDF] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
