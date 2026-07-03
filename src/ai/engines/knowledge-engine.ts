
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { initializeFirebase } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';

/**
 * Knowledge Engine: Synthesizes tactical intelligence from the arena library.
 */
export async function getKnowledgeSummary() {
  const { firestore } = initializeFirebase();
  const quizzesSnap = await getDocs(collection(firestore, 'quizzes'));
  
  const summary = {
    totalArenas: quizzesSnap.size,
    lastUpdated: Date.now()
  };

  const prompt = ai.definePrompt({
    name: 'knowledgeSummary',
    input: { schema: z.object({ summary: z.any() }) },
    output: { schema: z.object({
      insight: z.string(),
      topicCoverage: z.array(z.string()),
      nextStrategicMove: z.string()
    })},
    prompt: `Based on the arena stats (Total Arenas: {{summary.totalArenas}}), provide a tactical knowledge summary.`
  });

  const { output } = await prompt({ summary });
  return output!;
}
