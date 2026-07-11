import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { fetchDocsWithToken } from '@/lib/firebase-admin';

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

export async function getKnowledgeSummary(uid: string) {
  const docs = await fetchDocsWithToken('quizzes', uid, { limit: 1000 });

  const summary = {
    totalArenas: docs.length,
    lastUpdated: Date.now()
  };

  const prompt = ai.definePrompt({
    name: 'knowledgeSummary',
    input: { schema: z.object({ summary: z.object({ totalArenas: z.number(), lastUpdated: z.number() }) }) },
    output: { schema: z.object({
      insight: z.string(),
      topicCoverage: z.array(z.string()),
      nextStrategicMove: z.string()
    })},
    prompt: `Based on the arena stats (Total Arenas: {{summary.totalArenas}}), provide a tactical knowledge summary.`
  });

  const { output } = await withRetry(() => prompt({ summary }));
  if (!output) throw new Error('Knowledge engine returned empty output');
  return output;
}
