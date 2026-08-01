import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

/**
 * Central Genkit instance.
 * Configured with the Google AI plugin for tactical intelligence workflows.
 * The default model is overridden per-call in PDF flow based on platform_settings.
 *
 * IMPORTANT: The @genkit-ai/googleai plugin only reads GEMINI_API_KEY,
 * GOOGLE_API_KEY, or GOOGLE_GENAI_API_KEY from the environment. This app
 * documents GOOGLE_GENERATIVE_AI_API_KEY (`.env.example`, CI, PDF Forge UI),
 * so the key is passed in explicitly to keep that variable working.
 */
function resolveGoogleAiApiKey(): string | undefined {
  return (
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    undefined
  );
}

const apiKey = resolveGoogleAiApiKey();

export const ai = genkit({
  plugins: [
    googleAI(apiKey ? { apiKey } : undefined)
  ],
  model: googleAI.model('gemini-2.0-flash'),
});