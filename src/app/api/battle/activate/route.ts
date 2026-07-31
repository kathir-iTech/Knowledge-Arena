import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithAnyRole } from '@/lib/verify-auth';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS, QUIZ_STARTING, QUIZ_LIVE, STARTING_TRANSITION_MS } from '@/lib/constants';
import { writeBattleLog, getMs } from '@/lib/battle-server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithAnyRole(req, ['commander', 'gladiator']);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const rateLimitResponse = enforceRateLimit(`battle:${auth.uid}`, Limits.BATTLE_ACTION_PER_USER);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await req.json().catch(() => ({}));
    const quizId = typeof body.quizId === 'string' ? body.quizId.trim() : '';
    if (!quizId) return NextResponse.json({ error: 'Missing quizId' }, { status: 400 });

    const db = getAdminDb();
    await db.runTransaction(async (tx) => {
      const quizRef = db.collection(COLLECTIONS.QUIZZES).doc(quizId);
      const snap = await tx.get(quizRef);
      if (!snap.exists) throw new Error('Arena not found');
      const quiz = snap.data() as Record<string, any>;
      // Multiple clients fire activation when the countdown ends; the first
      // successful transition wins and the rest see the arena already live.
      if (quiz.status === QUIZ_LIVE) return;
      if (quiz.status !== QUIZ_STARTING) {
        throw new Error(`Cannot activate a battle in state: ${quiz.status}`);
      }
      const startedAt = getMs(quiz.started_at);
      if (Date.now() - startedAt < STARTING_TRANSITION_MS) {
        throw new Error('Battle has not finished its starting countdown yet');
      }
      tx.update(quizRef, { status: QUIZ_LIVE, question_start_at: Date.now() });
    });

    await writeBattleLog({ quizId, event: 'battle_activated', actor: auth.uid, actorRole: auth.role });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[Battle/activate]', err?.message);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
}
