'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useFirebase } from '@/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import type { ValidatedQuiz, ValidatedParticipant } from '@/lib/schemas';
import { computeAnalytics, type AnalyticsData, type AnswerKeyDoc, type QuestionStatsDoc } from '@/services/analytics.service';
import type { QuestionDoc } from '@/lib/schemas';

const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map<string, { data: AnalyticsData; expiresAt: number }>();

function useAnalytics(teacherId: string | undefined, role?: string) {
  const { firestore } = useFirebase();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const fetchAnalytics = useCallback(async () => {
    if (!firestore) return;
    const isExecutive = role === 'executive';
    if (!teacherId && !isExecutive) return;
    const cacheKey = `analytics_${isExecutive ? 'all' : teacherId}`;

    const cached = cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      setData(cached.data);
      return;
    }

    setIsLoading(true);
    setError(null);
    abortRef.current = false;

    try {
      const quizzesQuery = isExecutive
        ? collection(firestore, 'quizzes')
        : query(collection(firestore, 'quizzes'), where('created_by', '==', teacherId));
      const quizzesSnap = await getDocs(quizzesQuery);

      if (abortRef.current) return;

      const allQuizzes: ValidatedQuiz[] = [];
      for (const d of quizzesSnap.docs) {
        allQuizzes.push({ id: d.id, ...d.data() } as ValidatedQuiz);
      }

      const quizIds = allQuizzes.map(q => q.id).slice(0, 100);

      if (!quizIds.length) {
        const empty = computeAnalytics([], {}, {}, {}, {});
        setData(empty);
        cache.set(cacheKey, { data: empty, expiresAt: Date.now() + CACHE_TTL });
        setIsLoading(false);
        return;
      }

      const [participantsSnaps, questionsSnaps, answerKeysSnaps] = await Promise.all([
        Promise.all(quizIds.map(id => getDocs(collection(firestore, 'quizzes', id, 'participants')))),
        Promise.all(quizIds.map(id => getDocs(collection(firestore, 'quizzes', id, 'questions')))),
        Promise.all(quizIds.map(id => getDocs(collection(firestore, 'quizzes', id, 'answerKeys')))),
      ]);

      if (abortRef.current) return;

      const participantsMap: Record<string, ValidatedParticipant[]> = {};
      const questionsMap: Record<string, QuestionDoc[]> = {};
      const answerKeysMap: Record<string, AnswerKeyDoc[]> = {};
      const statsMap: Record<string, Record<string, QuestionStatsDoc>> = {};

      // Per-question aggregates are denormalized at evaluation/finish time
      // (writeQuestionStats in battle-server.ts), so no submissions-scan is
      // needed here — the previous per-question getDocs(submissions) read one
      // document per submission for every finished quiz.
      for (let i = 0; i < quizIds.length; i++) {
        const qid = quizIds[i];
        participantsMap[qid] = participantsSnaps[i].docs.map(d => ({ user_id: d.id, ...d.data() } as ValidatedParticipant));
        questionsMap[qid] = questionsSnaps[i].docs.map(d => ({ id: d.id, ...d.data() } as QuestionDoc));
        answerKeysMap[qid] = answerKeysSnaps[i].docs.map(d => ({ id: d.id, ...d.data() } as AnswerKeyDoc));
        const perQuestion: Record<string, QuestionStatsDoc> = {};
        for (const qDoc of questionsSnaps[i].docs) {
          const stats = qDoc.data()?.questionStats as QuestionStatsDoc | undefined;
          if (stats) perQuestion[qDoc.id] = stats;
        }
        statsMap[qid] = perQuestion;
      }

      if (abortRef.current) return;

      const result = computeAnalytics(allQuizzes, participantsMap, questionsMap, answerKeysMap, statsMap);
      setData(result);
      cache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL });
    } catch (err: unknown) {
      if (!abortRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      }
    } finally {
      if (!abortRef.current) setIsLoading(false);
    }
  }, [teacherId, role, firestore]);

  useEffect(() => {
    fetchAnalytics();
    return () => { abortRef.current = true; };
  }, [fetchAnalytics]);

  const refetch = useCallback(() => {
    const cacheKey = role === 'executive' ? 'analytics_all' : `analytics_${teacherId}`;
    cache.delete(cacheKey);
    fetchAnalytics();
  }, [teacherId, role, fetchAnalytics]);

  return { data, isLoading, error, refetch };
}

export { useAnalytics };
