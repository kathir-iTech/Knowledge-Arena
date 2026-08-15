'use client';

import { initializeFirebase } from '@/firebase';

async function post(path: string, body: Record<string, unknown>): Promise<any> {
  const { auth } = initializeFirebase();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Battle operation failed');
  }
  return data;
}

export function getSessionToken(quizId: string): string {
  if (typeof window === 'undefined') return '';
  const key = `ka_battle_session_${quizId}`;
  try {
    let token = sessionStorage.getItem(key);
    if (!token) {
      token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      sessionStorage.setItem(key, token);
    }
    return token;
  } catch {
    return '';
  }
}

export const battleService = {
  startBattle(quizId: string) {
    return post('/api/battle/start', { quizId });
  },
  activateBattle(quizId: string) {
    return post('/api/battle/activate', { quizId });
  },
  pauseBattle(quizId: string) {
    return post('/api/battle/pause', { quizId });
  },
  resumeBattle(quizId: string) {
    return post('/api/battle/resume', { quizId });
  },
  skipQuestion(quizId: string) {
    return post('/api/battle/skip', { quizId });
  },
  advanceQuestion(quizId: string) {
    return post('/api/battle/advance', { quizId });
  },
  endBattle(quizId: string) {
    return post('/api/battle/end', { quizId });
  },
  evaluateQuestion(quizId: string, questionId: string) {
    return post('/api/battle/evaluate', { quizId, questionId });
  },
  evaluateSelf(quizId: string, questionId: string) {
    return post('/api/battle/evaluate', { quizId, questionId });
  },
  autoAdvance(quizId: string) {
    return post('/api/battle/auto-advance', { quizId });
  },
  transferOwnership(quizId: string, newOwnerId: string) {
    return post('/api/battle/transfer-ownership', { quizId, newOwnerId });
  },
  recordReconnect(quizId: string, sessionToken?: string) {
    return post('/api/battle/reconnect', { quizId, ...(sessionToken ? { sessionToken } : {}) });
  },
  archiveBattle(quizId: string) {
    return post('/api/battle/archive', { quizId });
  },
};
