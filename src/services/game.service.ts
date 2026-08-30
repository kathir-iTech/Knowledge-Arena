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
  orderBy,
  onSnapshot,
  increment,
  runTransaction,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import type { QuestionDoc } from '@/lib/schemas';
import {
  COLLECTIONS,
  PS_BLOCKED,
  QUIZ_WAITING,
  SCORE_BASE,
  SCORE_TIMED_BONUS,
  DEFAULT_TIMER_SECONDS,
} from '@/lib/constants';

function toMillis(val: unknown): number {
  if (typeof val === 'number') return val;
  if (val instanceof Timestamp) return val.toMillis();
  if (val && typeof (val as any).toMillis === 'function') return (val as any).toMillis();
  return Date.now();
}

function getFirestore() {
  return initializeFirebase().firestore;
}

export const questionService = {
  async createQuestions(
    questions: Array<{
      quiz_id: string;
      text: string;
      options: string[];
      timer: number;
      sort_index: number;
    }>
  ): Promise<Array<QuestionDoc>> {
    const db = getFirestore();
    const batch = writeBatch(db);
    const results: Array<QuestionDoc> = [];

    for (const q of questions) {
      const questionId = uuidv4();
      const questionRef = doc(db, COLLECTIONS.QUIZZES, q.quiz_id, COLLECTIONS.QUESTIONS, questionId);
      batch.set(questionRef, {
        text: q.text,
        options: q.options,
        timer: q.timer,
        sort_index: q.sort_index,
      });
      results.push({ id: questionId, ...q });
    }

    await batch.commit();
    return results;
  },

  async createAnswerKeys(
    answerKeys: Array<{
      question_id: string;
      quiz_id: string;
      correct_option_index: number;
    }>
  ): Promise<void> {
    const db = getFirestore();
    const creates = answerKeys.map(ak =>
      setDoc(doc(db, COLLECTIONS.QUIZZES, ak.quiz_id, COLLECTIONS.ANSWER_KEYS, ak.question_id), {
        correct_option_index: ak.correct_option_index,
      })
    );
    await Promise.all(creates);
  },

  async getQuestionsByQuizId(quizId: string): Promise<QuestionDoc[]> {
    const db = getFirestore();
    const q = query(
      collection(db, COLLECTIONS.QUIZZES, quizId, COLLECTIONS.QUESTIONS),
      orderBy('sort_index')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as QuestionDoc));
  },

  subscribeToQuestions(quizId: string, callback: (questions: QuestionDoc[]) => void, onError?: (error: Error) => void) {
    const db = getFirestore();
    const q = query(
      collection(db, COLLECTIONS.QUIZZES, quizId, COLLECTIONS.QUESTIONS),
      orderBy('sort_index')
    );
    return onSnapshot(q, (snap) => {
      const questions = snap.docs.map(d => ({ id: d.id, ...d.data() } as QuestionDoc));
      callback(questions);
    }, (error) => onError?.(error));
  },

  async evaluateQuestion(
    quizId: string,
    questionId: string,
    startTime: number
  ): Promise<void> {
    const db = getFirestore();
    const questionRef = doc(db, COLLECTIONS.QUIZZES, quizId, COLLECTIONS.QUESTIONS, questionId);
    const answerKeyRef = doc(db, COLLECTIONS.QUIZZES, quizId, COLLECTIONS.ANSWER_KEYS, questionId);

    try {
      await runTransaction(db, async (transaction) => {
        const akSnap = await transaction.get(answerKeyRef);
        if (!akSnap.exists()) {
          console.warn('[evaluateQuestion] No answerKey for', quizId, questionId);
          return;
        }
        const correctIndex = akSnap.data().correct_option_index;

        const qSnap = await transaction.get(questionRef);
        if (!qSnap.exists()) {
          console.warn('[evaluateQuestion] Question doc missing:', questionId);
          return;
        }
        if (qSnap.data().scored) {
          return;
        }

        const timerSeconds = qSnap.data().timer || DEFAULT_TIMER_SECONDS;
        const timeLimit = timerSeconds * 1000;

        // Pre-fetch participant refs OUTSIDE the transaction so the transaction
        // can use transaction.get() on each ref with proper consistency guarantees.
        // (A full collection-group get inside a transaction is not supported in
        // the Firestore Admin SDK; we pre-fetch and then read individually inside.)
        let participantRefsOutside: Array<{ ref: any; uid: string }> = [];
        try {
          const pSnap = await getDocs(
            collection(db, COLLECTIONS.QUIZZES, quizId, COLLECTIONS.PARTICIPANTS)
          );
          participantRefsOutside = pSnap.docs.map(d => ({
            ref: doc(db, COLLECTIONS.QUIZZES, quizId, COLLECTIONS.PARTICIPANTS, d.id),
            uid: d.id,
          }));
        } catch {}

        for (const { ref, uid } of participantRefsOutside) {
          const participantRef = ref;
          const pSnap = await transaction.get(ref);
          if (!pSnap.exists()) continue;
          if ((pSnap.data() as Record<string, any>).status === PS_BLOCKED) continue;

          const subRef = doc(
            db,
            COLLECTIONS.QUIZZES, quizId,
            COLLECTIONS.QUESTIONS, questionId,
            COLLECTIONS.SUBMISSIONS, uid
          );
          const subSnap = await transaction.get(subRef);
          if (!subSnap.exists()) continue;

          const subData = subSnap.data();
          const isCorrect = subData.selected_option === correctIndex;
          if (!isCorrect) continue;

          const submittedAt = toMillis(subData.submittedAt);
          const clampedSubmittedAt = Math.max(submittedAt, startTime);
          const elapsed = clampedSubmittedAt - startTime;
          const timeFraction = Math.max(0, 1 - elapsed / timeLimit);
          const scoreToAdd = Math.round(SCORE_BASE + timeFraction * SCORE_TIMED_BONUS);

          if (scoreToAdd > 0) {
            transaction.update(participantRef, { score: increment(scoreToAdd) });
          }
        }

        transaction.update(questionRef, { scored: true });
      });
    } catch (e) {
      console.error('[evaluateQuestion] Transaction failed:', quizId, questionId, e);
      throw e;
    }
  },

  async getAnswerKeys(quizId: string): Promise<Array<{ questionId: string; correct_option_index: number }>> {
    const db = getFirestore();
    const snap = await getDocs(collection(db, COLLECTIONS.QUIZZES, quizId, COLLECTIONS.ANSWER_KEYS));
    return snap.docs.map(d => ({ questionId: d.id, ...d.data() as { correct_option_index: number } }));
  },

  async replaceQuizContent(
    quizId: string,
    questions: Array<{ text: string; options: string[]; timer: number; sort_index: number }>,
    answerKeys: Array<{ questionId: string; correct_option_index: number }>
  ): Promise<void> {
    const db = getFirestore();

    const quizSnap = await getDoc(doc(db, COLLECTIONS.QUIZZES, quizId));
    if (!quizSnap.exists()) throw new Error('Quiz not found');
    if (quizSnap.data().status !== QUIZ_WAITING) throw new Error('Can only edit a waiting quiz');

    const createdQuestions: string[] = [];
    const createdKeys: string[] = [];

    try {
      const oldAkSnap = await getDocs(collection(db, COLLECTIONS.QUIZZES, quizId, COLLECTIONS.ANSWER_KEYS));
      await Promise.all(oldAkSnap.docs.map(d => deleteDoc(d.ref)));

      const oldQSnap = await getDocs(collection(db, COLLECTIONS.QUIZZES, quizId, COLLECTIONS.QUESTIONS));
      await Promise.all(oldQSnap.docs.map(async (qDoc) => {
        const subSnap = await getDocs(collection(db, COLLECTIONS.QUIZZES, quizId, COLLECTIONS.QUESTIONS, qDoc.id, COLLECTIONS.SUBMISSIONS));
        await Promise.all(subSnap.docs.map(s => deleteDoc(s.ref)));
        await deleteDoc(qDoc.ref);
      }));

      const newIds: string[] = [];
      for (const q of questions) {
        const questionId = uuidv4();
        await setDoc(doc(db, COLLECTIONS.QUIZZES, quizId, COLLECTIONS.QUESTIONS, questionId), {
          text: q.text,
          options: q.options,
          timer: q.timer,
          sort_index: q.sort_index,
        });
        newIds.push(questionId);
        createdQuestions.push(questionId);
      }

      const creates = answerKeys.map((ak, i) =>
        setDoc(doc(db, COLLECTIONS.QUIZZES, quizId, COLLECTIONS.ANSWER_KEYS, newIds[i]), {
          correct_option_index: ak.correct_option_index,
        }).then(() => newIds[i])
      );
      const keyIds = await Promise.all(creates);
      createdKeys.push(...keyIds);

      await updateDoc(doc(db, COLLECTIONS.QUIZZES, quizId), { question_count: questions.length });
    } catch (e) {
      await Promise.all([
        ...createdKeys.map(id => deleteDoc(doc(db, COLLECTIONS.QUIZZES, quizId, COLLECTIONS.ANSWER_KEYS, id))),
        ...createdQuestions.map(id => deleteDoc(doc(db, COLLECTIONS.QUIZZES, quizId, COLLECTIONS.QUESTIONS, id))),
      ]);
      throw e;
    }
  },
};

export const submissionService = {
  async submitAnswer(submission: {
    quiz_id: string;
    question_id: string;
    user_id: string;
    selected_option: number;
  }): Promise<void> {
    if (!submission.quiz_id) throw new Error('Quiz ID required');
    if (!submission.question_id) throw new Error('Question ID required');
    if (!submission.user_id) throw new Error('User ID required');
    if (submission.selected_option < 0 || submission.selected_option > 3) throw new Error('Invalid option');

    const db = getFirestore();
    await setDoc(
      doc(
        db,
        COLLECTIONS.QUIZZES,
        submission.quiz_id,
        COLLECTIONS.QUESTIONS,
        submission.question_id,
        COLLECTIONS.SUBMISSIONS,
        submission.user_id
      ),
      {
        question_id: submission.question_id,
        selected_option: submission.selected_option,
        submittedAt: serverTimestamp(),
        clientTime: Date.now(),
      }
    );
  },
};
