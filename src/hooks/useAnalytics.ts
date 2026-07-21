'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useFirebase } from '@/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import type { ValidatedQuiz, ValidatedParticipant } from '@/lib/schemas';
import { computeAnalytics, type AnalyticsData, type QuestionDoc, type AnswerKeyDoc, type SubmissionDoc } from '@/services/analytics.service';

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
      const submissionsMap: Record<string, SubmissionDoc[]> = {};

      const subFetchPromises = quizIds.map(async (qid, i) => {
        participantsMap[qid] = participantsSnaps[i].docs.map(d => ({ user_id: d.id, ...d.data() } as ValidatedParticipant));
        questionsMap[qid] = questionsSnaps[i].docs.map(d => ({ id: d.id, ...d.data() } as QuestionDoc));
        answerKeysMap[qid] = answerKeysSnaps[i].docs.map(d => ({ id: d.id, ...d.data() } as AnswerKeyDoc));

        const questionDocs = questionsSnaps[i].docs;
        const subSnaps = await Promise.all(
          questionDocs.map(qDoc =>
            getDocs(collection(firestore, 'quizzes', qid, 'questions', qDoc.id, 'submissions'))
          )
        );
        const quizSubmissions: SubmissionDoc[] = [];
        for (let qi = 0; qi < questionDocs.length; qi++) {
          for (const subDoc of subSnaps[qi].docs) {
            quizSubmissions.push({
              id: subDoc.id,
              ...subDoc.data(),
              question_id: questionDocs[qi].id,
            } as SubmissionDoc);
          }
        }
        submissionsMap[qid] = quizSubmissions;
      });
      await Promise.all(subFetchPromises);

      if (abortRef.current) return;

      const result = computeAnalytics(allQuizzes, participantsMap, questionsMap, answerKeysMap, submissionsMap);
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
