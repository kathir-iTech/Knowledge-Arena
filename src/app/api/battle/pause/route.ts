import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS, QUIZ_PAUSED, QUIZ_LIVE } from '@/lib/constants';
import { writeBattleLog, isCreator, battleErrorResponse } from '@/lib/battle-server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'commander');
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const rateLimitResponse = await enforceRateLimit(`battle:${auth.uid}`, Limits.BATTLE_ACTION_PER_USER);
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
      if (!isCreator(quiz, auth.uid)) {
        throw new Error('Only the Commander can pause this arena');
      }
      if (quiz.status !== QUIZ_LIVE) {
        throw new Error(`Cannot pause a battle in state: ${quiz.status}`);
      }
      tx.update(quizRef, { status: QUIZ_PAUSED, paused_at: Date.now() });
    });

    await writeBattleLog({ quizId, event: 'battle_paused', actor: auth.uid, actorRole: 'commander' });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return battleErrorResponse(err);
  }
}
