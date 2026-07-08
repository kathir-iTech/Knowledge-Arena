
import { ai } from '@/ai/genkit';
import { z } from 'genkit';

/**
 * Decision Support Engine: Provides strategic guidance for Commanders.
 */
export async function getDecisionSupportSummary() {
  const prompt = ai.definePrompt({
    name: 'decisionSupport',
    output: { schema: z.object({
      criticalAlerts: z.array(z.string()),
      arenaOptimization: z.string(),
      commanderAdvice: z.string()
    })},
    prompt: `Generate a decision support summary for a classroom quiz commander focusing on fair play and engagement.`
  });

  const { output } = await prompt({});
  return output!;
}
