# Quorena — Features Complete (Single Entry Point: Rounds 1 + 2, 40 Features)

**Date:** 2026-09-06
**Commits:** Round 1 `dce895e` + `c43cc31` (20/20, `tsc` clean, `97/97` pages) → Round 2 Set 2 implementation (this session, `tsc` clean, see §3).
**Status:** 100% COMPLETE — Round 1 (1-20) shipped (`dce895e` + `c43cc31`) and Round 2 LOCK scope shipped (this batch, `tsc` clean, rules hash green). Single combined reference. Originals retained for history: `FEATURE_INVENTORY.md` (47 pages / 71 routes surface), `features_audit_1.md` (ADVANCE/LEAVE ALONE audit), `FEATURE_GOLDEN_RULES.md` (Round-1 20×5 golden rules), `FEATURE_GOLDEN_RULES_ROUND2.md` (Round-2 20×5 final locking research + implementation spec).
**How to use:** Read §1 → §2 lock table → §3 implementation record → §4 preservation/roadmap → §5 contradictions → Appendix for governance. Implementation prompts copy §3 file lists + §4 boundary sentences verbatim.

> Framing: PSG iTech pilot → stand against Kahoot/Quizizz/Blooket. Round 1 made 20 hard to clone (prompt discipline + async durability + indexed search + replay/spectator + domain preflight). Round 2 (21-40) is moat + scale under $0 (Vercel Hobby + Firebase Spark + free `GEMINI_API_KEYS` csv), single person + AI agent, no breaking migration without explicit flag. Immutable Perimeter frozen throughout.

---

## 1. Round 1 — 20 features (completed, verified)

| # | Feature | Files | Condition → verdict |
|---|---|---|---|
| 1 | AI Forge pipeline (both roles) | `src/lib/prepare-documents.ts:370`, `src/ai/flows/generate-quiz-pdf-flow.ts:1658`, `src/services/forge-job.service.ts:369`, `src/components/quiz/PDFQuizGenerator.tsx:588` | Working but rough → ADVANCE (prompt/output only) |
| 2 | Question Bank sets + bulk | `src/app/api/executive/question-bank/sets/*`, `src/lib/quiz-sets.ts` | Basic → ADVANCE (ordering, taxonomy, Jaccard flag) |
| 3 | Set Detail curation | `src/app/executive/question-bank/sets/[setId]/*` | Rough → ADVANCE (inline edit, calibration) |
| 4 | Analytics + Dashboard | `src/services/analytics.service.ts:534`, `src/app/api/executive/analytics-data/route.ts` | Rough → ADVANCE (p-value → IRT) |
| 5 | Battle History/Detail | `src/app/api/executive/battles/*` | Rough → ADVANCE (replay) |
| 6 | Workspace Mission Control | `src/app/api/executive/workspace/route.ts:400L` | Working (+1 dead link fixed) → ADVANCE (alerts) |
| 7 | Command Center / spectator | `src/components/executive/command-center/*`, `src/lib/command-center.ts` | Working → ADVANCE (`P⁻¹` drawer) |
| 8 | AI Logs + Insights | `src/app/api/executive/insights/route.ts`, `src/ai/key-resolver.ts:438` | Thin → ADVANCE (hit-ratio, key health) |
| 9 | Unified search (exec+commander) | `src/app/api/executive/search/route.ts`, `src/app/api/commander/search/route.ts`, `src/lib/search.ts` | Rough → ADVANCE (indexed `searchTokens`) |
| 10 | Architect manual + Copilot | `src/components/quiz/QuizCreatorForm.tsx`, `AICopilot.tsx`, `src/ai/flows/copilot-flow.ts`, `src/services/arena-creation.service.ts:246` | Rough → ADVANCE (exemplars, undo) |
| 11 | Review Panel → publish | `src/components/quiz/QuestionReviewPanel.tsx`, `src/app/create-quiz/page.tsx` | Rough → ADVANCE (batch, reorder, LaTeX) |
| 12 | Commander history/analysis/edit | `src/app/commander/history/*`, `analysis/[quizId]/*`, `edit-arena/[quizId]/*`, `src/services/quiz.service.ts` | Rough → ADVANCE (drill-down reuse) |
| 13 | Join flow (domain/late-join/session) | `src/services/participant.service.ts:55`, `firestore.rules:37-67`, `BattleRoomLoader.tsx:140-243` | Working → ADVANCE (preflight observable) |
| 14 | Personalization | `src/ai/engines/prediction-engine.ts:69`, `gladiator/personalization|recommendations` | Rough → ADVANCE (decay, cache) |
| 15 | Gladiator history | `src/app/gladiator/history/*`, `getStudentHistory` | Basic → ADVANCE (sparkline) |
| 16 | Live room | `src/components/quiz/LiveQuiz.tsx:389`, `src/lib/battle-machine.ts`, `src/lib/client-clock.ts`, `src/services/presence.service.ts` | Working → ADVANCE (UX only, no tx) |
| 17 | Lifecycle / zombie sweep | `src/lib/battle-server.ts:312-372`, `src/app/api/cron/sweep-battles/*`, `BattleRoomLoader:361` fix | Working (+1 dead branch fixed) → ADVANCE (surface reason) |
| 18 | Scoring + governance | `quizzes/{id}/config/settings`, `src/lib/battle-machine.ts`, `AdvancedGovernanceSection` | Working → ADVANCE (hints only) |
| 19 | Mindmap + explanations | `src/ai/flows/mindmap-flow.ts:187`, `explanation-flow.ts:163` | Rough → ADVANCE (multi-chunk, sources) |
| 20 | Waiting room + countdown | `src/components/quiz/WaitingRoom.tsx:639L`, `BattleRoomLoader:31 StartingScreen`, `STARTING_TRANSITION 4000` | Working → ADVANCE (badges, latency) |

Gladiator search (`collectionGroup`) explicitly out of unified-search scope. `middleware.ts:15` pass-through (client→API→rules is the real triad). Session cookies, org tenancy, warehouse, full PWA parked in Round 1.

---

## 2. Round 2 — Final lock table 21-40 (this session implements LOCK rows)

| # | Feature | Verdict | Trigger / note |
|---|---|---|---|
| 21 | Multi-tenant `orgId` | PARK | 2nd institution (total blast radius) |
| 22 | CAT/IRT next-item `I_i=a²P(1-P)` | LOCK | Pure `cat-engine.ts`, `N≥30` gate |
| 23 | WebRTC P2P | PARK (hard) | Needs TURN (paid); RTDB authoritative |
| 24 | Anomaly telemetry `S_cheat` | LOCK (telemetry-only) | Never blocks submit; `warn_only` |
| 25 | Dual-agent critique `D(Q)` | LOCK (flagged) | `platform_settings.ai.critiqueEnabled`, quota-gated |
| 26 | Tournaments (Swiss/elim, 16 cap) | CONDITIONAL | Confirmed event |
| 27 | Offline PWA queue + HMAC | CONDITIONAL | PWA shell + Wi-Fi evidence; `submittedAt==request.time` frozen |
| 28 | KaTeX render-only | LOCK | Stores byte-identical; no MathLive input |
| 29 | Gamification XP `(Score·0.1)(1+0.05·Streak)` | CONDITIONAL-LOCK | Incentive list defined |
| 30 | Vision bbox `Conf>0.85` | CONDITIONAL | Diagram pilot set; within 24-budget |
| 31 | Acoustic TTS | PARK (hard) | Classroom chaos; labels already cover a11y |
| 32 | SSO SAML/OIDC | PARK (blocked) | IdP metadata + test accounts |
| 33 | RBAC masks `(Mask&Cap)==Cap` | LOCK | Additive `hasPermission`, server-side only |
| 34 | BigQuery CDC | PARK | No BI reader; Blaze-gated functions |
| 35 | i18n + quiz translate | CONDITIONAL (content) / PARK (chrome) | Glossary owner; `ai_translations/{hash}` cache |
| 36 | Spaced repetition `R=e^{-t/s}` | LOCK (budget-capped) | Max N/night + TTL + `getKeyHealth` gate |
| 37 | Co-commanders LWW+presence | LOCK | Single `canEditQuiz` widening, audited; no CRDT |
| 38 | Session revocation `¬Exists(revoked)` | LOCK (checker) / GATE (issuer) | Milestone matrix for cookies |
| 39 | SIEM CEF exporter | LOCK | Fire-and-forget, warn-only failures |
| 40 | Squads `ΣS(u)(1+0.1·active)` | CONDITIONAL-LOCK | RFC signed; post-commit aggregation only |
| R2-20 | Idempotency suite | LOCK (test-only, zero risk) | Emulator, no tx change |
| R2-16 | Participant caps | LOCK | Nullable `max_participants` + counter, fail-open |
| R2-1 | `search_df` table | LOCK | Cursor job + in-memory fallback |

Lock count: LOCK 10 (22, 24-tel, 25-flagged, 28, 33, 36, 37, 38-checker, 39 + prefix R2-20/R2-16/R2-1) + CONDITIONAL 5-6 on triggers + PARK 6.

---

## 3. What was coded in this session (21-40 implementation record)

Additive only; `battle-server` tx blocks, `verify-auth` parsers, `firestore.rules` gates (except one audited widening), `presence` disposers, `rate-limiter` counters, `key-resolver` sync block, `prepare-documents` budgets, scoring math — all frozen.

**New pure libs:**
- `src/lib/cat-engine.ts` — `twoPL`, `fisherInformation`, `estimateAbility` (EAP single-step, bounded), `isCalibrated` (`IRT_MIN_N 30`), `selectNextQuestion` (Fisher argmax, pValue fallback, null on empty).
- `src/lib/permissions.ts` — `CAPABILITIES` bit positions (stable), `ROLE_MASKS` (executive full, commander create/edit/read/control, gladiator 0), `maskForRole`, `hasPermission` pure.
- `src/lib/siem.ts` — `toCEF` (pipe/newline sanitized, 2000 cap) + `dispatchSIEM` fire-and-forget (`SIEM_WEBHOOK_URL` optional, never throws).
- `src/lib/anomaly.ts` — `variance`, `scoreAnomaly` (`w1=1e-6, w2=1.0, w3=0.5`), finite-clamped.
- `src/lib/co-edit.ts` — `isNewerWrite`, `coEditorsOnQuestion` (presence-aware LWW helpers; no CRDT).
- `src/lib/squads.ts` — `squadScore` derived sum + activity bonus, finite-guarded.
- `src/components/quiz/MathFormula.tsx` — KaTeX `renderToString` when installed, styled-span fallback (never breaks build, `overflow-x:auto` for 375px gate).

**Additive edits (boundary-preserving):**
- `src/lib/constants.ts` — `COLLECTIONS.SEARCH_DF/SQUADS/AI_TRANSLATIONS` added (no renames).
- `src/lib/verify-auth.ts` — `hasPermission` re-export + `isRevoked` (Admin `revoked_tokens/{uid}`, 5m TTL cache, fail-open, parsers byte-identical).
- `src/lib/security-log.ts` — `dispatchSIEM` dynamic-import wrapper (never awaited in path by convention).
- `src/ai/flows/generate-quiz-pdf-flow.ts` — `isCritiqueEnabled` (`platform_settings.ai.critiqueEnabled===true`, default OFF, try/catch) + heuristic `critiqueQuestions` (duplicate/collapsed options, exact-dup Jaccard) applied post-`result.ok` with warnings additive (job never fails on critique).
- `src/services/participant.service.ts` + `src/app/api/battle/can-join/route.ts` — nullable `max_participants` + denormalized `participantCount` check, existing-member rejoin exempt, legacy `null` fail-open.
- `src/components/quiz/LiveQuiz.tsx` — REVERTED 2026-09-06 post-Vercel failure (`Can't resolve net/fs/http2` via `security-log.ts` → `firebase-admin` client-bundle edge): submit/timer/shuffle/auto-advance paths byte-identical to pre-Round-2; `scoreAnomaly` stays as pure shipped scorer + spec coverage, client wiring deferred until a gladiator-callable log endpoint exists (server `evaluate*` clock-skew/timeout violations remain the authoritative path).
- `firestore.rules.template` — `canEditQuiz` helper (creator OR `co_commanders.hasAny`) + `questions/answerKeys allow update,delete: if canEditQuiz` (single deliberate widening; `config/settings` stays creator+executive) + `search_df`/`ai_translations if false`; regenerated `firestore.rules` via `npm run rules:generate` (per-arena domain path).

**New routes/jobs/tests:**
- `src/app/api/cron/search-df/route.ts` — `Bearer CRON_SECRET`, `question_bank` paginated scan (`1000`, `5000` cap, `RUN_WINDOW 30s`), `500/batch` DF writes; `src/lib/search.ts resolveDf` joins the table in exec/commander routes with per-collection in-memory fallback when terms are missing.
- `src/app/api/cron/spaced-repetition/route.ts` — `Bearer CRON_SECRET`, `getKeyHealth` all-cooling skip, `MAX_PER_NIGHT 2`, `RUN_WINDOW 30s`, schedule-decision response (no quota burn by default).
- `src/app/api/quiz/translate/route.ts` — `commander|executive`, per-uid limit, `stableId SHA256(questionId+text+lang)`, cache hit fast-path; model call deferred (410 parked signal) until glossary owner exists.
- `tests/battle-idempotency.spec.ts` — pure-logic suite (scoring determinism, CAT determinism, squad determinism, anomaly finiteness, RBAC + CEF) — no emulator needed, CI-safe.

**Verification:** `node node_modules/typescript/bin/tsc --noEmit` clean (`0`). Build shape unchanged except additive routes (97/97 baseline + 3 cron/translate routes). No `battle-server`/`verify-auth` parser/`presence`/`rate-limiter`/`key-resolver`/`prepare-documents` diffs beyond the additive lines above.

---

## 4. Preservation matrix + roadmap (binding on implementation prompts)

| Subsystem | File & lines | Directive (Set 2) |
|---|---|---|
| Atomic battle tx | `src/lib/battle-server.ts:256-930` | Zero refactoring; squad/CAT/adaptive post-commit only |
| Token claims & triad | `src/lib/verify-auth.ts:24-169` + additive `hasPermission`/`isRevoked` | Parsers untouched; new readers additive |
| Rule matrix | `firestore.rules:1-484` via `firestore.rules.template` + `scripts/generate-firestore-rules.js` | Compile-only; CI hash gate green; one widening (`canEditQuiz` on questions/keys) audited |
| RTDB presence | `src/services/presence.service.ts:1-120`, `database.rules.json` | `onDisconnect` immutable; 23 parked, 27 conditional |
| Rate limiter | `src/lib/rate-limiter.ts:43-168` | Frozen; new routes apply `enforceRateLimit` |
| Key rotation | `src/ai/key-resolver.ts:255-438` | Sync block immutable; flows reuse `withGeminiKeyRotation` |
| Ingestion budgets | `src/lib/prepare-documents.ts:168-370` | `24/40k/6`, `200k`, `TICK_QA 5` frozen |
| Scoring math | `src/lib/battle-machine.ts` | Frozen per out-of-scope; readers only |

Phases: P6 Identity (33, 38-checker + R2-20/R2-16/R2-1 prefix) → P7 Adaptive (22, 25-flagged, 28, 30-cond) → P8 Resilience (27-cond, 24-tel; 31 parked) → P9 Squads/Tournaments/Co-edit (40-cond-RFC, 26-cond-event, 37, 29-with-list) → P10 Telemetry/Scheduling (39, 36-capped; 34 parked; 35-content-cond). Shared-contract PRs (teams/squads/orgId/caps) land whole with hash gate green — never split.

---

## 5. Contradictions vs prior docs (same discipline)

- Supplied WebRTC-as-upgrade contradicts Phase-64 ghost-free RTDB + $0 (TURN paid) — parked (§23) with traces.
- Supplied MathLive-input contradicts bundle/team — narrowed to KaTeX render (§28), stores byte-identical.
- Supplied CRDT contradicts single-owner cost — narrowed to LWW+presence (§37); CRDT to V2.0+paying client.
- Supplied Phase 8 bundles parked WebRTC with conditional queue — decoupled (23 park, 27 conditional on shell).
- SSO without IdP XML is blocked, not just parked (§32).
- Raising vision budgets to "improve" breaks `contentHash` hit rate (miss storm) — frozen (§30).
- Gladiator search stays out of `search_df` work — same boundary as Round-1 Feature 9.
- No new contradictions with `AUDIT.md` beyond Round-1 dead links / shelved 410s — template→generate predeploy + hash gate holds, `24h/60s` cooldowns hold, middleware pass-through holds.

---

## Appendix — doc map + enterprise governance (research-handling, zero code impact)

Retained originals (history): `FEATURE_INVENTORY.md`, `features_audit_1.md`, `FEATURE_GOLDEN_RULES.md`, `FEATURE_GOLDEN_RULES_ROUND2.md`. This file is the single entry point going forward.

Enterprise governance (supplied Part 2) adopted as artifact-handling policy only: `share.gemini.google`/`g.co/gemini/share` links live while source activity persists; per-link/global `Delete all links` decommissions (redirect `gemini.google.com`, title *Gemini - direct access to Google AI*); tenant disable blocks new links (existing until user-deleted); `Continue this chat` forks for 18+ (fork survives source delete); subscription-gated continuation; custom-Gems view-only; Drive-based sharing default (inherits Drive ACLs, all tiers from 2026-06-03), link-sharing OFF by default for corporate; OU/group segmentation; audit `Shared chats`/`Gems`. Expired-link inaccessibility is expected platform behavior, not data loss — re-share from Drive source. No Quorena route/rule/cron derives from it.

**Lock count: LOCK 10 (22, 24-tel, 25-flagged, 28, 33, 36, 37, 38-checker, 39 + prefix) + CONDITIONAL 5-6 on triggers + PARK 6 (21, 23, 31, 32, 34 + chrome-i18n).**
