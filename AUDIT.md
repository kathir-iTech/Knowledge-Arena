# Quorena — Live Audit (Phase 113)

**Date:** 2026-09-03
**Commit:** `2dab742` (Phase 113C) + `7f88495` (Phase 113B)
**Auditor:** Phase 113 (full repo audit, PDF Forge final resolution)
**Status:** This is the current source of truth. Supersedes `FINAL_PROJECT_REPORT.md` (2026-07-31, stale) and `AUDIT.md` (deleted 2026-07-14) which were caught stale in Phase 108/109.

---

## 1. What was re-verified (Tier 1 — Phase 112 fixes)

All Tier 1 fixes were re-traced file:line and **still hold** after Sept 1-2 PDF debugging (which only touched `generate-quiz-pdf-flow.ts`):

**Transaction anti-patterns (5):**
- `src/services/game.service.ts:111-192` `evaluateQuestion` — batch for `createQuestions`, and per-participant `transaction.get()` inside `runTransaction`. Collection `getDocs` is via non-transactional `getDocs` inside tx (unavoidable — Firestore client `transaction.get(query)` not supported for collection queries; individual doc reads are transactional). **TRACED** — still holds, with noted SDK limitation.
- `src/lib/battle-server.ts:253-298` `finishBattle` — transaction only updates quiz status, no participant N+1 inside. **CONFIRMED** — `src/lib/battle-server.ts:261-276` has no participant loop.
- `src/lib/battle-server.ts:382-491` `advanceQuestion` — participants fetched via `tx.get(partsCol)` inside transaction on `ended` path (`src/lib/battle-server.ts:424`). **CONFIRMED** — still inside tx.
- `src/services/quiz.service.ts:199-241` `resetQuiz` — entire delete + status update wrapped in single `runTransaction` with all reads via `transaction.get`. **CONFIRMED** — `src/services/quiz.service.ts:199`
- `src/services/quiz.service.ts:300-384` `duplicateQuiz` — new-ID allocation + batch creation wrapped in `runTransaction` with re-check of ID availability inside. **CONFIRMED** — `src/services/quiz.service.ts:325`

**Security/auth (4):**
- `src/app/api/battle/auto-advance/route.ts:68-72` — no longer trusts client `commanderAbsentSinceRef`; relies only on RTDB `presence/{quizId}/{commanderUid}` missing. **CONFIRMED** — still holds, comment at `68-72`.
- `src/app/api/battle/evaluate/route.ts:39-43` — question ownership check (`questionExists` via `quizRef.collection(questions)`). **CONFIRMED** — `src/app/api/battle/evaluate/route.ts:39-43`
- `src/lib/verify-auth.ts:80-110` — **REGRESSION FOUND AND FIXED in Phase 113C**: `verifyFirebaseTokenWithRole` previously skipped `mustChangePassword` when `customClaims.role` was present (would bypass forced password change). Fixed to always check `mustChangePassword` via Firestore (cached). `verifyFirebaseTokenWithAnyRole` was always correct. **CONFIRMED after fix** — `src/lib/verify-auth.ts:80-110`
- `src/lib/rate-limiter.ts:14-97` — per-entry `windowMs`, cleanup on every check, IP extraction leftmost `parts[0]`. **CONFIRMED** — `src/lib/rate-limiter.ts:27-28,58,97`

**Firestore rules — full table (fresh, not trusting prior):**

| Collection | Operation | Rule | Code path that writes it | Verdict |
|------------|-----------|------|--------------------------|---------|
| `users/{uid}` | read | `isOwner(uid) \|\| isExecutive()` | `AuthContext`, `user-detail` | ✅ Least-privilege — commanders cannot enumerate roster client-side; cross-user reads via Admin SDK |
| `users/{uid}` | create | `isOwner && role=='gladiator' && isAllowedGladiatorEmail && keys.hasOnly([...])` | Gladiator self-signup | ✅ No privilege escalation |
| `users/{uid}` | update | `isOwner && diff.hasOnly(['name','avatar','onboarding_complete'])` | Profile edit | ✅ Role/email immutability server-only |
| `quizzes/{quizId}` | read | `isExecutive \|\| canReadArena \|\| (isCommander && !exists) \|\| resource.created_by==uid \|\| status in ['waiting','ready']` | Commander collision check, list queries | ✅ Listeners handle `resource` checks for list queries |
| `quizzes/{quizId}` | create | `isSignedIn && (commander\|\|executive) && created_by==uid` | `arena-creation.service` | ✅ |
| `quizzes/{quizId}` | update | `isLegalQuizUpdate` (whitelist fields + `isLegalStatusTransition`) | Commander battle control | ✅ Mirrors `constants.ts` |
| `quizzes/{quizId}/questions/{qid}` | read | `canReadArenaContent` (creator/participant/executive) | Battle live | ✅ Questions not exposed to non-participants even if arena is open |
| `quizzes/{quizId}/answerKeys/{qid}` | read | `isExecutive \|\| isQuizCreator \|\| (status=='finished' && participant)` | Post-battle | ✅ |
| `quizzes/{quizId}/participants/{uid}` | read | `isExecutive \|\| canReadArena` (open arena allows pre-join roster) | Waiting room | ✅ |
| `quizzes/{quizId}/participants/{uid}` | create | `isOwner && isNotBlocked && keys.hasOnly([...]) && getAfter(status in ['waiting','ready'])` | Commander batch + Gladiator join | ✅ `getAfter` handles atomic batch |
| `quizzes/{quizId}/config/{docId}` | read | `canReadQuizConfig` (creator/participant/executive) | Battle server via Admin SDK | ✅ scoring_config never leaked to non-participant via parent doc |
| `question_bank/{qid}` | read | `isExecutive \|\| isCommander` | Commander AI import source | ✅ Gladiators never read directly |
| `platform_settings/{doc}` | read/write | `isExecutive` | Executivo settings | ✅ |
| `conversations/{conv}` | read | `participants.hasAny([uid])` | Messaging | ✅ |
| `notifications/{id}` | read | `isOwner(resource.userId) \|\| isExecutive` ; write `false` | Server via Admin SDK | ✅ |
| `battle_logs/{id}` | read | `isExecutive \|\| isQuizCreator(quizId) \|\| isQuizParticipant` | Timeline | ✅ |
| `ai_logs`, `security_logs`, `auditLogs` | read | `isExecutive`; write `false` | Server-only | ✅ |
| `/{path=**}/participants/{uid}` (collection group) | read | `auth.uid == userId` | Gladiator history | ✅ The flagged Phase 112 collection-group rule — **TRACED and still necessary**: it enables `collectionGroup('participants').where('user_id','==',uid)` for history; scoped to `request.auth.uid==userId` so it does NOT widen access (user can only read their own participant docs across quizzes). No bypass to other users. |

No new rule gaps found.

---

## 2. Tier 2 — First Real Audit: AI Surface

**AI Copilot (`src/app/api/copilot/route.ts:7-9`, `src/ai/flows/copilot-flow.ts:128-180`):**
- Endpoint `POST /api/copilot` requires auth (`idToken`), rate limit 10/min per IP at route + 10/min per UID inside flow. **TRACED** — dual layer. Inconsistent vs other AI routes? All three (copilot, mindmap, explanation) have same dual IP+UID pattern, so copilot **was** covered by Phase 101 audit — **TRACED, still holds**. Flag: IP bucket shared across NAT users could false-positive; UID bucket is the correct per-user limit.

**Advanced scoring (`src/lib/battle-machine.ts:57-91`, `src/lib/battle-server.ts:546-675`):**
- Zero submissions: `evaluateQuestionForAll` builds `plans[]` only from existing `subSnap`, so zero submissions → empty plans → only `scored=true` mark, no score changes. **TRACED** — handled.
- Tie: `notifyBattleCompleted` sorts `score` desc and assigns `rank=i+1` sequentially — ties get distinct ranks (no shared rank). **TRACED** — product decision, not crash, but should be documented as "strict ranking" vs "shared rank".
- No correct answer: `correctIndex` may be undefined; `sub.selected_option === undefined` never true, so no one scored. **TRACED** — no crash, but question with missing answerKey throws `Answer key not found` earlier (good).
- Negative marking: `governance.negative_marking` only gates `wrong_penalty`, not `skip_penalty`. Skip still penalizes even when negative marking off. **TRACED** — potential UX inconsistency; flagged.

**Mind maps (`src/app/api/quiz/mindmap/route.ts`, `src/ai/flows/mindmap-flow.ts`):**
- **Before fix:** No caching — every request hit Gemini, even for identical quiz content (cost/quota). **Fixed in Phase 113C:** per-quiz content-hash cache (`ai_mindmaps` collection via Admin SDK, SHA256 of `quizId:title:questions`, `cached:true` on hit). **CONFIRMED** — `src/app/api/quiz/mindmap/route.ts:1,57-78`
- Graceful degradation: route returns 401/429/504 with JSON `{ error }` and `Retry-After`; flow returns `error` string for Gemini failure, not blank. **TRACED** — `src/ai/flows/mindmap-flow.ts:134-182` logs and returns error, route maps to status codes. Phase 75 standard met.
- **After fix:** `npx tsc` clean, `build` 94 pages LastExit 0.

**AI explanations (`src/app/api/quiz/explanation/route.ts`, `src/ai/flows/explanation-flow.ts`):**
- Caching: `ai_explanations` collection with `sha256(questionId:wrongOptionIndex)` stable ID, Admin SDK, `cached:true` on hit. **CONFIRMED** — `src/app/api/quiz/explanation/route.ts:10,32-38,80-89`
- Graceful degradation: same 401/429/504 mapping, not blank. **CONFIRMED**.

**key-resolver (`src/ai/key-resolver.ts:1-426`):**
- All keys rate-limited simultaneously: `getGeminiApiKey` computes `minRemaining`, waits bounded `MAX_WAIT_MS=15s` if shortest cooldown ≤15s, else throws `ALL_GEMINI_KEYS_EXHAUSTED` with `~N s`. **TRACED** — handles, never hangs indefinitely.
- Race condition: two concurrent `getGeminiApiKey` could both read same `roundRobinIndex` before increment, return same key, both hit 429. No lock. **TRACED** — minor, not exploitable, just extra quota hit. Flagged but not fixed (requires mutex; low risk on free tier).
- Permanently-invalid key: **BUG FOUND AND FIXED in Phase 113C**: previously `isAuthError` was not marked as cooldown, so invalid key retried forever across models. Fixed to mark 24h cooldown and rotate to next key in all 4 AI flows + `withGeminiKeyRotation` central helper. **CONFIRMED after fix** — `src/ai/key-resolver.ts:369-407`, `src/ai/flows/*`

**Global search (`src/app/api/executive/search/route.ts`, `src/app/api/commander/search/route.ts`, `src/app/api/gladiator/search/route.ts`) and Question Bank import (`src/app/api/executive/question-bank/route.ts`):**
- Executive search requires `executive` role, scans all collections but scoped to executive's own notifications via `where('userId','==',auth.uid)` for notifications; other collections are executive-only data. **TRACED** — correctly scoped.
- Commander search: `where('created_by','==',auth.uid)` — only own arenas. **CONFIRMED** — `src/app/api/commander/search/route.ts:25`
- Gladiator search: `collectionGroup('participants').where('user_id','==',auth.uid)` → then `getAll` only those quizIds. **CONFIRMED** — `src/app/api/gladiator/search/route.ts:26-45` — cannot search into another Commander's unpublished question bank; question_bank not even queried in gladiator search.
- Question Bank import: `POST /api/executive/question-bank` requires `executive` only, validates `text≥5`, `options≥2`, `correctAnswerIndex` in range, uses `batch`. **CONFIRMED** — `src/app/api/executive/question-bank/route.ts:68-101` — no gladiator/commander bypass.

**Executive command-center (`src/components/executive/command-center/*`):**
- `CommandCenter.tsx:82-220` uses live `onSnapshot` for `quizzes where status in ACTIVE_BATTLE_STATUSES`, and per-battle `subscribeToParticipants` + `subscribeToQuestions`. Derived `sortedBattles` via `useMemo` from live state. **CONFIRMED** — not stale/hardcoded; data is live with 1s `now` clock and real listeners.

---

## 3. Tier 3 — Consistency & Doc Hygiene

- **AUDIT.md** — deleted 2026-07-14; recreated now as this file (live). Previous `FINAL_PROJECT_REPORT.md` dated 2026-07-31 claimed `pdfreader` for PDF parsing (now `pdfjs-dist`), and that `npm run build` failed due to SWC binary (now passes). **Fixed:** `FINAL_PROJECT_REPORT.md` now has deprecation notice pointing here; `AUDIT.md` is source of truth.
- **WEBSITE_AUDIT.md** (Phase 108) — still valid for its scope (240+ elements, 3 auto-fixes). Not deleted; header now notes "Phase 108 scope; PDF Forge re-audited in Phase 113".
- **Quorena rename (Phase 71):** `grep -r "Knowledge Arena" src/` → 0 hits. User-facing `src/app/layout.tsx:11,12` and `src/app/manifest.ts:3,4` are `Quorena`. Remaining `Knowledge Arena` hits are only in `*.md` docs (historical) — **CONFIRMED complete** for user-facing.
- **public/icons:** `icon-192.png` 6783 bytes, `icon-512.png` 24847 bytes, both valid `%PNG` headers. `icon.svg` present. **CONFIRMED** — `public/icons/` valid.
- **/manifest.webmanifest:** `src/app/manifest.ts` returns valid JSON (`name: Quorena`, `icons` with 192/512). `src/middleware.ts:26` explicitly allows `pathname === '/manifest.webmanifest'` (Phase 79 fix). Matcher excludes `icons/*`. **CONFIRMED** — not HTML redirect.

---

## 4. Build & Type Evidence

```
$ npx tsc --noEmit
(no output — clean)

$ npm run build
> quorena@0.1.0 build
> cross-env NODE_ENV=production next build
  ▲ Next.js 15.5.20
  Compiled with warnings in 44s (OTEL expression warning only)
  Checking validity of types ...
  Generating static pages (94/94)
  Route (app) — 94 routes, First Load JS 103 kB
  Middleware 32.6 kB
  LastExit: 0
```

Warnings are only `@opentelemetry/instrumentation` expression (dev) — not errors.

---

## 5. PDF Forge — Final Resolution (Step 1)

See `src/ai/flows/generate-quiz-pdf-flow.ts:597-628` fix. Root cause: `GlobalWorkerOptions.workerSrc = 'pdf.worker.mjs'` is a bare specifier rejected by Node ESM ("Cannot find package 'pdf.worker.mjs'"). Fix resolves absolute `file://` URL via `require.resolve` + `pathToFileURL`, fallback to `./pdf.worker.mjs` (relative to `pdf.mjs`). DOMMatrix/Path2D polyfill untouched. Verified locally with 3 real PDFs:

- **Multi-page text-only (3 pages)** — extracted `Page One Hello World | Page Two Quorena ... | Page Three Battle Engine...` — **CONFIRMED**
- **PDF with embedded 1×1 image + text** — extracted `Hello With Image` — **CONFIRMED**
- **Image-only (scanned) 1 page** — correctly `isImageOnly=true` → throws `PDF_IMAGE_ONLY` distinct error — **CONFIRMED**

Vercel still **UNVERIFIED** until live upload tested on production (required by ground rules). Local `build` externalizes `pdfjs-dist` correctly (`next.config.ts:25`).

---

## 6. Plain-Language Summary

- **PDF Forge actually fixed and proven on production?** Locally **YES** (3 PDFs, tsc+build clean). On Vercel **NO — UNVERIFIED** (needs live upload on https://... via AI Forge; historical "works locally / fails on Vercel" pattern requires that).
- **Full end-to-end loop confirmed?** **NO — UNVERIFIED** (the continuous Playwright run covering Executive → Commander → PDF Forge → publish → Gladiator join → battle → leaderboard → mind map → explanation → history was not yet run against a real deployed environment in this phase; required for Step 4).
