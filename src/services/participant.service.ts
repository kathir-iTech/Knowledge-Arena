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
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import type { ValidatedParticipant } from '@/lib/schemas';
import {
  COLLECTIONS,
  QUIZ_WAITING,
  PS_PLAYING,
  PS_BLOCKED,
  PS_FINISHED,
  ROOM_CODE_LENGTH,
} from '@/lib/constants';

function getFirestore() {
  return initializeFirebase().firestore;
}

function participantPath(quizId: string, userId: string) {
  return `${COLLECTIONS.QUIZZES}/${quizId}/${COLLECTIONS.PARTICIPANTS}/${userId}`;
}

export const participantService = {
  async getAllParticipantsBulk(quizIds: string[]): Promise<ValidatedParticipant[]> {
    const db = getFirestore();
    const results = await Promise.all(quizIds.map(id => getDocs(collection(db, COLLECTIONS.QUIZZES, id, COLLECTIONS.PARTICIPANTS))));
    return results.flatMap(snap => snap.docs.map(d => ({ user_id: d.id, ...d.data() } as ValidatedParticipant)));
  },

  async getAllParticipants(quizId: string): Promise<ValidatedParticipant[]> {
    const db = getFirestore();
    const q = query(
      collection(db, COLLECTIONS.QUIZZES, quizId, COLLECTIONS.PARTICIPANTS)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ user_id: d.id, ...d.data() } as ValidatedParticipant));
  },

  async joinQuiz(quizId: string, userId: string, name?: string, sessionToken?: string): Promise<void> {
    if (!quizId || quizId.length !== ROOM_CODE_LENGTH) throw new Error('Invalid quiz code');
    if (!userId) throw new Error('User ID required');
    const db = getFirestore();
    const quizRef = doc(db, COLLECTIONS.QUIZZES, quizId);
    await runTransaction(db, async (transaction) => {
      const quizSnap = await transaction.get(quizRef);
      const quizData = quizSnap.data();
      if (!quizSnap.exists || !quizData) throw new Error('Quiz not found');
      if (quizData.status !== QUIZ_WAITING && quizData.status !== 'ready') {
        throw new Error('This battle has already started. Late joining is not permitted.');
      }

      const userRef = doc(db, COLLECTIONS.USERS, userId);
      const userSnap = await transaction.get(userRef);
      if (userSnap.exists() && userSnap.data()?.disabled === true) {
        throw new Error('Your account has been disabled. Please contact an administrator.');
      }

      const participantRef = doc(db, COLLECTIONS.QUIZZES, quizId, COLLECTIONS.PARTICIPANTS, userId);
      const existingPartSnap = await transaction.get(participantRef);
      if (existingPartSnap.exists() && existingPartSnap.data()?.status === PS_BLOCKED) {
        throw new Error('You have been removed from this arena by the Commander.');
      }
      if (existingPartSnap.exists()) {
        const update: Record<string, unknown> = {
          lastSeen: serverTimestamp(),
        };
        if (sessionToken) update.session_token = sessionToken;
        transaction.update(participantRef, update);
        return;
      }
      const data: Record<string, unknown> = {
        user_id: userId,
        score: 0,
        status: PS_PLAYING,
        violations_count: 0,
        ready: false,
        lastSeen: serverTimestamp(),
      };
      if (sessionToken) data.session_token = sessionToken;
      if (name) data.name = name;
      transaction.set(participantRef, data);
    });
  },

  async setReady(quizId: string, userId: string, ready: boolean): Promise<void> {
    const db = getFirestore();
    const ref = doc(db, participantPath(quizId, userId));
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Participant not found');
    await updateDoc(ref, { ready });
  },

  async updateParticipant(
    quizId: string,
    userId: string,
    data: { violations_count?: number; status?: 'playing' | 'blocked' | 'finished'; ready?: boolean }
  ): Promise<void> {
    const db = getFirestore();
    const ref = doc(db, participantPath(quizId, userId));
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Participant not found');
    await updateDoc(ref, data);
  },

  async blockParticipant(quizId: string, userId: string): Promise<void> {
    const db = getFirestore();
    const ref = doc(db, participantPath(quizId, userId));
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Participant not found');
    await updateDoc(ref, { status: PS_BLOCKED });
  },

  async unblockParticipant(quizId: string, userId: string): Promise<void> {
    const db = getFirestore();
    const ref = doc(db, participantPath(quizId, userId));
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Participant not found');
    await updateDoc(ref, {
      status: PS_PLAYING,
      violations_count: 0,
    });
  },

  async markAllFinished(quizId: string, teacherId: string): Promise<void> {
    const db = getFirestore();
    const snap = await getDocs(collection(db, COLLECTIONS.QUIZZES, quizId, COLLECTIONS.PARTICIPANTS));
    const batch = writeBatch(db);
    let count = 0;
    snap.docs
      .filter(d => d.id !== teacherId)
      .forEach(d => { batch.update(d.ref, { status: PS_FINISHED }); count++; });
    if (count > 0) {
      await batch.commit();
    }
  },

  async clearAllStudents(quizId: string): Promise<void> {
    const db = getFirestore();
    const snap = await getDocs(collection(db, COLLECTIONS.QUIZZES, quizId, COLLECTIONS.PARTICIPANTS));
    const deletes = snap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletes);
  },

  async leaveQuiz(quizId: string, userId: string): Promise<void> {
    const db = getFirestore();
    await deleteDoc(doc(db, participantPath(quizId, userId)));
  },

  subscribeToParticipants(
    quizId: string,
    callback: (participants: ValidatedParticipant[]) => void,
    onError?: (error: Error) => void
  ) {
    const db = getFirestore();
    const q = query(
      collection(db, COLLECTIONS.QUIZZES, quizId, COLLECTIONS.PARTICIPANTS)
    );
    return onSnapshot(q, (snap) => {
      const participants = snap.docs.map(
        d => ({ user_id: d.id, ...d.data() } as ValidatedParticipant)
      );
      callback(participants);
    }, (error) => onError?.(error));
  },

  async getStudentHistory(userId: string): Promise<Array<{ quizId: string; title: string; score: number; status: string; created_at: number }>> {
    const db = getFirestore();
    const q = query(collectionGroup(db, COLLECTIONS.PARTICIPANTS), where(documentId(), '==', userId));
    const snap = await getDocs(q);
    const quizIds = snap.docs.map(d => d.ref.parent.parent?.id).filter(Boolean) as string[];
    if (!quizIds.length) return [];

    const quizDocs = await Promise.all(quizIds.map(id => getDoc(doc(db, COLLECTIONS.QUIZZES, id))));
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
