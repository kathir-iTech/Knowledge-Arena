import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS, QUIZ_LIVE, QUIZ_PAUSED, BATTLE_MODE_INDEPENDENT } from '@/lib/constants';
import { writeBattleLog, isCreator, getMs, battleErrorResponse } from '@/lib/battle-server';

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
    let pausedMs = 0;
    await db.runTransaction(async (tx) => {
      const quizRef = db.collection(COLLECTIONS.QUIZZES).doc(quizId);
      const snap = await tx.get(quizRef);
      if (!snap.exists) throw new Error('Arena not found');
      const quiz = snap.data() as Record<string, any>;
      if (!isCreator(quiz, auth.uid)) {
        throw new Error('Only the Commander can resume this arena');
      }
      if (quiz.status !== QUIZ_PAUSED) {
        throw new Error(`Cannot resume a battle in state: ${quiz.status}`);
      }
      const now = Date.now();
      pausedMs = Math.max(0, now - getMs(quiz.paused_at));
      const update: Record<string, any> = {
        status: QUIZ_LIVE,
        paused_at: null,
        paused_ms: (quiz.paused_ms || 0) + pausedMs,
      };
      if (quiz.question_start_at) {
        update.question_start_at = getMs(quiz.question_start_at) + pausedMs;
      }
      tx.update(quizRef, update);

      if (quiz.battle_mode === BATTLE_MODE_INDEPENDENT) {
        const partsSnap = await getAdminDb()
          .collection(COLLECTIONS.QUIZZES).doc(quizId)
          .collection(COLLECTIONS.PARTICIPANTS)
          .get();
        for (const p of partsSnap.docs) {
          const pSnap = await tx.get(p.ref);
          const pData = pSnap.data() as Record<string, any>;
          if (pData?.question_start_at) {
            tx.update(p.ref, { question_start_at: getMs(pData.question_start_at) + pausedMs });
          }
        }
      }
    });

    await writeBattleLog({
      quizId,
      event: 'battle_resumed',
      actor: auth.uid,
      actorRole: 'commander',
      metadata: { pausedMs },
    });
    return NextResponse.json({ ok: true, pausedMs });
  } catch (err: unknown) {
    return battleErrorResponse(err);
  }
}
