# Quorena — Final Locking Project Plan 21-40 & Golden Rules

**Date:** 2026-09-06
**Base:** `c43cc31` (Round 1 20/20 complete: `dce895e` + timeout-copy fix, `tsc` clean, `build` 97/97)
**Status:** FINAL LOCKING — replaces the Round-2 research draft. No code changed in this round. Paste this file alongside completed-Round-1 `FEATURE_GOLDEN_RULES.md:1` for personal research; argue against the LOCK/PARK calls below, then implementation prompts are written per-phase.
**How built:** File-by-file re-verification of `FEATURE_INVENTORY.md:1`, `features_audit_1.md:1`, live code `src/lib/prepare-documents.ts:370` `src/ai/flows/generate-quiz-pdf-flow.ts:1658` `src/services/forge-job.service.ts:369` `src/lib/search.ts` `src/services/analytics.service.ts:534` `src/components/battle/BattleReplay.tsx` `src/components/executive/command-center/SpectatorDrawer.tsx` `src/app/api/battle/can-join/route.ts` `src/components/quiz/LiveQuiz.tsx` `src/lib/battle-server.ts:930` `src/lib/battle-machine.ts:127` `src/lib/rate-limiter.ts:43-168` `src/ai/key-resolver.ts:255-438` `src/lib/verify-auth.ts:24-169` `firestore.rules:1-484` + `firestore.rules.template` + `scripts/generate-firestore-rules.js` `firestore.indexes.json` `vercel.json:18` `ROADMAP.md` V1.1/V1.2/V2.0. Supplied reference `20-Feature OpenCode Optimization Plan-20260906-0905.md` §§1-6 + Enterprise Governance Part 2 compared line-by-line — its `[cite:1,2,3]` markers are placeholders (no resolvable source); its AST/RTDB-shadow/full-IRT-at-N=6 claims are corrected per-section below. Nothing is restated unread.

> **Framing:** PSG iTech pilot → stand against Kahoot/Quizizz/Blooket. Round 1 made the existing 20 hard to casually clone (prompt discipline + async durability + indexed search + replay/spectator + domain preflight). Round 2 is *moat + scale*: things needing deliberate sustained engineering (a real DF table, a real CAT service, a real team model, a real offline queue) — not weekend polish. $0 holds until a paying client (Vercel Hobby + Firebase Spark + free `GEMINI_API_KEYS` csv). Single person + AI agent is the team. Nothing here may require a breaking migration without saying so explicitly.

**How to read:** 20 sections numbered 21-40 in supplied order. Each has exactly 5 parts: (1) Golden rules, (2) What would actually be hard to casually copy, (3) Direct files, (4) Indirect files (exhaustive — prevents the stale-template regression pattern), (5) Risk level + boundary. Each ends with a **LOCK verdict**: `LOCK` (build), `CONDITIONAL` (build only on stated trigger), `PARK` (explicit no-build with trigger to promote). Formulas carry their `N` thresholds so pilot `N` never implies guarantees it cannot support. `Gladiator search` stays out of unified-search work unless stated.

**Lock legend — no compromise, fully committed:**
- `LOCK` = best-in-class for this codebase under constraints; build in stated phase.
- `CONDITIONAL` = lock only when the named trigger exists (second institution, IdP metadata, event, incentive list, metric).
- `PARK` = explicit no-build; promotion trigger named. Parking is a decision, not deferral.

---

## 21. Multi-Tenant Institutional Workspaces & OrgId Isolation — PARK (promote on 2nd institution)

*Supplied §3.21 baseline: single-tenant string match `psgitech.ac.in` in `firestore.rules:57-67`. Supplied upgrade: hierarchical `orgId` claims + rule-context validation. Supplied model: `AccessAllowed(u,d) = I(u.orgId==d.orgId) ∨ I(role=='executive')`.*

### 1. Golden rules — the genuinely unavoidable constraints
* **Breaking-migration warning (explicit):** Adds `orgId` to `users` + `quizzes` (+ tournament/bank later), tenant-scoped rules (`getOrgRole` helper), workspace queries + composite index additions. Every existing doc needs backfill (`scripts/backfill-*.mjs` pattern like `backfill-arena-configs.mjs`). Cannot be additive-only — this is the total-blast-radius item.
* **Firestore rules cost:** `getRole()` already costs 1 `get()` per evaluation (`firestore.rules.template:10-12`); `getOrgRole` adds a second. Combined with the 10-get limit, batch creates (`isQuizCreatorAfter` `existsAfter/getAfter`) must be re-proved under emulator — the exact pattern that silently undid fixes twice.
* **Vercel/Spark/$0:** Composite `orgId` prefixing increases index count and per-query read cost (`orgId + created_by + created_at`, `orgId + status + created_at`). No new cron. No paid tier.
* **Team:** Single-person team cannot maintain tenant backfill + rule matrix + workspace scoping without a second tenant asking. College won't provide infra Kathir doesn't have.

### 2. What would actually be hard to casually copy
* **Hard:** Tenant isolation surviving the 10-get limit + `existsAfter` batch patterns. But hard ≠ worth doing now. Honest: most defensible on this list *and* most expensive — park it even though it is the moat, because with one pilot it is pure cost.
* **Pros (supplied, confirmed):** Zero leakage across departments. **Cons:** Composite index updates everywhere. **Limitations:** Slightly higher read costs (`orgId` filter per query).

### 3. Correlated files — direct
* `users` + `quizzes` (new `orgId`), `src/lib/constants.ts` (`COLLECTIONS`, add `ORGANIZATIONS` if workspaces become docs), `firestore.rules` + `firestore.rules.template` (`getOrgRole`, per-collection `orgId` clauses), `firestore.indexes.json` (tenant composites), `src/lib/verify-auth.ts` (attach `orgId` to context — additive claim read only), `src/app/api/executive/workspace/route.ts` (tenant filter).

### 4. Correlated files — indirect
* Everything reading `users/quizzes` (i.e., everything): `src/services/participant.service.ts` (`joinQuiz`), `src/services/quiz.service.ts`, `src/app/api/executive/search/route.ts` + `src/app/api/commander/search/route.ts` (tenant scoping), `src/app/api/executive/battles/*`, `src/services/analytics.service.ts`, `src/components/executive/command-center/*`, `.github/workflows/ci.yml` (hash gate must cover new rules), `src/lib/search.ts` (`DF` per-tenant if ever).

### 5. Risk level + boundary
**CRITICAL blast radius. PARK — promote only on second institution.**
* Boundary if promoted: extend `verify-auth.ts` with additive claim checkers only; zero modification to core token parsing (`verifyIdToken` + customClaims-first + `mustChangePassword` single-read). Rules compiled only via `scripts/generate-firestore-rules.js`; never hand-edit `firestore.rules`.

**LOCK verdict: PARK.**

---

## 22. Computerized Adaptive Testing (CAT) & IRT Next-Item Selection Engine — LOCK (pure-function advance)

*Supplied §3.22 baseline: static sequences / basic randomization in independent mode (`battle-machine.ts:127`). Supplied upgrade: Fisher maximization on live θ. Supplied model: `I_i(θ)=a_i²P_i(θ)(1-P_i(θ))`, `q*=argmax I_q(θ̂)` with pre-calibrated `a_i,b_i`. Graduates Round-1 p-value gate + R2-2.*

### 1. Golden rules
* **Pure function only:** New `src/lib/cat-engine.ts` (`selectNextQuestion(ability, answeredIds, itemBank)`) — no Firestore, no tx, no collection. Reads already-denormalized `questionStats {submittedCount, optionCounts, correctCount}` + Round-1 `pValue/discrimination` + `irtDifficulty/irtDiscrimination` response fields. `a_i,b_i` persisted only as derived response fields, never as new collection at pilot scale (avoids migration).
* **N-gate (load-bearing):** `submittedCount≥30` per item for stable `a_i` (below: fall back to Round-1 `p-value` + `discrimination=corr(correct,total)`). Ability `θ̂` from own `correct/total` (EAP single step, not full MLE at pilot `N≤6` quizzes). Pre-calibration requirement in supplied doc (≥30 attempts) is correct — enforce it, don't waive it.
* **Vercel/Spark/$0:** Per-submission overhead is `O(unanswered)` argmax in memory — negligible. No new cron, no new index, no dep (`scipy`/`stan` forbidden — closed-form + few Newton steps in TS).
* **Team:** One pure module + tests; single-person feasible.

### 2. What would actually be hard to casually copy
* **Hard:** Knowing *when not to adapt*. Sprint clones ship CAT at `N=6` and get diverging `a_i` → mistarget everything. The moat is the gate (`N<30 → p-value only`, `b_i>2.0 && low-θ>80% → re-label`) + `I_i` selection that minimizes test length at equal precision. That takes sustained calibration trials, not a weekend.
* **Pros:** Shorter tests, higher precision per contestant. **Cons:** Per-submission compute (trivial) + needs calibrated bank (real). **Limitations:** Useless without `≥30` attempts/item — state this in UI (`calibration: provisional` badge).

### 3. Correlated files — direct
* (New) `src/lib/cat-engine.ts` (`fisherInformation`, `estimateAbility`, `selectNextQuestion`)
* `src/services/analytics.service.ts` (extend `irtAvailable/irtDifficulty/irtDiscrimination` — already shaped in Round 1)
* `src/app/api/executive/analytics-data/route.ts` (pass-through, keep `select()` + `QUIZ_CAP 100 / QUESTION_CAP 200`)
* `src/components/analytics/DifficultyCalibrationTable.tsx` (`b_i` column + re-label badge)

### 4. Correlated files — indirect
* `src/lib/battle-server.ts:200` (`writeQuestionStats` — read shape only, never change write), `src/lib/battle-machine.ts` (`normalizeScoringConfig` untouched), `src/lib/constants.ts`, `src/lib/schemas.ts`, `src/hooks/useAnalytics.ts` (`CACHE_TTL 5min`), `firestore.rules` (no change — client `useAnalytics` stays `isExecutive`), `vercel.json` (on-demand, no cron).

### 5. Risk level + boundary
**LOW — pure function. LOCK in Phase 7.**
* Boundary: hook into `evaluateQuestionForUser` *response* path for next-item hint only; never alter `advanceQuestion tx.get/tx.set` order or `evaluate*` idempotency (`scored` re-check, `answered/timed_out/skipped`). Supplied directive to "hook into response path without altering locks" is correct — enforce it.
* **Do not touch:** `questionStats` write shape, caps, `select()` projections.

**LOCK verdict: LOCK.**

---

## 23. WebRTC Ephemeral State Sync & Peer-to-Peer Heartbeat Transport — PARK (RTDB stays authoritative)

*Supplied §3.23 baseline: RTDB polling + `onSnapshot` (`presence.service.ts:88`). Supplied upgrade: DataChannels with RTDB fallback. Supplied model: `T_latency = t_receive - t_send < Δ_RTDB_threshold`.*

### 1. Golden rules
* **College NAT reality:** Peer connection setup needs STUN (free) but NAT traversal failures need TURN (paid relay) — violates $0 until a paying client. Classroom NAT + firewall blocks UDP that RTDB (HTTPS/WebSocket) traverses fine. Vercel Hobby has no TURN to offer; college won't provide it.
* **Single source of truth:** RTDB `presence/{quizId}/{uid}` + `onDisconnect().remove()` + `.info/connected` (`src/services/presence.service.ts:40`) is ghost-free (Phase 64 lesson). A P2P shadow for scores/streaks creates split-brain (which wins when peers disagree?). Supplied "RTDB as fallback" inverts the correct hierarchy — fallback must be P2P visuals only, never state.
* **Team:** Signaling + ICE + reconnection + fallback matrix is a second networking stack for one person to own. Firestore `onSnapshot` is already sub-second; the latency win is unmeasurable at 60/section.

### 2. What would actually be hard to casually copy
* **Honest:** Nothing worth copying here at pilot scale. P2P streak visualizers are demo candy; the hard part (NAT-proof reliability) is exactly what would break in a real classroom. A competitor could demo it in a sprint and fail in production the same way.

### 3. Correlated files — direct
* (Would-be new) `src/services/webrtc-peer.service.ts` — **do not create in Set 2.**
* `src/services/presence.service.ts` (stays authoritative), `src/components/quiz/LiveQuiz.tsx` (stays `onSnapshot` + RTDB presence).

### 4. Correlated files — indirect
* `src/lib/command-center.ts` (`isOnline PRESENCE_WINDOW`), `database.rules.json` (no `spectators`-style P2P node), `vercel.json` (no signaling function), `src/hooks/useAuth.ts`.

### 5. Risk level + boundary
**HIGH if built (ghost presence + split-brain), ZERO value if parked. PARK — no promotion trigger short of a measured RTDB latency problem with traces.**
* Boundary if ever promoted: client broadcasts only (visualizer), RTDB authoritative for all state; `onDisconnect` disposers byte-identical.

**LOCK verdict: PARK. Supplied §3.23 + Phase 8 P2P item rejected for Set 2.**

---

## 24. Behavioral Anomaly Scoring & Key-Cadence Anti-Cheat Engine — LOCK as telemetry-only

*Supplied §3.24 baseline: `usePageFocusChange.ts` + `fullscreenchange`. Supplied upgrade: multi-signal `S_cheat = w1·σ²(t_keystroke) + w2·I_focus_lost + w3·max(0,1-t_elapsed/t_reading_min)`. Graduates Round-1 `warn_only/auto_flag`.*

### 1. Golden rules
* **Never block submit:** `firestore.rules:229-246` `submissions allow create` (`isOwner && isNotBlocked && isQuizParticipant && status=='live' && isCurrentQuestion && selected 0..3 && submittedAt==request.time`) is the fairness gate. Telemetry writes to `security_logs` async post-submit only. Any design that rejects a submission on keystroke variance violates fairness (fast readers, assistive devices) and the supplied `warn_only`-unless-escalated limitation.
* **$0/Vercel:** Feature-vector extraction is client-side (`LiveQuiz.tsx` keydown timestamps, focus deltas, selection-to-submit latency) — zero server cost. `security-log.ts` `logSecurityViolation` throttled path already exists.
* **Data model:** No new collection. Vectors ride as `metadata` on existing `security_violation` events (`actor, kind, detail, metadata {quizId, questionId, variance, focusLost}`).

### 2. What would actually be hard to casually copy
* **Hard:** Calibrated weights (`w1/w2/w3`) + `t_reading_min` per-question floor that keeps false positives down in real classrooms. That needs pilot data (distribution of honest keystroke variance), not clever math. A sprint clone ships the formula with guessed weights and flags half the class.
* **Pros:** Catches bot scripts + paste-from-second-screen without extensions. **Cons/ Limitations (supplied, confirmed):** Fast-reader/AT false positives; restrict to `warn_only` unless commander escalates `anti_cheat_strictness` (`AdvancedGovernanceSection` mapping already shipped).

### 3. Correlated files — direct
* `src/components/quiz/LiveQuiz.tsx` (feature-vector extractor: keydown `performance.now()` deltas, focus/blur deltas — additive hook, `handleAnswerSubmit` untouched)
* `src/hooks/usePageFocusChange.ts` (keep `visibilitychange/blur/pagehide` + `2000ms lastViolationRef` debounce)
* `src/lib/security-log.ts` (`logSecurityViolation` async path), `src/lib/constants.ts` (`ANSWER_GRACE 3s / VIOLATION 15s / SKEW 5s`, `governance.anti_cheat_strictness`)

### 4. Correlated files — indirect
* `src/lib/battle-server.ts` (`submission_clock_skew`, `answer_after_timeout` violation kinds — read only), `firestore.rules` (`participants allow update` violations-increment branch — no change), `src/services/participant.service.ts` (`violations_count` increment path), `src/components/quiz/WaitingRoom.tsx` (blocked/flagged surfacing), `src/app/api/executive/security-logs/route.ts` (event filters gain new `metadata` fields only).

### 5. Risk level + boundary
**MEDIUM if it blocks, LOW as telemetry. LOCK telemetry-only in Phase 8.**
* Boundary: extractor + async log only; `handleAnswerSubmit` confirmed-ids + `timeLeft` clamp + `submissionService.submitAnswer serverTimestamp+clientTime` byte-identical; `isCurrentQuestion` + `submittedAt==request.time` untouched.

**LOCK verdict: LOCK (telemetry-only).**

---

## 25. Multi-Agent AI Question Quality & Ambiguity Verification Engine — LOCK behind flag

*Supplied §3.25 baseline: single-pass Gemini + `repairJson` + Zod (`generate-quiz-pdf-flow.ts:1658`). Supplied upgrade: Solver vs Critique dual-agent, `D(Q)=P(Solver Correct|clear)-P(Solver Correct|ambiguous)`. Graduates Forge output discipline.*

### 1. Golden rules
* **Quota reality ($0):** Dual-agent doubles token burn per tick. `GEMINI_TIMEOUT 35s` + `TICK_QA 5` + `MAX_TICKS 40` + `60/min tick / 10/min create` (`src/lib/rate-limiter.ts`) already bound free-tier quota. Critique pass must be *opt-in per job* (`platform_settings.ai.critiqueEnabled` or per-request flag), default OFF until `getKeyHealth` shows headroom. Supplied 5-10s/tick cost is accurate — budget it against `RUN_WINDOW 30s` (`forge-worker` cron) or ticks overflow `maxDuration 60`.
* **One-call-per-tick contract (Phase 115C):** Solver generation is the tick's one call; critique must ride *inside the same tick's* second half only if time remains, else defer to next tick (tick N generates, tick N+1 critiques). Never two Gemini calls in one tick.
* **Data model:** No shape change. `QuizQuestionOutputSchema` gains optional `critique?: {discriminability, ambiguity}` (additive, like Round-1 `warnings[]`/`sources`). `forge_cache` key stays `sha256({kind,text,imageDataUris},difficulty,count)` — critiqued questions overwrite cache only when critique passes.

### 2. What would actually be hard to casually copy
* **Hard:** Discriminability threshold that doesn't nuke good hard questions (`D(Q)` high can mean "good discrimination" or "ambiguous" — need `b_i` join from R2-2/Feature 22 to disambiguate). The sustained work is the joint tuning (critique + IRT), not the second prompt.
* **Pros:** Zero ambiguous/multiple-correct before publish. **Cons:** 2x tokens + 5-10s/tick. **Limitations:** Accurate only with calibrated bank.

### 3. Correlated files — direct
* `src/ai/flows/generate-quiz-pdf-flow.ts` (`critiqueAgentPass` behind flag, `generateOnceForJob` reuse, `callModelWithRetry` rotation — no new retry semantics)
* `src/services/forge-job.service.ts` (`engine` field records `solver+critique` chain), `src/services/ai-log.service.ts` (`model` + `metadata.critique` additive), `src/config/gemini-models.ts` (no new provider — same `gemini-3.6-flash` chain)

### 4. Correlated files — indirect
* `src/ai/key-resolver.ts` (`withGeminiKeyRotation`, `24h/60s` cooldowns — reuse, never reimplement), `src/ai/genkit.ts` (`createGenkitForKey` per-request), `src/lib/rate-limiter.ts`, `src/app/api/cron/forge-worker/route.ts` (`RUN_WINDOW`, orphaned scan), `src/components/quiz/QuestionReviewPanel.tsx` (surface `critique` badge pre-`createArenaAtomic`), `src/app/api/executive/settings/route.ts` (`platform_settings.ai` flag).

### 5. Risk level + boundary
**MEDIUM — quota burn. LOCK flagged in Phase 7.**
* Boundary: prompt/output layer only (`buildPrompt` exemplars pattern from Round 1); `prepare-documents` budgets, `PAYLOAD_TEXT_PART 200k`, `TICK_QA 5`, `claimNextTick` gate, `contentHash` semantics, singleton-vs-`createGenkitForKey` all frozen per Round-1 Forge boundary.

**LOCK verdict: LOCK (flagged, quota-gated).**

---

## 26. Tournament Bracket & Multi-Arena Elimination Engine — CONDITIONAL (needs event)

*Supplied §3.26 baseline: isolated `quizzes`. Supplied upgrade: Swiss + single/double elimination + auto-progression. Supplied model: `Matchup(u_i,u_j)=argmin|S_i-S_j| ∉History`. Same as R2-5.*

### 1. Golden rules
* **Additive-only:** New `tournaments/{id} {name, created_by, created_at, status: draft|live|finished}` + `tournaments/{id}/rounds/{roundId} {quizIds[], winners[]}`. Existing `quizzes` gain optional `tournamentId` (nullable — `null` → standalone, no migration).
* **Vercel/Spark:** Bracket fan-out `tournament + N quizzes` capped `16 arenas/tournament`, `select()` projections, `<60s`. No new cron (advance via existing `advanceQuestion` per arena). Supplied stall-delay handling = manual `sweepStaleLiveArena 3h` per arena, not bracket-level timeout in Set 2.
* **Rules:** `match /tournaments/{id}` (`isExecutive` full, creator own, participant read when in any bracket arena). No cross-collection tx (Firestore limit) — advancement is sequential Admin writes with idempotency keys.

### 2. What would actually be hard to casually copy
* **Hard:** Bracket integrity without cross-doc tx (winners feed next round, losers can't re-enter) via `ALLOWED_TOURNAMENT_TRANSITIONS` mirroring `ALLOWED_QUIZ_TRANSITIONS` (`src/lib/constants.ts:32`). Most clones either allow re-entry bugs or lock the whole bracket in one tx that hits write limits.

### 3. Correlated files — direct
* (New) `tournaments` + `src/lib/tournaments.ts` + `src/app/executive/tournaments/*` + `src/app/api/executive/tournaments/*` (or `src/app/api/commander/tournaments` per supplied directive — pick executive-owner, commander-read; do not build both)
* `src/lib/constants.ts` (`COLLECTIONS.TOURNAMENTS`, `TOURNAMENT_STATUSES`)

### 4. Correlated files — indirect
* `src/lib/battle-server.ts` (`finishBattle` → report winner post-commit only), `src/app/api/executive/battles/*` (tournament filter), `src/components/battle/BattleReplay.tsx` (tournament view), `firestore.rules` + template + `firestore.indexes.json`, `src/services/audit.service.ts` (`tournament_*`), `src/services/notification.service.ts` (bracket-advance type if needed — prefer reuse `battle_completed`).

### 5. Risk level + boundary
**MEDIUM — new surface, cross-collection tx temptation. CONDITIONAL on a confirmed inter-college event.**
* Boundary: sequential Admin writes + idempotency keys; `battle-server` tx blocks byte-identical. Supplied `src/services/tournament.service.ts` + `/api/commander/tournaments` is correct shape — single owner namespace only.

**LOCK verdict: CONDITIONAL (event confirmed) else PARK.**

---

## 27. Offline-First PWA Submission Queue & Cryptographic Reconciler — CONDITIONAL (needs shell)

*Supplied §3.27 baseline: direct POST, fail on disconnect. Supplied upgrade: `sw.js` + IndexedDB queue + `HMAC_sub=SHA256(K_session∥quizId∥questionId∥optionIdx∥t_client)`. Same as R2-9.*

### 1. Golden rules
* **Timestamp authority never moves:** `firestore.rules` `submittedAt==request.time` + `question_id==path` + `selected 0..3` + `isCurrentQuestion` stays. Queued payloads carry `clientTime` (analytics) + `nonce`; server stamps `submittedAt` on receipt. Late flushes score as `timedOut` per `ANSWER_GRACE 3s / VIOLATION 15s / SKEW 5s` (`src/lib/constants.ts:71-73`) — correctly, not as correct answers. Supplied "signature verification into `submitAnswer`" is right only for *tamper evidence*, never for accepting client timestamps.
* **Cache scope (load-bearing):** Service worker caches static + history + question-bank reads only. Never cache `quizzes/*/questions` or `submissions` (stale questions = cheating surface; stale submission state = double-submit). Supplied `sw.js` queue handler must enforce this allowlist.
* **$0/Vercel:** IDB is free; FCM not required for queue (decouple from R2-10). No new cron. `sw.js` must not sit behind `maxDuration`.
* **Team:** Needs the PWA shell (R2-10-equivalent) first — queue without shell is cart-before-horse.

### 2. What would actually be hard to casually copy
* **Hard:** Correct failure semantics (late = timeout with a clear "received late" receipt, not silent drop or unfair accept). Most clones pick one wrong extreme. The HMAC is straightforward; the *semantics* are the moat.
* **Pros:** Zero lost submissions on spotty Wi-Fi. **Cons:** HMAC verify per submission + late-receipt UX. **Limitations:** Post-expiry delivery still loses (correctly).

### 3. Correlated files — direct
* (New) `public/sw.js` (allowlist cache + IDB queue), (new) `src/lib/submission-queue.ts` (enqueue/flush/nonce), `src/components/quiz/LiveQuiz.tsx` (`handleAnswerSubmit` → queue on `navigator.onLine===false`, `confirmedQuestionIds` reconciliation on flush)
* `src/services/game.service.ts` (`submissionService.submitAnswer serverTimestamp+clientTime` — verify path, never accept client time)

### 4. Correlated files — indirect
* `src/components/offline-detector.tsx` + `useOnlineStatus` (flush trigger), `src/lib/client-clock.ts` (offset still authority for deadline display), `src/lib/battle-server.ts` (`evaluate*` grace windows — read only), `firestore.rules` (no change), `src/firebase/provider.tsx` (`initializeFirestore` cache settings — lobby/history only, not live), `tests/phase114-responsive.spec.ts` (no-overflow must still pass with SW).

### 5. Risk level + boundary
**MEDIUM-HIGH — touches the submit path. CONDITIONAL on PWA shell + classroom Wi-Fi evidence.**
* Boundary: queue in `localStorage`/IDB only; `submittedAt==request.time` + `isCurrentQuestion` untouched; `offsetRef` deadline math untouched. Supplied directive is corrected here: verify HMAC for evidence, score by server clock.

**LOCK verdict: CONDITIONAL (shell + evidence) else PARK.**

---

## 28. Interactive Formula Vector Engine & Native MathLive Ingestion — LOCK

*Supplied §3.28 baseline: span-based `$$` styling (Round-1 Review lightweight render, no katex dep). Supplied upgrade: KaTeX/MathLive AST `RenderAST(LaTeX)→SVG/Canvas` in Forge + review + live. Supplied cost `+80KB` noted.*

### 1. Golden rules
* **Stores stay plain-text:** `question_bank.text`, `quizzes/*/questions.text`, `options[]` remain raw LaTeX strings (`$...$`/`$$...$$`). Rendering is view-layer only (`QuestionReviewPanel`, `LiveQuiz`, `QuestionPreviewModal`). No migration, no AST column. Supplied "without modifying plain-text stores" is correct — enforce it.
* **Bundle budget:** `+80KB` KaTeX is acceptable (First Load `103kB` baseline per AUDIT §4; KaTeX fonts lazy). MathLive (heavier, editor) is *not* needed in Set 2 — KaTeX render-only suffices. Supplied "MathLive/KaTeX" is narrowed here to KaTeX render.
* **Mobile:** Dynamic font scaling via `overflow-x:auto` + `text-[0.9em]` on small viewports (responsive suite `phase114-responsive` must still pass no-overflow at 375px).
* **Team:** One render component reused in three places; no new service.

### 2. What would actually be hard to casually copy
* **Moderate:** Correct LaTeX *input* path (Forge `buildPrompt` preserving `$` through `repairJson` quote-fixing without mangling backslashes) + consistent render across Forge/preview/live. Most clones render in one place and break in the other two. STEM at PSG iTech (Physics/Chemistry/Maths) makes this a real moat, not polish.
* **Pros:** Full STEM support. **Cons:** Bundle + mobile scaling. **Limitations:** Authoring still raw LaTeX (no visual editor in Set 2).

### 3. Correlated files — direct
* (New or extended) `src/components/quiz/MathFormula.tsx` (KaTeX `renderToString` + sanitized HTML), `src/components/quiz/QuestionReviewPanel.tsx` (preview + pre-publish render), `src/components/quiz/LiveQuiz.tsx` (question + options render), `src/components/quiz/QuestionPreviewModal.tsx`, `package.json` (add `katex` only — not `mathlive`)
* `src/ai/flows/generate-quiz-pdf-flow.ts` (`buildPrompt` LaTeX-preservation note + `repairJson` backslash guard — prompt layer only)

### 4. Correlated files — indirect
* `src/lib/quiz-validator.ts` (`MIN/MAX_QUESTION_LENGTH 5-500` counts raw chars including `$` — do not change), `src/components/ui/*` (dialog/card overflow), `src/app/create-quiz/page.tsx` (draft `localStorage` stores raw text), `next.config.ts` (KaTeX CSS/font handling), `tests/phase114-responsive.spec.ts` (375px overflow gate).

### 5. Risk level + boundary
**LOW — view-layer only. LOCK in Phase 7.**
* Boundary: raw stores byte-identical; `validateQuiz` lengths count raw text; `createArenaAtomic` payload unchanged. Supplied directive narrowed to KaTeX render (no MathLive input) for Set 2.

**LOCK verdict: LOCK.**

---

## 29. Dynamic Gamification, Mastery Badging & Cyber-Gladiator XP Economy — LOCK once list defined (else PARK)

*Supplied §3.29 baseline: rank + total score. Supplied upgrade: `XP_gained=(Score×0.1)(1+0.05·Streak)·I_win_bonus`, levels, streak multipliers, `users/{uid}/achievements`. Same as R2-6.*

### 1. Golden rules
* **Post-commit only:** Pure `src/services/gamification.service.ts` (`calculateXP`, `checkAchievements`) invoked after `finishBattle` resolves, never inside tx. `users/{uid}` profile writes via Admin SDK batched outside tx (XP updates rate-limited to avoid `users` doc contention — one write per battle per user max).
* **$0:** Computed from already-fetched `participants {score, best_streak}` + `questionStats` — zero new reads at award time.
* **Rules:** `users/{uid}/achievements/{id} {type, earnedAt, quizId}` → `allow read if isOwner || isExecutive`, `write if false` (Admin only). `NOTIFICATION_TYPES` gains `achievement_earned` (`src/lib/constants.ts:113`).
* **Team:** Needs the incentive list first (`first_win`, `streak_5`, `perfect_arena`, house-points mapping). Supplied background-trigger requirement is correct.

### 2. What would actually be hard to casually copy
* **Honest:** Little technically — the moat is *institutional* (PSG iTech house points + daily retention loop), not the equation. "Solid, not defensible" unless tied to real stakes. Build the economy the college actually rewards, not a generic badge engine.
* **Pros:** Retention + voluntary practice. **Cons:** Async triggers + rate-limited profile writes. **Limitations:** XP must not contend on `users` doc during live battle (post-battle only).

### 3. Correlated files — direct
* (New) `src/services/gamification.service.ts` + (new) `users/{uid}/achievements` + profile sections (`src/components/profile/GladiatorProfile.tsx`, commander profile)
* `src/lib/battle-server.ts` (post-commit hook call site only — tx blocks byte-identical)

### 4. Correlated files — indirect
* `src/services/participant.service.ts`, `src/services/notification.service.ts` (new type), `src/lib/constants.ts` (`NOTIFICATION_TYPES`), `firestore.rules` + template (achievements match), `src/app/api/executive/insights/route.ts` (XP distribution telemetry — additive).

### 5. Risk level + boundary
**LOW — post-commit only. LOCK once incentive list exists; PARK without it.**
* Boundary: never write achievements inside `evaluate*/advance/finish` tx; never update `users` doc during live battle.

**LOCK verdict: CONDITIONAL-LOCK (list defined) — default PARK until list lands.**

---

## 30. AI Vision Multi-Modal Ingestion & Visual Bounding-Box Extractor — CONDITIONAL (needs diagram set)

*Supplied §3.30 baseline: `prepare-documents.ts:168` full-page JPEG capped 24 total. Supplied upgrade: detection `Crop=[xmin,ymin,xmax,ymax] Conf>0.85`, per-diagram assets. Supplied limits (JPEG 0.75, payload caps) noted.*

### 1. Golden rules
* **Budgets frozen:** `MAX_TOTAL_IMAGES 24 / SCAN 6 / RENDER_LONG_SIDE 2240 / IMAGE_LONG_SIDE 1600 / JPEG 0.8` (`prepare-documents.ts:70-77`) + server `MAX_EXTRACTED 24/500k` + `PAYLOAD_TEXT_PART 200k` + `TICK_QA 5`. Cropped boxes *replace* full-page renders within the same 24 budget (never add). Supplied JPEG 0.75 recompression is accepted only for crops (keep 0.8 for full pages to avoid double-degrade).
* **Client memory:** Region-growing on `2240px` canvas + per-box `toDataURL` spikes memory on low-end classroom devices. Cap boxes per page (e.g., 4) + total boxes per job (e.g., 12 within the 24 budget) + `willReadFrequently` context already in `renderScannedPage`.
* **$0/Vercel:** No object-detection model download (paid/heavy). Set-2 version is heuristic (connected-component / whitespace-split region growing on canvas, not a DNN). A DNN detector is V2.0 with a paying client.
* **Data model:** `PreparedDocument.imageDataUris[]` shape unchanged (crops are just more URIs, fewer full pages). `contentHash` semantics unchanged.

### 2. What would actually be hard to casually copy
* **Hard:** Box-to-question assignment (which crop belongs to which generated question's options) via `imageDataUris` index + prompt referencing `Figure k`. Most clones attach all crops to all questions (waste + confusion).
* **Pros:** Textbook diagrams → visual options directly. **Cons:** Memory + prompt complexity. **Limitations:** Heuristic boxes misfire on dense pages — needs the `0.85` confidence gate + fallback to full-page render.

### 3. Correlated files — direct
* `src/lib/prepare-documents.ts` (`extractPdfFile` region-growing branch + box caps — budgets frozen), `src/components/quiz/PDFQuizGenerator.tsx` (per-box progress + truncation notes), `src/ai/flows/generate-quiz-pdf-flow.ts` (`buildVisionPrompt` `Figure k` referencing — prompt only)

### 4. Correlated files — indirect
* `src/services/forge-job.service.ts` (`img_N` per-doc sharding already handles crops), `src/lib/rate-limiter.ts`, `src/services/ai-log.service.ts` (`fileTypes` gains `diagram` marker — additive), `firestore.rules` (no change), `next.config.ts` (canvas tracing already covers `@napi-rs/canvas`).

### 5. Risk level + boundary
**MEDIUM-HIGH — client memory + prompt complexity. CONDITIONAL on a textbook-diagram pilot set.**
* Boundary: heuristic only (no model download); box caps within 24; `claimNextTick`/lease/`contentHash` frozen. Supplied "update prepare-documents while maintaining caps" is correct — enforce the caps as the test.

**LOCK verdict: CONDITIONAL.**

---

## 31. Acoustic Narration & Voice-Guided Arena Controller — PARK

*Supplied §3.31 baseline: text-only rendering. Supplied upgrade: `AudioStream=TTS(QuestionText∥Options, VoiceConfig)`, `AcousticPlayer.tsx` via SpeechSynthesis + cache.*

### 1. Golden rules
* **Classroom reality:** 60 devices playing TTS simultaneously is chaos, not accessibility. Real accessibility need (screen-reader labels, focus order, `aria-live` timers) is already covered by Round-1 `LiveQuiz` a11y work + `phase113-e2e` skip-link gate. Browser `SpeechSynthesis` voices vary by device; Web Audio autoplay policies block unmuted playback without gesture.
* **$0/bandwidth:** Neural TTS API is paid; `SpeechSynthesis` is free but inconsistent. Audio asset caching adds storage for zero assessment gain.
* **Team:** No accessibility stakeholder asking for narration; WCAG can be met with labels already shipped.

### 2. What would actually be hard to casually copy
* **Honest:** Nothing defensible here at pilot scale. Immersion ≠ assessment. A competitor demos voice in a sprint; classrooms mute it.

### 3. Correlated files — direct
* (Would-be new) `src/components/quiz/AcousticPlayer.tsx` — **do not create in Set 2.**

### 4. Correlated files — indirect
* `src/components/quiz/LiveQuiz.tsx` (timers already `aria-live`), `src/components/ui/*`.

### 5. Risk level
**LOW risk, ZERO urgency. PARK — no promotion trigger short of a formal accessibility audit requiring narration.**

**LOCK verdict: PARK. Supplied §3.31 rejected for Set 2.**

---

## 32. Enterprise SSO & Federated Identity Provider (SAML 2.0 / OIDC) — PARK (needs IdP metadata)

*Supplied §3.32 baseline: Firebase Email/Password + Google OAuth. Supplied upgrade: `Token_claims=VerifySAML(Assertion_xml,K_idp)→{uid,email,role,orgId}`, JIT provisioning. Supplied constraint (custom-claims sync) noted.*

### 1. Golden rules
* **Auth hardening area:** `verify-auth.ts` customClaims-first + `users/{uid}` single-read + `mustChangePassword` TOCTOU fix is battle-tested. SAML/OIDC assertion verify (`VerifySAML`) runs *before* `verifyIdToken` as a separate exchange that mints a Firebase custom token (`adminAuth.createCustomToken(uid, {role, orgId})`), never inside `verifyFirebaseToken*` parsers.
* **College infra:** Needs IdP metadata XML (AD/Okta/Shibboleth entityID, SSO URL, X.509 cert) + attribute map (which SAML attr → `role`/`orgId`) + test accounts. PSG iTech hasn't provided any. Without metadata, this is unbuildable — not just parked, *blocked*.
* **$0:** SAML library (`samlify`/`passport-saml`) is free; the cost is configuration + claim-mapping maintenance per institution (multiplies with R2-12 tenancy).

### 2. What would actually be hard to casually copy
* **Hard:** Correct JIT role provisioning without privilege escalation (SAML `role` attr must never self-assert `executive` — allowlist `commander|gladiator` only, executive via existing admin path). That's real sustained security work — but with no IdP to integrate, it's shelfware.

### 3. Correlated files — direct
* (Would-be) `src/app/api/auth/saml/*` (metadata + ACS + JIT), `src/lib/verify-auth.ts` (additive IdP-claim reader — parsers untouched), `src/lib/constants.ts` (`STAFF_EMAIL_DOMAIN` interaction)

### 4. Correlated files — indirect
* Every `src/app/api/*` route (all call `verify*` — behavior unchanged for Bearer), `src/contexts/AuthContext.tsx`, `firestore.rules` (uses `request.auth` either way — no change), `src/app/login/page.tsx` (`?demo=` + SSO button placement).

### 5. Risk level + boundary
**HIGH blast radius. PARK — promote only on IdP metadata + test accounts.**
* Boundary if promoted: exchange mints custom tokens; core `verifyIdToken` + role/claims logic byte-identical. Supplied "without altering standard helpers" is correct — enforce it.

**LOCK verdict: PARK.**

---

## 33. Granular RBAC & Dynamic Policy Matrix — LOCK additive-only

*Supplied §3.33 baseline: coarse `executive|commander|gladiator`. Supplied upgrade: capability vectors `HasPermission(RoleMask,CapMask)=(RoleMask&CapMask)==CapMask` (TA, Guest Evaluator, Auditor). Supplied limits (claim size, rule-tree complexity) noted.*

### 1. Golden rules
* **Claim-size reality:** Custom claims cap ~1000 bytes. Capability masks must pack into a small int map (`capabilities: {bank_edit:1, analytics_export:1}`), not free-form strings. Bitwise masks in supplied model are correct direction; implement as named caps → bit positions in `src/lib/permissions.ts` (new, pure).
* **Rules-tree cost:** Every capability check in `firestore.rules` costs `get()`s. Keep enforcement *server-side* (`verify-auth hasPermission` in API routes) + coarse rules unchanged (`isExecutive/isCommander` gates stay). Fine-grained rules per capability would explode the 10-get limit — do not do it in Set 2.
* **$0/Vercel:** Pure helper + route guards; no new collection, cron, or index.

### 2. What would actually be hard to casually copy
* **Moderate:** The *matrix* (which caps imply which — e.g., `bank_edit` implies `bank_read`) + migration of existing three roles to masks without breaking `getRole()=='commander'` checks everywhere. Sustained audit work, not algorithm.
* **Pros:** TA/Auditor sub-roles without new role strings. **Cons/Limitations:** Claim size + rule-tree complexity (both managed by server-side enforcement).

### 3. Correlated files — direct
* (New) `src/lib/permissions.ts` (`CAPABILITIES`, `ROLE_MASKS`, `hasPermission(token,cap)` pure), `src/lib/verify-auth.ts` (expose helper — parsers untouched)

### 4. Correlated files — indirect
* `src/app/api/executive/*` + `src/app/api/commander/*` (per-route `hasPermission` guards added alongside `verifyFirebaseTokenWithRole`), `src/components/ExecutiveSidebar.tsx` + `CommanderSidebar.tsx` (hide links without caps — UI only), `firestore.rules` (no fine-grained change in Set 2), `src/lib/constants.ts` (`ROLES` stays source of truth for coarse roles).

### 5. Risk level + boundary
**MEDIUM — guard-sprawl risk. LOCK additive-only in Phase 6.**
* Boundary: coarse `verifyFirebaseTokenWithRole` checks stay first; `hasPermission` is second gate. Never replace role checks with masks in the same PR. Supplied directive is correct — enforce it.

**LOCK verdict: LOCK.**

---

## 34. Data Warehouse Sync & CDC Pipeline to BigQuery — PARK (no BI reader)

*Supplied §3.34 baseline: operational analytics on live Firestore. Supplied upgrade: `EventStream(e_t)→BigQuery partitionBy created_at` via Eventarc/CF webhooks. Same as R2-15.*

### 1. Golden rules
* **$0/eventual consistency:** Eventarc + BigQuery sandbox are free to a point, but sync without a dashboard reader is pure cost (reads for export + 5-10s lag dashboards nobody opens). Current `analytics-data select()` + `questionStats` denormalization already keeps live queries off `submissions` scans.
* **Vercel:** Webhooks must not sit in API-request path (affect `60s` latency). Eventarc triggers are separate functions — needs Blaze plan for Cloud Functions (Spark blocks it). That alone parks it until a paying client.
* **Team:** Pipeline ops (schema drift, backfill, partition expiry) without a BI owner is toil.

### 2. What would actually be hard to casually copy
* **Honest:** Nothing at pilot scale. Longitudinal research queries are real in year two, shelfware in term one.

### 3. Correlated files — direct
* (Would-be) Eventarc triggers on `quizzes/submissions` mutations — **do not create in Set 2.** `src/app/api/executive/export/route.ts` (`json/csv` + `escCsv` guard stays the export path).

### 4. Correlated files — indirect
* `src/services/analytics.service.ts`, `src/app/api/executive/analytics-data/route.ts`.

### 5. Risk level
**LOW risk, ZERO urgency. PARK.**

**LOCK verdict: PARK. Supplied §3.34 rejected for Set 2.**

---

## 35. Dynamic Multilingual Translation & Localization Engine — CONDITIONAL (needs locale owner)

*Supplied §3.35 baseline: monolingual English. Supplied upgrade: `next-intl` + `Q_target=GeminiTranslate(Q_src,Lang_target,PreserveContext:true)`, `ai_translations/{hash}` cache. Same family as R2-11 (chrome i18n parked). Split verdict here: chrome stays parked, quiz-content translation is conditional.*

### 1. Golden rules
* **Chrome vs content split (load-bearing):** App chrome (`next-intl` dictionary across every `page.tsx`/`components/*` + `middleware.ts` locale routing — currently pass-through) is parked unconditionally (no locale owner; machine Tamil chrome without reviewer is worse than English-only). Quiz-content translation (`/api/quiz/translate` + `ai_translations/{hash}` SHA256 of `(questionId+text+targetLang)`, Admin-only read/write like `ai_mindmaps`/`ai_explanations`) is conditional on a bilingual classroom need.
* **Quota:** Translation burns Gemini tokens per question per lang. Cache (`30d` TTL like `forge_cache`) + per-uid rate limit (`AI_API_PER_USER` family, e.g., `TRANSLATE 10/min`) required. Technical-term accuracy needs domain prompts (supplied limitation confirmed).
* **$0/Vercel:** `withTimeout 30s` < `maxDuration 60`; `TRANSLATE_TIMEOUT` mirrors `EXPLANATION_TIMEOUT 30s`. No new cron.
* **Data model:** Translations are derived cache (`ai_translations`), never source. Source `question_bank.text`/`options` stay English.

### 2. What would actually be hard to casually copy
* **Moderate:** `PreserveContext:true` domain prompts that keep technical terms (e.g., mitosis) untranslated while translating stems — needs per-subject glossaries. That's sustained linguistic work, not a translate call.

### 3. Correlated files — direct
* (Conditional-new) `src/app/api/quiz/translate/route.ts` (`Bearer||body.idToken`, per-uid limit, `stableDocId SHA256(questionId+targetLang)`), (conditional-new) `ai_translations/{hash}` collection, `src/ai/flows/translate-flow.ts` (pattern-match `explanation-flow.ts` rotation/timeout/logging)

### 4. Correlated files — indirect
* `src/ai/key-resolver.ts` (rotation reuse), `src/ai/genkit.ts` (`createGenkitForKey`), `src/services/ai-log.service.ts` (`fileTypes: ['translate']`), `src/lib/rate-limiter.ts`, `firestore.rules` (`ai_translations if false`), `src/components/quiz/QuestionReviewPanel.tsx` (show translation alongside source — never replace source).

### 5. Risk level + boundary
**MEDIUM — quota + terminology risk. CONDITIONAL on a bilingual need + glossary owner; chrome i18n stays PARKED.**
* Boundary: never replace source text; cache key includes `targetLang`; translator role-gated (`commander|executive` for bank, `gladiator` only for own wrong-answer explanation language variant if ever).

**LOCK verdict: CONDITIONAL (content) / PARK (chrome).**

---

## 36. Automated Spaced-Repetition Practice Bot & Arena Scheduler — LOCK

*Supplied §3.36 baseline: manual creation. Supplied upgrade: `R(t)=e^{-t/s}`, `t_next=t_last-S·ln(0.85)` cron worker on `prediction-engine` analytics. Same family as R2-14 (scheduler infra) but scoped to a single worker — lockable.*

### 1. Golden rules
* **Cron slots:** Reuse `forge-worker`'s `RUN_WINDOW 30s / MAX_PER_RUN 6 / CRON_SECRET` pattern; piggyback GitHub hourly (no third `vercel.json` cron — Hobby fails). Practice arenas are regular `quizzes` docs (`created_by` = system commander id or owning commander, `tournamentId null`, `source: 'spaced_repetition'`) so all existing rules/analytics/replay work unchanged.
* **Quota:** Each practice arena costs Forge jobs (same `ai_jobs` + `10/min create`). Per-schedule quota budget required (e.g., max 2 practice arenas/night) or it starves interactive Forge. Gate by `getKeyHealth` (skip night when all keys cooling).
* **Cleanup:** Auto-generated practice quizzes need TTL (`expiresAt` like `FORGE_JOB_TTL 6h`, longer e.g., 30d) + `cleanupExpired`-style sweeper, or banks accumulate.
* **$0/Team:** One worker file + existing `prediction-engine getQuizRecommendations` + `M_c(t)` decay (Round-1 G-ADV2). No new collection.

### 2. What would actually be hard to casually copy
* **Hard:** `t_next` calibration per category (`S` strength per `M_c(t)` mastery, not global) + "don't spam" policy (max 1 practice arena per gladiator per 3 days). A sprint clone spams daily quizzes; the moat is restraint tuned to retention data.
* **Pros:** Reinforces weak areas at optimal intervals. **Cons:** Background docs need cleanup. **Limitations:** Free-tier cron quotas (supplied, confirmed).

### 3. Correlated files — direct
* (New) `src/app/api/cron/spaced-repetition/route.ts` (`Bearer CRON_SECRET`, `RUN_WINDOW`, quota budget, TTL), `src/ai/engines/prediction-engine.ts` (reuse `getQuizRecommendations` + `personalization` wrongRate), `src/services/forge-job.service.ts` (reuse `createJob` for practice content if generated, else bank-sampled)

### 4. Correlated files — indirect
* `src/app/api/cron/forge-worker/route.ts` (pattern + orphaned scan), `.github/workflows/forge-worker.yml` (slot), `src/ai/key-resolver.ts` (`getKeyHealth`), `src/services/ai-log.service.ts`, `src/services/participant.service.ts` (practice join = normal join), `src/app/api/battle/can-join/route.ts` (same preflight), `src/lib/constants.ts` (`SCHEDULER_*` if added — else reuse `FORGE_*`).

### 5. Risk level + boundary
**MEDIUM — quota starvation. LOCK in Phase 10 with budget caps.**
* Boundary: max N/night + `getKeyHealth` gate + TTL cleanup; never a third `vercel.json` cron in Set 2. Supplied directive (leverage `prediction-engine`) is correct — enforce it.

**LOCK verdict: LOCK (budget-capped).**

---

## 37. Collaborative Co-Commander Quiz Authoring & Live Sync — LOCK (smallest collaboration win)

*Supplied §3.37 baseline: single `created_by`. Supplied upgrade: `State_{t+1}=CRDT_Merge(State_t,Δ1,Δ2)` OT/CRDT in `QuizCreatorForm`, `co_commanders[]`, LWW fallback.*

### 1. Golden rules
* **No CRDT in Set 2 (explicit):** Full OT/CRDT is a second sync stack for one person to own. Set-2 version is *presence + field-level LWW with presence awareness* (who's editing which question, last-write-wins with `updatedAt`, conflict banner showing other editor's name). That delivers 80% of teaching-team value at 10% of the cost. CRDT merge is V2.0 with a paying client.
* **Rules (load-bearing):** `quizzes/{id} co_commanders: string[]` + helper `canEditQuiz = isQuizCreator || co_commanders.hasAny([uid]) || isExecutive`. `questions/answerKeys allow update,delete: if canEditQuiz` (widens from `isQuizCreator` — audit this diff line-by-line; it is the one deliberate rule widening in Set 2). `config/settings` stays creator+executive-only (scoring/governance never co-editable in Set 2).
* **Data model:** `co_commanders` additive array (old arenas `[]` → solo). `updatedAt` per question doc for LWW display. No migration.
* **Vercel/Spark:** Presence via existing RTDB (`presence/{quizId}/{uid}` + `onDisconnect`) or Firestore `typing`-style ephemeral doc — reuse `WaitingRoom` presence pattern, no new infra.

### 2. What would actually be hard to casually copy
* **Moderate:** LWW *with* presence (not blind LWW) — showing "Anitha is editing Q3" prevents most conflicts without OT. Most clones either lock the whole doc (annoying) or silent-overwrite (data loss). The moat is the presence-aware UX, not the merge math.
* **Pros:** Teaching teams build exams together. **Cons:** Field locks. **Limitations:** Simultaneous option edits → LWW (supplied, accepted — with a visible conflict banner, not silent).

### 3. Correlated files — direct
* `quizzes/{id} co_commanders[]` + (new) `src/lib/co-edit.ts` (presence helpers, LWW `updatedAt` compare — not CRDT), `src/components/quiz/QuizCreatorForm.tsx` + `src/components/quiz/QuizEditor.tsx` (presence badges + conflict banner), `firestore.rules` + template (`canEditQuiz`)

### 4. Correlated files — indirect
* `src/services/quiz.service.ts` (`updateQuiz` whitelist + `canEditQuiz` server check), `src/services/game.service.ts` (`replaceQuizContent` — co-editors allowed in Set 2 only for `waiting` arenas), `src/components/quiz/QuestionBankImportModal.tsx` + `AICopilot.tsx` (append paths respect `canEditQuiz`), `src/hooks/useAuth.ts`, `.github/workflows/ci.yml` (hash gate covers rule widening), `src/services/audit.service.ts` (`quiz_co_edited` action).

### 5. Risk level + boundary
**MEDIUM-HIGH — the one deliberate rule widening. LOCK in Phase 9 with line-by-line rule audit.**
* Boundary: `config/settings` never co-editable; `live` arenas never co-editable (`replaceQuizContent waiting`-only guard stays); `co_commanders` editable only by creator+executive. Supplied directive is corrected here: add `co_commanders` + `canEditQuiz`, do NOT attempt OT/CRDT in Set 2.

**LOCK verdict: LOCK (LWW+presence, not CRDT).**

---

## 38. Granular Session Management & Token Revocation Engine — LOCK read-only checker (milestone-gated full rollout)

*Supplied §3.38 baseline: stateless 1h ID tokens. Supplied upgrade: `ValidSession=Verify(T)∧¬Exists(revoked_tokens[u.uid].t>T.issued_at)`, session cookies + instant revocation. Same as R2-18.*

### 1. Golden rules
* **Alongside, never replacing, in Set 2:** `verify-auth.ts` gains a read-only `isRevoked(uid, issuedAt)` check (`revoked_tokens/{uid} {revokedAt}` via Admin SDK, cached in-memory with TTL) called *after* `verifyIdToken` succeeds. Bearer header fallback stays byte-identical. Session-cookie issuance (`__session` + `verifySessionCookie`) ships only behind the hardening milestone with live creds to test expired/revoked/`mustChangePassword`+cookie combos.
* **$0:** `revoked_tokens` is tiny (one doc per revoked user, TTL-pruned). One extra Admin read per request only when cache misses — negligible vs `users/{uid}` role read already paid.
* **Team:** Needs the test matrix (expired, revoked, shared-device sign-out-everywhere vs this-device) — do not ship full cookie issuance without it.

### 2. What would actually be hard to casually copy
* **Hard:** Correct sign-out-everywhere vs this-device semantics on shared classroom devices without locking out the next class. Real product work with high blast radius — which is why Set 2 ships the *checker* (safe) and gates the *issuer* (risky) on the milestone.
* **Pros:** Instant global sign-out + access revocation. **Cons:** Extra cache lookup. **Limitations:** Cache staleness window (documented TTL).

### 3. Correlated files — direct
* `src/lib/verify-auth.ts` (additive `isRevoked` post-verify — parsers untouched), (new, gated) `revoked_tokens/{uid}`, `src/contexts/AuthContext.tsx` (`signOut` writes revocation when "everywhere" chosen), `src/middleware.ts:15` (stays pass-through in Set 2 — first real job deferred with i18n routing)

### 4. Correlated files — indirect
* Every `src/app/api/*` route (behavior unchanged for valid Bearers), `src/components/ClientLayout.tsx:30` (`mustChangePassword` redirect unchanged), `src/app/api/auth/change-password/route.ts` (`auth_time 5min` freshness unchanged), `firestore.rules` (uses `request.auth` either way — no change).

### 5. Risk level + boundary
**HIGH if issuer ships without matrix; LOW as checker. LOCK checker in Phase 6, gate issuer on milestone.**
* Boundary: checker reads `revoked_tokens` without breaking Bearer fallback. Supplied directive is corrected here: read-only check now, cookies on milestone.

**LOCK verdict: LOCK (checker) / GATE (issuer).**

---

## 39. Automated SIEM Security Telemetry & Webhook Exporter — LOCK (telemetry, non-blocking)

*Supplied §3.39 baseline: internal `security_logs`. Supplied upgrade: `CEF_Format(e)="CEF:0|Quorena|Platform|1.0|"+e.type+"|"`, streaming to Datadog/Splunk/Cloud Logging. Formula and non-blocking requirement confirmed.*

### 1. Golden rules
* **Non-blocking (load-bearing):** `extend security-log.ts` with fire-and-forget `fetch(webhook, {CEF payload})` + `catch(()=>warn locally)` — never `await` in request path, never throw. Failed deliveries log `console.warn` + optional `auditLogs` entry, never 500 the API. Supplied limitations confirmed verbatim.
* **$0:** Webhook URLs in env (`SIEM_WEBHOOK_URL` optional — absent → no-op). No new collection; formats existing `security_logs` docs (`event, actor, detail, metadata, createdAt`).
* **Data model:** No schema change. CEF string is derived at export time.

### 2. What would actually be hard to casually copy
* **Low technically, high operationally:** The moat is *having* the exporter when an institution's security review asks for it (go/no-go procurement item), not the formatter. Honest: "checkbox moat."
* **Pros:** Real-time enterprise monitoring + incident response. **Cons:** Retry bookkeeping. **Limitations:** Local-warn on failure (accepted).

### 3. Correlated files — direct
* `src/lib/security-log.ts` (additive `dispatchSIEM` fire-and-forget), (new, tiny) `src/lib/siem.ts` (`toCEF`, `dispatch` — pure + fetch wrapper for testability)

### 4. Correlated files — indirect
* `src/app/api/executive/security-logs/route.ts` (filters gain no new fields — CEF is export-time), `src/app/api/executive/insights/route.ts` (`eventBreakdown` unchanged), `src/services/audit.service.ts` (optional failure log), `vercel.json` (no new function — dispatch rides existing request lifecycle, fire-and-forget).

### 5. Risk level + boundary
**LOW. LOCK in Phase 10.**
* Boundary: never `await` dispatch in request path; never crash API on webhook failure. Supplied directive is correct — enforce it.

**LOCK verdict: LOCK.**

---

## 40. Peer-to-Peer Team Battles & Squad Scoring Engine — CONDITIONAL-LOCK (needs RFC, same as R2-4)

*Supplied §3.40 baseline: `participants/{uid}` individual. Supplied upgrade: `squads/{squadId}`, `S_squad=ΣS(u)(1+0.1·ActiveSquadMembers)`, `squad_id` filter in `LiveLeaderboard`. Supplied cons/limitations (aggregation complexity, no mid-battle reassignment) confirmed. Consolidates R2-4 `teams` vs supplied `squads` naming — lock `squads` as the term (classroom-friendly), keep `teams` as alias in code comments only.*

### 1. Golden rules
* **Breaking-migration warning (explicit):** New `quizzes/{quizId}/squads/{squadId} {name, memberIds[], score}` + per-squad scoring. Existing `participants/{uid} {score}` stays per-glider; squad score derived `Σ(member scores)·(1+0.1·active)` — no dual-write (split-brain guard). Pre-squad arenas read `squads=[]` → solo mode unchanged. No mid-battle reassignment (supplied limitation enforced in rules: `squads` writes blocked once `status in [live,paused]`).
* **Vercel/Spark:** `evaluateQuestionForAll` two-phase `plans[]` near `500/tx` — squad aggregation outside tx (`Promise.all` post-commit like `writeQuestionStats`), never inside. `LiveLeaderboard` dual-rank (team + individual) from same `participants` snapshot (no second listener).
* **Rules:** New `match /quizzes/{quizId}/squads/{squadId}` mirroring `participants` (`isQuizCreator` write pre-live, `canReadArena` read). `submissions isCurrentQuestion` unchanged (still per-glider). Template → generate → hash gate includes it.
* **Team:** RFC first (sum-vs-average settled here as supplied sum-with-activity-bonus; block/flag per-glider not per-team; `option_shuffle` per-glider stays).

### 2. What would actually be hard to casually copy
* **Hard (most on this list):** One engine serving solo+squad without forking `battle-server`, dual-rank leaderboard from one snapshot, `BattleReplay` per-squad trajectories from per-glider deltas. Sprint clones fork a second app; the moat is the unified engine.
* **Pros:** Collaboration + group competition. **Cons:** Aggregation complexity. **Limitations:** No mid-battle reassignment (enforced).
* **Honest scope check:** If PSG iTech doesn't need squads this term, this is the most expensive build — conditional despite being most defensible.

### 3. Correlated files — direct
* (New) `quizzes/{quizId}/squads/{squadId}` + `src/lib/squads.ts` (`squadScore(members,active)`, `assignSquads` — `teams.ts` name not used; comment alias), `src/lib/battle-machine.ts` (add `squadScore` helper alongside `computeCorrectScore` — scoring core untouched), `src/components/quiz/LiveQuiz.tsx` (`LiveLeaderboard` `squad_id` grouping + filter), `src/components/quiz/WaitingRoom.tsx` (squad lobby), `src/components/battle/BattleReplay.tsx` (per-squad trajectories), `src/app/api/battle/*` (no new routes initially — assignment via Admin `updateQuiz`-style route)

### 4. Correlated files — indirect
* `src/services/participant.service.ts` (`joinQuiz` + squad assignment), `src/services/game.service.ts` (`submissions`), `src/lib/constants.ts` (`COLLECTIONS.SQUADS`, `PS_*`), `firestore.rules` + template + `firestore.indexes.json` (`squads` indexes), `src/components/executive/command-center/*` (squad heatmap), `src/services/analytics.service.ts` (per-squad aggregates), `src/app/api/executive/battles/[id]/route.ts` (`submissionsByUserId` → squad rollup), `src/services/notification.service.ts` (reuse `battle_completed` — no new type in Set 2).

### 5. Risk level + boundary
**CRITICAL — the only Set-2 item touching `battle-server` scoring paths. CONDITIONAL-LOCK on RFC sign-off.**
* Boundary: all existing tx blocks byte-identical, post-commit aggregation only. Any change to `advanceQuestion tx.get/tx.set` order or `evaluate*` idempotency in the same PR is forbidden. Supplied "squad logic above transaction blocks" is correct — enforce it.

**LOCK verdict: CONDITIONAL-LOCK (RFC signed) else PARK.**

---

## Preservation Matrix — Set 2 (extends Round-1 perimeter, same enforcement)

| Subsystem / Module | Responsibility | File & lines | Refusal directive (Set 2) |
|---|---|---|---|
| Atomic battle tx | State transitions, scoring writes, advancement | `src/lib/battle-server.ts:256-930` | **Zero refactoring.** Squad/CAT/adaptive sit above tx blocks (22, 40 post-commit only). |
| Token claims & triad | Role auth, token verify, password gate | `src/lib/verify-auth.ts:24-169` | Read-only claim additions (`orgId`, caps, revocation read). Core parsing untouched (21/32/33/38). |
| Security rule matrix | Write prohibitions, domain checks, transition gates | `firestore.rules:1-484` via `firestore.rules.template` + `scripts/generate-firestore-rules.js` | Compile-only edits; hash gate in `.github/workflows/ci.yml` must stay green (all rule-touching items). |
| RTDB presence | Ephemeral tracking, disconnect cleanup | `src/services/presence.service.ts:1-120`, `database.rules.json` | `onDisconnect().remove()` immutable (23 parked, 27 conditional, R2-8 spectator pattern). |
| Fixed-window limiter | Throttle across mutating endpoints | `src/lib/rate-limiter.ts:43-168` | Counter logic frozen; new routes apply `enforceRateLimit` (all Set-2 routes). |
| Key rotation locks | Multi-key rotation, cooldowns | `src/ai/key-resolver.ts:255-438` | Sync index mutations immutable; multi-agent flows reuse `withGeminiKeyRotation` (25). |
| Ingestion budgets | Client re-encode, payload caps | `src/lib/prepare-documents.ts:168-370` | `24/40k/6` + `200k` + `TICK_QA 5` frozen (25/28/30). |
| Scoring math | Time-decay, streak, penalties | `src/lib/battle-machine.ts` | Formula frozen per `ROADMAP.md` out-of-scope (22/29/40 read it, never rewrite it). |

---

## Implementation Roadmap — Set 2 (5 phases, non-breaking, gates before proceeding)

*Each phase lists entry gate (all must hold) and exit proof.*

```
Phase 6: Enterprise Identity & Sessions (33, 38-checker)
  + R2-20 suite + R2-16 caps as zero-risk prefix
  Gate: second-institution need confirmed PARK for 21/32 (do not build).
  Proof: tsc + hash gate + phase113-e2e + idempotency spec green.
Phase 7: Adaptive Ingestion & Assessment (22, 25-flagged, 28, 30-conditional)
  Gate: bank N≥30 for CAT calibration display; getKeyHealth headroom for critique.
  Proof: Forge e2e (critique ON/OFF), KaTeX 375px no-overflow, box-cap test.
Phase 8: Offline Resilience & Behavioral (27-conditional, 24-telemetry, 31-parked)
  Gate: PWA shell exists for 27; warn_only for 24.
  Proof: airplane-mode submit → late-receipt timeout (not correct); security_logs metadata present.
Phase 9: Tournament & Squads & Co-edit (26-conditional, 40-conditional, 37, 29-with-list)
  Gate: event confirmed (26), RFC signed (40), incentive list (29), rule-diff audit (37).
  Proof: 16-arena bracket advance by Admin writes; solo arenas unaffected (teams=[]).
Phase 10: Enterprise Telemetry & Scheduling (39, 36-budget-capped, 34-parked, 35-conditional)
  Gate: SIEM URL optional (no-op when absent); scheduler max N/night + TTL.
  Proof: webhook no-op + failure warn-only; practice arenas TTL-swept.
```

### Phase details (OpenCode directives, bind on implementation prompts)

* **Phase 6:** Extend `verify-auth.ts` with `hasPermission` + `isRevoked` readers; `src/lib/permissions.ts` new pure; `revoked_tokens/{uid}` new (Admin-only). No parser/rulestree changes beyond `co_commanders` in Phase 9.
* **Phase 7:** `src/lib/cat-engine.ts` new pure; `generate-quiz-pdf-flow.ts` `critiqueAgentPass` flagged + overlap windows; KaTeX `MathFormula.tsx` render-only; box-heuristic within 24-budget (conditional).
* **Phase 8:** `sw.js` allowlist + `src/lib/submission-queue.ts` IDB (conditional); `LiveQuiz.tsx` vector extractor + async `security_logs` (telemetry-only); 31 not built.
* **Phase 9:** `tournaments` *or* `squads` only with triggers; `co_commanders[]` + `canEditQuiz` single widening with audit; `gamification.service.ts` post-commit with list.
* **Phase 10:** `src/lib/siem.ts` (`toCEF` pure + fire-and-forget `dispatch`); `src/app/api/cron/spaced-repetition/route.ts` budget-capped + TTL; 34 not built; 35 content-translate conditional (`ai_translations/{hash}`, chrome parked).

---

## Appendix A — Enterprise Governance Framework (Gemini sharing protocols): what it is, what it is not

*Supplied Part 2 is a corporate DLP manual for Google Gemini sharing (`share.gemini.google` / `g.co/gemini/share`), not a Quorena feature spec. It is adopted here as research-handling governance, with zero Quorena code impact.*

* **Mechanics adopted as fact:** Public links live only while source activity persists in owner history; `Delete all links` / per-link delete permanently decommissions endpoints (redirect to `gemini.google.com`, title *Gemini - direct access to Google AI*); `share.gemini.google` → `g.co/gemini/share` / `gemini.google.com/share`; tenant disable blocks new links (existing stay until user-deleted); `Continue this chat` forks for 18+ (fork survives source delete); subscription-gated continuation; custom-Gems chats view-only.
* **Interface paths adopted:** Active Chat → Share → Share conversation (static snapshot); Sidebar Chats → `more_vert` → Share → Create link (tenant-controlled); Gems → Share (Viewer/Editor), Drive locate, ownership transfer, Public/Link/Org/Private scopes.
* **Admin controls adopted:** `Generative AI > Gemini app > Sharing` (legacy `Apps > Workspace > Gemini > Conversation Sharing`): link-sharing OFF by default for corporate, Drive-sharing ON by default (all tiers from 2026-06-03); Drive policies inherit (external-drive-block ⇒ snapshot-blocked).
* **DLP posture for this initiative:** Drive-based sharing default for all pasted research (`FEATURE_GOLDEN_RULES.md`, this file, inventory/audit); link-sharing only for explicitly public artifacts; OU/group segmentation if link-sharing ever needed; regular audit of `Shared chats`/`Gems` with deletion of sensitive links. Expired-link inaccessibility (`share.gemini.google/VCjG6deqY3JQ`-class) is expected platform behavior, not data loss — re-share from Drive source.
* **FAQs applied:** No new settings needed for Drive sharing (inherits Drive ACLs); shareable types = chat snapshots + canvases + generated media; external access = Drive external policy; Gem chats can't be continued (view-only); disabling link-sharing later doesn't kill existing links (user-delete does).
* **Quorena code impact: none.** No route, rule, or cron derives from Part 2. It constrains *how we handle research artifacts*, not what we build.

---

## Appendix B — Contradictions vs prior docs (same discipline as Round 1)

* Supplied `§3.23` WebRTC-as-upgrade contradicts Round-1 `presence.service` ghost-free lesson + $0 (TURN paid) — rejected here (PARK §23) with traces, not preference.
* Supplied `§3.28` MathLive-input contradicts bundle + team constraint — narrowed to KaTeX render-only (§28) with stores byte-identical.
* Supplied `§3.37` CRDT/OT contradicts single-person ownership cost — narrowed to LWW+presence (§37); CRDT deferred to V2.0+paying client.
* Supplied Phase 8 `sw.js` + `webrtc-peer` in one phase couples a PARK (23) with a CONDITIONAL (27) — decoupled here (23 parked, 27 conditional on shell).
* Supplied `§3.32` SSO-without-metadata is unbuildable, not just parked — marked blocked-parked (§32) until IdP XML lands.
* Round-1 `FEATURE_GOLDEN_RULES.md` `contentHash(names excluded)` + `claimNextTick` + `24/40k/6` restated as frozen for §§25/28/30 — any proposal raising them to "improve" vision silently causes cache-miss storms (documented in §30).
* `Gladiator search` remains out of scope for §§9-equivalent search work (R2-1 `search_df` is exec/commander only) — same boundary as Round 1 Feature 9.
* No contradictions with `AUDIT.md` beyond Round-1's dead links / shelved 410s — template→generate predeploy + hash gate holds, `24h/60s` cooldowns hold, middleware pass-through holds.

---

## How to lock Set 2 (your loop)

1. **You review this file + pasted Round-1 file** — dispute any `LOCK` (especially 22/25/28/33/36/37/38-checker/39), any `CONDITIONAL` trigger (26 event, 29 list, 30 diagram set, 35 glossary, 27 shell, 40 RFC), and any `PARK` (21/23/31/32/34).
2. **You bring findings to Claude** — Claude diffs against golden rules + hard-to-copy notes above.
3. **Then prompt OpenCode** — copy this file's **Direct/Indirect** lists as the correlation map and **Risk boundary** sentences verbatim (e.g., "UI + prompt layer can be reworked — do not touch `advanceQuestion tx.get/tx.set` order"; "rules compiled only via `scripts/generate-firestore-rules.js`") so no edit repeats the stale-template regression. R2-20 + R2-16 + R2-1 go first (zero-risk prefix).

*Final lock count: LOCK 10 (22, 24-tel, 25-flagged, 28, 33, 36, 37, 38-checker, 39 + R2-carry prefix) + CONDITIONAL-LOCK 5 (26, 29-with-list, 30, 35-content, 27, 40-RFC — build only on trigger; 40 counted once) + PARK 6 (21, 23, 31, 32, 34 + chrome-i18n). 31 TTS and 23 WebRTC are hard-PARK in Set 2.*
