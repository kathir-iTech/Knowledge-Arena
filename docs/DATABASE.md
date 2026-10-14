# Database Schema

Firestore collections and documents.

## Entities

### `users/{userId}`

User profile document.

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Display name (used for self-created gladiator profiles; client-writable) |
| `displayName` | `string` | Display name (used when the Executive creates a Commander via `/api/admin/users`; server-written) |
| `email` | `string` | Email address |
| `role` | `string` | `"executive"` / `"commander"` / `"gladiator"` |
| `avatar` | `string` | Emoji avatar string |

### `quizzes/{quizId}`

Quiz room document.

| Field | Type | Description |
|-------|------|-------------|
| `title` | `string` | Quiz title |
| `status` | `string` | One of 9 statuses: `draft`, `waiting`, `ready`, `starting`, `live`, `paused`, `finished`, `archived`, `abandoned` (see `ALLOWED_QUIZ_TRANSITIONS` in `src/lib/constants.ts`) |
| `current_question_index` | `number` | Current question (0-based), -1 before start |
| `question_count` | `number` | Total questions |
| `question_start_at` | `number \| null` | Timestamp when question started (epoch ms) |
| `created_by` | `string` | Commander's user ID |
| `created_at` | `number` | Creation timestamp (epoch ms) |
| `archived` | `boolean` | (optional) Archived state |
| `allowed_gladiator_domain` | `string \| null` | (optional) Per-arena email-domain snapshot for join gating; blank means open |
| `max_participants` | `number` | (optional) Participant cap; absent means uncapped |
| `co_commanders` | `string[]` | (optional) Additional editors; absent means solo |

### `quizzes/{quizId}/questions/{questionId}`

Individual question.

| Field | Type | Description |
|-------|------|-------------|
| `text` | `string` | Question text |
| `options` | `string[]` | 2-4 answer options |
| `timer` | `number` | Time limit in seconds |
| `sort_index` | `number` | Display order |
| `scored` | `boolean` | Whether this question has been scored (for idempotency) |

### `quizzes/{quizId}/questions/{questionId}/submissions/{userId}`

Student's answer for one question.

| Field | Type | Description |
|-------|------|-------------|
| `question_id` | `string` | Must match the document path ID (anti-forgery) |
| `selected_option` | `number` | Index of selected option (0–3) |
| `submittedAt` | `Timestamp` | Server timestamp (authority for scoring; `== request.time` in rules) |
| `clientTime` | `number` | Client clock at submit (analytics only) |

### `quizzes/{quizId}/participants/{userId}`

Participant state (exact creation whitelist in `firestore.rules`: `user_id`, `score`, `status`, `violations_count`, `ready`, `lastSeen`, `session_token`, `name`).

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Display name at time of joining |
| `user_id` | `string` | User's auth UID |
| `score` | `number` | Current total score |
| `status` | `string` | `"playing"` / `"finished"` / `"blocked"` / `"flagged"` |
| `violations_count` | `number` | Number of malpractice violations |
| `ready` | `boolean` | Lobby ready toggle |
| `lastSeen` | `Timestamp` | Heartbeat (`== request.time` in rules) |
| `session_token` | `string` | Single-session token |

### `quizzes/{quizId}/answerKeys/{questionId}`

Correct answer (hidden from students).

| Field | Type | Description |
|-------|------|-------------|
| `correct_option_index` | `number` | Index of the correct option |

## Other top-level collections

Beyond quizzes, the app uses: `question_bank` (curated library), `conversations` + `messages` subcollection, `announcements`, `notifications` (server-write-only), `auditLogs` / `ai_logs` / `security_logs` / `battle_logs` (server-write-only, executive-read), `executive_requests`, `platform_settings/global`, `rate_limits` / `ai_jobs` / `forge_cache` / `search_df` / `ai_translations` (Admin SDK only, rules deny all client access), and `quizzes/{id}/config/settings` (gated scoring/governance internals readable only by creator/participants/executive).

## Indexes

Required indexes defined in `firestore.indexes.json` (19 composite indexes + 1 field override — not just the single entry below):

- Per-collection pairs/triples for `quizzes`, `users`, `executive_requests`, `question_bank`, `auditLogs`, `security_logs`, `notifications`, `ai_logs`, `battle_logs` (see `ARCHITECTURE.md` §10 for the full table).
- Collection-group `participants` on `user_id ASC` (+ `user_id ASC, finished_at DESC`), with a field override on `participants.user_id` enabling gladiator history lookup.

## Security Rules

Rules are generated from `firestore.rules.template` via `npm run rules:generate` (predeploy hook). Key policies:

- **Users**: Owners and executives can read; owners may update only `name`/`avatar`/`onboarding_complete` (role/email are server-only)
- **Quizzes**: Commanders/Executives create own; updates restricted to a field whitelist plus legal status transitions; creators (and `co_commanders` for questions/answer keys) manage content
- **Questions**: Readable only by creator/participants/executive — never by non-participants, even in open arenas
- **AnswerKeys**: Creator/executive, plus participants once the arena is `finished`
- **Participants**: Owners create own (domain-gated, lobby-state-gated); creators manage all; heartbeats/`ready` tightly constrained
- **Submissions**: Owners submit own while `live` for the current question only (`submittedAt == request.time`); creators read

## Common Queries

```typescript
// Get quizzes by commander
query(collection(db, 'quizzes'), where('created_by', '==', userId))

// Get questions in order
query(collection(db, 'quizzes', quizId, 'questions'), orderBy('sort_index'))

// Get gladiator history (collection group)
query(collectionGroup(db, 'participants'), where('user_id', '==', userId))

// Get recent quizzes for AI
query(collection(db, 'quizzes'), orderBy('created_at', 'desc'), limit(5))
```
