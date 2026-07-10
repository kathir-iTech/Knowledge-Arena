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
} from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';

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

  subscribeToQuestions(quizId: string, callback: (questions: QuestionDoc[]) => void) {
    const db = getFirestore();
    const q = query(
      collection(db, 'quizzes', quizId, 'questions'),
      orderBy('sort_index')
    );
    return onSnapshot(q, (snap) => {
      const questions = snap.docs.map(d => ({ id: d.id, ...d.data() } as QuestionDoc));
      callback(questions);
    });
  },

  async evaluateQuestion(
    quizId: string,
    questionId: string,
    startTime: number
  ): Promise<void> {
    const db = getFirestore();
    const questionRef = doc(db, 'quizzes', quizId, 'questions', questionId);

    // Idempotency: atomically check if already scored
    try {
      await runTransaction(db, async (transaction) => {
        const qSnap = await transaction.get(questionRef);
        if (!qSnap.exists()) return;
        if (qSnap.data().scored) return;
        transaction.update(questionRef, { scored: true });
      });
    } catch {
      // Transaction failed (contention) — skip to prevent double-scoring
      return;
    }

    // Read the answer key
    const answerKeySnap = await getDoc(
      doc(db, 'quizzes', quizId, 'answerKeys', questionId)
    );
    if (!answerKeySnap.exists()) return;
    const correctIndex = answerKeySnap.data().correct_option_index;

    // Read the question for timer value
    const questionSnap = await getDoc(questionRef);
    if (!questionSnap.exists()) return;
    const timerSeconds = questionSnap.data().timer || 30;
    const timeLimit = timerSeconds * 1000;

    // Read all submissions
    const submissionsSnap = await getDocs(
      collection(db, 'quizzes', quizId, 'questions', questionId, 'submissions')
    );

    // Score each submission atomically — no read-before-write race
    const scoringPromises = submissionsSnap.docs.map(async (subDoc) => {
      const subData = subDoc.data();
      const isCorrect = subData.selected_option === correctIndex;

      let scoreToAdd = 0;
      if (isCorrect) {
        const elapsed = subData.submittedAt - startTime;
        const timeFraction = Math.max(0, 1 - elapsed / timeLimit);
        scoreToAdd = Math.round(500 + timeFraction * 500);
      }

      if (scoreToAdd > 0) {
        const participantRef = doc(
          db,
          'quizzes',
          quizId,
          'participants',
          subDoc.id
        );
        await updateDoc(participantRef, { score: increment(scoreToAdd) });
      }
    });

    await Promise.all(scoringPromises);
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

    const oldAkSnap = await getDocs(collection(db, 'quizzes', quizId, 'answerKeys'));
    await Promise.all(oldAkSnap.docs.map(d => deleteDoc(d.ref)));

    const oldQSnap = await getDocs(collection(db, 'quizzes', quizId, 'questions'));
    await Promise.all(oldQSnap.docs.map(async (qDoc) => {
      const subSnap = await getDocs(collection(db, 'quizzes', quizId, 'questions', qDoc.id, 'submissions'));
      await Promise.all(subSnap.docs.map(s => deleteDoc(s.ref)));
      await deleteDoc(qDoc.ref);
    }));

    await updateDoc(doc(db, 'quizzes', quizId), { question_count: questions.length });

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
    }

    const creates = answerKeys.map((ak, i) =>
      setDoc(doc(db, 'quizzes', quizId, 'answerKeys', newIds[i]), {
        correct_option_index: ak.correct_option_index,
      })
    );
    await Promise.all(creates);
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
        selected_option: submission.selected_option,
        submittedAt: Date.now(),
      }
    );
  },
};
