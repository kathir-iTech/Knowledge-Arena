# AI Module Reference

Powered by [Genkit](https://firebase.google.com/docs/genkit) with Google Gemini.

## Setup

1. Get an API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Set `GOOGLE_GENERATIVE_AI_API_KEY` in `.env`

## Flows

### `generateQuizFromPDF` (`src/ai/flows/generate-quiz-pdf-flow.ts`)

Server action that:
1. Accepts a PDF (or DOCX/TXT/MD/image) uploaded as a **data URI**
2. Extracts text using `pdfreader` (images are passed through to the model)
3. Calls Gemini (via Genkit) to generate quiz questions with multi-model fallback and retry logic
4. Validates the structured output against Zod schemas (`repairJson` / `tryParseQuestions` for malformed responses)

**Input**: PDF file (max 10MB)
**Output**: `GenerateQuizFromPDFOutput` (questions, difficulty, answer keys)

## Engines

### Prediction Engine (`src/ai/engines/prediction-engine.ts`)

Reads the 5 most recent quizzes and generates predictions about:
- Performance patterns
- Difficulty trends
- Student engagement forecasts

Called via: `GET /api/predictions/summary`

### Knowledge Engine (`src/ai/engines/knowledge-engine.ts`)

Reads all quizzes and generates a summary of:
- Subject coverage
- Topic distribution
- Knowledge gaps

Called via: `GET /api/knowledge/summary`

### Decision Support Engine (`src/ai/engines/decision-support-engine.ts`)

Generates strategic teaching advice without reading database:
- Assessment strategies
- Classroom management tips
- Curriculum recommendations

Called via: `GET /api/decision-support/summary`

### Copilot Engine

> **Note:** The copilot engine was removed. Executive question generation uses `generateQuizFromPDF` above (or `src/ai/dev.ts` for local development).

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

All engine flows use the Gemini Flash model via `@genkit-ai/googleai` plugin.
