# Environment Variables Reference

## Required

| Variable | Description |
|----------|-------------|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google AI API key for Genkit features (PDF quiz generation, prediction, copilot). Get one at [Google AI Studio](https://aistudio.google.com/app/apikey). |

## How Variables Are Used

| Variable | Location | Purpose |
|----------|----------|---------|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Genkit (reads automatically via `@genkit-ai/googleai`) | Powers AI flows: quiz generation from PDF, knowledge summary, predictions, decision support, copilot chat |

## Firebase Configuration

Firebase credentials are **hardcoded** in `src/firebase/config.ts`. These are public-facing values (API key, project ID, app ID) required by the Firebase JS SDK.

To use a different Firebase project, update `src/firebase/config.ts` with values from your Firebase Console > Project Settings > General > Your apps > Web app.

## Obsolete Variables

The following variables from earlier versions are no longer used and can be removed:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY` (use `GOOGLE_GENERATIVE_AI_API_KEY` instead)
