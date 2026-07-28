# Knowledge Arena — Architecture

## 1. System Architecture

Knowledge Arena uses a **monolithic Next.js deployment** with the App Router serving both the client UI (React Server/Client Components) and API Routes. Client components interact with Firebase Web SDK (Firestore, Auth) directly for real-time data. Admin-only operations go through API Routes that use the Firebase Admin SDK. Gemini AI is accessed via Genkit through server actions.

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
│  Genkit + Gemini 2.0 Flash                    │
│  (AI PDF Forge, Summaries, Predictions)       │
└───────────────────────────────────────────────┘
```

**Key design choices:**
- **Server Actions for AI** — The PDF-to-quiz generation runs in a server action to avoid exposing API keys to the client and to handle long-running AI calls without timeout limits.
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

**Route-to-portal mapping** (from `src/middleware.ts`):
```
/executive        → executive role required
/commander        → commander role required
/create-quiz      → commander role required
/gladiator        → gladiator role required
/battle/{id}      → public (battle page)
/api/*            → public (auth enforced per-route)
```

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

### Quiz Status Transitions (enforced in `quizService.updateQuizStatus`)
```
draft   → waiting
waiting → live
live    → finished
finished → waiting (via reset)
```

### Scoring Formula

For each correct answer:
```
score = 500 + 500 × max(0, 1 − elapsed / timeLimit)
```
- Base score: **500 points**
- Time bonus: up to **500 points** (decreases linearly with response time)
- Maximum per question: **1000 points**

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
     ├── 3. PDF parsing via pdfreader (30s timeout)
     ├── 4. Text extraction & validation
     │      ├── Checks: header, encryption, corruption, content length
     │      └── Max input: 40,000 characters (truncated intelligently)
     ├── 5. Build prompt with difficulty & question count
     ├── 6. Gemini call with model fallback chain
     │      ├── Default model: gemini-2.5-flash-lite (configurable via settings)
     │      ├── Fallback: gemini-2.0-flash
     │      ├── Retry: up to 3 attempts per model
     │      └── Timeout: 30s per call
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
When the Commander advances a question or ends the arena, `evaluateQuestion` runs a Firestore transaction:
1. Reads the answer key for the question.
2. Fetches all participants.
3. For each non-blocked participant, checks their submission.
4. If correct, calculates score with time bonus.
5. Updates participant score using `increment()`.
6. Marks the question as `scored: true` to prevent double-evaluation.

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

### Why a sliding-window rate limiter?
An in-memory sliding-window rate limiter (rather than Firestore-based) avoids additional read/write costs and maintains low latency for auth and AI endpoints. The window is reset if idle for 120 seconds to prevent memory leaks.

### Why tab-visibility enforcement?
Browser `visibilitychange` events are captured and sent to Firestore as violation counts. The Commander can block gladiators with excessive violations, ensuring fair play during live battles.

---

## 10. Firestore Indexes

Composite indexes are defined in `firestore.indexes.json`:

| Collection | Fields | Purpose |
|---|---|---|
| `quizzes` | `created_by ASC, created_at DESC` | Commander's quiz list |
| `users` | `role ASC, createdAt DESC` | Executive user management |
| `executive_requests` | `commanderId ASC, createdAt DESC` | Commander's request list |
| `executive_requests` | `status ASC, createdAt DESC` | Executive request filtering |
| `question_bank` | `category ASC, createdAt DESC` | Question bank browsing |
| `auditLogs` | `actor ASC, timestamp DESC` | User audit trail |
| `auditLogs` | `action ASC, timestamp DESC` | Action-based filtering |
| `auditLogs` | `action ASC, actorRole ASC, timestamp DESC` | Combined filtering |

Field overrides enable collection-group queries on `participants.user_id` for gladiator history.

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
