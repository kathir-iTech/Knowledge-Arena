# Architecture

## System Overview

Knowledge Arena is a single-page Next.js application with server-side API routes and client-side Firestore integration.

```
┌──────────────────────────────────────────────────────┐
│                   Browser (Client)                    │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Next.js  │  │ Firebase │  │  Firebase Auth    │  │
│  │ App      │◄─┤ Firestore│  │  (email/password) │  │
│  │ Router   │  │ (realtime)│  └───────────────────┘  │
│  └────┬─────┘  └──────────┘                           │
│       │                                              │
│  ┌────▼─────┐  ┌──────────────────┐                  │
│  │ API      │  │ Genkit/Gemini    │                  │
│  │ Routes   │──► (AI Flows)       │                  │
│  └──────────┘  └──────────────────┘                  │
└──────────────────────────────────────────────────────┘
```

## Authentication Flow

1. User signs in with email/password via Firebase Auth client SDK
2. Role is assigned on signup based on email domain (`@staffs.com` => teacher)
3. Auth state is managed via `AuthContext` + `FirebaseProvider`
4. API routes verify identity via Firebase Auth REST API (`accounts:lookup`)

## Real-Time Data Flow

1. **Quiz Creation**: Teacher creates a quiz → Firestore `quizzes/{id}` document
2. **Joining**: Student enters room code → reads quiz doc, creates participant doc
3. **Waiting Room**: Teacher sees participant count via `onSnapshot` listener
4. **Live Quiz**: Teacher advances questions → `quiz.current_question_index` updates → all clients react
5. **Submissions**: Students submit answers → write to `submissions/{userId}`
6. **Scoring**: Teacher clicks "Evaluate & Next" → `evaluateQuestion` scores all submissions for current question
7. **Results**: Quiz status changes to `finished` → podium displays top 3

## Security Model

- **Firestore Security Rules**: All access control enforced server-side via rules
- **Answer Keys**: Stored in protected subcollection — students cannot read
- **Scoring**: Performed by teacher's client during evaluation, not by students
- **Blocking**: Students blocked after 2 violations — enforced by rules + client checks
- **API Auth**: All API routes verify Firebase ID tokens

## Route Structure

```
/                        Landing page / Login
/create-quiz             Quiz creation (manual + AI PDF)
/battle/[roomCode]       Quiz room (waiting/live/results)
/teacher/dashboard       Teacher dashboard
/teacher/edit-quiz/[id]  Edit existing quiz
/student/dashboard       Student dashboard
/student/profile         Student profile
/kicked                  Malpractice blocked page
/cheating-detected       Unauthorized access page
```

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `src/app/` | Next.js App Router pages and API routes |
| `src/components/` | UI components (dashboard, quiz, auth, layouts) |
| `src/services/` | Firestore service layer |
| `src/ai/` | Genkit AI flows and engines |
| `src/hooks/` | Custom React hooks |
| `src/lib/` | Utilities, types, schemas |
| `src/contexts/` | React contexts (auth) |
| `src/firebase/` | Firebase initialization |
| `docs/` | Additional documentation |
