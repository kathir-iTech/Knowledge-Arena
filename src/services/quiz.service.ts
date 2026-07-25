'use client';

import { initializeFirebase } from '@/firebase';
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import type { ValidatedQuiz } from '@/lib/schemas';
import { generateRoomCode } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import {
  COLLECTIONS,
  QUIZ_WAITING,
  QUIZ_LIVE,
  QUIZ_FINISHED,
  ALLOWED_QUIZ_TRANSITIONS,
  ROOM_CODE_RETRIES,
  MIN_TITLE_LENGTH,
  MIN_QUESTIONS,
  ROOM_CODE_LENGTH,
} from '@/lib/constants';

function getFirestore() {
  return initializeFirebase().firestore;
}

function normalizeQuiz(data: Record<string, unknown>): void {
  const qsa = data.question_start_at;
  if (qsa && typeof (qsa as any).toMillis === 'function') {
    data.question_start_at = (qsa as any).toMillis();
  }
}

export const quizService = {
  async getQuizById(id: string): Promise<ValidatedQuiz> {
    const db = getFirestore();
    const snap = await getDoc(doc(db, COLLECTIONS.QUIZZES, id));
    if (!snap.exists()) throw new Error('Quiz not found');
    const data = snap.data() as Record<string, unknown>;
    normalizeQuiz(data);
    return { id: snap.id, ...data } as ValidatedQuiz;
  },

  async getQuizzesByCreator(creatorId: string): Promise<ValidatedQuiz[]> {
    const db = getFirestore();
    const q = query(collection(db, COLLECTIONS.QUIZZES), where('created_by', '==', creatorId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ValidatedQuiz));
  },

  async createQuiz(data: {
    id: string;
    title: string;
    status: string;
    current_question_index: number;
    question_count: number;
    created_by: string;
    question_start_at?: number | null;
  }): Promise<void> {
    const db = getFirestore();

    if (!data.id || data.id.length !== ROOM_CODE_LENGTH) throw new Error('Invalid quiz ID');
    if (!data.title || data.title.length < MIN_TITLE_LENGTH) throw new Error('Title must be at least 3 characters');
    if (![QUIZ_WAITING, QUIZ_LIVE, QUIZ_FINISHED].includes(data.status as any)) throw new Error('Invalid status');
    if (data.question_count < MIN_QUESTIONS) throw new Error('Question count must be at least 1');
    if (data.current_question_index < -1) throw new Error('Invalid question index');
    if (!data.created_by) throw new Error('Creator ID required');

    const now = Date.now();
    const quizData: Record<string, unknown> = {
      title: data.title,
      status: data.status,
      current_question_index: data.current_question_index,
      question_count: data.question_count,
      created_by: data.created_by,
      created_at: now,
    };
    if (data.question_start_at !== undefined && data.question_start_at !== null) {
      quizData.question_start_at = data.question_start_at;
    }
    await setDoc(doc(db, COLLECTIONS.QUIZZES, data.id), quizData);
  },

  async updateQuizStatus(id: string, status: 'waiting' | 'live' | 'finished'): Promise<void> {
    const db = getFirestore();
    const quizRef = doc(db, COLLECTIONS.QUIZZES, id);
    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(quizRef);
        if (!snap.exists()) throw new Error('Quiz not found');
        const currentStatus = snap.data().status as string;
        const allowed = ALLOWED_QUIZ_TRANSITIONS[currentStatus] || [];
        if (!allowed.includes(status)) {
          throw new Error(`Invalid status transition: ${currentStatus} → ${status}`);
        }
        transaction.update(quizRef, { status });
      });
    } catch (e) {
      console.error('[updateQuizStatus] Failed:', id, '→', status, e);
      throw e;
    }
  },

  async startQuiz(id: string): Promise<void> {
    const db = getFirestore();
    const quizRef = doc(db, COLLECTIONS.QUIZZES, id);
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(quizRef);
      if (!snap.exists()) throw new Error('Quiz not found');
      if (snap.data().status !== QUIZ_WAITING) throw new Error('Quiz is not in waiting state');
      transaction.update(quizRef, {
        status: QUIZ_LIVE,
        current_question_index: 0,
        question_start_at: serverTimestamp(),
      });
    });
  },

  async advanceToQuestion(id: string, index: number): Promise<void> {
    const db = getFirestore();
    const quizRef = doc(db, COLLECTIONS.QUIZZES, id);
    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(quizRef);
        if (!snap.exists()) throw new Error('Quiz not found');
        if (snap.data().current_question_index >= index) {
          return;
        }
        transaction.update(quizRef, {
          current_question_index: index,
          question_start_at: serverTimestamp(),
        });
      });
    } catch (e) {
      console.error('[advanceToQuestion] Failed:', id, 'index:', index, e);
      throw e;
    }
  },

  async deleteQuiz(id: string): Promise<void> {
    const db = getFirestore();
    const errors: Error[] = [];

    const questionsSnap = await getDocs(collection(db, COLLECTIONS.QUIZZES, id, COLLECTIONS.QUESTIONS));
    const submissionDeletions = questionsSnap.docs.map(qDoc =>
      getDocs(collection(db, COLLECTIONS.QUIZZES, id, COLLECTIONS.QUESTIONS, qDoc.id, COLLECTIONS.SUBMISSIONS))
        .then(subSnap =>
          Promise.all(subSnap.docs.map(subDoc => deleteDoc(subDoc.ref).catch(e => { errors.push(e); })))
        )
        .catch(e => { errors.push(e); })
    );
    await Promise.allSettled(submissionDeletions);

    await Promise.allSettled(questionsSnap.docs.map(qDoc =>
      deleteDoc(qDoc.ref).catch(e => { errors.push(e); })
    ));

    const participantsSnap = await getDocs(collection(db, COLLECTIONS.QUIZZES, id, COLLECTIONS.PARTICIPANTS));
    await Promise.allSettled(participantsSnap.docs.map(pDoc =>
      deleteDoc(pDoc.ref).catch(e => { errors.push(e); })
    ));

    const answerKeysSnap = await getDocs(collection(db, COLLECTIONS.QUIZZES, id, COLLECTIONS.ANSWER_KEYS));
    await Promise.allSettled(answerKeysSnap.docs.map(aDoc =>
      deleteDoc(aDoc.ref).catch(e => { errors.push(e); })
    ));

    await deleteDoc(doc(db, COLLECTIONS.QUIZZES, id)).catch(e => { errors.push(e); });

    if (errors.length > 0) {
      console.warn(`deleteQuiz: ${errors.length} sub-operation(s) failed for quiz ${id}`, errors);
    }
  },

  async resetQuiz(id: string): Promise<void> {
    const db = getFirestore();

    const quizSnap = await getDoc(doc(db, COLLECTIONS.QUIZZES, id));
    if (!quizSnap.exists()) throw new Error('Quiz not found');
    if (quizSnap.data().status !== QUIZ_FINISHED) {
      throw new Error('Only finished arenas can be replayed');
    }

    const errors: Error[] = [];

    const questionsSnap = await getDocs(collection(db, COLLECTIONS.QUIZZES, id, COLLECTIONS.QUESTIONS));
    const questionOps = questionsSnap.docs.map(qDoc =>
      getDocs(collection(db, COLLECTIONS.QUIZZES, id, COLLECTIONS.QUESTIONS, qDoc.id, COLLECTIONS.SUBMISSIONS))
        .then(subSnap =>
          Promise.allSettled([
            ...subSnap.docs.map(subDoc => deleteDoc(subDoc.ref).catch(e => { errors.push(e); })),
            updateDoc(qDoc.ref, { scored: false }).catch(e => { errors.push(e); }),
          ])
        )
        .catch(e => { errors.push(e); })
    );
    await Promise.allSettled(questionOps);

    const participantsSnap = await getDocs(collection(db, COLLECTIONS.QUIZZES, id, COLLECTIONS.PARTICIPANTS));
    await Promise.allSettled(participantsSnap.docs.map(pDoc =>
      deleteDoc(pDoc.ref).catch(e => { errors.push(e); })
    ));

    if (errors.length > 0) {
      throw new Error(`Could not fully reset arena (${errors.length} operation${errors.length === 1 ? '' : 's'} failed)`);
    }

    await updateDoc(doc(db, COLLECTIONS.QUIZZES, id), {
      status: QUIZ_WAITING,
      current_question_index: -1,
      question_start_at: null,
      commanderLastSeen: null,
    });
  },

  async replayQuiz(id: string, creatorId: string): Promise<string> {
    const db = getFirestore();
    const quizSnap = await getDoc(doc(db, COLLECTIONS.QUIZZES, id));
    if (!quizSnap.exists()) throw new Error('Quiz not found');
    if (quizSnap.data().status !== QUIZ_FINISHED) {
      throw new Error('Only finished arenas can be replayed');
    }
    return this.duplicateQuiz(id, creatorId);
  },

  subscribeToQuiz(id: string, callback: (quiz: ValidatedQuiz | null) => void, onError?: (error: Error) => void) {
    const db = getFirestore();
    return onSnapshot(doc(db, COLLECTIONS.QUIZZES, id), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Record<string, unknown>;
        normalizeQuiz(data);
        callback({ id: snap.id, ...data } as ValidatedQuiz);
      } else {
        callback(null);
      }
    }, (error) => onError?.(error));
  },

  async updateQuiz(id: string, data: { title?: string; archived?: boolean }): Promise<void> {
    const db = getFirestore();
    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.archived !== undefined) updateData.archived = data.archived;
    await updateDoc(doc(db, COLLECTIONS.QUIZZES, id), updateData);
  },

  async commanderHeartbeat(id: string): Promise<void> {
    const db = getFirestore();
    await updateDoc(doc(db, COLLECTIONS.QUIZZES, id), { commanderLastSeen: serverTimestamp() });
  },

  async duplicateQuiz(id: string, creatorId: string): Promise<string> {
    const db = getFirestore();

    const quizSnap = await getDoc(doc(db, COLLECTIONS.QUIZZES, id));
    if (!quizSnap.exists()) throw new Error('Quiz not found');

    const questionsSnap = await getDocs(collection(db, COLLECTIONS.QUIZZES, id, COLLECTIONS.QUESTIONS));
    const questions = questionsSnap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; text: string; options: string[]; timer: number; sort_index: number }));

    const answerKeysSnap = await getDocs(collection(db, COLLECTIONS.QUIZZES, id, COLLECTIONS.ANSWER_KEYS));
    const answerKeys: Record<string, { correct_option_index: number }> = {};
    answerKeysSnap.docs.forEach(d => { answerKeys[d.id] = d.data() as { correct_option_index: number }; });

    let newId = generateRoomCode();
    for (let attempts = 0; attempts < ROOM_CODE_RETRIES; attempts++) {
      const existing = await getDoc(doc(db, COLLECTIONS.QUIZZES, newId));
      if (!existing.exists()) break;
      newId = generateRoomCode();
    }

    const quizData = quizSnap.data();
    const now = Date.now();
    const quizDocRef = doc(db, COLLECTIONS.QUIZZES, newId);
    const createdDocs: Array<ReturnType<typeof doc>> = [quizDocRef];

    try {
      await setDoc(quizDocRef, {
        title: quizData.title,
        status: QUIZ_WAITING,
        current_question_index: -1,
        question_count: quizData.question_count || questions.length,
        created_by: creatorId,
        created_at: now,
      });

      for (const q of questions) {
        const newQId = uuidv4();
        const qDocRef = doc(db, COLLECTIONS.QUIZZES, newId, COLLECTIONS.QUESTIONS, newQId);
        createdDocs.push(qDocRef);
        await setDoc(qDocRef, {
          text: q.text,
          options: q.options,
          timer: q.timer,
          sort_index: q.sort_index,
        });

        const ak = answerKeys[q.id];
        if (ak) {
          const akDocRef = doc(db, COLLECTIONS.QUIZZES, newId, COLLECTIONS.ANSWER_KEYS, newQId);
          createdDocs.push(akDocRef);
          await setDoc(akDocRef, {
            correct_option_index: ak.correct_option_index,
          });
        }
      }
    } catch (e) {
      await Promise.allSettled(createdDocs.map(ref => deleteDoc(ref)));
      throw e;
    }

    return newId;
  },
};
