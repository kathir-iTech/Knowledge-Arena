import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';
import { writeBattleLog, isCreator, battleErrorResponse, advanceQuestion, loadQuizDoc, sweepStaleLiveArena } from '@/lib/battle-server';

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

    const { data: quiz } = await loadQuizDoc(quizId);
    if (await sweepStaleLiveArena(quizId, quiz)) {
      // The arena was a zombie — do not advance it; warn the Commander.
      return NextResponse.json(
        { error: 'This battle was abandoned because it was inactive for too long.' },
        { status: 409 }
      );
    }
    if (!isCreator(quiz, auth.uid)) {
      throw new Error('Only the Commander can advance the question');
    }

    const expectedFromIndex = quiz.current_question_index ?? 0;
    const { nextIndex, ended, alreadyAdvanced } = await advanceQuestion(quizId, expectedFromIndex);
    if (alreadyAdvanced) {
      // Another advance already moved past the index the caller saw (e.g. a
      // racing auto-advance). The quiz/participant listeners will reflect the
      // real index shortly; no error and no duplicate battle-log entries.
      return NextResponse.json({ ok: true, ended: false, nextIndex, alreadyAdvanced: true });
    }

    await writeBattleLog({
      quizId,
      event: 'question_advanced',
      actor: auth.uid,
      actorRole: 'commander',
      metadata: { nextIndex },
    });
    if (ended) {
      await writeBattleLog({
        quizId,
        event: 'battle_finished',
        actor: auth.uid,
        actorRole: 'commander',
        metadata: { reason: 'last_question_advanced' },
      });
    }
    return NextResponse.json({ ok: true, ended, nextIndex });
  } catch (err: unknown) {
    return battleErrorResponse(err);
  }
}