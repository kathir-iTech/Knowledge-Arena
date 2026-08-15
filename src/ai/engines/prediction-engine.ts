import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { fetchDocsWithToken } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/constants';

// PHASE 69: PARTIALLY SHELVED. getQuizRecommendations (and /api/gladiator/
// recommendations) are LIVE — rendered on the gladiator dashboard. The Genkit
// summary features below (getPredictionSummary, getRecommendationPrompt) are
// shelved: their only route /api/predictions/summary now returns 410. These
// two exports are kept for future wiring; do not treat them as active.

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt === maxRetries) throw e;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }
  }
  throw new Error('Retry exhausted');
}

// SHELVED (see file header): prediction summary fed /api/predictions/summary,
// which now returns 410. Kept for future wiring.
export async function getPredictionSummary(uid: string) {
  const docs = await fetchDocsWithToken('quizzes', uid, {
    orderBy: 'created_at', direction: 'desc', limit: 5
  });

  const stats = docs.map((d: Record<string, unknown>) => ({
    title: String(d.title || ''),
    count: Number(d.question_count || 0)
  }));

  if (!stats.length) {
    return { trend: 'Insufficient data', predictedEngagement: 0, recommendation: 'Create more quizzes to enable predictions.' };
  }

  const prompt = ai.definePrompt({
    name: 'predictionSummary',
    input: { schema: z.object({ stats: z.array(z.object({ title: z.string(), count: z.number() })) }) },
    output: { schema: z.object({
      trend: z.string(),
      predictedEngagement: z.number(),
      recommendation: z.string()
    })},
    prompt: `Analyze these recent quiz stats and predict the next battle's engagement:
    {{#each stats}}
    - Quiz: {{title}}, Rounds: {{count}}
    {{/each}}`
  });

  const { output } = await withRetry(() => prompt({ stats }));
  if (!output) throw new Error('Prediction engine returned empty output');
  return output;
}

export interface QuizRecommendation {
  quizId: string;
  title: string;
  category: string;
  difficulty: string;
  questionCount: number;
  reason: string;
  confidence: number;
}

export async function getQuizRecommendations(uid: string): Promise<QuizRecommendation[]> {
  const db = (await import('@/lib/firebase-admin')).getAdminDb();

  const [participantsSnap, quizzesSnap] = await Promise.all([
    db.collectionGroup(COLLECTIONS.PARTICIPANTS).where('user_id', '==', uid).get(),
    db.collection(COLLECTIONS.QUIZZES).where('status', '==', 'finished').orderBy('created_at', 'desc').limit(50).get(),
  ]);

  const completedQuizzes = participantsSnap.docs
    .filter(d => d.data().status === 'finished')
    .map(d => {
      const quizId = d.ref.parent.parent?.id;
      if (!quizId) return null;
      return {
        quizId,
        score: Number(d.data().score) || 0,
        maxScore: Number(d.data().max_score) || 1000,
      };
    })
    .filter((p): p is { quizId: string; score: number; maxScore: number } => p !== null);

  if (completedQuizzes.length === 0) {
    return [];
  }

  const quizMap = new Map<string, Record<string, unknown>>();
  const quizIds = [...new Set(completedQuizzes.map(p => p.quizId))];
  for (let i = 0; i < quizIds.length; i += 30) {
    const chunk = quizIds.slice(i, i + 30);
    const snap = await db.getAll(...chunk.map(id => db.collection(COLLECTIONS.QUIZZES).doc(id)));
    for (const d of snap) {
      if (d.exists) quizMap.set(d.id, d.data()!);
    }
  }

  const completed = completedQuizzes.map(p => ({
    ...p,
    quizData: quizMap.get(p.quizId),
    pct: Math.round((p.score / p.maxScore) * 100),
  })).filter(c => c.quizData);

  const weakCategories = new Map<string, { total: number; correct: number }>();
  const weakDifficulties = new Map<string, { total: number; correct: number }>();

  for (const c of completed) {
    const q = c.quizData!;
    const cat = String(q.category || 'General');
    const diff = String(q.difficulty || 'medium');
    if (!weakCategories.has(cat)) weakCategories.set(cat, { total: 0, correct: 0 });
    if (!weakDifficulties.has(diff)) weakDifficulties.set(diff, { total: 0, correct: 0 });
    weakCategories.get(cat)!.total += c.pct;
    weakDifficulties.get(diff)!.total += c.pct;
  }

  const avgByCategory = Array.from(weakCategories.entries())
    .map(([cat, v]) => ({ category: cat, avg: Math.round(v.total / completed.length) }))
    .sort((a, b) => a.avg - b.avg);

  const avgByDifficulty = Array.from(weakDifficulties.entries())
    .map(([diff, v]) => ({ difficulty: diff, avg: Math.round(v.total / completed.length) }))
    .sort((a, b) => a.avg - b.avg);

  const weakestCategory = avgByCategory[0]?.category || 'General';
  const weakestDifficulty = avgByDifficulty[0]?.difficulty || 'medium';

  const availableQuizzes = quizzesSnap.docs
    .map(d => ({
      id: d.id,
      title: String(d.data().title || ''),
      category: String(d.data().category || 'General'),
      difficulty: String(d.data().difficulty || 'medium'),
      questionCount: Number(d.data().question_count || 0),
    }))
    .filter(q => q.questionCount > 0 && !completedQuizzes.some(p => p.quizId === q.id));

  const recommendations: QuizRecommendation[] = [];

  for (const q of availableQuizzes) {
    let reason = '';
    let confidence = 0.5;

    const catMatch = q.category === weakestCategory;
    const diffMatch = q.difficulty === weakestDifficulty;

    if (catMatch && diffMatch) {
      reason = `Targets your weakest area (${weakestCategory}, ${weakestDifficulty})`;
      confidence = 0.9;
    } else if (catMatch) {
      reason = `Matches your weakest category: ${weakestCategory}`;
      confidence = 0.75;
    } else if (diffMatch) {
      reason = `Matches your weakest difficulty: ${weakestDifficulty}`;
      confidence = 0.7;
    } else {
      const catAvg = avgByCategory.find(c => c.category === q.category)?.avg ?? 50;
      if (catAvg < 60) {
        reason = `Practice ${q.category} to improve your weak spot`;
        confidence = 0.6;
      } else {
        reason = `A solid quiz to maintain your skills`;
        confidence = 0.5;
      }
    }

    recommendations.push({
      quizId: q.id,
      title: q.title,
      category: q.category,
      difficulty: q.difficulty,
      questionCount: q.questionCount,
      reason,
      confidence,
    });
  }

  recommendations.sort((a, b) => b.confidence - a.confidence);

  return recommendations.slice(0, 6);
}

// SHELVED (see file header): utility with no remaining callers (its only
// consumer was the now-neutralized prediction summary flow). Kept for future wiring.
export async function getRecommendationPrompt(uid: string): Promise<string> {
  const recs = await getQuizRecommendations(uid);
  if (!recs.length) return 'No recommendations available yet. Complete more quizzes to get personalized suggestions.';
  return recs.map(r => `- ${r.title}: ${r.reason} (confidence: ${Math.round(r.confidence * 100)}%)`).join('\n');
}