'use client';

import { initializeFirebase } from '@/firebase';
import { collection, addDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { COLLECTIONS } from '@/lib/constants';
import type { BattleLogEvent } from '@/lib/battle-server';

export interface BattleLogEntry {
  id?: string;
  quizId: string;
  event: BattleLogEvent;
  actor: string;
  actorRole: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

function getFirestore() {
  return initializeFirebase().firestore;
}

export const battleLogService = {
  async record(entry: Omit<BattleLogEntry, 'id'>): Promise<void> {
    try {
      await addDoc(collection(getFirestore(), COLLECTIONS.BATTLE_LOGS), {
        quizId: entry.quizId,
        event: entry.event,
        actor: entry.actor,
        actorRole: entry.actorRole,
        timestamp: entry.timestamp ?? Date.now(),
        metadata: entry.metadata ?? null,
        createdAt: serverTimestamp(),
      });
    } catch {
      /* battle logs must never break the battle flow */
    }
  },

  subscribeToBattleLogs(
    quizId: string,
    callback: (logs: BattleLogEntry[]) => void,
    onError?: (error: Error) => void
  ) {
    const db = getFirestore();
    const q = query(
      collection(db, COLLECTIONS.BATTLE_LOGS),
      where('quizId', '==', quizId),
      orderBy('timestamp', 'desc'),
      limit(100)
    );
    return onSnapshot(q, (snap) => {
      const logs = snap.docs.map(d => ({ id: d.id, ...d.data() } as BattleLogEntry));
      callback(logs);
    }, (error) => onError?.(error));
  },
};
