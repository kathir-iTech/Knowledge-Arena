
import { ai } from '@/ai/genkit';
import { z } from 'genkit';

/**
 * Copilot Engine: Real-time tactical assistant for Arena Architects.
 */
export async function handleCopilotChat(message: string) {
  const prompt = ai.definePrompt({
    name: 'copilotChat',
    input: { schema: z.string() },
    output: { schema: z.string() },
    prompt: `You are the Knowledge Arena Copilot. Answer the commander's query: {{input}}`
  });

  const { output } = await prompt(message);
  return output!;
}
