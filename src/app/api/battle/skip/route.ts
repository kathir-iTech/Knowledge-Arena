import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseTokenWithRole } from '@/lib/verify-auth';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  COLLECTIONS,
  QUIZ_CONFIG_SETTINGS_DOC,
  QUIZ_LIVE,
  QUIZ_PAUSED,
  QUIZ_FINISHED,
  PS_BLOCKED,
} from '@/lib/constants';
import { writeBattleLog, isCreator, normalizeSkipConfig, scoringConfigFrom, quizConfigRef, evaluateQuestionForAll, battleErrorResponse, notifyBattleCompleted } from '@/lib/battle-server';

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
    let skippedQuestionId = '';
    let ended = false;

    // Resolve the question being skipped and run the same evaluate step used by
    // "Evaluate & Next" BEFORE the skip transaction commits. Any submission that
    // landed before the skip gets scored first; the penalty loop below then only
    // hits genuine non-submitters. evaluateQuestionForAll is idempotent (scored
    // flag re-checked inside its own transaction), so a concurrent advance /
    // auto-advance that already evaluated this question is a harmless no-op.
    const preQuizSnap = await db.collection(COLLECTIONS.QUIZZES).doc(quizId).get();
    if (preQuizSnap.exists) {
      const preQuiz = preQuizSnap.data() as Record<string, any>;
      const preIndex = preQuiz.current_question_index ?? 0;
      const preQuestionsSnap = await db
        .collection(COLLECTIONS.QUIZZES).doc(quizId)
        .collection(COLLECTIONS.QUESTIONS)
        .orderBy('sort_index')
        .get();
      const preQuestion = preQuestionsSnap.docs[preIndex];
      if (preQuestion) {
        await evaluateQuestionForAll(quizId, preQuestion.id, auth.uid, 'commander');
      }
    }

    await db.runTransaction(async (tx) => {
      const quizRef = db.collection(COLLECTIONS.QUIZZES).doc(quizId);
      const snap = await tx.get(quizRef);
      if (!snap.exists) throw new Error('Arena not found');
      const quiz = snap.data() as Record<string, any>;
      if (!isCreator(quiz, auth.uid)) {
        throw new Error('Only the Commander can skip a question');
      }
      if (quiz.status !== QUIZ_LIVE && quiz.status !== QUIZ_PAUSED) {
        throw new Error(`Cannot skip a question in state: ${quiz.status}`);
      }

      const index = quiz.current_question_index ?? 0;
      const questionCount = quiz.question_count ?? 0;
      const questionsSnap = await getAdminDb()
        .collection(COLLECTIONS.QUIZZES).doc(quizId)
        .collection(COLLECTIONS.QUESTIONS)
        .orderBy('sort_index')
        .get();
      const question = questionsSnap.docs[index];
      if (!question) throw new Error('No question to skip');
      skippedQuestionId = question.id;

      const now = Date.now();
      const nextIndex = index + 1;
      ended = nextIndex >= questionCount;
      // Phase 94: scoring config lives in the gated config/settings doc (legacy
      // parent-doc value used as a fallback for pre-migration arenas).
      const cfgRef = quizConfigRef(quizId);
      const cfgSnap = await tx.get(cfgRef);
      const config = normalizeSkipConfig(scoringConfigFrom(cfgSnap.exists ? cfgSnap.data() : undefined, quiz));

      const quizUpdate: Record<string, any> = {
        current_question_index: nextIndex,
        question_start_at: ended ? null : now,
      };
      if (ended) {
        quizUpdate.status = QUIZ_FINISHED;
        quizUpdate.ended_at = now;
        quizUpdate.paused_at = null;
      }

      const partsSnap = await getAdminDb()
        .collection(COLLECTIONS.QUIZZES).doc(quizId)
        .collection(COLLECTIONS.PARTICIPANTS)
        .get();

      // Firestore transactions require all reads before any writes. Gather
      // every read first, then apply the writes below.
      const participantUpdates: Array<{ ref: any; data: Record<string, any> }> = [];
      for (const p of partsSnap.docs) {
        const pSnap = await tx.get(p.ref);
        if (!pSnap.exists || p.id === quiz.created_by || pSnap.data()?.status === PS_BLOCKED) continue;
        const updates: Record<string, any> = {
          skipped_question_ids: FieldValue.arrayUnion(question.id),
        };
        if (ended) {
          updates.status = 'finished';
          updates.finished_at = now;
        }
        if (config.skip_penalty > 0) {
          const subSnap = await tx.get(
            db.collection(COLLECTIONS.QUIZZES).doc(quizId)
              .collection(COLLECTIONS.QUESTIONS).doc(question.id)
              .collection(COLLECTIONS.SUBMISSIONS).doc(p.id)
          );
          if (!subSnap.exists) {
            updates.score = FieldValue.increment(-config.skip_penalty);
          }
        }
        participantUpdates.push({ ref: p.ref, data: updates });
      }

      tx.update(quizRef, quizUpdate);
      // Quiz-level skip bookkeeping also moved into the config doc.
      if (cfgSnap.exists) {
        tx.update(cfgRef, { skipped_question_ids: FieldValue.arrayUnion(question.id) });
      } else {
        // Legacy arena without a config doc yet: backfill it in place so the
        // skip is recorded (Admin SDK writes bypass rules).
        tx.set(cfgRef, { skipped_question_ids: [question.id], scoring_config: quiz.scoring_config ?? null });
      }
      tx.update(
        db.collection(COLLECTIONS.QUIZZES).doc(quizId)
          .collection(COLLECTIONS.QUESTIONS).doc(question.id),
        { skipped: true }
      );
      for (const pu of participantUpdates) {
        tx.update(pu.ref, pu.data);
      }
    });

    await writeBattleLog({
      quizId,
      event: 'question_skipped',
      actor: auth.uid,
      actorRole: 'commander',
      metadata: { questionId: skippedQuestionId },
    });
    if (ended) {
      await writeBattleLog({ quizId, event: 'battle_finished', actor: auth.uid, actorRole: 'commander', metadata: { reason: 'question_skipped_last' } });
      try {
        await notifyBattleCompleted(quizId);
      } catch (e) {
        console.error('[skip] battle-completed notifications failed:', e);
      }
    }
    return NextResponse.json({ ok: true, ended });
  } catch (err: unknown) {
    return battleErrorResponse(err);
  }
}
