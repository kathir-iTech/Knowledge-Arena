# AI Module Reference

Powered by [Genkit](https://firebase.google.com/docs/genkit) with Google Gemini.

## Setup

1. Get an API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Set `GOOGLE_GENERATIVE_AI_API_KEY` in `.env`

## Flows

### `generateQuizFromPDF` (`src/ai/flows/generate-quiz-pdf-flow.ts`)

Server action that:
1. Accepts a PDF file upload (FormData)
2. Extracts text using `pdf-parse`
3. Calls Gemini to generate quiz questions
4. Falls back through multiple parsing strategies if initial response is invalid

**Input**: PDF file (max 20MB)
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

### Copilot Engine (`src/ai/engines/copilot-engine.ts`)

Chat-powered teacher assistant that:
- Answers questions about the platform
- Helps design quizzes
- Provides teaching suggestions

Called via: `POST /api/copilot/chat`

## Architecture

```
src/ai/
  genkit.ts              Genkit instance configuration
  dev.ts                 Development entry point for genkit CLI
  flows/
    generate-quiz-pdf-flow.ts   PDF quiz generation flow
  engines/
    copilot-engine.ts           Teacher copilot chat
    decision-support-engine.ts  Strategic advice
    knowledge-engine.ts         Knowledge gap analysis
    prediction-engine.ts        Performance predictions
```

All engine flows use the Gemini Flash model via `@genkit-ai/googleai` plugin.
