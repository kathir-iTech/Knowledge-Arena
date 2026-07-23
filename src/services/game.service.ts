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
} from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';

function toMillis(val: unknown): number {
  if (typeof val === 'number') return val;
  if (val instanceof Timestamp) return val.toMillis();
  if (val && typeof (val as any).toMillis === 'function') return (val as any).toMillis();
  return Date.now();
}

function getFirestore() {
  return initializeFirebase().firestore;
}

export interface QuestionDoc {
  id: string;
  text: string;
  options: string[];
  timer: number;
  sort_index: number;
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
    const results: Array<QuestionDoc> = [];

    for (const q of questions) {
      const questionId = uuidv4();
      const questionRef = doc(db, 'quizzes', q.quiz_id, 'questions', questionId);
      await setDoc(questionRef, {
        text: q.text,
        options: q.options,
        timer: q.timer,
        sort_index: q.sort_index,
      });
      results.push({ id: questionId, ...q });
    }

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
      setDoc(doc(db, 'quizzes', ak.quiz_id, 'answerKeys', ak.question_id), {
        correct_option_index: ak.correct_option_index,
      })
    );
    await Promise.all(creates);
  },

  async getQuestionsByQuizId(quizId: string): Promise<QuestionDoc[]> {
    const db = getFirestore();
    const q = query(
      collection(db, 'quizzes', quizId, 'questions'),
      orderBy('sort_index')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as QuestionDoc));
  },

  subscribeToQuestions(quizId: string, callback: (questions: QuestionDoc[]) => void, onError?: (error: Error) => void) {
    const db = getFirestore();
    const q = query(
      collection(db, 'quizzes', quizId, 'questions'),
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
    const questionRef = doc(db, 'quizzes', quizId, 'questions', questionId);

    // Read the answer key (static data — safe outside transaction)
    const answerKeySnap = await getDoc(
      doc(db, 'quizzes', quizId, 'answerKeys', questionId)
    );
    if (!answerKeySnap.exists()) {
      console.warn('[evaluateQuestion] No answerKey for', quizId, questionId);
      return;
    }
    const correctIndex = answerKeySnap.data().correct_option_index;

    // Read participants to enumerate who may have submitted
    const participantsSnap = await getDocs(
      collection(db, 'quizzes', quizId, 'participants')
    );

    console.log('[evaluateQuestion] Scoring', quizId, questionId, 'participants:', participantsSnap.docs.length, 'startTime:', startTime);

    // Single atomic transaction: read question → read each submission → write scores
    try {
      await runTransaction(db, async (transaction) => {
        const qSnap = await transaction.get(questionRef);
        if (!qSnap.exists()) {
          console.warn('[evaluateQuestion] Question doc missing:', questionId);
          return;
        }
        if (qSnap.data().scored) {
          console.log('[evaluateQuestion] Already scored:', questionId);
          return;
        }

        const timerSeconds = qSnap.data().timer || 30;
        const timeLimit = timerSeconds * 1000;

        for (const pDoc of participantsSnap.docs) {
          const uid = pDoc.id;

          const participantRef = doc(db, 'quizzes', quizId, 'participants', uid);
          const pSnap = await transaction.get(participantRef);
          if (!pSnap.exists()) continue;
          if (pSnap.data().status === 'blocked') continue;

          const subRef = doc(
            db,
            'quizzes', quizId,
            'questions', questionId,
            'submissions', uid
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
          const scoreToAdd = Math.round(500 + timeFraction * 500);

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
    const snap = await getDocs(collection(db, 'quizzes', quizId, 'answerKeys'));
    return snap.docs.map(d => ({ questionId: d.id, ...d.data() as { correct_option_index: number } }));
  },

  async replaceQuizContent(
    quizId: string,
    questions: Array<{ text: string; options: string[]; timer: number; sort_index: number }>,
    answerKeys: Array<{ questionId: string; correct_option_index: number }>
  ): Promise<void> {
    const db = getFirestore();

    const quizSnap = await getDoc(doc(db, 'quizzes', quizId));
    if (!quizSnap.exists()) throw new Error('Quiz not found');
    if (quizSnap.data().status !== 'waiting') throw new Error('Can only edit a waiting quiz');

    // Track created docs for potential rollback
    const createdQuestions: string[] = [];
    const createdKeys: string[] = [];

    try {
      const oldAkSnap = await getDocs(collection(db, 'quizzes', quizId, 'answerKeys'));
      await Promise.all(oldAkSnap.docs.map(d => deleteDoc(d.ref)));

      const oldQSnap = await getDocs(collection(db, 'quizzes', quizId, 'questions'));
      await Promise.all(oldQSnap.docs.map(async (qDoc) => {
        const subSnap = await getDocs(collection(db, 'quizzes', quizId, 'questions', qDoc.id, 'submissions'));
        await Promise.all(subSnap.docs.map(s => deleteDoc(s.ref)));
        await deleteDoc(qDoc.ref);
      }));

      const newIds: string[] = [];
      for (const q of questions) {
        const questionId = uuidv4();
        await setDoc(doc(db, 'quizzes', quizId, 'questions', questionId), {
          text: q.text,
          options: q.options,
          timer: q.timer,
          sort_index: q.sort_index,
        });
        newIds.push(questionId);
        createdQuestions.push(questionId);
      }

      const creates = answerKeys.map((ak, i) =>
        setDoc(doc(db, 'quizzes', quizId, 'answerKeys', newIds[i]), {
          correct_option_index: ak.correct_option_index,
        }).then(() => newIds[i])
      );
      const keyIds = await Promise.all(creates);
      createdKeys.push(...keyIds);

      await updateDoc(doc(db, 'quizzes', quizId), { question_count: questions.length });
    } catch (e) {
      // Rollback: delete any created questions and answer keys
      await Promise.all([
        ...createdKeys.map(id => deleteDoc(doc(db, 'quizzes', quizId, 'answerKeys', id))),
        ...createdQuestions.map(id => deleteDoc(doc(db, 'quizzes', quizId, 'questions', id))),
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
        'quizzes',
        submission.quiz_id,
        'questions',
        submission.question_id,
        'submissions',
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
