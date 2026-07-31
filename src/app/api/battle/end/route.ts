import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithAnyRole } from '@/lib/verify-auth';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS, QUIZ_LIVE, QUIZ_PAUSED } from '@/lib/constants';
import { evaluateQuestionForAll, finishBattle, isCreator, getMs } from '@/lib/battle-server';

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
    const quizSnap = await db.collection(COLLECTIONS.QUIZZES).doc(quizId).get();
    if (!quizSnap.exists) throw new Error('Arena not found');
    const quiz = quizSnap.data() as Record<string, any>;

    // Gladiator auto-end: only valid on the final question with an expired
    // timer, and only while the battle is live (not paused).
    if (auth.role === 'gladiator' && !isCreator(quiz, auth.uid)) {
      if (quiz.status !== QUIZ_LIVE) {
        throw new Error(`Battle cannot end in state: ${quiz.status}`);
      }
      const index = quiz.current_question_index ?? 0;
      const questionCount = quiz.question_count ?? 0;
      if (index < questionCount - 1) {
        throw new Error('Battle can only end after the final question');
      }
      const startedAt = getMs(quiz.question_start_at);
      const questionsSnap = await db
        .collection(COLLECTIONS.QUIZZES).doc(quizId)
        .collection(COLLECTIONS.QUESTIONS)
        .orderBy('sort_index')
        .get();
      const question = questionsSnap.docs[index];
      const timerMs = (question?.data()?.timer || 30) * 1000;
      if (Date.now() - startedAt < timerMs) {
        throw new Error('Question timer has not expired yet');
      }
      await evaluateQuestionForAll(quizId, question.id, auth.uid, 'gladiator');
      await finishBattle(quizId, auth.uid, 'gladiator', { reason: 'auto_end_final_question' });
      return NextResponse.json({ ok: true });
    }

    if (!isCreator(quiz, auth.uid)) {
      throw new Error('Only the Commander can end this battle');
    }
    await finishBattle(quizId, auth.uid, 'commander');
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[Battle/end]', err?.message);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
}
