import { genkit } from 'genkit';

/**
 * Central Genkit instance.
 * We are using a direct integration for Anthropic to ensure 100% stability 
 * and avoid versioning conflicts with community plugins.
 */
export const ai = genkit({
  plugins: [], // No plugins needed for direct model definition
});
