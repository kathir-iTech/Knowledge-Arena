# Quorena — Security

**Last updated:** 2026-09-15 (Hardening Sprint: server-gated submission pipeline, transactional idempotency, nonce-based CSP, rules lockdown)

This document is the single source of truth for how Quorena's security
boundaries work today and what they guarantee. It supersedes any older prose in
`ARCHITECTURE.md` / `API.md` describing direct client Firestore writes.

---

## 1. Threat model (what we defend against)

| Attack | Vector | Defense |
|---|---|---|
| Cheat: answer-key exfiltration before an answer | Reading `answerKeys/{qid}` while `live` | Rules: keys readable by gladiators only after `finished`; `matched` authors never read them during live play |
| Cheat: forged / self-scored submission | Client write to `quizzes/{id}/questions/{q}/submissions/{uid}` | **Client creation locked (`allow create: if false`)**; submissions written ONLY by the server via `POST /api/battle/submit` (Admin SDK) |
| Cheat: double answer / overwrite between double-taps | Two in-flight `set()` calls to the same submission doc | **Atomic one-shot idempotency** — subject + write in one Admin-SDK transaction; the loser of a race gets `alreadySubmitted: true` and never overwrites |
| Cheat: answering the wrong/closed question | Client-supplied `questionId` | **Server-verified current-question binding inside the transaction** (per-participant shuffled order or `sort_index` vs current index) |
| Replay / tamper of a captured request | Re-posting a captured `POST /api/battle/submit` body | **HMAC-SHA256 signature** bound to payload + per-battle session key; timing-safe compare; fresh-`clientTime` window; per-nonce |
| Impersonation | Forging `user_id` in a submission | Server uses the verified `auth.uid`, never the client-supplied id, for the submission doc path and key derivation |
| Rogue content authored by participants | Gladiator writing `questions`/`answerKeys`/`config` | Rules `created_by` fallback now **role-gated to commander/executive** |
| Mid-battle scoring tampering by a host | Exec/creator editing `config/settings.scoring_config` while live | Rules: `config` is immutable from clients once status ∈ {live, paused, finished, archived, abandoned} |
| Script injection / data exfiltration | Any stored XSS on a page | **Strict nonce-based CSP** injected by middleware with per-request nonces; locked `connect-src`; `frame-ancestors 'none'` |

## 2. Submission pipeline (the new reality)

```
Gladiator tap
   │
   ▼
submissionService.submitAnswer(client)            src/services/game.service.ts:264
   │  sign: HMAC-SHA256(sessionKey, canonical payload)  src/lib/submit-answer.ts
   ▼
POST /api/battle/submit { quizId, questionId, selectedOption, nonce, clientTime, signature }
   │
   ▼
 1. verifyFirebaseTokenWithAnyRole(gladiator|commander)
 2. rate limit  battle:submit:<uid>  (30/60s, BATTLE_ACTION_PER_USER)
 3. payload shape + freshness (SUBMIT_CLOCK_SKEW_TOLERANCE_MS=5000)
 4. sweepStaleLiveArena (zombie live arenas → abandoned)
 5. participant session_token → recompute HMAC → timingSafeEqual verify
 6. ONE Admin-SDK transaction:
      • quiz status still 'live'
      • participant exists, not blocked/finished
      • no prior submission (→ ok, alreadySubmitted)
      • current-question binding re-verified
      • t.set(submission) with server Timestamp
   │
   ▼
{ ok: true } | { ok: true, alreadySubmitted: true } | 4xx error
```

**Client Firestore writes to submissions are dead.** The rules deny
`create`/`update` on the submissions path entirely; `read` (owner/creator
/executive) and creator `delete` (waiting-arena cleanup) remain.

## 3. Cryptographic payload signing (`src/lib/submit-answer.ts`)

- **Canonical message** (order-stable): `quizId | questionId | selectedOption | nonce | floor(clientTime)`.
- **Key** bound to session + participant + arena:
  `quorena:submit:<quizId>:<userId>:<sessionToken>` where `sessionToken` lives
  on `participants/{uid}.session_token` (minted at join, mirrored to
  `sessionStorage` via `getSessionToken`).
- **Algorithm:** Web Crypto HMAC-SHA256 (browser sign / Node 20+ verify, same
  import path — no Node-only crypto in shared lib).
- **Verify:** constant-time compare (`timingSafeEqual`) of hex buffers.
- **Freshness:** payload dies once `|Date.now() − clientTime| > 5000ms` (cheap
  replay window).
- **Nonce:** 8–128 chars, randomized; binds the signature to exactly one payload.

**Honest boundary (documented in code):** the key material is the
client-visible session token, so a gladiator can always sign their OWN
requests — this layer is **payload-integrity + replay/impersonation defense,
not zero-knowledge or anti-self-cheat.** The hard anti-cheat boundary is the
server-only write path: live-only acceptance, current-question binding, and
one-shot idempotency are enforced server-side regardless of the signature.

## 4. One-shot idempotency (`src/app/api/battle/submit/route.ts`)

The existence check and the write happen inside a single `db.runTransaction`.
When two requests race on the same submission doc, Firestore retries the
losing transaction, which then observes the winner's committed write and
returns `{ ok: true, alreadySubmitted: true }` — a graceful no-op, never a
hard error and never a silent overwrite of a prior answer. The client treats
this as success, so double-taps and post-timeout retries recover cleanly.

## 5. Transport & content security

### HTTP headers (`next.config.ts` `headers()`)
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`,
`Strict-Transport-Security` (1y, includeSubDomains, preload),
`Permissions-Policy` (camera/microphone/geolocation/interest-cohort denied),
`poweredByHeader` off.

### CSP (`src/middleware.ts` → nonce → `src/app/layout.tsx`)
- A per-request nonce is generated in middleware, injected as a request header
  (`x-nonce`) and response header, and the strict policy is emitted both ways.
- `script-src 'self' 'nonce-<n>' 'strict-dynamic'` (plus `'unsafe-eval'` in dev
  only); `style-src 'self' 'unsafe-inline'`; locked `connect-src` (Firebase
  surface, `ws://*.firebaseio.com`, emulator origins in dev);
  `img-src` allowlist; `object-src 'none'`; `frame-ancestors 'none'`;
  `base-uri 'self'`; `form-action 'self'`; `upgrade-insecure-requests` in prod.
- `await connection()` in the root layout forces per-request rendering so
  Next's inline hydration/bootstrap scripts carry the nonce the header demands.
- **PPR guard:** `experimental.ppr` is pinned `false` with a comment. A PPR
  static shell would bake framework scripts WITHOUT a nonce, which this policy
  would block — do not re-enable it without reworking the nonce flow.

## 6. Firestore rules lockdown (`firestore.rules` ← `firestore.rules.template`)

Regenerate with `npm run rules:generate`. Highlights:

| Path | Rule |
|---|---|
| `questions/{qid}`, `answerKeys/{qid}`, `config/{doc}` create (created_by fallback) | also requires `request.auth.token.role in ['commander','executive']` (token claim — no extra `get()`) |
| `config/{doc}` update | creator/executive only, only while arena NOT started |
| `submissions/{uid}` | `create`/`update` locked; `read` self/creator/exec; `delete` creator |

## 7. Known limitations

1. HMAC key = client-visible session token (payload-integrity, not secrecy) — see §3.
2. `config` edit guard costs one extra `get()` in rules (still inside the
   batch get budget because ownership is carried by the `created_by` fallback).
3. Gladiator reveal of `questionStats.correctOptionIndex` occurs only after the
   server has evaluated the question — intentional and unchanged.
4. The rules still contain the legacy `isCurrentQuestion` / `isNotBlocked`
   rule functions (now unused by any `allow`); they are dead-but-valid helpers.

## 8. Verification

- `npm run typecheck` — clean.
- `npm run build` — clean; all pages render `ƒ (Dynamic)` (nonce boundary).
- `npm run lint` — runs (ESLint 9 + `eslint-config-next@15` + strict ruleset in
  `.eslintrc.json`, i.e. `no-explicit-any`, `no-unused-vars`, `no-console`,
  `react-hooks/exhaustive-deps`). The hardening-sprint delta is lint-clean; the
  wider legacy codebase still carries a pre-existing backlog of explicit `any`
  annotations, which is tracked as a dedicated cleanup item.

## 9. Related files

- `src/lib/submit-answer.ts` — HMAC/canonicalization/freshness/nonce helpers.
- `src/app/api/battle/submit/route.ts` — the only submission write path.
- `src/services/game.service.ts` (`submissionService.submitAnswer:264`) — client signer.
- `src/services/battle.service.ts:24` — session-token minting.
- `src/lib/battle-server.ts` — `loadQuizDoc`, `sweepStaleLiveArena`, `battleErrorResponse`.
- `src/middleware.ts`, `src/app/layout.tsx`, `next.config.ts` — header/CSP/PPR boundary.
- `firestore.rules.template` (+ generated `firestore.rules`) — rules lockdown.
- `SECURITY_NOTES.md` — dependency posture + crypto workflow notes.