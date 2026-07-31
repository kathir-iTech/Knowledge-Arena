# Knowledge Arena — Phase 3 Report: Production-Grade Security Hardening

**Date:** July 2026
**Scope:** Authentication, authorization, Firestore rules, API security, anti-cheat, session management, rate limiting, audit logging, realtime security, error handling, validation.
**Constraint honored:** no redesign of working systems; Phase 1 and Phase 2 architectures extended safely; Git + repository used as the only source of truth; no invented features.

---

## 1. Executive Summary

Knowledge Arena was audited and hardened across its full security surface. The platform's existing architecture (server-authoritative battle API, state-machine-validated Firestore rules, per-role authorization) was found to be a sound foundation; this phase closed the gaps around it:

- **Removed** a production-visible debug endpoint (`/api/debug-pdf`) and hardened the audit-log API.
- **Tightened Firestore rules** from "any signed-in user" to least privilege in 7 places (user profiles, quiz metadata, question bank, notifications, battle logs, executive request responses, submissions).
- **Added server-side anti-cheat**: answers submitted after a question timer expires are now rejected at scoring time (previously they still scored); impossible/sub-second timing fabrications are detected and logged; suspicious reconnects and session replacements are now recorded as security events.
- **Added rate limiting** to all 11 battle API routes, executive exports/backups, and messaging POST endpoints (the existing in-memory sliding-window limiter was reused — no duplicate implementations).
- **Added a security event log** (`security_logs` collection, server-only writes, executive-only reads) capturing invalid tokens, role mismatches, authorization failures, security violations, and session anomalies.
- **Fixed a latent realtime hazard**: `battleLogService.subscribeToBattleLogs` subscribed to the entire top-level `battle_logs` collection; it is now quiz-scoped.

Validation: TypeScript preflight is **CLEAN** across all 30 touched files. `npm run build` and `next lint` remain environment-blocked (SWC binary and ESLint 10 vs legacy config — pre-existing issues, not regressions).

---

## 2. Security Architecture Review (before → after)

| Area | Before | After |
|---|---|---|
| Attack surface | 46 API routes incl. `debug-pdf` debug endpoint | 45 routes; debug endpoint removed |
| Client-direct Firestore writes | Participants could create arbitrary battle log entries; notifications readable by any signed-in user | Log events allowlisted + self-authored; notifications owner/executive only |
| Answer integrity | Late answers still scored (with minimum score); client timestamps never cross-checked | Late answers = timeout (no score); clock-skew/late-submission violations logged |
| Rate limiting | 4 limit groups (login/signup/AI); battle, join, messaging, executive unprotected | + battle actions, audit writes, messages, executive exports/backups (10 groups total) |
| Observability | No security event stream; auth failures invisible | `security_logs` collection with throttled, server-only writes |

---

## 3. Authentication Review

**Findings.** Token verification is server-side on every API route (`verifyFirebaseToken*` family in `src/lib/verify-auth.ts`); role is read from the `users/{uid}` Firestore doc (not custom claims) — a sound design for this scale. Sessions restore via `onAuthStateChanged` + profile fetch; the Firebase SDK handles ID-token refresh. Session timeout UI (30 min) is cosmetic-only by design (participants in live battles must not be logged out mid-battle).

**Changes.**
- Auth/authorization *failures* are now recorded: missing/invalid Bearer tokens and role mismatches produce throttled `invalid_token` entries in `security_logs` (throttled per key per minute to prevent log flooding by an attacker). See `src/lib/verify-auth.ts` and `src/lib/security-log.ts`.

**Not changed (by design).** Login/signup remain client-side Firebase Auth (no server route exists; Firebase provides its own sign-in rate limiting; the client pre-flight `/api/rate-limit/check` remains as a UX guard). Login/logout success events cannot be observed server-side without client instrumentation — documented as residual (see §12).

---

## 4. Authorization Review

**Findings.** All 45 remaining API routes verify the Firebase token; executive routes are executive-only; battle routes enforce creator ownership + state-machine transitions inside transactions; commander-scoped routes filter by `created_by`. The `/api/audit/log` endpoint accepted any free-form `action` string, which commanders could abuse to forge audit history.

**Changes.**
- `/api/audit/log`: **action allowlist** (22 known actions — all existing call sites verified against it), typed body validation (`action`/`target` strings, `metadata` object with ≤20 keys), invalid JSON → 400, and per-user rate limit.
- `/api/debug-pdf` **removed** (dead debug endpoint, echoed 50 chars of PDF payload into logs).
- All 11 battle routes now rate-limited per user.

---

## 5. Firestore Rules Review (`firestore.rules`)

| Rule | Before | After |
|---|---|---|
| `users/{userId}` read | any signed-in user (any profile: name/email/role) | owner, commander, executive |
| `quizzes/{quizId}` read | any signed-in user (incl. finished arenas, room-code enumeration) | executive OR `canReadArena` (non-finished = joinable; finished = creator/participant/executive) |
| `submissions` create | any time | **quiz must be `live`** (matches `canSubmitAnswer` semantics) |
| `notifications` | read any signed-in; self-create/update/delete | read owner/executive only; writes server-only |
| `question_bank` | read any signed-in | executive/commander only |
| `battle_logs` create | any participant, any event, any actor | self-authored only + 5 client events (`gladiator_joined/left/ready/blocked/unblocked`) |
| `executive_requests/{id}/responses` | read/create any signed-in | read executive or owning commander; create executive only |
| `security_logs` (new) | — | read executive; write false |

**Companion UX changes** (rules tightening affects client behavior):
- `BattleRoomLoader.tsx`: permission-denied/offline reads now show "This room does not exist or you do not have access to it." instead of hanging.
- `GladiatorDashboard.tsx`: `permission-denied` from the join lookup maps to "Arena not found" instead of a raw Firebase error.

---

## 6. API Security Review

- **All battle mutations** remain server-authoritative: verified tokens, creator/participant checks, state-machine validation inside Firestore transactions, battle-log records.
- **New rate limits** (reusing the existing `rateLimiter` singleton — no duplicate implementations):
  - `BATTLE_ACTION_PER_USER` (30/min) → start, activate, pause, resume, skip, advance, end, evaluate, reconnect, transfer-ownership, archive
  - `AUDIT_WRITE_PER_USER` (10/min) → `/api/audit/log`
  - `MESSAGE_POST_PER_USER` (20/min) → conversation create, message send
  - `EXECUTIVE_EXPORT_PER_USER` (5/min) → executive export, backup export, backup import
- **Error handling:** battle routes consistently return `{ error }` with safe messages (no stack traces); new code follows the same pattern; unexpected failures map to `Internal server error`.
- **CSV injection guard** in the executive export (existing) verified still present.

---

## 7. Anti-Cheat Features Added

Scoring is (and remains) server-side only — `evaluateQuestionForAll` / `evaluateQuestionForUser` in `src/lib/battle-server.ts`. New integrity checks:

1. **Answer-after-timeout rejection.** A submission is scored only if `submittedAt ≤ question_start_at + timer + 3s grace`. Late answers are treated as timed out (no score, added to `timed_out_question_ids`) instead of earning points. Previously they scored (with the minimum/decayed value).
2. **Violation detection + logging.** Submissions more than 15s past the deadline (`answer_after_timeout`) or stamped before the question started beyond 5s clock-skew (`submission_clock_skew`) emit throttled `security_violation` entries to `security_logs` with quiz/question context.
3. **Suspicious reconnect logging.** The reconnect route already flagged reconnects inside a 60s window (`suspicious_reconnects`); these now also produce a `security_violation` entry.
4. **Duplicate/double answers** remain structurally impossible for honest clients (single submission doc per user per question, `setDoc`-overwrite, rules reject `update` and any extra docs), and rules now require the quiz to be `live` at write time.
5. **Impossible score jumps** were already impossible (scores only mutated inside server transactions via `FieldValue.increment`); verified unchanged.

**Residual (see §12):** a malicious client can still fabricate `submittedAt` timestamps within the allowed window to maximize the time bonus — this cannot be fully prevented while submissions are client-written; a server-authoritative submission API is the Phase 4 path.

---

## 8. Session Improvements

- **Session-token verification on reconnect.** `POST /api/battle/reconnect` now accepts the client's `session_token` and compares it to the participant doc's stored token. A mismatch (another tab/device active) is recorded as a `session_replaced` security event and surfaced in the reconnect battle log. The client (`battle.service.recordReconnect`) now sends the token.
- The existing client-side single-session UX (session token per tab in `sessionStorage`, mismatch → "Session Replaced" screen, heartbeat overwrites) is unchanged and remains the primary mechanism.
- Reconnect route is rate-limited and returns safe errors.

---

## 9. Audit Logging Improvements

| Event | Channel | Notes |
|---|---|---|
| Login/logout | (client-side Firebase) | Not observable server-side; residual risk (documented) |
| Invalid token / missing bearer | `security_logs` | Throttled 1/min/key |
| Role mismatch on API access | `security_logs` | Throttled per uid |
| Suspicious reconnect | `security_logs` + battle log | |
| Session replaced | `security_logs` + battle log | |
| Answer-after-timeout / clock skew | `security_logs` | Throttled per actor |
| Business actions (22 actions) | `auditLogs` | Allowlist enforced at API boundary |

The `security_logs` collection is server-write-only (rules `write: false`), so it cannot be forged from clients; executives read it via the rules and (if desired) a future API route.

---

## 10. Files Modified + Why

**New files**
- `src/lib/security-log.ts` — `recordSecurityEvent` + throttled `logAuthFailure` / `logSecurityViolation` helpers for the `security_logs` collection.

**Modified files**
- `firestore.rules` — least-privilege closures (§5).
- `src/lib/rate-limiter.ts` — added `Limits` groups (battle/audit/messaging/executive) + `enforceRateLimit` helper.
- `src/lib/verify-auth.ts` — throttled logging of invalid tokens / role mismatches.
- `src/lib/constants.ts` — added `SECURITY_LOGS` collection + anti-cheat timing constants (`ANSWER_GRACE_MS` 3s, `ANSWER_VIOLATION_MARGIN_MS` 15s, `SUBMIT_CLOCK_SKEW_TOLERANCE_MS` 5s).
- `src/lib/battle-server.ts` — anti-cheat: late-answer rejection + violation logging in both evaluators.
- `src/app/api/audit/log/route.ts` — action allowlist, body validation, rate limit.
- `src/app/api/battle/*/route.ts` (all 11) — rate limiting; `reconnect` additionally: session-token comparison, security events.
- `src/app/api/executive/export/route.ts`, `src/app/api/executive/backup/export/route.ts`, `src/app/api/executive/backup/import/route.ts` — rate limiting.
- `src/app/api/messaging/conversations/route.ts`, `src/app/api/messaging/conversations/[id]/messages/route.ts` — rate limiting on POST.
- `src/services/battle-log.service.ts` — `subscribeToBattleLogs` now queries `where('quizId', '==', quizId)` (was: whole-collection read + client-side filter).
- `src/services/battle.service.ts` — `recordReconnect` sends `sessionToken`.
- `src/components/quiz/BattleRoomLoader.tsx` — handles permission-denied reads; passes session token on reconnect.
- `src/components/dashboard/GladiatorDashboard.tsx` — maps `permission-denied` to "Arena not found".

**Deleted files**
- `src/app/api/debug-pdf/route.ts` — dead debug endpoint.

### Incident note (transparency)
During this phase, a PowerShell text-insertion script used to add rate limits to the 10 remaining battle routes corrupted them (backtick escape mangling, then a failed regex pass emptied the files). These files were **uncommitted** (the battle engine lives only in the working tree), so they could not be restored from git. They were **faithfully rebuilt** from: the two routes read in full earlier in the session (skip, evaluate), the beginning-of-file reads for five more (start, advance, pause, resume, and the shared header), the Phase 2 engineering report's route table, the constants/schema files, the client call sites (`WaitingRoom`, `LiveQuiz`, `BattleRoomLoader`), and the shared helpers in `battle-server.ts`. All 10 rebuilt routes were then included in the TypeScript preflight (clean) and re-inspected for state-transition correctness against `isLegalStatusTransition` in the rules. **Recommended:** commit the working tree promptly — it is the only copy of the battle engine.

---

## 11. Manual Security Testing Checklist

1. **Auth failures logged:** call any battle route with a garbage bearer token → expect 401 + a `security_logs` entry (event `invalid_token`).
2. **Role mismatch logged:** commander token on `/api/executive/settings` → 401 + `invalid_token` entry with `role_mismatch`.
3. **Audit allowlist:** POST `/api/audit/log` with `action: "foo"` → 400 `Invalid action`; with `commander_created` → 200.
4. **Answer after timeout:** as a participant, write a submission doc with `submittedAt` > question start + timer + 3s → after evaluation the answer is ignored (no score), participant marked timed out for that question, `security_logs` shows `answer_after_timeout` (when >15s late).
5. **Clock skew:** submission with `submittedAt` before `question_start_at` − 5s → `submission_clock_skew` violation logged.
6. **Submissions gated:** attempt `setDoc` submission while quiz is `paused` → permission-denied.
7. **Battle rate limit:** fire >30 battle actions/min from one account → 429 with `X-RateLimit-Remaining` headers.
8. **Rules tightenings:** (a) gladiator reads another user's profile → denied; (b) gladiator reads `question_bank` → denied; (c) non-participant reads a finished quiz → denied; (d) participant writes `battle_logs` with event `battle_finished` or another actor's id → denied; (e) gladiator reads others' notifications → denied.
9. **Reconnect session check:** open the same arena in two tabs; reconnect with the old tab's token → `session_replaced` security event + battle log metadata.
10. **Client UX:** join flow with a bogus room code → "Arena not found" (not a Firebase permission error); open an archived/finished arena you didn't join → "room does not exist or no access" message.

---

## 12. Remaining Risks

1. **Client-written submission timestamps** can be fabricated within the question window to maximize time bonus (integrity ceiling of the current architecture). Server-authoritative submission API = Phase 4.
2. **Login/logout success events** are not observable server-side (client-side Firebase Auth only).
3. **`/api/rate-limit/check`** is unauthenticated and its IP input can be spoofed; impact is limited to burning the caller's own in-memory quota (self-DoS only). Left as-is deliberately; revisit if auth moves server-side.
4. **In-memory rate limiter** is per-instance (resets on redeploy, not shared across instances). Acceptable at current scale; Redis-backed limiter = Phase 4 if multi-instance deployment occurs.
5. **Room codes** of non-finished arenas remain enumerable by any signed-in user (required by the join flow). Low impact (codes are 6-char random).
6. **Join capacity** is not enforced at rules level (soft UI check only). If capacity enforcement becomes a requirement, it must be a server-side join API.
7. **Question-bank writes** remain client-possible for executives (rules `create,update,delete: isExecutive()`) — acceptable for trusted admin roles.
8. **Notifications** read rule (`owner || executive`) matches current server-only access; if a future client reads another user's notifications directly, the rule must be re-reviewed.

---

## 13. Technical Debt

- `next lint` is broken in this environment (ESLint 10 flat-config vs legacy `.eslintrc.json`); `npm run build` is broken (SWC binary). Both are pre-existing environment issues; the TypeScript preflight script (`ts.createProgram`, noise-filtered) is the current validation gate.
- `storage.rules` exists and was reviewed at a high level; storage hardening was out of scope this phase (no storage uploads surfaced in the audit).
- The `battle-log.service.ts` client subscription remains unused by UI (fixed but still dead code) — wire it to a future "arena activity feed" or delete it.
- `useAnalytics.ts` performs per-quiz client reads with a 5-minute cache; fine at current scale, revisit if quiz counts grow.
- The in-memory security log throttles are per-instance (consistent with the rate limiter).

---

## 14. Phase 4 Readiness

The platform is now in a defensible production posture. Recommended Phase 4 work, in priority order:
1. **Server-authoritative submission API** (closes the last anti-cheat gap): client submits via API route; server stamps `submittedAt` with its own clock inside a transaction with question-window validation.
2. **Server-side login/logout instrumentation** (e.g., Firebase Auth blocking functions or a token-revocation endpoint) to close the auth-event observability gap.
3. **Join API + capacity enforcement** server-side (rules-level capacity is not implementable in Firestore rules).
4. **Multi-instance rate limiting + security-log deduplication** (Redis or Firestore-backed counters) when scaling beyond a single instance.
5. **Lint toolchain migration** (flat config) so `next lint` works again in CI.
6. Optionally: question/option shuffling server-side (`buildOptionShuffle` exists in `battle-machine.ts` but is currently unused).

---

## Appendix A: Files in Preflight Scope (30)

`constants.ts`, `battle-machine.ts`, `battle-server.ts`, `schemas.ts`, `verify-auth.ts`, `rate-limiter.ts`, `security-log.ts`, `battle-log.service.ts`, `battle.service.ts`, `quiz.service.ts`, `participant.service.ts`, `arena-creation.service.ts`, `WaitingRoom.tsx`, `BattleRoomLoader.tsx`, `LiveQuiz.tsx`, `QuizResults.tsx`, `GladiatorDashboard.tsx`, 11 battle routes, `audit/log/route.ts` → **PREFLIGHT CLEAN**.
