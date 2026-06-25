import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

/**
 * Central Genkit instance configured with the Google AI plugin.
 * Using gemini-1.5-flash as the most stable and available model.
 */
export const ai = genkit({
  plugins: [googleAI()],
  model: 'googleai/gemini-1.5-flash',
});
