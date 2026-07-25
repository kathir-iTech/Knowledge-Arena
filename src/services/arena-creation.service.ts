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
  QUIZ_WAITING,
  PS_PLAYING,
  ROOM_CODE_RETRIES,
  MAX_BATCH_OPS,
  MIN_TITLE_LENGTH,
  MIN_QUESTIONS,
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
  const overhead = 2;
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
