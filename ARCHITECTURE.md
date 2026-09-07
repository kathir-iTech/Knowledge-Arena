# Quorena — Architecture

## 1. System Architecture

Quorena uses a **monolithic Next.js deployment** with the App Router serving both the client UI (React Server/Client Components) and API Routes. Client components interact with Firebase Web SDK (Firestore, Auth) directly for real-time data. Admin-only operations go through API Routes that use the Firebase Admin SDK. Gemini AI is accessed via Genkit through server actions.

```
┌──────────────────────────────────────────────┐
│              Browser / PWA                    │
│  ┌────────────────┐ ┌──────────────────────┐  │
│  │ React Client   │ │ React Server         │  │
│  │ Components     │ │ Components           │  │
│  └───────┬────────┘ └──────────┬───────────┘  │
│          │                     │               │
└──────────┼─────────────────────┼───────────────┘
           │                     │
┌──────────┼─────────────────────┼───────────────┐
│  Next.js 15 App Router         │               │
│          │                     │               │
│  ┌───────┴─────────────────────┴───────────┐   │
│  │            App Router                    │   │
│  ├─────────────────────────────────────────┤   │
│  │  API Routes (/api/*)                    │   │
│  │  Server Actions ('use server')           │   │
│  └───────┬─────────────────────┬───────────┘   │
└──────────┼─────────────────────┼───────────────┘
           │                     │
┌──────────┼─────────────────────┼───────────────┐
│  ┌───────┴────────┐ ┌──────────┴──────────┐   │
│  │  Firebase Auth  │ │  Cloud Firestore    │   │
│  │  (Admin SDK)    │ │  (Admin SDK)        │   │
│  └────────────────┘ └─────────────────────┘   │
│           Firebase Project                     │
└────────────────────────────────────────────────┘
                    │
┌───────────────────┴───────────────────────────┐
│  Genkit + Gemini (Forge chain                │
│  gemini-3.6-flash → gemini-3.5-flash;        │
│  catalog default gemini-2.5-flash-lite)      │
│  (AI PDF Forge; summaries/predictions        │
│  shelved behind 410)                         │
└───────────────────────────────────────────────┘
```

**Key design choices:**
- **Server Actions for AI** — The PDF-to-quiz generation runs in server actions to avoid exposing API keys to the client. Long calls are bounded, not unlimited: each Gemini call times out after 35s (`GEMINI_TIMEOUT_MS` in `src/ai/flows/generate-quiz-pdf-flow.ts:47`) and generation is split into one-call-per-tick jobs (`createForgeJob`/`runForgeTick`) to stay inside Vercel's 60s `maxDuration` (`vercel.json:4`).
- **Firebase Admin SDK on server** — All admin API routes use the Admin SDK for privileged access bypassing security rules.
- **Firebase Web SDK on client** — Real-time subscriptions use the client SDK directly for low-latency updates during battles.
- **Standalone output** — `next.config.ts` sets `output: 'standalone'` for flexible deployment (Vercel, Docker, custom Node).

---

## 2. Authentication Flow

Login is handled client-side via Firebase Auth. The ID token is verified server-side in API Routes and Server Actions using `verifyFirebaseToken` / `verifyFirebaseTokenWithRole`. The `ClientLayout` component enforces route-level redirection based on role and authentication state.

```
User          Client Component    Firebase Auth     API Route          Firestore
 │                    │                 │                │                 │
 │  Credentials       │                 │                │                 │
 ├───────────────────►│                 │                │                 │
 │                    │ signInWith      │                │                 │
 │                    │ EmailPassword   │                │                 │
 │                    ├────────────────►│                │                 │
 │                    │◄────────────────┤                │                 │
 │                    │    ID Token     │                │                 │
 │                    │                 │                │                 │
 │  Request +         │                 │                │                 │
 │  Bearer Token      │                 │                │                 │
 ├───────────────────►│────────────────────────────────►│                 │
 │                    │                 │                │                 │
 │                    │                 │   verifyIdToken │                 │
 │                    │                 │◄───────────────│                 │
 │                    │                 │   Decoded UID  │                 │
 │                    │                 │                │                 │
 │                    │                 │                │  Read users/uid │
 │                    │                 │                ├────────────────►│
 │                    │                 │                │◄────────────────┤
 │                    │                 │                │   { role }      │
 │                    │                 │                │                 │
 │                    │                 │   Check role   │                 │
 │                    │                 │◄───────────────│                 │
 │  Response/401      │                 │                │                 │
 │◄───────────────────│◄────────────────────────────────│                 │
 │                    │                 │                │                 │
 │  ClientLayout      │                 │                │                 │
 │  redirects by role │                 │                │                 │
 ├───────────────────►│                 │                │                 │
```

**Token verification utilities** (`src/lib/verify-auth.ts`):
- `verifyFirebaseToken(token | Request)` — Decodes and verifies a Firebase ID token.
- `verifyFirebaseTokenWithRole(token | Request, role)` — Verifies token AND checks the user's Firestore document for the required role.

**Authentication header format:**
```
Authorization: Bearer <firebase-id-token>
```

---

## 3. Authorization (Role-Based Access)

Three roles — **Executive**, **Commander**, and **Gladiator** — determine what a user can access and modify.

| Role | Description | Permissions |
|---|---|---|
| **Executive** | Platform admin | Full read/write access to all collections, user management, analytics, settings, backup/restore |
| **Commander** | Quiz creator/host | Create and manage own quizzes, view their dashboard, send requests to Executives, participate in conversations |
| **Gladiator** | Quiz participant | Join battles via room code, submit answers, view own profile/history |

**Enforcement layers:**

1. **Client Layout Guard** (`src/components/ClientLayout.tsx`) — Reads the user's role from AuthContext and redirects to the appropriate dashboard. Unknown/unauthenticated users go to the landing page.
2. **API Route Verification** — Each API route calls `verifyFirebaseTokenWithRole(req, requiredRole)` before processing requests. Returns `401 Unauthorized` on failure.
3. **Firestore Security Rules** — Rules enforce collection-level access based on the authenticated user's role and document ownership.

**Route-to-portal mapping** (`PORTAL_ROUTES` in `src/middleware.ts:8`):
```
 /executive        → executive role required
 /commander        → commander role required
 /create-quiz      → commander role required
 /gladiator        → gladiator role required
 /battle/{id}      → public (battle page)
 /api/*            → public (auth enforced per-route)
```
Note: the middleware itself passes portal requests through (`src/middleware.ts:45-47` — "client-side AuthContext handles enforcement"). Real enforcement is `ClientLayout` role redirects plus per-route `verifyFirebaseTokenWithRole` plus Firestore rules.

---

## 4. Firestore Data Model

### Collections Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Firestore                             │
├─────────────────────────────────────────────────────────────┤
│  users/{uid}                                                │
│  ├─ email, displayName, role, avatar, disabled, ...          │
│                                                              │
│  quizzes/{quizId} (6-char room code)                        │
│  ├─ title, status, question_count, created_by, created_at    │
│  ├─ questions/{questionId}                                   │
│  │  └─ text, options[4], timer, sort_index, scored           │
│  │     └─ submissions/{userId}                               │
│  │        └─ selected_option, submittedAt, clientTime        │
│  ├─ answerKeys/{questionId}                                  │
│  │  └─ correct_option_index                                  │
│  └─ participants/{userId}                                    │
│     └─ user_id, score, status, violations_count, lastSeen    │
│                                                              │
│  conversations/{conversationId}                              │
│  ├─ participants[], unreadCount{}, lastMessage, lastActivity │
│  └─ messages/{messageId}                                     │
│     └─ senderId, senderRole, text, timestamp, attachments[]  │
│                                                              │
│  notifications/{notificationId}                              │
│  ├─ type, title, description, read, userId, link, metadata   │
│                                                              │
│  announcements/{announcementId}                              │
│  ├─ text, senderId, targetRole, targetId, readBy[], createdAt│
│                                                              │
│  auditLogs/{logId}                                           │
│  ├─ timestamp, actor, actorRole, action, target, metadata    │
│                                                              │
│  executive_requests/{requestId}                              │
│  ├─ title, type, status, commanderId, attachments[], ...     │
│                                                              │
│  question_bank/{questionId}                                  │
│  ├─ text, options[], subject, difficulty, source, createdAt  │
│                                                              │
│  platform_settings/global                                    │
│  └─ institutionName, auth{}, battle{}, ai{}, messaging{}, ...│
└─────────────────────────────────────────────────────────────┘
```

### Quiz State Machine

Nine statuses (`QUIZ_STATUSES` in `src/lib/constants.ts:8`). Simplified flow:

```
    ┌──────────┐
    │  Draft*  │
    └────┬─────┘
         │ Commander publishes
         ▼
    ┌──────────┐    Gladiators join    ┌──────────┐
    │ Waiting  │──────────────────────►│  Live    │
    └──────────┘                       └────┬─────┘
         ▲                                  │ Commander ends
         │                                  ▼
         │                           ┌──────────┐
         └─── Commander resets───────│ Finished │
                                     └──────────┘
```
*Draft status is used client-side before the quiz is persisted to Firestore.

### Quiz Status Transitions (`ALLOWED_QUIZ_TRANSITIONS` in `src/lib/constants.ts:32`, mirrored by `isLegalStatusTransition` in Firestore rules)
```
draft     → waiting
waiting   → ready, starting
ready     → waiting, starting
starting  → live, waiting
live      → paused, finished, abandoned
paused    → live, finished, abandoned
finished  → archived
abandoned → (terminal)
archived  → (terminal)
```

### Scoring Formula

Per-arena scoring config lives in the gated `quizzes/{quizId}/config/settings` document (defaults: max 1000, min 100, no wrong/skip penalty, time decay on, no streak multiplier — see `normalizeScoringConfig` in `src/lib/battle-machine.ts:58`).

For each correct answer (`computeCorrectScore` in `src/lib/battle-machine.ts:77`):
```
fraction = max(0, 1 − elapsed / timeLimit)
score    = round(score_max − (1 − fraction) × (score_max − score_min))   [if time_decay, else score_max]
total   += score + streakBonus − penalties
```
- Correct-answer range: **score_min–score_max** (defaults 100–1000), decreasing linearly with response time when time decay is on.
- Streak bonus: `round(streak × streak_multiplier)` (`computeStreakBonus`).
- Wrong/skip answers subtract `wrong_penalty`/`skip_penalty` when configured (wrong penalty applies only when the arena enables negative marking).

---

## 5. Messaging System Design

The messaging system supports **direct conversations** between Executives and Commanders, plus **announcements** from Executives.

### Conversations
- Created by Executives targeting a specific Commander (1-on-1).
- Messages are stored in a subcollection under each conversation.
- Firestore transactions ensure atomic write of message + conversation metadata update.
- Unread counts are tracked per participant in the conversation document.
- Idempotency keys prevent duplicate message creation on retry.
- Cursor-based pagination for message history.

### Announcements
- Created by Executives; can target all Commanders or a specific Commander.
- Read receipts tracked via a `readBy` array.
- Notifications are batch-created for all target recipients.

### File Attachments
- Validated against allowed MIME types (jpeg, png, gif, webp, pdf, csv, txt, json, xlsx).
- Maximum 10 attachments per message, 500KB per file, 5MB total.
- Stored as base64 in Firestore (optional Firebase Storage bucket also supported).

---

## 6. AI PDF Forge Pipeline

The AI PDF Forge converts uploaded PDF study materials into multiple-choice quizzes.

```
User uploads PDF → Server action triggered
     │
     ├── 1. Auth verification (executive or commander)
     ├── 2. Rate limit check (5 requests/minute)
     ├── 3. PDF parsing via pdfjs-dist (30s timeout; browser-side extraction in `src/lib/prepare-documents.ts` for uploads)
     ├── 4. Text extraction & validation
     │      ├── Checks: header, encryption, corruption, content length
     │      └── Max input: 40,000 characters (truncated intelligently)
     ├── 5. Build prompt with difficulty & question count
     ├── 6. Gemini call with model fallback chain
     │      ├── Default chain: gemini-3.6-flash → gemini-3.5-flash (platform settings may prepend a configured model; `gemini-2.0`/`1.5` prefixes are blocked as shut down)
     │      ├── Retry: up to 3 attempts per model
     │      └── Timeout: 35s per call (`GEMINI_TIMEOUT_MS`)
     ├── 7. JSON repair (fix markdown fences, single quotes, trailing commas)
     ├── 8. Parse structured output
     └── 9. Return questions array to client
```

**Prompt construction:** The AI receives the extracted text, a difficulty mapping (easy/moderate/hard), and a requested question count. Output must conform to a Zod-validated schema with text, 4 options, correctAnswerIndex (0-3), and explanation.

**Model configuration** (`src/config/gemini-models.ts`):
- Models are centrally cataloged with metadata (speed, reasoning, availability).
- Platform settings can override the default model.
- Deprecated/disabled models are automatically excluded.

---

## 7. Quiz / Arena Flow

```
Commander                    Firestore                     Gladiator(s)
    │                           │                              │
    ├── Create quiz (waiting) ──►                              │
    │                           │                              │
    │                           │                              │
    │  Share room code ─────────┼─────────────────────────────►│
    │                           │                              │
    │                           │◄──── Join via room code ─────┤
    │                           │                              │
    ├── Start game ────────────►│                              │
    │  (status → live)          │                              │
    │                           │                              │
    │  Advance to Q1 ──────────►│                              │
    │                           │── Real-time question ──────►│
    │                           │◄──── Submit answer ──────────┤
    │                           │                              │
    │  Advance to Q2 ──────────►│                              │
    │                           │                              │
    │  ... (repeat)             │                              │
    │                           │                              │
    ├── End arena ─────────────►│                              │
    │  (status → finished)      │                              │
    │                           │── Evaluate all questions ──►│
    │                           │── Leaderboard updates ─────►│
    │                           │                              │
    │  View results ◄───────────┤                              │
    │                           │                              │
    ├── Reset arena ───────────►│                              │
    │  (status → waiting)       │                              │
```

### Evaluation Process
When the Commander advances a question or ends the arena, the server evaluates via `evaluateQuestionForAll` / `evaluateQuestionForUser` in `src/lib/battle-server.ts:577-907` (called from `/api/battle/evaluate`, `/api/battle/skip`, `/api/battle/end`, `/api/battle/auto-advance`):
1. Reads the answer key for the question.
2. Fetches all participants.
3. For each non-blocked participant, checks their submission.
4. If correct, calculates score with `computeCorrectScore` plus streak bonus (wrong/skip penalties applied per arena config).
5. Updates participant score using `increment()`.
6. Marks the question as `scored: true` to prevent double-evaluation.

(Note: the client-side `questionService.evaluateQuestion` in `src/services/game.service.ts:111` is dead legacy code with zero callers and a divergent `500 + time bonus` formula — it is not part of live scoring.)

---

## 8. Notification System

Events throughout the system trigger notification creation via the Admin SDK:

| Event Type | Trigger | Target |
|---|---|---|
| `commander_request` | Commander creates a request | Executive |
| `gladiator_registration` | Executive handles request | Executive |
| `battle_completed` | Arena finishes | Commander |
| `ai_import_completed` | AI PDF Forge finishes | Creator |
| `new_announcement` | Executive publishes announcement | Commanders |
| `new_message` | Message sent in conversation | Other participant |
| `operation_failed` | System operation failure | Executive |
| `system_warning` | Admin action (disable, delete) | Executive |

Notifications are stored in Firestore and exposed via API to Executive users with unread count tracking.

---

## 9. Key Design Decisions

### Why Firestore subcollections for quizzes?
All quiz-scoped data (questions, participants, submissions, answer keys) lives under `quizzes/{quizId}` subcollections. This provides:
- **Natural data isolation** — Deleting a quiz cascades to all its subcollections.
- **Efficient queries** — Participants, questions, and submissions are always scoped to a single quiz.
- **Security rule simplicity** — Rules can grant access based on the parent quiz document.

### Why Firebase Admin SDK for API routes?
Client-side Firestore SDK enforces security rules, which is ideal for real-time subscriptions. But admin operations (user management, analytics aggregation, backup) require bypassing rules. API routes with the Admin SDK provide a controlled server-side interface for these operations.

### Why Genkit for AI?
Genkit provides:
- **Structured output schemas** — Zod-compatible schemas ensure the AI response conforms to the expected format.
- **Model fallback** — Automatic fallback chain across models, critical for reliability.
- **Flow definitions** — Traceable, observable AI pipelines.
- **Plugin system** — Seamless integration with Google AI (Gemini).

### Why a Firestore-backed fixed-window rate limiter?
A Firestore-backed fixed-window rate limiter (`FirestoreRateLimiter` in `src/lib/rate-limiter.ts:43`, one document per key in `rate_limits/{key}` updated via transaction, auto-pruned by `expiresAt` TTL) rather than in-memory avoids limits multiplying across serverless instances and cold starts. It fails open (allows the request) if Firestore is unreachable. Per-route budgets live in `Limits` (`src/lib/rate-limiter.ts:113-130`): login 5/min per IP/email, signup 5/min per IP, AI 10/min per user, battle actions 30/min, search 20/min, copilot 10/min, mind map 5/min, explanations 30/min, exports 5/min.

### Why tab-visibility enforcement?
Browser `visibilitychange` events are captured and sent to Firestore as violation counts. The Commander can block gladiators with excessive violations, ensuring fair play during live battles.

---

## 10. Firestore Indexes

Composite indexes are defined in `firestore.indexes.json` (19 composite indexes plus one field override):

| Collection | Fields | Purpose |
|---|---|---|
| `quizzes` | `created_by ASC, created_at DESC` | Commander's quiz list |
| `users` | `role ASC, createdAt DESC` | Executive user management |
| `executive_requests` | `commanderId ASC, createdAt DESC` | Commander's request list |
| `executive_requests` | `status ASC, createdAt DESC` | Executive request filtering |
| `question_bank` | `category ASC, createdAt DESC` | Question bank browsing |
| `question_bank` | `difficulty ASC, createdAt DESC` | Difficulty filtering |
| `question_bank` | `category ASC, difficulty ASC, createdAt DESC` | Combined browsing |
| `auditLogs` | `actor ASC, timestamp DESC` | User audit trail |
| `auditLogs` | `action ASC, timestamp DESC` | Action-based filtering |
| `auditLogs` | `action ASC, actorRole ASC, timestamp DESC` | Combined filtering |
| `auditLogs` | `actorRole ASC, timestamp DESC` | Role-based filtering |
| `security_logs` | `actor ASC, createdAt DESC` | Security actor lookup |
| `security_logs` | `event ASC, createdAt DESC` | Security event filtering |
| `notifications` | `userId ASC, createdAt DESC, __name__ DESC` | Per-user inbox pagination |
| `ai_logs` | `userId ASC, createdAt DESC` | Per-user AI log lookup |
| `battle_logs` | `actor ASC, timestamp DESC` | Actor battle history |
| `battle_logs` | `quizId ASC, timestamp DESC` | Per-arena timeline |
| `participants` (collection group) | `user_id ASC` | Gladiator history lookup |
| `participants` (collection group) | `user_id ASC, finished_at DESC` | Finished-history ordering |

A field override enables collection-group queries on `participants.user_id` for gladiator history.

---

## 11. Security

- **HSTS** enforced (max-age=31536000, includeSubDomains, preload)
- **X-Content-Type-Options**: nosniff
- **X-Frame-Options**: DENY
- **Referrer-Policy**: strict-origin-when-cross-origin
- **Permissions-Policy**: geolocation, camera, microphone, interest-cohort all denied
- **CSP** can be added via Next.js headers
- **Server Actions** body limited to 20MB
- **File uploads** validated for MIME type, extension, and size
- **Rate limiting** on login (5/min per IP + per email) and AI endpoints (10/min per user)
