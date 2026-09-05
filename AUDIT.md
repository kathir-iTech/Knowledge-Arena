# Quorena — Live Audit (Phase 114)

**Date:** 2026-09-04
**Commit:** `08a684f` (T2) + `29996f5` (T1C), building on `2dab742`/`7f88495` (Phase 113)
**Auditor:** Phase 114 (production verification, key-resolver/scoring/rate-limit, dependency cleanup, UI sweep)
**Status:** This is the current source of truth. Supersedes `FINAL_PROJECT_REPORT.md` (2026-07-31, stale) and `AUDIT.md` (deleted 2026-07-14) which were caught stale in Phase 108/109.

---

## 0. PDF/Document Forge rebuild + remaining-issue sweep (Phase 116)

**Date:** 2026-09-05
**Commits:** `933b348`, `12bf722`, `01e0026`, `6d08728`, `89c7199`, `e7efbd4` (all pushed to `main`)
**Verdict:** See the Part 7 report in the session log. Live-site verification (Part 5 battery) still pending on deployed Vercel.

**Root cause (CONFIRMED):** The Forge base64-encoded each uploaded file in the browser and sent it whole via a Next server action. Vercel Functions cap request bodies at ~4.5 MB, and base64 inflates files by ~33% — a 4.44 MB PDF became ~5.92 MB of base64 → `413 FUNCTION_PAYLOAD_TOO_LARGE`. Next's `serverActions.bodySizeLimit: '20mb'` was not the limiter; `vercel.json` `maxDuration` was a secondary factor. The server's 10 MB decoded-size guard could never see a platform-level rejection.

**Fix (Part 2/3):** `src/lib/prepare-documents.ts` extracts PDF/DOCX/TXT/MD text in the browser (pdfjs + fflate), renders scanned pages to bounded JPEGs, and caps the derived payload (`MAX_TEXT_CHARS=40000`, `MAX_TOTAL_IMAGES=24`, `MAX_SCANNED_PAGE_IMAGES=6`). Server-side `generateQuizFromExtracted` (`src/ai/flows/generate-quiz-pdf-flow.ts`) guards `MAX_EXTRACTED_IMAGES=24` / `MAX_EXTRACTED_TEXT_CHARS=500000`, reuses the shared `generateContentFromExtracted` core, and the legacy `generateQuizFromPDF` flow delegates to it. Both wizard regeneration paths now send extracted documents.

**Audit resolutions:**

- **6.1 — rules single source (CONFIRMED).** `firestore.rules` is regenerated verbatim from `firestore.rules.template` by `npm run rules:generate` (`scripts/generate-firestore-rules.js`); the predeploy hook in `firebase.json` runs it. Template is the single source of truth.
- **6.2 — waiting-room staleness (FIXED).** `GladiatorSidebar.tsx` used the 3-hour `QUIZ_ABANDONED_AFTER_MS` for waiting (lobby) arenas too, trapping logout behind an idle lobby. Added `QUIZ_WAITING_ABANDONED_AFTER_MS` (30 min) in `src/lib/constants.ts`; waiting arenas now release the lock after 30 min, `live` stays at 3 h. Also added the `created_at.toMillis()` fallback the `live` branch already had.
- **6.3 — token email vs doc email (SYNCED + documented).** The join gate rule uses `request.auth.token.email` (authoritative). The friendly client pre-check in `participant.service.ts:joinQuiz` read the Firestore `users/{uid}` doc `email` — a potential divergence source. Now it reads `auth.currentUser.email` — the same ID-token identity the rule evaluates — and only falls back to the doc email if the token email is absent. Accepted inconsistency (documented): the `users/{uid}.email` field is written once at profile creation, is server-only after that (update rule whitelists only `name`/`avatar`/`onboarding_complete`), and admin-SDK-created accounts may intentionally carry a different address; no client path can mutate it to bypass the domain gate.
- **6.4 — grounded sweep (3 fixes).**
  1. `prepare-documents.ts`: direct images were double-counted against `MAX_TOTAL_IMAGES` (incremented in the `image` case AND by the shared per-file accumulator) — effectively halved the image cap. Removed the duplicate increment.
  2. `prepare-documents.ts`: scanned-PDF JPEGs bypassed `MAX_TOTAL_IMAGES` entirely (they were only per-file capped at 6); a pile of scanned PDFs could exceed the 24-image server budget. `extractPdfFile` now receives the remaining image slots and caps accordingly.
  3. `prepare-documents.ts`: pdfjs `page.render()` was given a `{width,height}` copy instead of the real viewport; the renderer reads the viewport's transform matrix. Now passes the real viewport.
  Also removed dead `batchCount` in `arena-creation.service.ts`.
- **Known/accepted:** the vision path (`generatePromptWithImages`) uses only `chunks[0]` for text alongside images. Harmless today because the browser path caps extracted text at 40 000 chars (a single chunk); noted so a future client cap raise does not silently drop content for text+image requests.

**Blocked while sandboxed:** literal production status/log capture and the Part 5 test battery (6 cases) require Vercel credentials/deployed site — to be run by the project owner on the live environment after deploying `main`.

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

## 2. Storage Dependency Note

- **Storage backend**: This project uses local file-based processing only. Firebase/Blob storage integration is not implemented.  
  Running `firebase deploy --only storage` on a Spark/Free tier project will fail because Storage requires a Blaze plan.  
  **Recommendation**: Remove `storage` from the firebase deploy command and add this note to future deploy scripts to avoid confusion.

- **AUDIT.md** — updated with this finding (see section above).

See `src/ai/flows/generate-quiz-pdf-flow.ts:597-628` fix. Root cause: `GlobalWorkerOptions.workerSrc = 'pdf.worker.mjs'` is a bare specifier rejected by Node ESM ("Cannot find package 'pdf.worker.mjs'"). Fix resolves absolute `file://` URL via `require.resolve` + `pathToFileURL`, fallback to `./pdf.worker.mjs` (relative to `pdf.mjs`). DOMMatrix/Path2D polyfill untouched. Verified locally with 3 real PDFs:

- **Multi-page text-only (3 pages)** — extracted `Page One Hello World | Page Two Quorena ... | Page Three Battle Engine...` — **CONFIRMED**
- **PDF with embedded 1×1 image + text** — extracted `Hello With Image` — **CONFIRMED**
- **Image-only (scanned) 1 page** — correctly `isImageOnly=true` → throws `PDF_IMAGE_ONLY` distinct error — **CONFIRMED**

Vercel still **UNVERIFIED** until live upload tested on production (required by ground rules). Local `build` externalizes `pdfjs-dist` correctly (`next.config.ts:25`).

---

## 5b. Phase 114 — Key-resolver race, scoring copy, rate-limiting, deps

**Tier 1A — key-resolver cooldown-wait race (re-opened):** `src/ai/key-resolver.ts:294-326`. After `await sleep(minRemaining)` (`:296`), all index/cool-down-modifying code (`:298-324`) is **synchronous** (only `Date.now()` and in-memory `cooldowns.get`/`keys.indexOf`, no further `await`). Node's single-threaded event loop serializes them, so a waiter cannot interleave with a competing `getGeminiApiKey` between its sleep-return and its round-robin write. Per-instance in-memory state means there is also no cross-instance claim. **CONFIRMED — no race; no change.**

**Tier 1B — "Wrong answers subtract points" copy vs skip_penalty:** `src/components/quiz/AdvancedGovernanceSection.tsx:124-125` UI copy states "Wrong answers subtract points". `battle-machine.ts:57-91` gates `wrong_penalty` under `negative_marking` but applies `skip_penalty` independently. UI copy agrees with the code's negative-marking contract, so **no fix** — `skip_penalty` is an independent, correctly-documented setting, not a UI/code mismatch. **TRACED — designed behavior.**

**Tier 1C — UID-based rate limiting (FIXED):** `copilot`, `quiz/mindmap`, `quiz/explanation` routes previously rate-limited by `getClientIp(req)`, which would throttle an entire college behind one shared NAT IP. Now they `verifyFirebaseToken` first, then rate-limit per `auth.uid`. **CONFIRMED** — `src/app/api/copilot/route.ts:20-26`, `src/app/api/quiz/mindmap/route.ts:16-20`, `src/app/api/quiz/explanation/route.ts:20-24`. `getClientIp` remains IP-based only where IP is the correct key (`clock`, `rate-limit/check`, `admin/users`).

**Tier 2 — dependency cleanup + security (DONE):** Removed 6 dead deps (radix accordion/menubar/popover/progress, @vercel/speed-insights, react-is — zero `src/` imports). Bumped `next` 15.5.9→15.5.20. Added safe audit overrides (brace-expansion 2.1.4, fast-uri 3.1.6, nanoid 3.3.18, fast-xml-parser 5.10.1, ip-address 10.3.1) — all cleared from `npm audit`. Remaining 68 vulns are gated behind firebase-admin→@google-cloud, genkit→OTEL, and next→sharp chains; `npm audit fix` hangs on them. See `SECURITY_NOTES.md`. **CONFIRMED.**

**Tier 3D — arena/notify fan-out:** `src/app/api/arena/notify/route.ts:23-59` — 1 read (gladiators query) + N writes (per-gladiator `notificationService.create`, chunked concurrency 20), with a 500-gladiator hard cap (`:32-35`). Inherent fan-out; bounded and guarded. **TRACED — accepted, no change.**

**Tier 4 — UI regression sweep (46 routes, grouped T4-1..T4-6):** All groups share the same static + responsive results. **Palette — CLEAN:** the app uses only semantic CSS variables (`--primary` 15 68%, `--accent` 38 59%, `--success` 106 23%, `--warning` 38 59% — earthy red/amber/olive theme; `themeColor #8B1E2A` in `layout.tsx:32`); grep for hardcoded Tailwind color families (`emerald/amber/rose/blue/indigo/violet/teal/cyan/pink/orange/green/red/yellow`) and arbitrary `bg-[#]/text-[#]` across all `src/**/*.tsx` → **0 violations**. **Dead buttons/links — CLEAN:** no empty `onClick={()=>{}}`, no `href="#"`, no placeholder-destination Links; all `<Link href>` resolve to real routes (verified across landing, dashboard, portals). Only in-page anchors are legitimate a11y/nav (`#main-content` skip-link, `#demo` hero CTA). **Responsive overflow — CLEAN:** new `tests/phase114-responsive.spec.ts` renders 5 public pages (shared layout + landing + login + special states) at 375/768/1440 and asserts no horizontal scroll — **15/15 pass** (see §4 evidence). Authenticated portal pages render behind role gate (middleware 307) so can't be visually swept without creds; their shared shell uses the same clean layout.

Per-group route coverage:
- **T4-1 Auth/shared/layout:** `/`, `/login`, `/kicked`, `/cheating-detected`, `/force-password-change`, `/create-quiz` — static + responsive CLEAN.
- **T4-2 Commander:** `/commander/*` (dashboard, requests, profile, notifications ×[id], messages, history, edit-arena/[quizId], analysis/[quizId]) — static CLEAN.
- **T4-3 Gladiator + battle:** `/gladiator/*` (dashboard, history, profile, notifications ×[id]) + `/battle/[roomCode]` — static CLEAN.
- **T4-4 Executive ops/overview:** dashboard, command-center, analytics, settings, workspace, search, messages — static CLEAN.
- **T4-5 Executive people:** commanders, students, users/[uid], requests, profile — static CLEAN.
- **T4-6 Executive content/systems:** question-bank (+[id], +sets/[setId]), battles (+[id]), announcements ×[id], notifications ×[id], backup, audit-logs, ai-logs, security — static CLEAN.

No code changes required — Tier 4 findings are all **CONFIRMED clean**; the only new artifact is the responsive regression spec.

---

## 6. Plain-Language Summary

- **PDF Forge actually fixed and proven on production?** Locally **YES** (3 PDFs, tsc+build clean). On Vercel **NO — UNVERIFIED** (needs live upload on https://knowledge-arena.vercel.app via AI Forge; historical "works locally / fails on Vercel" pattern requires that).
- **Full end-to-end loop confirmed?** **NO — UNVERIFIED** (the continuous Playwright run covering Executive → Commander → PDF Forge → publish → Gladiator join → battle → leaderboard → mind map → explanation → history was not yet run against a real deployed environment in this phase; required for Step 4).

Phase 114 status: key-resolver cooldown race **CONFIRMED none**; negative-marking copy **no fix needed** (design); AI rate limiting now per-UID **CONFIRMED**; deps cleaned + 5 audit advisories closed **CONFIRMED**; remaining vulns gated (see SECURITY_NOTES.md).

### Phase 114 — Production (Vercel) verification (Step 0/4)

Re-ran the full unauth E2E suite against `https://knowledge-arena.vercel.app` after all
Tier 1-3 changes: **15/15 pass** (manifest, icons, Quorena rename, AI-Forge tab presence,
401 auth-gating on copilot/evaluate/advance/mindmap/explanation/executive-search/
commander-search/gladiator-search, security headers, skip-link/toast a11y). This confirms
none of the dependency/rate-limit/score changes broke the live unauth surface.

**Authenticated legs remain BLOCKED (UNVERIFIED):**
- **PDF Forge upload on production** — needs one real test Commander login (email+password)
  created through the product (Executive → create Commander), which this sandbox cannot
  provide (no service account; and a full service account is over-broad for this check).
- **Full end-to-end loop** (Executive → Commander → PDF Forge → publish → Gladiator join →
  battle → leaderboard → mindmap → explanation → history) — additionally needs a Gladiator,
  which is **Google-OAuth + domain-locked**; no credential can fix that leg. Requires a real
  account on the college domain, done by hand.

Planned follow-up: a scoped test-Commander login (not a service account) supplied as a local
`.env.test` / env var, then close out the two authenticated checks. **For now: UNVERIFIED, blocked
on credentials — no emulator substitute (works-locally/fails-on-Vercel is PDF Forge's known trap).**
