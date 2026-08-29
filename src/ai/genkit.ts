import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

/**
 * Central Genkit instance.
 * Configured with the Google AI plugin for tactical intelligence workflows.
 * The default model is overridden per-call in PDF flow based on platform_settings.
 *
 * All key resolution is now centralized in key-resolver.ts. This file no longer
 * reads process.env.GEMINI_API_KEY directly — it delegates to getConfiguredKeys().
 * When multiple keys are configured via GEMINI_API_KEYS, per-request calls should
 * use createGenkitForKey() with a key from getGeminiApiKey(scope) instead of
 * this singleton, so quota rotation works correctly.
 */
import { getConfiguredKeys } from './key-resolver';

function resolveInitialApiKey(): string | undefined {
  const keys = getConfiguredKeys();
  return keys[0];
}

const apiKey = resolveInitialApiKey();

const configuredCount = getConfiguredKeys().length;
const keyPreview = apiKey ? `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}` : 'none';
console.log(`[Genkit] AI keys configured: ${configuredCount} | default key: ${apiKey ? keyPreview : 'none set'} (multi-key rotation via key-resolver)`);

export const ai = genkit({
  plugins: [
    googleAI(apiKey ? { apiKey } : undefined)
  ],
  // gemini-2.0-flash was shut down by Google on 2026-06-01; gemini-3.6-flash is the current GA replacement.
  model: googleAI.model('gemini-3.6-flash'),
});

/**
 * Create a Genkit instance bound to a specific Gemini API key.
 * Use this for per-request generation so key rotation on 429 works correctly.
 * The singleton `ai` above is still used for flow definitions (defineFlow/definePrompt).
 */
export function createGenkitForKey(apiKeyForRequest: string) {
  return genkit({
    plugins: [googleAI({ apiKey: apiKeyForRequest })],
    model: googleAI.model('gemini-3.6-flash'),
  });
}