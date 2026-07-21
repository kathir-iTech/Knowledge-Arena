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
  collectionGroup,
  documentId,
  onSnapshot,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import type { ValidatedParticipant } from '@/lib/schemas';

function getFirestore() {
  return initializeFirebase().firestore;
}

function participantPath(quizId: string, userId: string) {
  return `quizzes/${quizId}/participants/${userId}`;
}

export const participantService = {
  async getAllParticipantsBulk(quizIds: string[]): Promise<ValidatedParticipant[]> {
    const db = getFirestore();
    const results = await Promise.all(quizIds.map(id => getDocs(collection(db, 'quizzes', id, 'participants'))));
    return results.flatMap(snap => snap.docs.map(d => ({ user_id: d.id, ...d.data() } as ValidatedParticipant)));
  },

  async getAllParticipants(quizId: string): Promise<ValidatedParticipant[]> {
    const db = getFirestore();
    const snap = await getDocs(collection(db, 'quizzes', quizId, 'participants'));
    return snap.docs.map(d => ({ user_id: d.id, ...d.data() } as ValidatedParticipant));
  },

  async joinQuiz(quizId: string, userId: string, name?: string): Promise<void> {
    if (!quizId || quizId.length !== 6) throw new Error('Invalid quiz code');
    if (!userId) throw new Error('User ID required');
    const db = getFirestore();
    const quizRef = doc(db, 'quizzes', quizId);
    const quizSnap = await getDoc(quizRef);
    if (!quizSnap.exists()) throw new Error('Quiz not found');
    if (quizSnap.data().status !== 'waiting') throw new Error('This battle has already started. Late joining is not permitted.');

    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists() && userDoc.data()?.disabled === true) {
      throw new Error('Your account has been disabled. Please contact an administrator.');
    }
    const data: Record<string, unknown> = {
      user_id: userId,
      score: 0,
      status: 'playing',
      violations_count: 0,
      lastSeen: serverTimestamp(),
    };
    if (name) data.name = name;
    await setDoc(doc(db, participantPath(quizId, userId)), data);
  },

  async updateParticipant(
    quizId: string,
    userId: string,
    data: { violations_count?: number; status?: 'playing' | 'blocked' | 'finished' }
  ): Promise<void> {
    const db = getFirestore();
    await updateDoc(doc(db, participantPath(quizId, userId)), data);
  },

  async unblockParticipant(quizId: string, userId: string): Promise<void> {
    const db = getFirestore();
    await updateDoc(doc(db, participantPath(quizId, userId)), {
      status: 'playing',
      violations_count: 0,
    });
  },

  async markAllFinished(quizId: string, teacherId: string): Promise<void> {
    const db = getFirestore();
    const snap = await getDocs(collection(db, 'quizzes', quizId, 'participants'));
    const batch = writeBatch(db);
    let count = 0;
    snap.docs
      .filter(d => d.id !== teacherId)
      .forEach(d => { batch.update(d.ref, { status: 'finished' }); count++; });
    if (count > 0) {
      // Firestore batch limit is 500 operations — participant count should stay well below
      await batch.commit();
    }
  },

  async clearAllStudents(quizId: string): Promise<void> {
    const db = getFirestore();
    const snap = await getDocs(collection(db, 'quizzes', quizId, 'participants'));
    const deletes = snap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletes);
  },

  async leaveQuiz(quizId: string, userId: string): Promise<void> {
    const db = getFirestore();
    await deleteDoc(doc(db, participantPath(quizId, userId)));
  },

  async heartbeat(quizId: string, userId: string): Promise<void> {
    const db = getFirestore();
    await updateDoc(doc(db, participantPath(quizId, userId)), {
      lastSeen: serverTimestamp(),
    });
  },

  subscribeToParticipants(
    quizId: string,
    callback: (participants: ValidatedParticipant[]) => void,
    onError?: (error: Error) => void
  ) {
    const db = getFirestore();
    return onSnapshot(collection(db, 'quizzes', quizId, 'participants'), (snap) => {
      const participants = snap.docs.map(
        d => ({ user_id: d.id, ...d.data() } as ValidatedParticipant)
      );
      callback(participants);
    }, (error) => onError?.(error));
  },

  async getStudentHistory(userId: string): Promise<Array<{ quizId: string; title: string; score: number; status: string; created_at: number }>> {
    const db = getFirestore();
    const q = query(collectionGroup(db, 'participants'), where(documentId(), '==', userId));
    const snap = await getDocs(q);
    const quizIds = snap.docs.map(d => d.ref.parent.parent?.id).filter(Boolean) as string[];
    if (!quizIds.length) return [];

    const quizDocs = await Promise.all(quizIds.map(id => getDoc(doc(db, 'quizzes', id))));
    const results: Array<{ quizId: string; title: string; score: number; status: string; created_at: number }> = [];
    for (const docSnap of quizDocs) {
      if (!docSnap.exists()) continue;
      const data = docSnap.data();
      const part = snap.docs.find(d => docSnap.id === d.ref.parent.parent?.id);
      if (!part) continue;
      results.push({
        quizId: docSnap.id,
        title: data.title || 'Untitled',
        score: part.data().score ?? 0,
        status: data.status || 'unknown',
        created_at: data.created_at || 0,
      });
    }
    results.sort((a, b) => b.created_at - a.created_at);
    return results;
  },
};
