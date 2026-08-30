import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import {
  COLLECTIONS,
  QUIZ_CONFIG_SETTINGS_DOC,
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
import { notificationService } from '@/services/notification.service';
import {
  normalizeScoringConfig,
  computeCorrectScore,
  computeStreakBonus,
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

// Phase 94: arena internals (scoring_config, skipped_question_ids) live in the
// gated quizzes/{quizId}/config/settings document, never on the parent quiz
// doc. These helpers centralize the location for every server-side read.
export function quizConfigRef(quizId: string) {
  return getAdminDb()
    .collection(COLLECTIONS.QUIZZES).doc(quizId)
    .collection(COLLECTIONS.QUIZ_CONFIG).doc(QUIZ_CONFIG_SETTINGS_DOC);
}

// Returns the raw scoring_config map from the config doc, falling back to a
// legacy value still sitting on the parent quiz doc (pre-Phase 94 data) when
// no config document exists yet.
export function scoringConfigFrom(doc: Record<string, any> | undefined, legacyQuiz?: Record<string, any>): Record<string, any> | null | undefined {
  if (doc && typeof doc.scoring_config !== 'undefined' && doc.scoring_config !== null) {
    return doc.scoring_config;
  }
  return legacyQuiz?.scoring_config ?? null;
}

export type GovernanceConfig = {
  reveal_timing: 'after_timer' | 'never_during_battle';
  show_live_leaderboard: boolean;
  allow_late_join: boolean;
  negative_marking: boolean;
  anti_cheat_strictness: 'warn_only' | 'auto_flag';
};

export const DEFAULT_GOVERNANCE_CONFIG: GovernanceConfig = {
  reveal_timing: 'after_timer',
  show_live_leaderboard: true,
  allow_late_join: true,
  negative_marking: false,
  anti_cheat_strictness: 'warn_only',
};

export function normalizeGovernanceConfig(raw?: Record<string, any> | null): GovernanceConfig {
  if (!raw) return { ...DEFAULT_GOVERNANCE_CONFIG };
  return {
    reveal_timing: raw.reveal_timing === 'never_during_battle' ? 'never_during_battle' : 'after_timer',
    show_live_leaderboard: typeof raw.show_live_leaderboard === 'boolean' ? raw.show_live_leaderboard : true,
    allow_late_join: typeof raw.allow_late_join === 'boolean' ? raw.allow_late_join : true,
    negative_marking: typeof raw.negative_marking === 'boolean' ? raw.negative_marking : false,
    anti_cheat_strictness: raw.anti_cheat_strictness === 'auto_flag' ? 'auto_flag' : 'warn_only',
  };
}

export function governanceConfigFrom(doc: Record<string, any> | undefined): Record<string, any> | null | undefined {
  if (doc && typeof doc.governance_config !== 'undefined' && doc.governance_config !== null) {
    return doc.governance_config;
  }
  return null;
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

// Write-time denormalized per-question analytics (Phase 68). The analytics
// dashboard previously re-scanned every question's submissions subcollection
// client-side for every finished quiz; instead, the server collapses each
// question's submissions into an aggregated `questionStats` field on the
// question doc at evaluation/finish time. The dashboard now reads a single
// field per question instead of one document per submission.
//
// Privacy note: aggregated counts live on the question doc (rules forbid adding
// a dedicated subcollection outside scope), so arena participants can read the
// aggregate of a question they have already answered. Scores and correctness of
// individual participants are never included.
export async function writeQuestionStats(quizId: string, questionId: string): Promise<void> {
  const db = getAdminDb();
  try {
    const akSnap = await db
      .collection(COLLECTIONS.QUIZZES).doc(quizId)
      .collection(COLLECTIONS.ANSWER_KEYS).doc(questionId)
      .get();
    const correctIndex = typeof akSnap.data()?.correct_option_index === 'number'
      ? akSnap.data()!.correct_option_index
      : null;

    const subsSnap = await db
      .collection(COLLECTIONS.QUIZZES).doc(quizId)
      .collection(COLLECTIONS.QUESTIONS).doc(questionId)
      .collection(COLLECTIONS.SUBMISSIONS)
      .get();

    const optionCounts: number[] = [];
    let submittedCount = 0;
    let correctCount = 0;
    const timestamps: number[] = [];
    const userTimes: Record<string, number> = {};
    for (const d of subsSnap.docs) {
      const data = d.data();
      if (typeof data.selected_option !== 'number' || data.selected_option < 0) continue;
      submittedCount++;
      const idx = data.selected_option;
      while (optionCounts.length <= idx) optionCounts.push(0);
      optionCounts[idx]++;
      if (correctIndex !== null && idx === correctIndex) correctCount++;
      const ts = getMs(data.submittedAt);
      timestamps.push(ts);
      userTimes[d.id] = typeof data.clientTime === 'number' ? data.clientTime : ts;
    }

    await db
      .collection(COLLECTIONS.QUIZZES).doc(quizId)
      .collection(COLLECTIONS.QUESTIONS).doc(questionId)
      .set(
        {
          questionStats: {
            submittedCount,
            optionCounts,
            correctCount,
            correctOptionIndex: correctIndex,
            timestamps: timestamps.slice(0, 500),
            userTimes,
          },
        },
        { merge: true }
      );
  } catch (err) {
    console.error('[battle-server] writeQuestionStats failed:', err);
  }
}

export async function finishBattle(
  quizId: string,
  actor: string,
  actorRole: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const db = getAdminDb();
  let didTransition = false;
  await db.runTransaction(async (tx) => {
    const quizRef = db.collection(COLLECTIONS.QUIZZES).doc(quizId);
    const quizSnap = await tx.get(quizRef);
    if (!quizSnap.exists) throw new Error('Arena not found');
    const status = quizSnap.data()?.status;
    if (status === QUIZ_FINISHED || status === QUIZ_ARCHIVED) return;
    didTransition = true;

    const now = Date.now();
    tx.update(quizRef, {
      status: QUIZ_FINISHED,
      ended_at: now,
      question_start_at: null,
      paused_at: null,
    });
  });
  if (!didTransition) return;
  await writeBattleLog({ quizId, event: 'battle_finished', actor, actorRole, metadata });

  // Denormalize analytics for every question now that the battle is final —
  // the analytics dashboard relies on these write-time aggregates.
  try {
    const qSnap = await getAdminDb()
      .collection(COLLECTIONS.QUIZZES).doc(quizId)
      .collection(COLLECTIONS.QUESTIONS)
      .get();
    await Promise.all(qSnap.docs.map(d => writeQuestionStats(quizId, d.id)));
  } catch (err) {
    console.error('[finishBattle] question stats collection failed:', err);
  }

  // Notify participants with their final rank — best-effort, never fails the battle.
  try {
    await notifyBattleCompleted(quizId);
  } catch (err) {
    console.error('[finishBattle] battle-completed notifications failed:', err);
  }
}

/**
 * Fan-out battle-completed notifications to every participant with ranking.
 * Gladiators get rank/score; the Commander gets a summary.
 */
export async function notifyBattleCompleted(quizId: string): Promise<void> {
  const db = getAdminDb();
  const quizSnap = await db.collection(COLLECTIONS.QUIZZES).doc(quizId).get();
  const quizData = quizSnap.data() as Record<string, any> | undefined;
  const title: string = typeof quizData?.title === 'string' ? quizData.title : quizId;
  const creatorId: string | undefined = typeof quizData?.created_by === 'string' ? quizData.created_by : undefined;

  const partsSnap = await db
    .collection(COLLECTIONS.QUIZZES).doc(quizId)
    .collection(COLLECTIONS.PARTICIPANTS)
    .get();

  const gladiators = partsSnap.docs
    .map(d => ({ id: d.id, data: d.data() as Record<string, any> }))
    .filter(p => p.id !== creatorId && p.data.status !== PS_BLOCKED);

  // Sort by score descending for ranking.
  gladiators.sort((a, b) => (Number(b.data.score) || 0) - (Number(a.data.score) || 0));
  const total = gladiators.length;
  const now = Date.now();
  const link = `/battle/${quizId}`;

  type PendingEntry = { type: 'battle_completed'; title: string; description: string; createdAt: number; userId: string; link: string; metadata: Record<string, unknown> };
  const pending: PendingEntry[] = [];

  for (let i = 0; i < gladiators.length; i++) {
    const p = gladiators[i];
    const rank = i + 1;
    const score = Number(p.data.score) || 0;
    pending.push({
      type: 'battle_completed' as const,
      title: `Battle Finished — Rank #${rank}`,
      description: `You finished #${rank} of ${total} with ${score} pts in "${title}"`,
      createdAt: now,
      userId: p.id,
      link,
      metadata: { quizId, rank, total, score, title },
    });
  }

  if (creatorId) {
    const winner = gladiators[0];
    const winnerText = winner
      ? `${(winner.data.name as string) || winner.id.slice(0, 6)} (${Number(winner.data.score) || 0} pts)`
      : 'no participants';
    pending.push({
      type: 'battle_completed' as const,
      title: 'Battle Completed',
      description: `Arena "${title}" finished — ${total} gladiator${total !== 1 ? 's' : ''}, winner: ${winnerText}`,
      createdAt: now,
      userId: creatorId,
      link,
      metadata: { quizId, total, title, winnerId: winner?.id ?? null },
    });
  }

  if (pending.length === 0) return;
  // Fan-out via notificationService.create per participant (chunked for rate control)
  const CHUNK = 20;
  for (let i = 0; i < pending.length; i += CHUNK) {
    const slice = pending.slice(i, i + CHUNK);
    await Promise.all(slice.map(entry => notificationService.create(entry)));
  }
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

  // Pre-fetch participants outside the transaction so the transaction does
  // not need to do a non-transactional collection get() inside it (which
  // would interleave with writes on the last-question path).
  let preFetchedParts: Array<{ ref: any; id: string }> | null = null;

  const doAdvance = async (): Promise<void> => {
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

      // Firestore transactions require ALL reads before ANY writes. On the
      // last-question path we must finish gladiators — gather those reads
      // before the quiz update write.
      let pendingFinishes: Array<{ ref: any; data: Record<string, any> }> = [];
      if (ended) {
        // Participants must be pre-fetched for the finish-gladiators path.
        // If they weren't captured in the same transaction, surface a retryable
        // error so the caller re-fetches with fresh data (see the catch block below).
        const partsSnap = await db.collection(COLLECTIONS.QUIZZES).doc(quizId).collection(COLLECTIONS.PARTICIPANTS).get();
        preFetchedParts = partsSnap.docs.map(d => ({ ref: d.ref, id: d.id }));

        for (const p of preFetchedParts) {
          const pSnap: any = await tx.get(p.ref);
          if (!pSnap.exists || p.id === quiz.created_by || pSnap.data()?.status === PS_BLOCKED) continue;
          pendingFinishes.push({
            ref: p.ref,
            data: { status: PS_FINISHED, finished_at: now },
          });
        }
      }

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
      for (const pf of pendingFinishes) {
        tx.update(pf.ref, pf.data);
      }
    });
  };

  try {
    await doAdvance();
  } catch (err) {
    // If the transaction failed because participants weren't pre-fetched
    // (e.g., index changed between pre-check and tx), re-fetch and retry once.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Participants not pre-fetched')) {
      const partsSnap = await db.collection(COLLECTIONS.QUIZZES).doc(quizId).collection(COLLECTIONS.PARTICIPANTS).get();
      preFetchedParts = partsSnap.docs.map(d => ({ ref: d.ref, id: d.id }));
      alreadyAdvanced = false;
      ended = false;
      nextIndex = 0;
      await doAdvance();
    } else {
      throw err;
    }
  }

  if (ended) {
    // The last question may end the battle without a final evaluateQuestion
    // pass; denormalize analytics now so finished battles always have stats.
    try {
      const qSnap = await getAdminDb()
        .collection(COLLECTIONS.QUIZZES).doc(quizId)
        .collection(COLLECTIONS.QUESTIONS)
        .get();
      await Promise.all(qSnap.docs.map(d => writeQuestionStats(quizId, d.id)));
    } catch (err) {
      console.error('[advanceQuestion] question stats collection failed:', err);
    }
    try {
      await notifyBattleCompleted(quizId);
    } catch (err) {
      console.error('[advanceQuestion] battle-completed notifications failed:', err);
    }
  }

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

    const cfgSnap = await tx.get(quizConfigRef(quizId));
    const rawGov = governanceConfigFrom(cfgSnap.exists ? cfgSnap.data() : undefined);
    const governance = normalizeGovernanceConfig(rawGov as any);
    const rawConfig = normalizeScoringConfig(
      scoringConfigFrom(cfgSnap.exists ? cfgSnap.data() : undefined, quiz) as ScoringConfig
    );
    // negative_marking governance: when false, wrong answers must not subtract points
    const config = governance.negative_marking ? rawConfig : { ...rawConfig, wrong_penalty: 0 };
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

    // Streak tracking — server-side only (Phase 99)
    const currentStreak = typeof participant.current_streak === 'number' ? participant.current_streak : 0;
    const bestStreak = typeof participant.best_streak === 'number' ? participant.best_streak : 0;
    let newStreak = currentStreak;
    let isCorrectForStreak = false;

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
          newStreak = 0;
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
          const baseScore = computeCorrectScore(config, elapsed, timeLimit);
          newStreak = currentStreak + 1;
          isCorrectForStreak = true;
          const streakBonus = computeStreakBonus(newStreak, config.streak_multiplier);
          scoreToAdd = baseScore + streakBonus;
        } else {
          scoreToAdd = config.wrong_penalty > 0 ? -config.wrong_penalty : 0;
          newStreak = 0;
        }
      } else {
        timedOut.push(questionId);
        newStreak = 0;
      }
    } else {
      if (config.skip_penalty > 0) {
        scoreToAdd = -config.skip_penalty;
      }
      newStreak = 0;
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
      current_streak: newStreak,
      best_streak: Math.max(bestStreak, newStreak),
    };
    if (scoreToAdd !== 0) {
      update.score = FieldValue.increment(scoreToAdd);
    }
    // Record streak bonus metadata for analytics (even when scoreToAdd is 0 but streak changed)
    if (isCorrectForStreak && config.streak_multiplier > 0) {
      update.last_streak_bonus = computeStreakBonus(newStreak, config.streak_multiplier);
    }
    if (finishedNow) {
      update.status = PS_FINISHED;
      update.finished_at = Date.now();
    }
    tx.update(partRef, update);
  });

  await writeQuestionStats(quizId, questionId);

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

  const cfgSnap = await db
    .collection(COLLECTIONS.QUIZZES).doc(quizId)
    .collection(COLLECTIONS.QUIZ_CONFIG).doc(QUIZ_CONFIG_SETTINGS_DOC)
    .get();
  const rawGov2 = governanceConfigFrom(cfgSnap.exists ? cfgSnap.data() : undefined);
  const gov2 = normalizeGovernanceConfig(rawGov2 as any);
  const rawConfig2 = normalizeScoringConfig(
    scoringConfigFrom(cfgSnap.exists ? cfgSnap.data() : undefined, quiz) as ScoringConfig
  );
  const config = gov2.negative_marking ? rawConfig2 : { ...rawConfig2, wrong_penalty: 0 };
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

    // All reads must complete before any writes (Firestore transaction
    // constraint). First pass: gather reads and compute per-participant
    // outcomes; second pass: apply the writes.
    // Phase 99: streak tracking — server-side only (not client).
    const plans: Array<{ ref: any; scoreToAdd: number; newStreak: number; bestStreak: number }> = [];
    for (const p of partsSnap.docs) {
      const pSnap = await tx.get(p.ref);
      if (!pSnap.exists || pSnap.data()?.status === PS_BLOCKED) continue;
      const participant = pSnap.data() as Record<string, any>;
      const skipped = Array.isArray(participant.skipped_question_ids)
        ? (participant.skipped_question_ids as string[])
        : [];
      if (skipped.includes(questionId)) continue;

      const currentStreak = typeof participant.current_streak === 'number' ? participant.current_streak : 0;
      const bestStreak = typeof participant.best_streak === 'number' ? participant.best_streak : 0;

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
        // Timeout resets streak (server-side)
        if (currentStreak !== 0) {
          plans.push({ ref: p.ref, scoreToAdd: 0, newStreak: 0, bestStreak });
        }
        continue;
      }

      const elapsed = submittedAt - questionStartAt;
      const isCorrect = sub.selected_option === correctIndex;
      if (!isCorrect) {
        const score = config.wrong_penalty > 0 ? -config.wrong_penalty : 0;
        // Wrong resets streak
        if (score !== 0 || currentStreak !== 0) {
          plans.push({ ref: p.ref, scoreToAdd: score, newStreak: 0, bestStreak });
        }
        continue;
      }
      const newStreak = currentStreak + 1;
      const streakBonus = computeStreakBonus(newStreak, config.streak_multiplier);
      const baseScore = computeCorrectScore(config, elapsed, timeLimit);
      const scoreToAdd = baseScore + streakBonus;
      plans.push({ ref: p.ref, scoreToAdd, newStreak, bestStreak: Math.max(bestStreak, newStreak) });
    }
    for (const plan of plans) {
      const update: Record<string, any> = {
        current_streak: plan.newStreak,
        best_streak: plan.bestStreak,
      };
      if (plan.scoreToAdd !== 0) {
        update.score = FieldValue.increment(plan.scoreToAdd);
      }
      tx.update(plan.ref, update);
    }
    tx.update(questionRef, { scored: true });
  });

  await writeQuestionStats(quizId, questionId);
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
