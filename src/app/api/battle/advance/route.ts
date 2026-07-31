import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  COLLECTIONS,
  QUIZ_LIVE,
  QUIZ_PAUSED,
  QUIZ_FINISHED,
  PS_BLOCKED,
} from '@/lib/constants';
import { writeBattleLog, isCreator } from '@/lib/battle-server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithRole(req, 'commander');
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const rateLimitResponse = enforceRateLimit(`battle:${auth.uid}`, Limits.BATTLE_ACTION_PER_USER);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await req.json().catch(() => ({}));
    const quizId = typeof body.quizId === 'string' ? body.quizId.trim() : '';
    if (!quizId) return NextResponse.json({ error: 'Missing quizId' }, { status: 400 });

    const db = getAdminDb();
    let nextIndex = 0;
    let ended = false;

    await db.runTransaction(async (tx) => {
      const quizRef = db.collection(COLLECTIONS.QUIZZES).doc(quizId);
      const snap = await tx.get(quizRef);
      if (!snap.exists) throw new Error('Arena not found');
      const quiz = snap.data() as Record<string, any>;
      if (!isCreator(quiz, auth.uid)) {
        throw new Error('Only the Commander can advance the question');
      }
      if (quiz.status !== QUIZ_LIVE && quiz.status !== QUIZ_PAUSED) {
        throw new Error(`Cannot advance a question in state: ${quiz.status}`);
      }

      const index = quiz.current_question_index ?? 0;
      const questionCount = quiz.question_count ?? 0;
      const now = Date.now();
      nextIndex = index + 1;
      ended = nextIndex >= questionCount;

      const quizUpdate: Record<string, any> = {
        current_question_index: nextIndex,
        question_start_at: ended ? null : now,
      };
      if (ended) {
        quizUpdate.status = QUIZ_FINISHED;
        quizUpdate.ended_at = now;
        quizUpdate.paused_at = null;
      }
      tx.update(quizRef, quizUpdate);

      if (ended) {
        const partsSnap = await getAdminDb()
          .collection(COLLECTIONS.QUIZZES).doc(quizId)
          .collection(COLLECTIONS.PARTICIPANTS)
          .get();
        for (const p of partsSnap.docs) {
          const pSnap = await tx.get(p.ref);
          if (!pSnap.exists || p.id === quiz.created_by || pSnap.data()?.status === PS_BLOCKED) continue;
          tx.update(p.ref, {
            status: 'finished',
            finished_at: now,
          });
        }
      }
    });

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
  } catch (err: any) {
    console.error('[Battle/advance]', err?.message);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
}
