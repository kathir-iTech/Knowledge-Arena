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
} from 'firebase/firestore';
import type { ValidatedQuiz } from '@/lib/schemas';
import { generateRoomCode } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';

function getFirestore() {
  return initializeFirebase().firestore;
}

export const quizService = {
  async getQuizById(id: string): Promise<ValidatedQuiz> {
    const db = getFirestore();
    const snap = await getDoc(doc(db, 'quizzes', id));
    if (!snap.exists()) throw new Error('Quiz not found');
    return { id: snap.id, ...snap.data() } as ValidatedQuiz;
  },

  async getQuizzesByCreator(creatorId: string): Promise<ValidatedQuiz[]> {
    const db = getFirestore();
    const q = query(collection(db, 'quizzes'), where('created_by', '==', creatorId));
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

    // Validate inputs
    if (!data.id || data.id.length !== 6) throw new Error('Invalid quiz ID');
    if (!data.title || data.title.length < 3) throw new Error('Title must be at least 3 characters');
    if (!['waiting', 'live', 'finished'].includes(data.status)) throw new Error('Invalid status');
    if (data.question_count < 1) throw new Error('Question count must be at least 1');
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
    await setDoc(doc(db, 'quizzes', data.id), quizData);
  },

  async updateQuizStatus(id: string, status: 'waiting' | 'live' | 'finished'): Promise<void> {
    const db = getFirestore();
    await updateDoc(doc(db, 'quizzes', id), { status });
  },

  async startQuiz(id: string): Promise<void> {
    const db = getFirestore();
    await updateDoc(doc(db, 'quizzes', id), {
      status: 'live',
      current_question_index: 0,
      question_start_at: Date.now(),
    });
  },

  async advanceToQuestion(id: string, index: number): Promise<void> {
    const db = getFirestore();
    await updateDoc(doc(db, 'quizzes', id), {
      current_question_index: index,
      question_start_at: Date.now(),
    });
  },

  async deleteQuiz(id: string): Promise<void> {
    const db = getFirestore();

    const errors: Error[] = [];

    // Delete all submissions under each question
    const questionsSnap = await getDocs(collection(db, 'quizzes', id, 'questions'));
    const submissionDeletions = questionsSnap.docs.map(qDoc =>
      getDocs(collection(db, 'quizzes', id, 'questions', qDoc.id, 'submissions'))
        .then(subSnap =>
          Promise.all(subSnap.docs.map(subDoc => deleteDoc(subDoc.ref).catch(e => { errors.push(e); })))
        )
        .catch(e => { errors.push(e); })
    );
    await Promise.allSettled(submissionDeletions);

    // Delete all questions
    await Promise.allSettled(questionsSnap.docs.map(qDoc =>
      deleteDoc(qDoc.ref).catch(e => { errors.push(e); })
    ));

    // Delete all participants
    const participantsSnap = await getDocs(collection(db, 'quizzes', id, 'participants'));
    await Promise.allSettled(participantsSnap.docs.map(pDoc =>
      deleteDoc(pDoc.ref).catch(e => { errors.push(e); })
    ));

    // Delete all answerKeys
    const answerKeysSnap = await getDocs(collection(db, 'quizzes', id, 'answerKeys'));
    await Promise.allSettled(answerKeysSnap.docs.map(aDoc =>
      deleteDoc(aDoc.ref).catch(e => { errors.push(e); })
    ));

    // Delete the quiz document
    await deleteDoc(doc(db, 'quizzes', id)).catch(e => { errors.push(e); });

    if (errors.length > 0) {
      console.warn(`deleteQuiz: ${errors.length} sub-operation(s) failed for quiz ${id}`, errors);
    }
  },

  async resetQuiz(id: string): Promise<void> {
    const db = getFirestore();

    const errors: Error[] = [];

    // Delete all submissions + reset scored flag on each question
    const questionsSnap = await getDocs(collection(db, 'quizzes', id, 'questions'));
    const questionOps = questionsSnap.docs.map(qDoc =>
      getDocs(collection(db, 'quizzes', id, 'questions', qDoc.id, 'submissions'))
        .then(subSnap =>
          Promise.allSettled([
            ...subSnap.docs.map(subDoc => deleteDoc(subDoc.ref).catch(e => { errors.push(e); })),
            updateDoc(qDoc.ref, { scored: false }).catch(e => { errors.push(e); }),
          ])
        )
        .catch(e => { errors.push(e); })
    );
    await Promise.allSettled(questionOps);

    // Delete all participants (fresh start for new round)
    const participantsSnap = await getDocs(collection(db, 'quizzes', id, 'participants'));
    await Promise.allSettled(participantsSnap.docs.map(pDoc =>
      deleteDoc(pDoc.ref).catch(e => { errors.push(e); })
    ));

    // Reset quiz metadata
    await updateDoc(doc(db, 'quizzes', id), {
      status: 'waiting',
      current_question_index: -1,
      question_start_at: null,
    });

    if (errors.length > 0) {
      console.warn(`resetQuiz: ${errors.length} sub-operation(s) failed for quiz ${id}`, errors);
    }
  },

  subscribeToQuiz(id: string, callback: (quiz: ValidatedQuiz) => void) {
    const db = getFirestore();
    return onSnapshot(doc(db, 'quizzes', id), (snap) => {
      if (snap.exists()) {
        callback({ id: snap.id, ...snap.data() } as ValidatedQuiz);
      }
    });
  },

  async updateQuiz(id: string, data: { title?: string; archived?: boolean }): Promise<void> {
    const db = getFirestore();
    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.archived !== undefined) updateData.archived = data.archived;
    await updateDoc(doc(db, 'quizzes', id), updateData);
  },

  async duplicateQuiz(id: string, creatorId: string): Promise<string> {
    const db = getFirestore();

    // Fetch original quiz
    const quizSnap = await getDoc(doc(db, 'quizzes', id));
    if (!quizSnap.exists()) throw new Error('Quiz not found');

    // Fetch original questions
    const questionsSnap = await getDocs(collection(db, 'quizzes', id, 'questions'));
    const questions = questionsSnap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; text: string; options: string[]; timer: number; sort_index: number }));

    // Fetch original answer keys
    const answerKeysSnap = await getDocs(collection(db, 'quizzes', id, 'answerKeys'));
    const answerKeys: Record<string, { correct_option_index: number }> = {};
    answerKeysSnap.docs.forEach(d => { answerKeys[d.id] = d.data() as { correct_option_index: number }; });

    // Generate new room code
    const newId = generateRoomCode();

    // Create new quiz
    const quizData = quizSnap.data();
    const now = Date.now();
    await setDoc(doc(db, 'quizzes', newId), {
      title: quizData.title,
      status: 'waiting',
      current_question_index: -1,
      question_count: quizData.question_count || questions.length,
      created_by: creatorId,
      created_at: now,
    });

    // Duplicate questions with new IDs
    for (const q of questions) {
      const newQId = uuidv4();
      await setDoc(doc(db, 'quizzes', newId, 'questions', newQId), {
        text: q.text,
        options: q.options,
        timer: q.timer,
        sort_index: q.sort_index,
      });

      // Duplicate answer keys
      const ak = answerKeys[q.id];
      if (ak) {
        await setDoc(doc(db, 'quizzes', newId, 'answerKeys', newQId), {
          correct_option_index: ak.correct_option_index,
        });
      }
    }

    return newId;
  },
};
