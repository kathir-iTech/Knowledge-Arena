import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithAnyRole } from '@/lib/verify-auth';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS, QUIZ_STARTING, QUIZ_LIVE, STARTING_TRANSITION_MS } from '@/lib/constants';
import { writeBattleLog, getMs, isCreator, battleErrorResponse } from '@/lib/battle-server';

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
      // Activation fires from multiple clients when the countdown ends, so any
      // arena member may trigger it — but the caller must belong to the arena.
      if (!isCreator(quiz, auth.uid)) {
        const memberSnap = await tx.get(
          db.collection(COLLECTIONS.QUIZZES).doc(quizId).collection(COLLECTIONS.PARTICIPANTS).where('user_id', '==', auth.uid).limit(1)
        );
        if (memberSnap.empty) {
          throw new Error('You are not a member of this arena');
        }
      }
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
      // current_question_index must be reset to 0 here: the quiz doc is created
      // with -1 (waiting state) and startBattle/activate never set it. Without
      // this the client guard `(current_question_index ?? -1) < 0` stays true and
      // LiveQuiz renders "Preparing question..." forever (Phase 106, Workstream A).
      tx.update(quizRef, {
        status: QUIZ_LIVE,
        current_question_index: 0,
        question_start_at: Date.now(),
      });
    });

    await writeBattleLog({ quizId, event: 'battle_activated', actor: auth.uid, actorRole: auth.role });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return battleErrorResponse(err);
  }
}
