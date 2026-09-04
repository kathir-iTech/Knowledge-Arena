import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS, QUIZ_LIVE, QUIZ_ABANDONED_AFTER_MS } from '@/lib/constants';
import { abandonBattle, getMs } from '@/lib/battle-server';

export const runtime = 'nodejs';

// Phase 115B cron backstop. The reactor (lazy sweep in the battle routes) is
// the primary zombie killer; this cron is the safety net that sweeps every
// `live` arena the moment anyone is NOT actively poking it, once per day.
//
// Scheduled from vercel.json `crons`. Vercel cron invokes this route with a
// `Authorization: Bearer <CRON_SECRET>` header; we compare against the same
// secret so an unauthenticated caller cannot force sweeps.
//
// Bounded batch: Firestore quota + the 30s function timeout cap the sweep to a
// fixed window of arenas per invocation. A once-daily cron comfortably covers
// an institutional arena count in a handful of runs.
const MAX_SWEEP_BATCH = 200;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('Authorization') ?? '';
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getAdminDb();
  const now = Date.now();
  const snapshot = await db
    .collection(COLLECTIONS.QUIZZES)
    .where('status', '==', QUIZ_LIVE)
    .limit(MAX_SWEEP_BATCH)
    .get();

  let swept = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const doc of snapshot.docs) {
    const quizId = doc.id;
    const data = doc.data() as Record<string, any>;
    const lastActivityMs = getMs(data.question_start_at);
    const stale =
      typeof lastActivityMs === 'number' &&
      Number.isFinite(lastActivityMs) &&
      lastActivityMs > 0 &&
      now - lastActivityMs >= QUIZ_ABANDONED_AFTER_MS;

    if (!stale) {
      skipped++;
      continue;
    }

    try {
      await abandonBattle(quizId, 'system', 'system', { reason: 'cron_sweep' });
      swept++;
    } catch (err) {
      errors.push(`${quizId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ ok: true, swept, skipped, errors });
}
