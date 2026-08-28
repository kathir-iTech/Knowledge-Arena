'use client';

import { initializeFirebase } from '@/firebase';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { generateRoomCode } from '@/lib/utils';
import {
  COLLECTIONS,
  QUIZ_CONFIG_SETTINGS_DOC,
  QUIZ_WAITING,
  PS_PLAYING,
  ROOM_CODE_RETRIES,
  MAX_BATCH_OPS,
  MIN_TITLE_LENGTH,
  MIN_QUESTIONS,
  DEFAULT_SCORE_MAX,
  DEFAULT_SCORE_MIN,
  DEFAULT_WRONG_PENALTY,
  DEFAULT_SKIP_PENALTY,
  DEFAULT_TIME_DECAY,
  DEFAULT_STREAK_MULTIPLIER,
  DEFAULT_TIME_LIMIT_SECONDS,
} from '@/lib/constants';

function getFirestore() {
  return initializeFirebase().firestore;
}

export interface ArenaQuestionInput {
  text: string;
  options: string[];
  correctAnswerIndex: number;
  timer: number;
}

export interface ArenaCreationInput {
  title: string;
  questions: ArenaQuestionInput[];
  createdBy: string;
  scoringConfig?: {
    score_max?: number;
    score_min?: number;
    wrong_penalty?: number;
    skip_penalty?: number;
    time_decay?: boolean;
    streak_multiplier?: number;
    time_limit_seconds?: number;
  };
  governanceConfig?: {
    reveal_timing?: string;
    show_live_leaderboard?: boolean;
    allow_late_join?: boolean;
    negative_marking?: boolean;
    anti_cheat_strictness?: string;
  };
}

function planCreation(questionsCount: number): string[] {
  const questionIds: string[] = [];
  for (let i = 0; i < questionsCount; i++) {
    questionIds.push(uuidv4());
  }
  return questionIds;
}

function batchCount(questionsCount: number): number {
  const opsPerQuestion = 2;
  const overhead = 3; // quiz + participant + config/settings
  const totalOps = overhead + questionsCount * opsPerQuestion;
  return Math.ceil(totalOps / MAX_BATCH_OPS);
}

export const arenaCreationService = {
  async createArenaAtomic(input: ArenaCreationInput): Promise<string> {
    const db = getFirestore();
    const { title, questions, createdBy } = input;

    if (!title || title.length < MIN_TITLE_LENGTH) throw new Error('Title must be at least 3 characters');
    if (!createdBy) throw new Error('Creator ID required');
    if (!questions.length) throw new Error('At least one question is required');

    const qCount = questions.length;
    const questionIds = planCreation(qCount);

    let roomCode = generateRoomCode();
    for (let attempts = 0; attempts < ROOM_CODE_RETRIES; attempts++) {
      const existing = await getDoc(doc(db, COLLECTIONS.QUIZZES, roomCode));
      if (!existing.exists()) break;
      roomCode = generateRoomCode();
    }
    const allBatchData: Array<{
      ref: ReturnType<typeof doc>;
      data: Record<string, unknown>;
    }> = [];

    allBatchData.push({
      ref: doc(db, COLLECTIONS.QUIZZES, roomCode),
      data: {
        title,
        status: QUIZ_WAITING,
        current_question_index: -1,
        question_count: qCount,
        created_by: createdBy,
        created_at: Date.now(),
        battle_mode: 'synchronized',
      },
    });

    allBatchData.push({
      ref: doc(db, COLLECTIONS.QUIZZES, roomCode, COLLECTIONS.PARTICIPANTS, createdBy),
      data: {
        user_id: createdBy,
        score: 0,
        status: PS_PLAYING,
        violations_count: 0,
        lastSeen: serverTimestamp(),
      },
    });

    // Phase 94: arena internals (scoring config + skip bookkeeping) are created
    // in the gated config/settings document — they must NEVER live on the parent
    // quiz doc where a pre-join reader with the room code could see them.
    // Phase 99: advanced scoring — expose via UI, default to current behavior so existing arenas unaffected.
    // Batch-create timing fix: include created_by so firestore.rules can allow config/settings
    // creation even when the parent quiz doc does not yet "exist" in the same batch (exists/get
    // vs existsAfter/getAfter timing). The rule allows if request.resource.data.created_by == uid.
    const sc = input.scoringConfig;
    const gc = input.governanceConfig;
    // Negative marking toggle maps to wrong_penalty for friendlier UX:
    // when governance says negative_marking=true, ensure wrong_penalty >0.
    let effectiveWrongPenalty = sc?.wrong_penalty ?? DEFAULT_WRONG_PENALTY;
    if (gc?.negative_marking === true && effectiveWrongPenalty === 0) {
      effectiveWrongPenalty = 250;
    }
    if (gc?.negative_marking === false) {
      effectiveWrongPenalty = 0;
    }
    allBatchData.push({
      ref: doc(db, COLLECTIONS.QUIZZES, roomCode, COLLECTIONS.QUIZ_CONFIG, QUIZ_CONFIG_SETTINGS_DOC),
      data: {
        scoring_config: {
          score_max: sc?.score_max ?? DEFAULT_SCORE_MAX,
          score_min: sc?.score_min ?? DEFAULT_SCORE_MIN,
          wrong_penalty: effectiveWrongPenalty,
          skip_penalty: sc?.skip_penalty ?? DEFAULT_SKIP_PENALTY,
          time_decay: sc?.time_decay ?? DEFAULT_TIME_DECAY,
          streak_multiplier: sc?.streak_multiplier ?? DEFAULT_STREAK_MULTIPLIER,
          time_limit_seconds: sc?.time_limit_seconds ?? DEFAULT_TIME_LIMIT_SECONDS,
        },
        governance_config: {
          reveal_timing: gc?.reveal_timing ?? 'after_timer',
          show_live_leaderboard: gc?.show_live_leaderboard ?? true,
          allow_late_join: gc?.allow_late_join ?? true,
          negative_marking: gc?.negative_marking ?? false,
          anti_cheat_strictness: gc?.anti_cheat_strictness ?? 'warn_only',
        },
        skipped_question_ids: [],
        created_by: createdBy,
      },
    });

    for (let i = 0; i < qCount; i++) {
      const qId = questionIds[i];
      const q = questions[i];

      allBatchData.push({
        ref: doc(db, COLLECTIONS.QUIZZES, roomCode, COLLECTIONS.QUESTIONS, qId),
        data: {
          text: q.text,
          options: q.options,
          timer: q.timer,
          sort_index: i,
        },
      });

      allBatchData.push({
        ref: doc(db, COLLECTIONS.QUIZZES, roomCode, COLLECTIONS.ANSWER_KEYS, qId),
        data: {
          correct_option_index: q.correctAnswerIndex,
        },
      });
    }

    const totalOps = allBatchData.length;
    const commitBatches = Math.ceil(totalOps / MAX_BATCH_OPS);

    const committedRefs: Array<ReturnType<typeof doc>> = [];

    try {
      for (let b = 0; b < commitBatches; b++) {
        const batch = writeBatch(db);
        const start = b * MAX_BATCH_OPS;
        const end = Math.min(start + MAX_BATCH_OPS, totalOps);
        const slice = allBatchData.slice(start, end);

        for (const item of slice) {
          batch.set(item.ref, item.data);
        }

        try {
          await batch.commit();
        } catch (batchErr: unknown) {
          const firstPath = slice[0]?.ref?.path || 'unknown';
          const lastPath = slice[slice.length - 1]?.ref?.path || 'unknown';
          console.error('[ArenaCreation] Batch', b, 'failed. Range:', firstPath, 'to', lastPath, 'Error:', batchErr);
          throw batchErr;
        }

        for (const item of slice) {
          committedRefs.push(item.ref);
        }
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Unknown error';
      console.error('[ArenaCreation] createArenaAtomic failed after', committedRefs.length, 'committed docs:', errMsg);
      await Promise.allSettled(
        committedRefs.map(ref => deleteDoc(ref))
      );
      throw e;
    }

    return roomCode;
  },
};
