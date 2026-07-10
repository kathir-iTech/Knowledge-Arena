
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

export async function getKnowledgeSummary() {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const firestore = getFirestore(app);
  const quizzesSnap = await getDocs(collection(firestore, 'quizzes'));
  
  const summary = {
    totalArenas: quizzesSnap.size,
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
