
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { initializeFirebase } from '@/firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

/**
 * Prediction Engine: Analyzes recent gladiator performance to predict battle outcomes.
 */
export async function getPredictionSummary() {
  const { firestore } = initializeFirebase();
  const quizzesSnap = await getDocs(query(collection(firestore, 'quizzes'), orderBy('createdAt', 'desc'), limit(5)));
  
  const stats = quizzesSnap.docs.map(doc => ({
    title: doc.data().title,
    count: doc.data().questionCount
  }));

  const prompt = ai.definePrompt({
    name: 'predictionSummary',
    input: { schema: z.object({ stats: z.array(z.any()) }) },
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
  return output!;
}
