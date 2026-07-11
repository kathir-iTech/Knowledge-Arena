import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { fetchDocsWithToken } from '@/lib/firebase-admin';

export async function getKnowledgeSummary(_idToken?: string) {
  const docs = await fetchDocsWithToken('quizzes', _idToken, { limit: 1000 });

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

  const { output } = await prompt({ summary });
  if (!output) throw new Error('Knowledge engine returned empty output');
  return output;
}
