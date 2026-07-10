# API Reference

## Overview

All API routes use Firebase ID token verification via `src/lib/verify-auth.ts`.
Requests without a valid token receive a 401 response.

## AI Routes

### `GET /api/predictions/summary`

Returns performance predictions based on recent quiz data.

**Auth**: Firebase ID token required
**Response**: JSON object with prediction summary

### `GET /api/knowledge/summary`

Returns knowledge gap analysis across all quizzes.

**Auth**: Firebase ID token required
**Response**: JSON object with knowledge summary

### `GET /api/decision-support/summary`

Returns strategic teaching recommendations.

**Auth**: Firebase ID token required
**Response**: JSON object with decision support content

### `POST /api/copilot/chat`

Chat endpoint for the teacher copilot assistant.

**Auth**: Firebase ID token required
**Body**: JSON with chat message and conversation history
**Response**: JSON with AI response

## Service Layer (Client-Side)

All database operations go through service functions in `src/services/`:

| File | Key Functions |
|------|--------------|
| `quiz.service.ts` | `createQuiz`, `getQuizById`, `getQuizzesByCreator`, `updateQuiz`, `updateQuizStatus`, `advanceToQuestion`, `deleteQuiz`, `resetQuiz`, `duplicateQuiz`, `subscribeToQuiz` |
| `game.service.ts` | `getQuestionsByQuizId`, `subscribeToQuestions`, `createQuestions`, `createAnswerKeys`, `evaluateQuestion`, `getAnswerKeys`, `replaceQuizContent`, `submitAnswer` |
| `participant.service.ts` | `joinQuiz`, `updateParticipant`, `getAllParticipants`, `subscribeToParticipants`, `unblockParticipant`, `clearAllStudents`, `getStudentHistory` |

## Auth Verification

The API uses Firebase Auth REST API for token verification:

```typescript
// src/lib/verify-auth.ts
POST https://identitytoolkit.googleapis.com/v1/accounts:lookup?key={firebaseApiKey}
```

Token must be sent in the `Authorization: Bearer <token>` header.
