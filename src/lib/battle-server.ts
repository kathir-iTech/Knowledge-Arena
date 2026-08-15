import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import {
  COLLECTIONS,
  QUIZ_LIVE,
  QUIZ_PAUSED,
  QUIZ_FINISHED,
  QUIZ_ARCHIVED,
  PS_FINISHED,
  PS_BLOCKED,
  BATTLE_MODE_INDEPENDENT,
  BATTLE_MODE_SYNCHRONIZED,
  ANSWER_GRACE_MS,
  ANSWER_VIOLATION_MARGIN_MS,
  SUBMIT_CLOCK_SKEW_TOLERANCE_MS,
} from '@/lib/constants';
import { logSecurityViolation } from '@/lib/security-log';
import {
  normalizeScoringConfig,
  computeCorrectScore,
  type ScoringConfig,
} from '@/lib/battle-machine';

export type BattleLogEvent =
  | 'battle_started'
  | 'battle_activated'
  | 'battle_paused'
  | 'battle_resumed'
  | 'question_advanced'
  | 'question_skipped'
  | 'battle_finished'
  | 'battle_archived'
  | 'reconnect'
  | 'ownership_transferred'
  | 'gladiator_joined'
  | 'gladiator_left'
  | 'gladiator_ready'
  | 'gladiator_blocked'
  | 'gladiator_unblocked'
  | 'unexpected_error';

export type BattleRole = 'commander' | 'gladiator' | 'executive';

export function getMs(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof (value as any).toMillis === 'function') return (value as any).toMillis();
  return Date.now();
}

export async function loadQuizDoc(quizId: string) {
  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.QUIZZES).doc(quizId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Arena not found');
  return { ref, data: snap.data() as Record<string, any>, exists: true };
}

export function isCreator(quiz: Record<string, any>, uid: string): boolean {
  return !!quiz.created_by && quiz.created_by === uid;
}

// Maps domain errors thrown by battle logic to proper HTTP status codes.
// Unknown errors return a generic 500 without leaking internals.
const DOMAIN_ERROR_STATUS: Array<[RegExp, number]> = [
  [/Arena not found|Question not found|Answer key not found|Participant not found/, 404],
  [/Only the Commander can|You are not a member of this arena|not a participant in this arena|blocked from this arena/, 403],
  [/not a registered user/, 400],
  [/already owns this arena|Cannot (activate|start|pause|resume|skip|advance|archive|end|transfer)|Invalid battle state transition|Battle is not live|Battle can only end|Question timer has not expired|Battle has not finished/, 409],
];

export function battleErrorResponse(err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : '';
  for (const [pattern, status] of DOMAIN_ERROR_STATUS) {
    if (pattern.test(message)) {
      return NextResponse.json({ error: message }, { status });
    }
  }
  console.error('[Battle] Unhandled error:', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

export function normalizeSkipConfig(
  scoringConfig?: Record<string, any> | null
): { skip_penalty: number } {
  const raw = scoringConfig as { skip_penalty?: number } | null | undefined;
  return { skip_penalty: Math.max(0, raw?.skip_penalty ?? 0) };
}

export function isBattleState(status: string, allowed: readonly string[]): boolean {
  return allowed.includes(status);
}

export async function writeBattleLog(entry: {
  quizId: string;
  event: BattleLogEvent;
  actor: string;
  actorRole: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await getAdminDb().collection(COLLECTIONS.BATTLE_LOGS).add({
      quizId: entry.quizId,
      event: entry.event,
      actor: entry.actor,
      actorRole: entry.actorRole,
      timestamp: Date.now(),
      metadata: entry.metadata ?? null,
      createdAt: Timestamp.now(),
    });
  } catch (err) {
    console.error('[BattleLog] write failed:', err);
  }
}

function participantRef(quizId: string, userId: string) {
  return getAdminDb()
    .collection(COLLECTIONS.QUIZZES).doc(quizId)
    .collection(COLLECTIONS.PARTICIPANTS).doc(userId);
}

function submissionRef(quizId: string, questionId: string, userId: string) {
  return getAdminDb()
    .collection(COLLECTIONS.QUIZZES).doc(quizId)
    .collection(COLLECTIONS.QUESTIONS).doc(questionId)
    .collection(COLLECTIONS.SUBMISSIONS).doc(userId);
}

export async function finishBattle(
  quizId: string,
  actor: string,
  actorRole: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const db = getAdminDb();
  await db.runTransaction(async (tx) => {
    const quizRef = db.collection(COLLECTIONS.QUIZZES).doc(quizId);
    const quizSnap = await tx.get(quizRef);
    if (!quizSnap.exists) throw new Error('Arena not found');
    const status = quizSnap.data()?.status;
    if (status === QUIZ_FINISHED || status === QUIZ_ARCHIVED) return;

    const now = Date.now();
    tx.update(quizRef, {
      status: QUIZ_FINISHED,
      ended_at: now,
      question_start_at: null,
      paused_at: null,
    });

    const partsSnap = await getAdminDb()
      .collection(COLLECTIONS.QUIZZES).doc(quizId)
      .collection(COLLECTIONS.PARTICIPANTS)
      .get();
    for (const p of partsSnap.docs) {
      const pSnap = await tx.get(p.ref);
      if (!pSnap.exists || pSnap.data()?.status === PS_BLOCKED) continue;
      tx.update(p.ref, {
        status: PS_FINISHED,
        finished_at: now,
      });
    }
  });
  await writeBattleLog({ quizId, event: 'battle_finished', actor, actorRole, metadata });
}

export interface AdvanceOutcome {
  nextIndex: number;
  ended: boolean;
  alreadyAdvanced: boolean;
}

// Shared state-machine advance logic used by both the Commander's
// "Evaluate & Next" button (/api/battle/advance) and the gladiator-triggered
// Commander auto-advance (/api/battle/auto-advance). The status guard and the
// index-precondition guard are kept inside the transaction so concurrent
// advances are serialized by Firestore: if the quiz's current_question_index no
// longer matches what the caller observed (someone else already advanced past it),
// the call no-ops with alreadyAdvanced=true instead of silently advancing again.
export async function advanceQuestion(quizId: string, expectedFromIndex: number): Promise<AdvanceOutcome> {
  const db = getAdminDb();
  let nextIndex = 0;
  let ended = false;
  let alreadyAdvanced = false;
  await db.runTransaction(async (tx) => {
    const quizRef = db.collection(COLLECTIONS.QUIZZES).doc(quizId);
    const snap = await tx.get(quizRef);
    if (!snap.exists) throw new Error('Arena not found');
    const quiz = snap.data() as Record<string, any>;
    if (quiz.status !== QUIZ_LIVE && quiz.status !== QUIZ_PAUSED) {
      throw new Error(`Cannot advance a question in state: ${quiz.status}`);
    }

    const index = quiz.current_question_index ?? 0;
    if (index !== expectedFromIndex) {
      alreadyAdvanced = true;
      nextIndex = index;
      ended = false;
      return;
    }
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
      const partsSnap = await db
        .collection(COLLECTIONS.QUIZZES).doc(quizId)
        .collection(COLLECTIONS.PARTICIPANTS)
        .get();
      for (const p of partsSnap.docs) {
        const pSnap = await tx.get(p.ref);
        if (!pSnap.exists || p.id === quiz.created_by || pSnap.data()?.status === PS_BLOCKED) continue;
        tx.update(p.ref, {
          status: PS_FINISHED,
          finished_at: now,
        });
      }
    }
  });
  return { nextIndex, ended, alreadyAdvanced };
}

async function loadQuestions(quizId: string) {
  const db = getAdminDb();
  const snap = await db
    .collection(COLLECTIONS.QUIZZES).doc(quizId)
    .collection(COLLECTIONS.QUESTIONS)
    .orderBy('sort_index')
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as { id: string; text: string; options: string[]; timer: number; sort_index: number; scored?: boolean });
}

export async function evaluateQuestionForUser(
  quizId: string,
  questionId: string,
  targetUserId: string,
  actor: string,
  actorRole: string
): Promise<{ status: string; allFinished: boolean }> {
  const db = getAdminDb();

  let quizStatus = '';
  let quizMode = BATTLE_MODE_SYNCHRONIZED;
  let questionStartAt = 0;
  let questionTimer = 30;
  let questionCount = 0;
  let allFinished = false;

  await db.runTransaction(async (tx) => {
    const quizRef = db.collection(COLLECTIONS.QUIZZES).doc(quizId);
    const quizSnap = await tx.get(quizRef);
    if (!quizSnap.exists) throw new Error('Arena not found');
    const quiz = quizSnap.data() as Record<string, any>;
    if (![QUIZ_LIVE, QUIZ_PAUSED].includes(quiz.status)) {
      throw new Error(`Battle is not live (${quiz.status})`);
    }
    quizStatus = quiz.status;
    quizMode = quiz.battle_mode || BATTLE_MODE_SYNCHRONIZED;
    questionStartAt = getMs(quiz.question_start_at);
    questionCount = quiz.question_count || 0;

    const questionRef = db
      .collection(COLLECTIONS.QUIZZES).doc(quizId)
      .collection(COLLECTIONS.QUESTIONS).doc(questionId);
    const qSnap = await tx.get(questionRef);
    if (!qSnap.exists) throw new Error('Question not found');
    questionTimer = qSnap.data()?.timer || 30;

    const akRef = db
      .collection(COLLECTIONS.QUIZZES).doc(quizId)
      .collection(COLLECTIONS.ANSWER_KEYS).doc(questionId);
    const akSnap = await tx.get(akRef);
    if (!akSnap.exists) throw new Error('Answer key not found for question');
    const correctIndex = akSnap.data()?.correct_option_index as number;

    const config = normalizeScoringConfig(quiz.scoring_config as ScoringConfig);
    const timeLimit = questionTimer * 1000;

    const partRef = participantRef(quizId, targetUserId);
    const partSnap = await tx.get(partRef);
    if (!partSnap.exists) throw new Error('Participant not found');
    const participant = partSnap.data() as Record<string, any>;
    if (participant.status === PS_BLOCKED) {
      throw new Error('Participant is blocked from this arena');
    }

    const participantStart =
      typeof participant.question_start_at !== 'undefined' && participant.question_start_at !== null
        ? getMs(participant.question_start_at)
        : questionStartAt;

    const skipped = Array.isArray(participant.skipped_question_ids)
      ? (participant.skipped_question_ids as string[])
      : [];

    let scoreToAdd = 0;
    const answered = Array.isArray(participant.answered_question_ids)
      ? (participant.answered_question_ids as string[])
      : [];
    const timedOut = Array.isArray(participant.timed_out_question_ids)
      ? (participant.timed_out_question_ids as string[])
      : [];
    const skippedList = skipped.includes(questionId)
      ? skipped
      : [...skipped, questionId];

    // Idempotency guard: if this question was already scored, timed out or
    // skipped for this participant, re-evaluating it must not double-apply
    // score, penalties or index advancement (e.g. on client retry).
    if (
      answered.includes(questionId) ||
      timedOut.includes(questionId) ||
      skipped.includes(questionId)
    ) {
      return;
    }

    if (!skipped.includes(questionId)) {
      const subRef = submissionRef(quizId, questionId, targetUserId);
      const subSnap = await tx.get(subRef);
      if (subSnap.exists) {
        const sub = subSnap.data() as Record<string, any>;
        const rawSubmittedAt = getMs(sub.submittedAt);
        const submittedAt = Math.max(rawSubmittedAt, participantStart);
        const lateBy = submittedAt - (participantStart + timeLimit);

        if (rawSubmittedAt < participantStart - SUBMIT_CLOCK_SKEW_TOLERANCE_MS) {
          logSecurityViolation(targetUserId, 'submission_clock_skew', `question=${questionId}`, {
            quizId,
            submittedAt: rawSubmittedAt,
            questionStartAt: participantStart,
          });
        }

        if (lateBy > ANSWER_GRACE_MS) {
          timedOut.push(questionId);
          if (lateBy > ANSWER_VIOLATION_MARGIN_MS) {
            logSecurityViolation(
              targetUserId,
              'answer_after_timeout',
              `question=${questionId} lateBy=${lateBy}ms`,
              { quizId }
            );
          }
        } else if (sub.selected_option === correctIndex) {
          const elapsed = submittedAt - participantStart;
          scoreToAdd = computeCorrectScore(config, elapsed, timeLimit);
        } else {
          scoreToAdd = config.wrong_penalty > 0 ? -config.wrong_penalty : 0;
        }
      } else {
        timedOut.push(questionId);
      }
    } else if (config.skip_penalty > 0) {
      scoreToAdd = -config.skip_penalty;
    }

    const idx = participant.current_question_index ?? 0;
    const nextIdx = idx + 1;
    const finishedNow = nextIdx >= questionCount;

    const update: Record<string, any> = {
      current_question_index: nextIdx,
      question_start_at: Date.now(),
      answered_question_ids: answered.includes(questionId) ? answered : [...answered, questionId],
      timed_out_question_ids: timedOut,
      skipped_question_ids: skippedList,
    };
    if (scoreToAdd !== 0) {
      update.score = FieldValue.increment(scoreToAdd);
    }
    if (finishedNow) {
      update.status = PS_FINISHED;
      update.finished_at = Date.now();
    }
    tx.update(partRef, update);
  });

  if (quizMode === BATTLE_MODE_INDEPENDENT) {
    const [quizSnap2, partsSnap] = await Promise.all([
      getAdminDb().collection(COLLECTIONS.QUIZZES).doc(quizId).get(),
      getAdminDb()
        .collection(COLLECTIONS.QUIZZES).doc(quizId)
        .collection(COLLECTIONS.PARTICIPANTS)
        .get(),
    ]);
    const creatorId = quizSnap2.data()?.created_by;
    const totalStudents = partsSnap.docs.filter(d => d.id !== creatorId).length;
    const finishedCount = partsSnap.docs.filter(
      d => d.data()?.status === PS_FINISHED || d.data()?.status === PS_BLOCKED
    ).length;
    allFinished = totalStudents > 0 && finishedCount >= totalStudents;
  }

  return { status: quizStatus, allFinished };
}

export async function evaluateQuestionForAll(
  quizId: string,
  questionId: string,
  actor: string,
  actorRole: string
): Promise<void> {
  const db = getAdminDb();
  const quizRef = db.collection(COLLECTIONS.QUIZZES).doc(quizId);

  const quizSnap = await quizRef.get();
  if (!quizSnap.exists) throw new Error('Arena not found');
  const quiz = quizSnap.data() as Record<string, any>;
  if (![QUIZ_LIVE, QUIZ_PAUSED].includes(quiz.status)) {
    throw new Error(`Battle is not live (${quiz.status})`);
  }

  const questionRef = db
    .collection(COLLECTIONS.QUIZZES).doc(quizId)
    .collection(COLLECTIONS.QUESTIONS).doc(questionId);
  const questionSnap = await questionRef.get();
  if (!questionSnap.exists) throw new Error('Question not found');
  if (questionSnap.data()?.scored === true) return;

  const akSnap = await db
    .collection(COLLECTIONS.QUIZZES).doc(quizId)
    .collection(COLLECTIONS.ANSWER_KEYS).doc(questionId)
    .get();
  if (!akSnap.exists) throw new Error('Answer key not found');
  const correctIndex = akSnap.data()?.correct_option_index as number;

  const config = normalizeScoringConfig(quiz.scoring_config as ScoringConfig);
  const questionStartAt = getMs(quiz.question_start_at);
  const timeLimit = (questionSnap.data()?.timer || 30) * 1000;

  const partsSnap = await db
    .collection(COLLECTIONS.QUIZZES).doc(quizId)
    .collection(COLLECTIONS.PARTICIPANTS)
    .get();

  await db.runTransaction(async (tx) => {
    // Re-check the scored flag inside the transaction so two concurrent
    // evaluations cannot both pass the pre-check and double-score.
    const scoredSnap = await tx.get(questionRef);
    if (scoredSnap.data()?.scored === true) return;
    for (const p of partsSnap.docs) {
      const pSnap = await tx.get(p.ref);
      if (!pSnap.exists || pSnap.data()?.status === PS_BLOCKED) continue;
      const participant = pSnap.data() as Record<string, any>;
      const skipped = Array.isArray(participant.skipped_question_ids)
        ? (participant.skipped_question_ids as string[])
        : [];
      if (skipped.includes(questionId)) continue;

      const subSnap = await tx.get(submissionRef(quizId, questionId, p.id));
      if (!subSnap.exists) continue;

      const sub = subSnap.data() as Record<string, any>;
      const rawSubmittedAt = getMs(sub.submittedAt);
      const submittedAt = Math.max(rawSubmittedAt, questionStartAt);
      const lateBy = submittedAt - (questionStartAt + timeLimit);

      if (rawSubmittedAt < questionStartAt - SUBMIT_CLOCK_SKEW_TOLERANCE_MS) {
        logSecurityViolation(p.id, 'submission_clock_skew', `question=${questionId}`, {
          quizId,
          submittedAt: rawSubmittedAt,
          questionStartAt,
        });
      }

      if (lateBy > ANSWER_GRACE_MS) {
        if (lateBy > ANSWER_VIOLATION_MARGIN_MS) {
          logSecurityViolation(
            p.id,
            'answer_after_timeout',
            `question=${questionId} lateBy=${lateBy}ms`,
            { quizId }
          );
        }
        continue;
      }

      const elapsed = submittedAt - questionStartAt;
      const isCorrect = sub.selected_option === correctIndex;
      if (!isCorrect) {
        if (config.wrong_penalty > 0) {
          tx.update(p.ref, { score: FieldValue.increment(-config.wrong_penalty) });
        }
        continue;
      }
      const scoreToAdd = computeCorrectScore(config, elapsed, timeLimit);
      if (scoreToAdd > 0) {
        tx.update(p.ref, { score: FieldValue.increment(scoreToAdd) });
      }
    }
    tx.update(questionRef, { scored: true });
  });

  await writeBattleLog({ quizId, event: 'question_advanced', actor, actorRole, metadata: { questionId } });
}

export async function endBattleIfAllFinished(quizId: string): Promise<boolean> {
  const db = getAdminDb();
  const quizSnap = await db.collection(COLLECTIONS.QUIZZES).doc(quizId).get();
  if (!quizSnap.exists) return false;
  const quiz = quizSnap.data() as Record<string, any>;
  if (quiz.status === QUIZ_FINISHED || quiz.status === QUIZ_ARCHIVED) return true;
  if (quiz.status !== QUIZ_LIVE && quiz.status !== QUIZ_PAUSED) return false;

  const creatorId = quiz.created_by;
  const partsSnap = await db
    .collection(COLLECTIONS.QUIZZES).doc(quizId)
    .collection(COLLECTIONS.PARTICIPANTS)
    .get();
  const students = partsSnap.docs.filter(d => d.id !== creatorId && d.data()?.status !== PS_BLOCKED);
  if (students.length === 0) return false;
  const allDone = students.every(d => d.data()?.status === PS_FINISHED);
  if (allDone) {
    await finishBattle(quizId, 'system', 'system', { reason: 'all_gladiators_finished' });
    return true;
  }
  return false;
}
