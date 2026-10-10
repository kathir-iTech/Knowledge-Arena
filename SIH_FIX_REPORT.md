# SIH-26242 RPL — Fix Report

Branch: `sih-26242-rpl` (never merged to `main`; remote `kathir-iTech/Knowledge-Arena`)
Input audit: `SIH_FULL_AUDIT.md` (defects D1–D7, plus security-hygiene gaps B8–B10)
Status: **all audit defects fixed locally; PUSH #2 held until the human login check passes**

---

## Summary

| Phase | Scope | Result | Push |
|---|---|---|---|
| A | Login chain + `/rpl` next-return (A4/A5) + Playwright spec | 3 commits | **PUSH #1** `af1d38961a7c783dc01b198b39a7a8b57eb96935` (`22de50b..af1d389`) |
| B | Audit defects D1–D7 + B8–B10 | 10 commits (`bb51258`..`1403821`) | held — waiting for "login works" |
| C | RPL-first landing + RPL Compass branding (per team deck SIH26242/ZYN6) | 1 commit `00d073a` | held |
| D | Verification + this report | — | — |

Gates run before **every** commit: `npx tsc --noEmit` = 0 errors; `npm run lint` = 0 errors / 0 warnings (since B8). Only explicit paths staged; no secrets printed; Firebase project stays `studio-4092189688-c74a7`; no `firebase deploy` performed.

---

## Phase B — per-defect fixes

### B1 / D1 — offline queue replayed unauthenticated (401 forever)
Commit `bb51258`.
- New `src/lib/rpl/offline-sync.ts`: page-side replay with injectable `QueueStore` (IndexedDB default); **fresh `getIdToken()` per record**, Bearer attached, record deleted only on 2xx; 401 → one forced refresh → `needs-signin`; 5xx → `error` + reason kept; network drop → keep + stop batch; 429 → keep + stop.
- `public/rpl-sw.js` no longer POSTs (the SW has no Firebase SDK, so any direct replay was guaranteed-401); sync handler only nudges open clients via `postMessage({type:'RPL_SYNC_PENDING'})`.
- Declare page: queue card with Sync now / Refresh, SW message listener; 202/`queued` treated as saved-offline success.
- Test: `scripts/test-offline-sync.mjs` — **ALL PASS** (39 assertions; run via `npx tsx` because plain node cannot resolve extension-less TS relative imports).

### B2 / D2 — assess never scored; admin overview always 0
Commit `68e347a`.
- New zero-runtime-import `src/lib/rpl/scores.ts` (`scoreItemsAgainstUnits`, `computeAssessmentScores`, `storedAssessmentScore`); `generateCompetencyProfile` delegates its unit math there.
- `POST /api/rpl/assess`: unknown packId → 400 (was silent success); persists `overallScore` / `unitScores` / `scores` and echoes `overallScore`; admin overview uses the shared reader.
- Seeder computes score fields for all assessments (hardcoded 3.13 removed; unitScores keyed by real item ids).
- New `scripts/rpl/backfill-assessment-scores.mjs` (dry-run default, `--write`, skips loudly).
- Test: `scripts/test-scores.mjs` — **ALL PASS** (golden 0–100 values, fallback chain, profile identity).

### B3 / D3 — kappa hardcoded / hidden when unmeasurable
Commit `8dcdb80`.
- `KappaInterpretation` gains `'No data'`; `overallKappa: number | null`; stored values are explicit `null` (never `undefined`) so merges clear stale numbers.
- `recompute-consistency.ts`: <2 pairs → `kappa: null` + interpretation `'No data'`; history records only measured values.
- Consistency page: `—` + outline badge for null; `needsCalibration` null-guarded.
- Seeder: hardcoded 0.58/0.71 purged; ELE κ = 0.3846 (Fair, matches audit); CON gains a second assessor → assisted κ 0.7647 (Substantial) **computed**. Dry-run confirms both.

### B4 / D4 — two competing item-id schemes
Commit `5f55a5d`.
- New `src/lib/rpl/item-ids.ts` (`performanceItemId` / `knowledgeItemId` / `firestoreItemId` — `/`→`_`; kind+index parse, unitId taken from the item field).
- Assess page, assess route (local `sanitizeDocId` deleted), seeder, and `tests/rpl-e2e.spec.ts` all derive ids from it; locators now `input[name="ELE/N1301::p0"]`.
- New `scripts/rpl/migrate-item-ids.mjs` (dry-run default; create-before-delete; dedupes identical duplicates; skips/conflicts reported loudly).
- Test: `scripts/test-item-ids.mjs` — **ALL PASS** (26 assertions).

### B5 / D5 — 5 unrated RPL API routes
Commit `17a44b0`.
- Inline-config `enforceRateLimit` added (after auth, keyed `rpl:<route>:<uid>`): admin/overview, assess GET, assess/[assessmentId], status/[workerId] = 30/min; assess POST (writes) = 15/min; consistency/[packId] = 10/min (full recompute + writes).
- Verified: **14/14** `/api/rpl/**` routes now enforce the distributed Firestore limiter.

### B6 / D6 — AI flows failed open (fabricated score 2 on HTTP 200)
Commit `1dfede1`.
- `POST /api/rpl/assess/suggest`: fallback deleted. Unparseable model output → **502 `AI_PARSE_FAILED`**; timeout → **504 `AI_TIMEOUT`**; any other failure → **502 `AI_UNAVAILABLE`**. The assess page already handled non-OK by showing the error banner; no fabricated prefill, `aiSuggestionUsed` stays false.
- Declare page: when `/api/rpl/match` returns `aiUsed:false` or fails, a visible amber note explains keyword matches are shown (matches were previously kept *silently*).
- Forge page: `parseError` (passed through `stripFlags`) now renders an amber warning card — unit list is real NSQF data but task items may be missing.
- Survey (report-only): `rpl-matching-flow` already sets `aiUsed:false` + 'Keyword match (AI unavailable)'; explanation-flow soft-fails to visible text; quiz-pdf/mindmap/copilot surface quota/errors to callers.

### B7 / D7 — `rpl_forge_cache` not denied in rules
Commit `eba16a3`.
- `firestore.rules.template` (source) gains explicit deny for `rpl_forge_cache` incl. recursive subdocuments; `firestore.rules` regenerated via `npm run rules:generate` (identical block only — CI hash gate passes locally).
- Legacy Phase 115C `forge_cache` deny kept (real collection). Stale "mirrors forge_cache" comments in `rpl-forge-flow.ts` corrected. **No `firebase deploy`** — rules ship with the next reviewed deploy.

### B8 — lint/CI hygiene (Section 9 gap list)
Commit `3b4dfe3`.
- `rpl-forge-flow.ts`: `allowedMethods` (type-only const) → local `AssessmentMethod` type alias.
- 3 `<img>` warnings: data:/blob: evidence thumbnails that `next/image` cannot optimize → `eslint-disable-next-line` comments with reasons, matching the existing repo convention.
- `.github/workflows/ci.yml`: added `npm run lint` after typecheck.
- **Result: `npm run lint` exits 0 with zero warnings and zero errors.**

### B9 — service-worker PII at rest + precached 307
Commit `2a726b3`.
- Removed the `/api/rpl/status/*` cache-with-fallback: responses carry worker PII (name, declaration, employer) and were kept in Cache Storage indefinitely. Status now passes through to the network; the offline declaration queue (IndexedDB + page replay) is unaffected.
- Precache list drops `/rpl` (prod 307 → `/` outside SW scope; preview 307 → `/login`); install + runtime navigation caching skip `res.redirected`.
- Cache bumped to `rpl-precache-v2`; activate **deletes** older `rpl-precache-*` caches so PII/redirect bodies placed by v1 are removed from devices that already ran it.

### B10 — hardcoded web API key in test scripts
Commit `1403821`.
- `scripts/e2e-test.ts` + `scripts/api-test.ts` read `FIREBASE_WEB_API_KEY` (fallback `NEXT_PUBLIC_FIREBASE_API_KEY`) and throw a loud error when unset.
- Repo-wide grep: the key remains only in `src/firebase/config.ts` (shipped client config — Firebase web API keys are public client identifiers by design; the audit gap was the committed copies in `scripts/*`).

---

## Phase C — RPL-first landing + RPL Compass branding
Commit `00d073a`. Brand taken from the team's SIH deck (`SIH26-ZYN6-242120261004194618.pdf`): **"RPL Compass — AI that standardises how assessors judge, not who passes."**

- Landing hero is now RPL-first: PPT tagline as `<h1>`, primary CTA → `/rpl`, stats κ / 1–4 / Offline, and an ELE/Q1301 per-criterion scoring mock (AI-proposed rows, κ 0.72 Substantial, PENDING SIGN-OFF).
- New sections: 5-step workflow (Declare→Match→Score→Measure→Certify), live-κ consistency showcase (per-assessor rows, κ<0.4 ALERT, Landis & Koch scale, N shown), NSQF competency-profile showcase (mastery bars + PENDING ASSESSOR SIGN-OFF). Quiz product demoted to a secondary `#quiz` block; features grid = the six deck pillars.
- `Quorena` → `RPL Compass` across every user-facing surface (metadata, manifest, login, sidebars, loaders, onboarding, executive settings default, CEF vendor `RPLCompass`, analytics header, landing). **0 occurrences of `Quorena` remain in `src/`.**
- Tests updated in lockstep: `landing.spec.ts` (full rewrite of assertions), `phase113-e2e.spec.ts` (manifest name; branding test now forbids *both* Quorena and Knowledge Arena in `<title>`), `qa-workflows`, `command-center`, `qa-e2e.js`, `qa-workflow.ps1`, `battle-idempotency` (CEF vendor).

---

## Phase D — verification evidence (local, 2026-10-10)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **0 errors** |
| `npm run lint` | **exit 0 — zero warnings, zero errors** |
| `node scripts/test-scores.mjs` | **ALL SCORES TESTS PASSED** |
| `node scripts/test-item-ids.mjs` | **ALL ITEM-ID TESTS PASSED** |
| `npx tsx scripts/test-offline-sync.mjs` | **ALL OFFLINE-SYNC TESTS PASSED** |
| `node scripts/rpl/seed-rpl-demo.mjs --dry-run` | 42 planned writes; κ computed (ELE 0.3846 Fair; CON 0.7647 Substantial assisted); certification `pending_human_signoff`; nothing written |
| `npm run rules:generate` + diff | firestore.rules **in sync** with template (CI hash gate passes) |
| `git status` | clean except intentionally untracked scratch files (`screenshots/`, probe specs, debug log, audit input doc) |

## Not verifiable locally — human / deploy checklist

1. **Login works** (human): Firebase console — project `studio-4092189688-c74a7` authorized domains include `*.vercel.app`; Google sign-in button; API-key referrer restriction. Reply **"login works"** to release PUSH #2 (Phase B + C commits).
2. **Firebase rules deploy**: `rpl_forge_cache` deny ships with the next reviewed `firebase deploy --only firestore:rules` (never run from this branch silently).
3. **Post-deploy smoke**: `/` shows RPL Compass landing; `/rpl` loads (no 307 loop); suggest endpoint returns 502/504 (not a fabricated score) with Gemini down; SW `rpl-precache-v2` activates and deletes v1 caches (devtools → Application → Cache Storage).
4. **Playwright suites** (`tests/landing.spec.ts`, `tests/rpl-e2e.spec.ts`, `tests/login-chain.spec.ts`) need the emulator/seed environment or a live URL (`QA_BASE_URL`).

## Explicit non-changes

- `src/firebase/config.ts` web API key left in place (public client identifier; rotating it is a console operation, not a code fix).
- `main` untouched; no merge, no push beyond PUSH #1.
- No invented stats, testimonials, or features; all landing copy traces to the product code or the team's SIH deck.
