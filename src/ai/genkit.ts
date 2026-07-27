import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

/**
 * Central Genkit instance.
 * Configured with the Google AI plugin for tactical intelligence workflows.
 * The default model is overridden per-call in PDF flow based on platform_settings.
 */
export const ai = genkit({
  plugins: [
    googleAI()
  ],
  model: googleAI.model('gemini-2.0-flash'),
});