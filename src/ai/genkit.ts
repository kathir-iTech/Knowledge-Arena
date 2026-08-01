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

const ENV_VAR_CANDIDATES = ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'] as const;
const envPresence = ENV_VAR_CANDIDATES.map(v => `${v}=${process.env[v] ? 'SET' : 'MISSING'}`).join(', ');
console.log(`[Genkit] AI env var check: ${envPresence} | plugin key source: ${apiKey ? 'explicit (GOOGLE_GENERATIVE_AI_API_KEY or first available)' : 'none set'}`);

export const ai = genkit({
  plugins: [
    googleAI(apiKey ? { apiKey } : undefined)
  ],
  // gemini-2.0-flash was shut down by Google on 2026-06-01; gemini-3.6-flash is the current GA replacement.
  model: googleAI.model('gemini-3.6-flash'),
});