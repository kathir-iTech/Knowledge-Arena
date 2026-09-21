# Quorena — Architecture

## 1. System Architecture

Quorena is a **monolithic Next.js 15 App Router** deployment serving both the
client UI (React Server/Client Components) and API routes. Since the
hardening sprint, the write/read split is explicit:

- **Reads + real-time subscriptions** → Firebase Web SDK (Firestore, Auth)
  directly from client components (rule-gated, low latency during battles).
- **State-changing / privileged / correctness-critical writes** → API routes
  using the Firebase Admin SDK (rules-bypassing). **Answer submissions are
  now server-write-only** (see §7 and `SECURITY.md`).
- **AI** → Genkit + Gemini through server actions / API routes (keys never on
  the client).

```
┌──────────────────────────────────────────────┐
│              Browser / PWA                    │
│  ┌────────────────┐ ┌──────────────────────┐  │
│  │ React Client   │ │ React Server         │  │
│  │ Components     │ │ Components           │  │
│  │ (reads, real-  │ │ (dynamic render,     │  │
│  │  time subs)    │ │  nonce-CSP)          │  │
│  └───────┬────────┘ └──────────┬───────────┘  │
└──────────┼─────────────────────┼───────────────┘
           │                     │
┌──────────┼─────────────────────┼───────────────┐
│  Next.js 15 App Router         │               │
│          │                     │               │
│  ┌───────┴─────────────────────┴───────────┐   │
│  │            App Router                    │   │
│  ├─────────────────────────────────────────┤   │
│  │  API Routes (/api/*)         │   │       │   │
│  │  Server Actions ('use server')│   │      │   │
│  │  Middleware (CSP + auth cookie)│  │      │   │
│  └───────┬─────────────────────┬───────────┘   │
└──────────┼─────────────────────┼───────────────┘
           │                     │
┌──────────┼─────────────────────┼───────────────┐
│  ┌───────┴────────┐ ┌──────────┴──────────┐   │
│  │  Firebase Auth  │ │  Cloud Firestore    │   │
│  │  (Admin SDK)    │ │  (Admin SDK for     │   │
│  │                 │ │   writes; Web SDK   │   │
│  │                 │ │   for rule-gated    │   │
│  │                 │ │   reads/subs)       │   │
│  └────────────────┘ └─────────────────────┘   │
│           Firebase Project                     │
└────────────────────────────────────────────────┘
                    │
┌───────────────────┴───────────────────────────┐
│  Genkit + Gemini (Forge chain                │
│  gemini-3.6-flash → gemini-3.5-flash;        │
│  catalog default gemini-2.5-flash-lite)      │
└───────────────────────────────────────────────┘
```

**Key design choices:**
- **Server Actions for AI** — PDF-to-quiz generation runs server-side so API
  keys never reach the client. Each Gemini call times out after 35s
  (`GEMINI_TIMEOUT_MS` in `src/ai/flows/generate-quiz-pdf-flow.ts:47`); jobs
  are one-call-per-tick (`createForgeJob`/`runForgeTick`) to stay inside
  Vercel's 60s `maxDuration`.
- **Firebase Admin SDK for state changes** — the battle engine, user
  management, analytics, and — critically — **answer submission writes** use
  the Admin SDK.
- **Firebase Web SDK for reads** — real-time subscriptions (LiveQuiz) remain
  client-side for latency; security rules gate what each role may read.
- **Per-request dynamic rendering** — the root layout awaits `connection()`
  so the middleware's per-request CSP nonce always matches the response's
  inline scripts. **`experimental.ppr` is pinned `false`** (`next.config.ts`);
  a PPR/static shell would bake nonce-less framework scripts and trip the
  strict policy.
- **Standalone output** — `next.config.ts` sets `output: 'standalone'`
  (Vercel, Docker, custom Node all supported).

---

## 2. Authentication Flow

Login is client-side via Firebase Auth. The ID token is verified server-side
in API routes using `verifyFirebaseToken` / `verifyFirebaseTokenWithRole`;
middleware additionally verifies the session cookie for portal pages. The
`ClientLayout` component enforces client-side route redirection, and the
middleware enforces server-side role checks for `/commander`, `/executive`,
`/create-quiz`, `/gladiator`.

```
User          Client Component    Firebase Auth     Middleware/API Route   Firestore
 │                    │                 │                 │                  │
 │  Credentials       │                 │                 │                  │
 ├───────────────────►│                 │                 │                  │
 │                    │ signInWith      │                 │                  │
 │                    │ EmailPassword   │                 │                  │
 │                    ├────────────────►│                 │                  │
 │                    │◄────────────────┤                 │                  │
 │                    │    ID Token     │                 │                  │
 │                    │  (sessionCookie)│────────────────►│                  │
 │   Request +        │                 │                 │                  │
 │   Bearer Token     │                 │                 │                  │
 ├───────────────────►│─────────────────────────────────►│                  │
 │                    │                 │     verifyIdToken│                  │
 │                    │                 │                 │                  │
 │                    │                 │                 │  Read users/uid  │
 │                    │                 │                 ├────────────────►│
 │                    │                 │                 │◄────────────────┤
 │                    │                 │                 │   { role }      │
 │                    │                 │   Check role    │                  │
 │                    │                 │◄────────────────│                  │
 │  Response/401      │                 │                 │                  │
 │◄───────────────────│◄────────────────│                 │                  │
 │  ClientLayout +    │                 │                 │                  │
 │  middleware        │                 │                 │                  │
 │  redirect by role  │                 │                 │                  │
```

**Token verification utilities** (`src/lib/verify-auth.ts`):
- `verifyFirebaseToken(token | Request)` — decodes + verifies an ID token.
- `verifyFirebaseTokenWithRole(token | Request, role)` — verifies token AND
  role. Role is read from the ID token's `customClaims.role` first, falling
  back to the Firestore `users` document (see `src/lib/verify-auth.ts`).
- `verifyFirebaseTokenWithAnyRole(req, roles[])` — role-set variant used by
  hybrid endpoints (e.g. `/api/battle/submit` accepts gladiator + commander).

**Header:** `Authorization: Bearer <firebase-id-token>`.

---

## 3. Authorization (Role-Based Access)

| Role | Description | Permissions |
|---|---|---|
| **Executive** | Platform admin | Full read/write, user management, analytics, settings, backup/restore |
| **Commander** | Quiz creator/host | Create/manage own quizzes, dashboard, requests, messaging |
| **Gladiator** | Quiz participant | Join battles, **submit answers (server-gated)**, own profile/history |

**Enforcement layers:**

1. **Middleware (`src/middleware.ts`)** — verifies the session cookie for
   portal routes and enforces `customClaims.role` server-side; also injects the
   per-request nonce + CSP on every HTML response.
2. **Client Layout Guard (`src/components/ClientLayout.tsx`)** — role redirect
   from the authenticated client state.
3. **API route verification** — each route calls
   `verifyFirebaseTokenWithRole`/`WithAnyRole`; returns `401` on failure.
4. **Firestore security rules** — gate reads and (remaining) client writes by
   role, ownership, and arena status. Submission client-writes are locked.

**Route-to-portal mapping** (`PORTAL_ROUTES` in `src/middleware.ts`):
```
 /executive        → executive role required (session cookie)
 /commander        → commander role required
 /create-quiz      → commander role required
 /gladiator        → gladiator role required
 /battle/{id}      → public (battle page, auth enforced in component/API)
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
│  │     └─ submissions/{userId}  (SERVER-WRITE ONLY)          │
│  │        └─ question_id, selected_option,                   │
│  │           submittedAt (server Timestamp), clientTime      │
│  ├─ answerKeys/{questionId}                                  │
│  │  └─ correct_option_index                                  │
│  ├─ participants/{userId}                                    │
│  │  └─ user_id, score, status, violations_count,             │
│  │     session_token, question_order, current_question_index │
│  └─ config/settings                                          │
│     └─ scoring_config, governance_config, skipped_question_ids│
│                                                              │
│  conversations, messages, notifications, announcements,      │
│  auditLogs, security_logs, ai_logs, battle_logs,             │
│  executive_requests, question_bank, platform_settings,       │
│  rate_limits/{key} ──────────────────────────────────────────┘
```

### Write policy per collection area (hardening sprint)

| Data | Client writes | Server (Admin SDK) writes |
|---|---|---|
| `quizzes/{id}` state machine | ✗ (transitions via `/api/battle/*`) | ✓ |
| `questions` / `answerKeys` / `config` | created in the waiting batch by creator (rules-gated); **locked once live** | ✓ |
| `participants` | join/heartbeat/leave (rules-gated) | ✓ |
| `submissions` | **locked entirely** | **✓ only via `POST /api/battle/submit`** |
| users, settings, logs, messaging | ✗ | ✓ |

### Quiz State Machine

Nine statuses (`QUIZ_STATUSES` in `src/lib/constants.ts`):

```
    ┌──────────┐
    │  Draft*  │   (client-side, pre-persist)
    └────┬─────┘
         │ Commander publishes
         ▼
    ┌──────────┐    Gladiators join    ┌──────────┐
    │ Waiting  │──────────────────────►│ starting │
    └──────────┘                       └────┬─────┘
         ▲                                  │ activate
         │                                  ▼
         │                           ┌──────────┐  advance ─► live next Q
         │                           │   live   │◄─ resume ─┐
         │                           └─┬─────┬──┘            │
         │                pause/sweep  │     │ pause         │
         │            ┌────────────────┘     └──────┐        │
         │            ▼                             ▼        │
         │       abandoned                       paused ─────┘
         │                                        │ end
         ▼                                        ▼
   waiting (reset)                        finished → archived (terminal)
```

`ALLOWED_QUIZ_TRANSITIONS` in `src/lib/constants.ts:32` mirrors
`isLegalStatusTransition` in the Firestore rules.

### Scoring Formula

Per-arena scoring config lives in the gated `quizzes/{quizId}/config/settings`
(defaults: max 1000, min 100, no wrong/skip penalty, time decay on, no streak
multiplier — `normalizeScoringConfig`, `src/lib/battle-machine.ts:58`).

For each correct answer (`computeCorrectScore`, `src/lib/battle-machine.ts:77`):
```
fraction = max(0, 1 − elapsed / timeLimit)
score    = round(score_max − (1 − fraction) × (score_max − score_min))   [if time_decay, else score_max]
total   += score + streakBonus − penalties
```
- Wrong/skip answers subtract `wrong_penalty`/`skip_penalty` when configured.
- Server-recorded `submittedAt` (Admin `Timestamp.now()`) is the canonical
  elapsed-time anchor — clients can no longer backdate.

---

## 5. Messaging System Design

Unchanged from prior architecture — see previous version's §5 (kept here for
continuity):

- Conversations are Exec↔Commander 1-on-1s; messages are a subcollection.
- Firestore transactions keep message + conversation-metadata writes atomic.
- Idempotency keys prevent duplicate message creation on retry.
- Cursor-based pagination; unread counts per participant; announcement
  read-receipts via `readBy`; notifications batch-created per target.
- Attachments: max 10/message, 500KB/file, 5MB total, restricted MIME types,
  base64 in Firestore (optionally Firebase Storage).

---

## 6. AI PDF Forge Pipeline

```
Upload PDF → Server action
   ├─ 1. Auth (executive | commander)
   ├─ 2. Rate limit (5/min)
   ├─ 3. Parse via pdfjs-dist (browser-side extraction for uploads)
   ├─ 4. Validate: header, encryption, corruption, ≤40,000 chars
   ├─ 5. Build prompt (difficulty, count)
   ├─ 6. Gemini call, model fallback chain (default gemini-3.6-flash →
   │       gemini-3.5-flash; 2.0/1.5 prefixes blocked; retries ×3; 35s timeout)
   ├─ 7. JSON repair (fences, quotes, trailing commas)
   ├─ 8. Zod-validate structured output
   └─ 9. Return questions to client
```
Models cataloged in `src/config/gemini-models.ts`; platform settings may
override the default; deprecated models auto-excluded.

---

## 7. Quiz / Arena Flow (post-hardening)

```
Commander                    Server                  Firestore              Gladiator(s)
    │                          │                        │                        │
    ├── Create quiz ──────────►│───────────────────────►│                        │
    │                          │  (batch: quiz,         │                        │
    │                          │   questions, keys,     │                        │
    │                          │   config)              │                        │
    │                          │                        │                        │
    │  Share room code ────────┼────────────────────────┼───────────────────────►│
    │                          │◄───────────────────────┤─── Join via room code ─┤
    │                          │                        │  (session_token minted) │
    ├── Start/activate ───────►│───────────────────────►│                        │
    │                          │  (status → live)       │                        │
    │                          │                        │◄─ real-time question ──┤
    │  Advance to Qn ─────────►│───────────────────────►│                        │
    │                          │                        │◄── submit answer ──────┤
    │                          │  /api/battle/submit    │        (HMAC-signed)   │
    │                          │  ◄───────────────────────────────────────────────┤
    │                          │  ──► atomic txn write  │                        │
    │                          │  (live check,          │                        │
    │                          │   current-question,    │                        │
    │                          │   one-shot)            │                        │
    │  Advance/End ───────────►│───────────────────────►│                        │
    │                          │  evaluate → scores,    │◄── leaderboard ─────────┤
    │                          │  questionStats, log    │                        │
    │  View results ◄──────────┤                        │                        │
    │  Reset (→ waiting) ──────►│───────────────────────►│                        │
```

### Evaluation process
When the Commander advances a question or ends the arena, the server evaluates
via `evaluateQuestionForAll` / `evaluateQuestionForUser` in
`src/lib/battle-server.ts:577-907` (called from `/api/battle/evaluate`,
`/api/battle/skip`, `/api/battle/end`, auto-advance):
1. Read the answer key.
2. Fetch participants.
3. For each non-blocked participant, read their **server-written** submission.
4. Correct → `computeCorrectScore` + streak bonus − penalties (per config).
5. Update score with `increment()`; mark question `scored: true`.

### Submission integrity (hardening sprint)
- **Client never writes submissions.** `submissionService.submitAnswer`
  (`src/services/game.service.ts:264`) signs the payload (HMAC-SHA256 against
  the participant session token) and POSTs to `/api/battle/submit`.
- The route: auth → rate limit (30/60s) → freshness (±5s) → HMAC verify
  (timing-safe) → **one Admin-SDK transaction** that re-checks live status,
  participant state, current-question binding, and one-shot idempotency
  before writing with a server `Timestamp`.
- Concurrent double-taps resolve to `alreadySubmitted: true` — no overwrite,
  no hard error. See `SECURITY.md`.

(Note: the client-side `questionService.evaluateQuestion` in
`src/services/game.service.ts` is dead legacy code with zero callers and a
divergent `500 + time bonus` formula — not part of live scoring.)

---

## 8. Notification System

Admin SDK creates notifications on: `commander_request`, `gladiator_
registration`, `battle_completed`, `ai_import_completed`, `new_announcement`,
`new_message`, `operation_failed`, `system_warning`. Exposed via API to
Executive users with unread counts.

---

## 9. Key Design Decisions

### Firestore subcollections under `quizzes/{quizId}`
Isolation + cascading deletes + efficient scoped queries + simple parent-scoped
rules.

### Firebase Admin SDK for writes, Web SDK for reads
Rules gate reads/subs in real time; correctness-critical writes go server-side
where rules can be bypassed deliberately in a controlled way. This is what made
the submission lockdown possible.

### Why Genkit for AI
Structured Zod output schemas, automatic model fallback, traceable flow
definitions, Google AI (Gemini) plugin.

### Why a Firestore-backed fixed-window rate limiter
`FirestoreRateLimiter` (`src/lib/rate-limiter.ts:43`, one doc per key in
`rate_limits/{key}`, transactional update, `expiresAt` TTL) avoids
multi-instance/cold-start limit multiplication; fails open if Firestore is
down. Budgets in `Limits` (`src/lib/rate-limiter.ts:113-130`).

### Why the per-request nonce CSP (not a static header)
A static `Content-Security-Policy` cannot carry nonces and would break Next's
inline bootstrap scripts. The middleware + `connection()` combo gives a strict
policy with a fresh nonce per request. Read-only; see `SECURITY.md` §5.

---

## 10. Firestore Indexes

Composite indexes in `firestore.indexes.json` (19 + one field override).
See the original index table in the previous ARCHITECTURE revision:
`quizzes(created_by,created_at)`, `users(role,createdAt)`,
`executive_requests(commanderId/status,createdAt)`,
`question_bank(category/difficulty...)`, `auditLogs(actor/action/...timestamp)`,
`security_logs(actor/event,createdAt)`, `notifications(userId,createdAt,__name__)`,
`ai_logs(userId,createdAt)`, `battle_logs(actor/quizId,timestamp)`, and two
`participants` collection-group indexes on `user_id`.

---

## 11. Security

Full detail in `SECURITY.md`; highlights:

- **HSTS** (1y, subdomains, preload), `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`,
  `poweredByHeader` off.
- **Nonce-based CSP** (`src/middleware.ts`): per-request nonce +
  `strict-dynamic`, locked `connect-src`/`img-src`, `object-src 'none'`,
  `frame-ancestors 'none'`, `upgrade-insecure-requests` (prod). The root
  layout forces dynamic rendering; `experimental.ppr` pinned `false`.
- **Submissions**: client writes dead in rules; server-only Admin-SDK path
  with HMAC signing, freshness, current-question binding, transactional
  one-shot idempotency.
- **Rules lockdown**: `created_by` fallbacks role-gated to commander/executive
  (questions/answerKeys/config); `config` immutable from clients once a battle
  starts.
- **Server Actions** body limited to 20MB; file uploads validated (MIME,
  extension, size); rate limiting across login (+per-email), AI, battle,
  search, messaging, copilot, mind-map, explanations, exports (budgets in
  `src/lib/rate-limiter.ts:113-130`).
- **Tooling:** `npm run lint` runs ESLint 9 (`eslint-config-next@15`, strict
  `.eslintrc.json`: `no-explicit-any`, `no-unused-vars`, `no-console`,
  `react-hooks/exhaustive-deps`). The hardening sprint is lint-clean; the
  legacy codebase retains a tracked explicit-`any` backlog. `next lint` will be
  removed in Next 16 — plan migration to the ESLint CLI + `eslint.config.mjs`.