import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithAnyRole } from '@/lib/verify-auth';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS, BATTLE_MODE_INDEPENDENT } from '@/lib/constants';
import {
  evaluateQuestionForAll,
  evaluateQuestionForUser,
  endBattleIfAllFinished,
  isCreator,
  battleErrorResponse,
} from '@/lib/battle-server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithAnyRole(req, ['commander', 'gladiator']);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const rateLimitResponse = await enforceRateLimit(`battle:${auth.uid}`, Limits.BATTLE_ACTION_PER_USER);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await req.json().catch(() => ({}));
    const quizId = typeof body.quizId === 'string' ? body.quizId.trim() : '';
    const questionId = typeof body.questionId === 'string' ? body.questionId.trim() : '';
    const targetUserId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!quizId || !questionId) {
      return NextResponse.json({ error: 'Missing quizId or questionId' }, { status: 400 });
    }

    const db = getAdminDb();
    const quizRef = db.doc(`quizzes/${quizId}`);
    const quizSnap = await quizRef.get();
    if (!quizSnap.exists) throw new Error('Arena not found');
    const quiz = quizSnap.data() as Record<string, any>;
    const mode = quiz.battle_mode || 'synchronized';

    // Verify the question actually belongs to this quiz.
    const questionsRef = quizRef.collection(COLLECTIONS.QUESTIONS);
    const questionsSnap = await questionsRef.get();
    const questionExists = questionsSnap.docs.some(d => d.id === questionId);
    if (!questionExists) throw new Error('Question does not belong to this quiz');

    if (auth.role === 'commander' && isCreator(quiz, auth.uid)) {
      await evaluateQuestionForAll(quizId, questionId, auth.uid, 'commander');
      return NextResponse.json({ ok: true });
    }

    if (auth.role === 'gladiator' || (auth.role === 'commander' && !isCreator(quiz, auth.uid))) {
      if (mode !== BATTLE_MODE_INDEPENDENT) {
        return NextResponse.json(
          { error: 'Independent evaluation requires independent battle mode' },
          { status: 400 }
        );
      }
      const uid = auth.uid;
      const { allFinished } = await evaluateQuestionForUser(quizId, questionId, uid, uid, 'gladiator');
      if (allFinished) {
        await endBattleIfAllFinished(quizId);
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  } catch (err: unknown) {
    return battleErrorResponse(err);
  }
}