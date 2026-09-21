import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { verifyFirebaseTokenWithAnyRole } from '@/lib/verify-auth';
import { enforceRateLimit, Limits } from '@/lib/rate-limiter';
import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import {
  COLLECTIONS,
  QUIZ_LIVE,
  PS_BLOCKED,
  PS_FINISHED,
  BATTLE_MODE_INDEPENDENT,
} from '@/lib/constants';
import {
  battleErrorResponse,
  loadQuizDoc,
  sweepStaleLiveArena,
} from '@/lib/battle-server';
import { logSecurityViolation } from '@/lib/security-log';
import {
  canonicalSubmissionPayload,
  hmacHex,
  isSubmissionTimestampFresh,
  submissionKey,
} from '@/lib/submit-answer';

export const runtime = 'nodejs';

const MAX_OPTION_INDEX = 3;

// Minimal structural types for the snapshot documents read by this route.
// Distinct from full QuizDoc/ParticipantDoc schemas: only the fields this
// security-critical path depends on, so the checks can never be widened by an
// upstream schema drift.
interface ParticipantData {
  status?: string;
  session_token?: string;
  question_order?: string[];
  current_question_index?: number;
}

interface QuizData {
  status?: string;
  battle_mode?: string;
  current_question_index?: number;
}

function safeEqual(hexA: string, hexB: string): boolean {
  if (hexA.length !== hexB.length || hexA.length === 0) return false;
  return timingSafeEqual(Buffer.from(hexA, 'hex'), Buffer.from(hexB, 'hex'));
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyFirebaseTokenWithAnyRole(req, ['gladiator', 'commander']);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const rateLimitResponse = await enforceRateLimit(`battle:submit:${auth.uid}`, Limits.BATTLE_ACTION_PER_USER);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await req.json().catch(() => ({}));
    const quizId = typeof body.quizId === 'string' ? body.quizId.trim() : '';
    const questionId = typeof body.questionId === 'string' ? body.questionId.trim() : '';
    const selectedOption = body.selectedOption;
    const nonce = typeof body.nonce === 'string' ? body.nonce.trim() : '';
    const clientTime = body.clientTime;
    const signature = typeof body.signature === 'string' ? body.signature.trim() : '';

    if (!quizId || !questionId) {
      return NextResponse.json({ error: 'Missing quizId or questionId' }, { status: 400 });
    }
    if (
      typeof selectedOption !== 'number' ||
      !Number.isInteger(selectedOption) ||
      selectedOption < 0 ||
      selectedOption > MAX_OPTION_INDEX
    ) {
      return NextResponse.json({ error: 'Invalid selected_option' }, { status: 400 });
    }
    if (!nonce || nonce.length < 8 || nonce.length > 128) {
      return NextResponse.json({ error: 'Invalid nonce' }, { status: 400 });
    }
    if (typeof clientTime !== 'number' || !isSubmissionTimestampFresh(clientTime)) {
      logSecurityViolation(auth.uid, 'stale_submission_timestamp', `quiz=${quizId} question=${questionId}`, {
        quizId,
        questionId,
        clientTime,
        serverTime: Date.now(),
      });
      return NextResponse.json({ error: 'Submission timestamp expired — refresh and retry' }, { status: 400 });
    }
    if (!signature || signature.length < 32) {
      return NextResponse.json({ error: 'Missing submission signature' }, { status: 400 });
    }

    const db = getAdminDb();

    // Arena must be live (and not a zombie). sweepStaleLiveArena returns true
    // when it abandoned an inactive live arena — hard-stop stale submits.
    const { ref: quizRef, data: quiz } = await loadQuizDoc(quizId);
    if (await sweepStaleLiveArena(quizId, quiz)) {
      return NextResponse.json(
        { error: 'This battle was abandoned because it was inactive for too long.' },
        { status: 409 }
      );
    }
    if (quiz.status !== QUIZ_LIVE) {
      throw new Error('Battle is not live');
    }

    const partRef = db
      .collection(COLLECTIONS.QUIZZES).doc(quizId)
      .collection(COLLECTIONS.PARTICIPANTS).doc(auth.uid);
    const partSnap = await partRef.get();
    if (!partSnap.exists) {
      throw new Error('You are not a member of this arena');
    }
    const participant = (partSnap.data() ?? {}) as ParticipantData;
    if (participant.status === PS_BLOCKED) {
      throw new Error('blocked from this arena');
    }
    if (participant.status === PS_FINISHED) {
      return NextResponse.json({ error: 'You have already finished this battle' }, { status: 409 });
    }

    // --- HMAC verification (audit Phase 1) ---
    // Signature binds to this participant's battle session token. Any mismatch
    // is a tamper/replay attempt: logged, rejected, no write.
    const sessionToken = typeof participant.session_token === 'string' ? participant.session_token : '';
    if (!sessionToken) {
      logSecurityViolation(auth.uid, 'missing_submission_key', `quiz=${quizId} question=${questionId}`, {
        quizId,
        questionId,
      });
      return NextResponse.json({ error: 'Battle session token missing — please rejoin the battle' }, { status: 403 });
    }
    const expected = await hmacHex(
      submissionKey(sessionToken, auth.uid, quizId),
      canonicalSubmissionPayload({ quizId, questionId, selectedOption, nonce, clientTime })
    );
    if (!safeEqual(expected.toLowerCase(), signature.toLowerCase())) {
      logSecurityViolation(auth.uid, 'invalid_submission_signature', `quiz=${quizId} question=${questionId}`, {
        quizId,
        questionId,
        nonce,
      });
      return NextResponse.json({ error: 'Submission signature verification failed' }, { status: 403 });
    }

    // --- Atomic one-shot submission (audit refinement) ---
    // A single Admin-SDK transaction makes the ENTIRE acceptance atomic: quiz
    // still live, participant still active, question still current, AND no
    // prior submission — then commits the write in the same step. This closes
    // the read-then-write race that two in-flight requests could exploit
    // (both seeing "no submission" and both writing, so the later tap silently
    // overwrites the earlier answer).
    // Graceful retry semantics: when concurrent requests race on the same
    // submission doc, Firestore automatically retries the losing transaction;
    // the retry sees the winner's committed write and returns
    // alreadySubmitted:true — a harmless no-op the client treats as success,
    // never a hard error and never an overwrite.
    //
    // The pre-transaction reads above (quiz + participant) only feed the HMAC
    // check and the liveness sweep; authority lives inside this transaction.
    const subRef = db
      .collection(COLLECTIONS.QUIZZES).doc(quizId)
      .collection(COLLECTIONS.QUESTIONS).doc(questionId)
      .collection(COLLECTIONS.SUBMISSIONS).doc(auth.uid);

    const outcome = await db.runTransaction(async (t) => {
      const quizSnap = await t.get(quizRef);
      if (!quizSnap.exists) throw new Error('Arena not found');
      const quizData = (quizSnap.data() ?? {}) as QuizData;
      if (quizData.status !== QUIZ_LIVE) throw new Error('Battle is not live');

      const partSnap = await t.get(partRef);
      if (!partSnap.exists) throw new Error('You are not a member of this arena');
      const partData = (partSnap.data() ?? {}) as ParticipantData;
      if (partData.status === PS_BLOCKED) throw new Error('blocked from this arena');
      if (partData.status === PS_FINISHED) {
        return { code: 'finished' as const, alreadySubmitted: false };
      }

      const subSnap = await t.get(subRef);
      if (subSnap.exists) {
        return { code: 'ok' as const, alreadySubmitted: true };
      }

      // Current-question binding verified INSIDE the transaction so an engine
      // advance that lands between request and commit cannot accept a late
      // answer for a question that just closed. Mirrors the rules'
      // isCurrentQuestion semantics per-participant (shuffled order in
      // independent mode) or sort_index vs current_question_index (synced).
      const order = Array.isArray(partData.question_order)
        ? (partData.question_order as string[])
        : null;
      const partIndex = typeof partData.current_question_index === 'number'
        ? partData.current_question_index
        : 0;
      let isCurrent = false;
      if (order && order.length > 0) {
        isCurrent = partIndex >= 0 && partIndex < order.length && order[partIndex] === questionId;
      } else {
        const qSnap = await t.get(
          db
            .collection(COLLECTIONS.QUIZZES).doc(quizId)
            .collection(COLLECTIONS.QUESTIONS).doc(questionId)
        );
        const sortIndex = qSnap.exists ? qSnap.data()?.sort_index : undefined;
        const quizIndex = typeof quizData.current_question_index === 'number'
          ? quizData.current_question_index
          : 0;
        const mode = quizData.battle_mode || BATTLE_MODE_INDEPENDENT;
        // Synchronized arenas bind by sort_index == current_question_index.
        // Independent arenas without a per-participant order fall back to the
        // same sort_index binding as a conservative default.
        isCurrent =
          typeof sortIndex === 'number' &&
          sortIndex === quizIndex &&
          (mode !== BATTLE_MODE_INDEPENDENT || !order);
      }
      if (!isCurrent) {
        return { code: 'wrong-question' as const, alreadySubmitted: false };
      }

      t.set(subRef, {
        question_id: questionId,
        selected_option: selectedOption,
        // Server time is the canonical submittedAt (the old rules forced
        // submittedAt == request.time; the Admin write guarantees the same).
        submittedAt: Timestamp.now(),
        clientTime: Math.floor(clientTime),
      });
      return { code: 'ok' as const, alreadySubmitted: false };
    });

    if (outcome.code === 'finished') {
      return NextResponse.json({ error: 'You have already finished this battle' }, { status: 409 });
    }
    if (outcome.code === 'wrong-question') {
      logSecurityViolation(auth.uid, 'submission_wrong_question', `quiz=${quizId} question=${questionId}`, {
        quizId,
        questionId,
      });
      return NextResponse.json({ error: 'That is not the current question' }, { status: 409 });
    }
    // outcome.code === 'ok' — single response, idempotent on retry.
    return NextResponse.json({ ok: true, alreadySubmitted: outcome.alreadySubmitted });
  } catch (err: unknown) {
    return battleErrorResponse(err);
  }
}