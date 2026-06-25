
import { genkit } from 'genkit';
import { anthropic } from 'genkitx-anthropic';

/**
 * Central Genkit instance configured with the Anthropic plugin.
 * Claude 3.5 Sonnet is used for maximum stability and instruction following.
 * Ensure ANTHROPIC_API_KEY is set in your environment.
 */
export const ai = genkit({
  plugins: [
    anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    }),
  ],
  model: 'anthropic/claude-3-5-sonnet-latest',
});
