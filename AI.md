# AI Module Reference

Powered by [Genkit](https://firebase.google.com/docs/genkit) with Google Gemini.

## Setup

1. Get API keys from [Google AI Studio](https://aistudio.google.com/app/apikey) (one per Google account for multi-key rotation)
2. Set `GEMINI_API_KEYS` (comma-separated, recommended) or `GOOGLE_GENERATIVE_AI_API_KEY` (single-key fallback) in `.env`. All key reads go through `src/ai/key-resolver.ts` (round-robin rotation with quota cooldowns).

## Flows

### `generateQuizFromPDF` / `generateQuizFromExtracted` (`src/ai/flows/generate-quiz-pdf-flow.ts`)

Server actions that:
1. Accept documents via the browser-side extraction payload from `src/lib/prepare-documents.ts` (text + bounded JPEGs for scanned pages; legacy path accepts a PDF as a **data URI**)
2. Extract text using `pdfjs-dist` (images are passed through to the model)
3. Call Gemini (via Genkit) to generate quiz questions with multi-model fallback chain (`gemini-3.6-flash` → `gemini-3.5-flash`) and retry logic
4. Validate the structured output against Zod schemas (`repairJson` / `tryParseQuestions` for malformed responses)

**Input**: PDF file (max 10MB)
**Output**: `GenerateQuizFromPDFOutput` (questions, difficulty, answer keys)

## Engines

### Prediction Engine (`src/ai/engines/prediction-engine.ts`)

> **Note:** `getPredictionSummary` / `getRecommendationPrompt` are shelved — `GET /api/predictions/summary` returns `410`. Only `getQuizRecommendations` in this file is live, via `GET /api/gladiator/recommendations`.

### Knowledge Engine (`src/ai/engines/knowledge-engine.ts`)

> **Note:** Shelved — `GET /api/knowledge/summary` returns `410`. Source kept for future wiring.

### Decision Support Engine (`src/ai/engines/decision-support-engine.ts`)

> **Note:** Shelved — `GET /api/decision-support/summary` returns `410`. Source kept for future wiring.

### Copilot (`src/ai/flows/copilot-flow.ts`)

Live question-writing assistant for Commanders/Executives, called via `POST /api/copilot` (10/min per user). Not removed.

## Architecture

```
src/ai/
  genkit.ts              Genkit instance configuration
  dev.ts                 Development entry point for genkit CLI
  flows/
    generate-quiz-pdf-flow.ts   PDF/quiz generation flow
  engines/
    decision-support-engine.ts  Strategic advice
    knowledge-engine.ts         Knowledge gap analysis
    prediction-engine.ts        Performance predictions
```

Model selection: the catalog in `src/config/gemini-models.ts` defaults to `gemini-2.5-flash-lite` (overridable via platform settings). The **Forge** flow calls `gemini-3.6-flash` with a model fallback chain to `gemini-3.5-flash`; the copilot/mindmap/explanation flows use a single fixed model (`gemini-3.6-flash`) with per-key rotation and retry across the configured API keys — no model-level fallback. All flows use the `@genkit-ai/googleai` plugin.
