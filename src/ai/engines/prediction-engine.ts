
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

export async function getPredictionSummary() {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const firestore = getFirestore(app);
  const quizzesSnap = await getDocs(query(collection(firestore, 'quizzes'), orderBy('created_at', 'desc'), limit(5)));

  const stats = quizzesSnap.docs.map(doc => ({
    title: doc.data().title,
    count: doc.data().question_count
  }));

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
