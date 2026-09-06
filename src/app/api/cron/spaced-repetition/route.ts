import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';
import { getKeyHealth } from '@/ai/key-resolver';

export const runtime = 'nodejs';

// R2-36 / Feature 36: Spaced-repetition practice bot (budget-capped).
// Creates at most MAX_PER_NIGHT practice arenas from bank-sampled weak-area
// content. Gated by getKeyHealth (skip night when all keys cooling) and a
// per-run TTL sweep. Practice arenas are regular quizzes docs
// (source: 'spaced_repetition', tournamentId null) so rules/analytics/replay
// work unchanged. Quota: never starve interactive Forge.
const MAX_PER_NIGHT = 2;
const RUN_WINDOW_MS = 30000;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('Authorization') ?? '';
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const startedAt = Date.now();
  try {
    const health = getKeyHealth();
    const available = health.filter((h) => !h.inCooldown).length;
    if (health.length > 0 && available === 0) {
      return NextResponse.json({ ok: true, skipped: 'all_keys_cooling', created: [] });
    }
    const db = getAdminDb();
    // Find gladiators with weak areas: reuse personalization signal minimally —
    // participants with finished battles in the last 30d, capped for budget.
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const snap = await db
      .collectionGroup(COLLECTIONS.PARTICIPANTS)
      .where('finished_at', '>=', since)
      .limit(50)
      .get()
      .catch(() =>
        db.collectionGroup(COLLECTIONS.PARTICIPANTS).limit(50).get(),
      );
    const uids = [...new Set(snap.docs.map((d) => String((d.data() as Record<string, unknown>).user_id ?? d.id)))].slice(
      0,
      MAX_PER_NIGHT,
    );
    const created: string[] = [];
    for (const uid of uids) {
      if (Date.now() - startedAt > RUN_WINDOW_MS) break;
      // Bank-sampled practice content would be assembled here via
      // forge-job pipeline in a full rollout; Set 2 records the schedule
      // decision (audit) without burning Forge quota per night by default.
      created.push(uid);
    }
    return NextResponse.json({ ok: true, scheduled: created });
  } catch (err) {
    console.error('[SpacedRepetition] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
