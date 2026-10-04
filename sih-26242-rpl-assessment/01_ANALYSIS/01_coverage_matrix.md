# Clause-by-Clause Coverage Matrix — SIH26242 vs Quorena

Every row maps one published clause of the problem statement to a capability that **actually
exists in code today**. Status is one of:

| Status | Meaning |
|---|---|
| **STRONG** | Already built, working, demoable. |
| **PARTIAL** | Real capability exists but does not fully satisfy the clause. |
| **GAP** | Not built. Do not claim it. |

Citations are `file:line`. Each was read during this analysis, not inferred from documentation.

---

## A. Published clauses — "Description of the Problem Statement"

### A1. *"Guide a worker through a structured self-declaration of prior experience, mapped automatically to the closest relevant NSQF qualification pack(s)."*

| | |
|---|---|
| **Status** | **GAP** (self-declaration) / **GAP** (pack mapping) |
| What exists | User records with role and profile fields (`DATABASE.md:7-17`). Nothing resembling a guided prior-experience declaration. |
| What is missing | A guided self-declaration flow; an NSQF qualification-pack taxonomy; any mapping engine. There is no NSQF or NCVET concept anywhere in the codebase. |
| Build | `03_ROADMAP/PRIORITISED_GAPS.md` P0-1, P0-2 |

### A2. *"Support practical skill evaluation through guided task checklists, and where feasible, video- or image-based assessment aids that help an assessor score consistently against NSQF criteria."*

| | |
|---|---|
| **Status** | **STRONG** (guided checklists) / **PARTIAL** (image aids) / **GAP** (video aids) |
| Guided checklists | Arena questions are server-authored, host-controlled, advanced by the assessor, and every transition runs through Admin-SDK transactions — `src/lib/battle-machine.ts:77`, `src/lib/battle-server.ts`. This is exactly a guided task checklist under assessor control. |
| Image aids | The Forge pipeline is genuinely multimodal: uploaded image files are detected and forwarded to Gemini vision (`generate-quiz-pdf-flow.ts:679`, `:957`), and embedded images are capped at `MAX_EXTRACTED_IMAGES = 24` (`:561`, `:618-622`). Real, working image ingestion. |
| **Critical correction** | **A scanned PDF with no text layer is REJECTED, not auto-OCR'd.** `PDF_IMAGE_ONLY` is thrown at `generate-quiz-pdf-flow.ts:930` and deliberately propagated at `:971-974` so the user sees "This PDF appears to be scanned images with no text". Do **not** claim scanned-document OCR. Any earlier assumption that scanned pages are rendered to JPEG and read visually is wrong. |
| Video aids | **GAP.** No video handling exists at all. |

> **Judging risk:** NCVET packs include scanned material. If the demo feeds a scanned PDF and it
> errors, the weakest part of the product is on screen. Rehearse with a **digital-native** pack,
> and say plainly that scanned input is a known limit.

### A3. *"Standardise scoring rubrics across assessors and locations to reduce evaluator-to-evaluator variance in RPL outcomes."*

| | |
|---|---|
| **Status** | **PARTIAL** — the *standardisation* is real; the *variance measurement* is the gap |
| What exists | Scoring rules are **not** hardcoded in UI. They live in a single versioned, gated document per assessment — `quizzes/{id}/config/settings` (`DATABASE.md:85`) — consumed by `computeCorrectScore` (`src/lib/battle-machine.ts:77`). One assessor-authored rubric, applied identically to every candidate. Two assessors using the same assessment literally cannot diverge on the rubric. |
| What is missing | **Nothing measures the agreement.** There is no inter-assessor metric, no kappa, no adjudicated gold set. Separately, the `src/lib/permissions.ts` capability masks are **defined but never called** — repo-wide, the only consumer is `tests/battle-idempotency.spec.ts:5`. No API route imports `hasPermission`. Routes rely on coarse role checks via `verifyFirebaseTokenWithRole` (`src/lib/verify-auth.ts:90`). |
| Build | **P0-3 — the headline differentiator.** See `02_gap_analysis.md` §4. |

### A4. *"Generate an NSQF-aligned competency profile and certification recommendation for assessor sign-off (the tool supports, but does not replace, the human assessor's final decision)."*

| | |
|---|---|
| **Status** | **PARTIAL** |
| Competency profile | Per-item statistics are real and computed live: `pValue = correct/submitted` (`analytics.service.ts:539`), distractor analysis, average response time, per-option distribution. Difficulty miscalibration is flagged and a relabel proposed — `suggestDifficultyRelabel` (`analytics.service.ts:248`). |
| Recommendation | Live: `getQuizRecommendations` (`src/ai/engines/prediction-engine.ts:6-10`) plus a `WeakAreas` component and a spaced-repetition cron. |
| Human sign-off | **Architecturally supported, not yet a flow.** `verifyFirebaseTokenWithRole` (`src/lib/verify-auth.ts:90`) and `isRevoked` (`:21`) exist, and the `revoked_tokens` collection gives a working revocation audit primitive. But there is no sign-off workflow, no decision record, no immutable audit chain. The `CAPABILITIES` masks that would gate a decision route are unused — see A3. |
| NSQF alignment | **GAP.** The analytics are generic. Mapping items to NSQF level/GOSC competency elements does not exist. |
| Guardrail | The PS itself mandates *"supports, but does not replace"*. Lead with this. Ministry juries evaluating anything touching official certification respond well to a tool that visibly preserves human authority. |

### A5. *"Work in low-connectivity settings, with offline data capture and later sync."*

| | |
|---|---|
| **Status** | **GAP** — hard, and must not be faked |
| What exists | Connectivity **awareness** only: `src/components/offline-detector.tsx:15-19` sets a flag from `navigator.onLine` and shows a banner. `src/hooks/useOnlineStatus.ts` reports status. |
| What does **not** exist | No service worker. No IndexedDB persistence. No `enableIndexedDbPersistence` / `persistentLocalCache` / `initializeFirestore`. **No offline answer queue.** A dropped connection mid-assessment loses input. `src/app/manifest.ts` exists, but a manifest is not a service worker. |
| Build | P1-1 — scoped to `/rpl/*` only, so the live app is untouched. |

---

## B. Published outcomes — "Expected Solutions / Outcomes"

| # | Required outcome | Status | Evidence / gap |
|---|---|---|---|
| B1 | *"A working assessment workflow covering self-declaration through an assessor-facing scoring interface for at least one trade."* | **PARTIAL** | Assessor-facing scoring interface: **STRONG** (`src/app/commander/dashboard`, `src/app/commander/analysis/[quizId]/page.tsx`, `/api/battle/[quizId]/analysis` CSV). Self-declaration end: **GAP** (A1). One trade: achievable — pick a single NCVET pack and support only that. |
| B2 | *"An NSQF qualification-pack mapping engine."* | **GAP** | Nothing exists. P0-2. Cleanest high-value build in the whole plan. |
| B3 | *"Evidence of consistency improvement over unassisted manual scoring (e.g., inter-assessor agreement on a test set)."* | **GAP** | No agreement metric of any kind. **This is the named expected outcome almost no competing team will satisfy with a real number.** P0-3. |
| B4 | *"An offline-capable mobile/web interface."* | **GAP** | Responsive web exists; offline does not. P1-1. |
| B5 | *"A clear description of where the tool supports versus replaces assessor judgement."* | **GAP** — documentation only | No artefact exists. Zero code cost, high judging value. See `OUR_PROBLEM_STATEMENT.md` §5. |

---

## C. Honest scorecard

| | Count |
|---|---|
| STRONG | 2 (guided checklists, assessor scoring interface) |
| PARTIAL | 6 |
| GAP | 7 |

**Honest reading:** the assessment *engine* is strong and the RPL *wrapping* is absent. That is a
genuine and defensible position — the hard part (calibrated generation from official documents,
rubric centralisation, per-item analytics) is built; the domain wrapping (NSQF taxonomy, offline,
inter-rater statistics) is not.

**Do not present this as ~90% coverage.** It is not. Present it as: *the engine is built and
proven; here is precisely what we add on top, and here is the one number nobody else will
compute.*

---

## D. Where this is genuinely competitive

Not feature-count. These are the three defensible edges:

1. **It is real production software, not a 48-hour sprint build.** Firebase transaction safety,
   idempotent submissions verified by `tests/battle-idempotency.spec.ts`, Admin-SDK-only writes on
   the answer path, a Firestore distributed rate limiter (`src/lib/rate-limiter.ts:113-130`), and
   live QA against `knowledge-arena.vercel.app` (`tests/qa-workflows.spec.ts:3`). A judge can click
   randomly and it holds.
2. **Rubric centralisation is architectural, not cosmetic.** Because scoring lives in a gated
   versioned document rather than in UI code, two assessors *structurally cannot* diverge on the
   rubric. That is a stronger guarantee than "we built a consistent form".
3. **The inter-assessor agreement number.** Unglamorous, explicitly named in the PS, and almost
   certainly skipped by every competitor who would rather draw a nicer slide.

**Correction to a number floating around:** the repo has **8** Playwright spec files
(`tests/`, `e2e/`), not "200+ tests". `AUDIT.md:203` records "15/15 on Vercel" for unauth
gating. Use the real figure. A judge who checks will notice an inflated claim, and it costs more
credibility than the claim was ever worth.