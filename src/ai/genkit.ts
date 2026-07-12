import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

/**
 * Central Genkit instance.
 * Configured with the Google AI plugin for tactical intelligence workflows.
 */
export const ai = genkit({
  plugins: [
    googleAI()
  ],
  model: googleAI.model('gemini-2.5-flash'),
});