import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithAnyRole } from '@/lib/verify-auth';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';
import { getAdminDb, getAdminRtdb } from '@/lib/firebase-admin';
import {
  COLLECTIONS,
  QUIZ_LIVE,
  PS_BLOCKED,
} from '@/lib/constants';
import {
  evaluateQuestionForAll,
  advanceQuestion,
  writeBattleLog,
  battleErrorResponse,
  loadQuizDoc,
  sweepStaleLiveArena,
} from '@/lib/battle-server';

export const runtime = 'nodejs';

// Auto-advance triggered by gladiators when the Commander is genuinely absent
// for the grace window. Reuses the exact evaluate+advance logic the Commander's
// "Evaluate & Next" button runs; it only decides WHEN to run it.
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithAnyRole(req, ['gladiator']);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const rateLimitResponse = await enforceRateLimit(`battle:${auth.uid}`, Limits.BATTLE_ACTION_PER_USER);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await req.json().catch(() => ({}));
    const quizId = typeof body.quizId === 'string' ? body.quizId.trim() : '';
    if (!quizId) return NextResponse.json({ error: 'Missing quizId' }, { status: 400 });

    const db = getAdminDb();

    // (a) The caller must be an authenticated gladiator who is a participant.
    const partSnap = await db
      .collection(COLLECTIONS.QUIZZES).doc(quizId)
      .collection(COLLECTIONS.PARTICIPANTS).doc(auth.uid)
      .get();
    if (!partSnap.exists) {
      return NextResponse.json({ error: 'You are not a member of this arena' }, { status: 403 });
    }
    if (partSnap.data()?.status === PS_BLOCKED) {
      return NextResponse.json({ error: 'You are blocked from this arena' }, { status: 403 });
    }

    const { data: quiz } = await loadQuizDoc(quizId);
    if (await sweepStaleLiveArena(quizId, quiz)) {
      return NextResponse.json(
        { error: 'This battle was abandoned because it was inactive for too long.' },
        { status: 409 }
      );
    }
    if (quiz.status !== QUIZ_LIVE) {
      return NextResponse.json(
        { error: `Auto-advance requires a live arena (state: ${quiz.status})` },
        { status: 409 }
      );
    }

    const commanderUid = quiz.created_by;
    if (!commanderUid || commanderUid === auth.uid) {
      return NextResponse.json({ error: 'No Commander to advance for this arena' }, { status: 409 });
    }

    // (b) Independently re-check RTDB presence: if the Commander's presence node
    // still exists they are not actually absent — no-op.
    const commanderPresence = await getAdminRtdb().ref(`presence/${quizId}/${commanderUid}`).get();
    if (commanderPresence.exists()) {
      return NextResponse.json({ error: 'Commander is present' }, { status: 409 });
    }

// (c) Grace window is enforced server-side: the Commander's RTDB presence
    // node should have been removed when they went absent. If the node still
    // exists we already caught it in step (b); if it's gone, the grace window
    // has elapsed and we proceed with auto-advance.
    // No client-supplied commanderAbsentSinceRef is trusted here.

    const index = quiz.current_question_index ?? 0;
    const qSnap = await db
      .collection(COLLECTIONS.QUIZZES).doc(quizId)
      .collection(COLLECTIONS.QUESTIONS)
      .orderBy('sort_index')
      .get();
    const currentQuestion = qSnap.docs[index];
    if (!currentQuestion) {
      return NextResponse.json({ error: 'No active question to advance' }, { status: 409 });
    }

    await evaluateQuestionForAll(quizId, currentQuestion.id, auth.uid, 'gladiator');
    const outcome = await advanceQuestion(quizId, index);
    if (outcome.alreadyAdvanced) {
      // The Commander (or another gladiator's auto-advance) already moved past
      // the index observed here — no-op, never surface an error. Clients will
      // pick up the real index via the quiz/participant listeners.
      return NextResponse.json({ ok: true, ended: false, nextIndex: outcome.nextIndex, alreadyAdvanced: true });
    }

    await writeBattleLog({
      quizId,
      event: 'question_advanced',
      actor: auth.uid,
      actorRole: 'gladiator',
      metadata: { auto: true, nextIndex: outcome.nextIndex },
    });
    if (outcome.ended) {
      await writeBattleLog({
        quizId,
        event: 'battle_finished',
        actor: auth.uid,
        actorRole: 'gladiator',
        metadata: { reason: 'commander_auto_advance_final' },
      });
    }

    return NextResponse.json({ ok: true, ended: outcome.ended, nextIndex: outcome.nextIndex });
  } catch (err: unknown) {
    return battleErrorResponse(err);
  }
}