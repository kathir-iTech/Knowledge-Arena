import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

/**
 * Central Genkit instance configured with the Google AI plugin.
 * Uses gemini-1.5-flash as the default model for optimal speed and reliability.
 */
export const ai = genkit({
  plugins: [googleAI()],
  model: 'googleai/gemini-1.5-flash',
});
