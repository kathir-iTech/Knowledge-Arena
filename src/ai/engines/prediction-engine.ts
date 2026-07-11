import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { fetchDocsWithToken } from '@/lib/firebase-admin';

export async function getPredictionSummary(_idToken?: string) {
  const docs = await fetchDocsWithToken('quizzes', _idToken, {
    orderBy: 'created_at', direction: 'desc', limit: 5
  });

  const stats = docs.map(d => ({
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

  const { output } = await prompt({ stats });
  if (!output) throw new Error('Prediction engine returned empty output');
  return output;
}
