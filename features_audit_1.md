# Quorena — Full Feature Audit With Advance / Leave-Alone Recommendation

**Date:** 2026-09-06
**Commit:** `e90c75b` (HEAD `main`)
**Auditor:** code-grounded pass (read every `src/app/**/page.tsx`, `src/app/api/**/route.ts`, `src/services/*`, `src/ai/flows/*`, `src/lib/battle-server.ts:930` + `battle-machine.ts:127`, `src/lib/prepare-documents.ts:370`, `src/lib/constants.ts:217`, `src/ai/key-resolver.ts:438`, `firestore.rules:484`, `next.config.ts:123`, `vercel.json:18`, `tests/*`, `docs/blueprint.md`, `docs/architecture.md`, `ROADMAP.md`, sidebars)
**Method:** No copying of `AUDIT.md` claims unread — every entry below was re-checked file:line. `FEATURE_INVENTORY.md` (2026-09-06) is the companion surface list; this file adds condition + prioritization.

**How to read:** Grouped by who the feature serves. Within each group, **ADVANCE** items come first (most actionable for Kathir), **LEAVE ALONE** items after. Each entry has the four required parts. A status summary and contradiction list follow the tables.

> Rubric (from the task):
> - **ADVANCE** = genuinely core to what Quorena is (battle engine, AI Forge, domain/anti-cheat, a real differentiator from earlier sessions) AND basic/adequate today with clear, meaningful room to be better without disproportionate risk.
> - **LEAVE ALONE** = (a) already works well and more polish has little user effect, (b) fragile already-hardened area where regression risk outweighs gain, (c) simple by design — simplicity is not a defect, or (d) deliberately out of scope / shelved.
> A report that says "advance everything" or "touch nothing" fails the task. This one prioritizes.

---

## Executive-only

### ADVANCE

#### E-ADV1 — AI Forge (Executive) — PDF/DOCX/TXT/MD/image → quiz
- **What it is:** The Executive copy of the AI PDF Forge, same pipeline as Commander but with a category selector and `QuizLibraryManager` refresh. Entry point for all question-bank content.
- **What it actually does:** Browser extracts text + renders scanned pages to bounded JPEGs (`src/lib/prepare-documents.ts:168` caps `MAX_TEXT_CHARS 40000`, `MAX_TOTAL_IMAGES 24`, `MAX_SCANNED_PAGE_IMAGES 6`), then `createForgeJob` (`src/ai/flows/generate-quiz-pdf-flow.ts:1419`) caches by `contentHash` (`forge_cache` TTL 30d) else creates `ai_jobs/{jobId}` payload split into `200k` parts, followed by `runForgeTick` (`src/ai/flows/generate-quiz-pdf-flow.ts:1497`) loop — one Gemini call per tick (`FORGE_TICK_QA 5`, `GEMINI_TIMEOUT 35s`, lease `55s`, backoff `60s/20s/10s`, max ticks 40) via `src/services/forge-job.service.ts:369`. Model chain `gemini-3.6-flash → gemini-3.5-flash` with key rotation (`src/ai/key-resolver.ts:255`) and `repairJson` + `validateQuestions` (`src/ai/flows/generate-quiz-pdf-flow.ts:182`).
- **Current condition:** **Working but rough.** Local `prepareDocuments` + `runForgeTick` loop is complete (`src/components/quiz/PDFQuizGenerator.tsx:189` 4-step UI, per-file status, truncation notes). `npm run build` passes. No emulator test proves the tick lease + cron backstop end-to-end (cred gap in `AUDIT.md:32`). `generatePromptWithImages` only uses `chunks[0]` when images present (noted as accepted, but silently drops text if `MAX_TEXT_CHARS` raised). `buildPrompt` is a plain instruction without few-shot or answer-format enforcement beyond Zod.
- **Recommendation: ADVANCE** — **Core differentiator, adequate but clearly improvable.** Output quality (distractor plausibility, hard-mode synthesis, explanation depth) is prompt-limited; chunking is naive sentence split (`src/ai/flows/generate-quiz-pdf-flow.ts:423`); validation is warnings-only. Meaningful gains: few-shot exemplars, per-difficulty prompt variants, retry with format feedback, question de-dupe across ticks, and grounding so skipped pages aren’t silent. All are additive — low regression risk vs battle engine.

#### E-ADV2 — Question Bank sets + bulk operations
- **What it is:** The executive’s library manager for curated question sets (grouped `title+category+importSessionId`) and the bulk edit/duplicate/export surfaces.
- **What it actually does:** `GET /api/executive/question-bank/sets` (`src/app/api/executive/question-bank/sets/route.ts`) lists summaries with `fetchSetSummaries`; `GET/PATCH/DELETE /sets/:setId` (`src/app/api/executive/question-bank/sets/[setId]/route.ts`) edits title/status, duplicates via `importSessionId` UUID, deletes batch; `POST /bulk` (`src/app/api/executive/question-bank/bulk/route.ts`) bulk updates difficulty/tags (`≤50` sets, `MAX_BATCH_OPS 500`); `GET /export` + `POST /sets/export` emit `kind:'quiz_set'` JSON.
- **Current condition:** **Solid and working, but basic.** Grouping + `searchTokens` + single/bulk export all trace clean. No ordering control, no tag taxonomy, no merge/diff of near-duplicate sets, no draft vs published preview beyond `QuizLibraryManager`. UI is a single filtered list.
- **Recommendation: ADVANCE** — **Core content pipeline, basic today.** High leverage with low risk: sort/reorder sets, tag taxonomy, de-dupe detection, set-level analytics (avg difficulty, coverage), and a staged publish flow (draft → review → publish) reusing `quiz_generations` idea without new platform work. No auth/transaction fragility touched.

#### E-ADV3 — Quiz Set Detail (`/executive/question-bank/sets/:setId`)
- **What it is:** The drill-down for a single set: question list with answer matrix, rename/duplicate/export/publish/archive/delete, preview as gladiator.
- **What it actually does:** `GET /api/executive/question-bank/sets/:setId` hydrates questions; `PATCH` mutates `question_bank` docs via `searchTokens` refresh; `QuestionPreviewModal` renders gladiator view.
- **Current condition:** **Working but rough.** Expandable question list + per-question option correctness highlighting is present. No inline edit of question text/options, no re-order via drag, no difficulty calibration per question, no audit of who changed a question.
- **Recommendation: ADVANCE** — Same rationale as E-ADV2: curation is the daily executive job; inline editing + calibration + change history are low-risk additive improvements with direct user effect.

#### E-ADV4 — Platform Analytics + Analytics Dashboard
- **What it is:** The executive’s view of how the product is used — the mostly-pure `computeAnalytics` engine plus the `AnalyticsDashboard` UI and `analytics-data` API.
- **What it actually does:** `src/services/analytics.service.ts:534` `computeAnalytics` (no IO) builds `OverviewStats`, per-quiz `duration`, `participationTimeline` 30s buckets, `engagementScore`, `scoreHistogram`, per-student rank history/percentile, per-question `optionDistribution`/`commonWrongAnswer`/`averageResponseTime` from `questionStats.userTimes`; `src/app/api/executive/analytics-data/route.ts` does the 30d time-series; `src/app/executive/analytics/page.tsx:12` + `src/components/analytics/*` renders `QuizOverviewCards`, `DifficultyCalibrationTable`, `CommanderPerformanceTable`.
- **Current condition:** **Working but rough.** Compute is pure (no DB risk) and reads denormalized `questions/{id}.questionStats` (`src/lib/battle-server.ts:200` `writeQuestionStats`). `exportAnalyticsCSV/HTML` is rudimentary CSV injection-guarded string builder. No cohort compare, no longitudinal trend beyond 30d, no anomaly (e.g., sudden difficulty mismatch) flagging.
- **Recommendation: ADVANCE** — **Core differentiator (institutional product needs insights), adequate not excellent.** Pure-function work means no Firestore transaction risk; meaningful upsides: calibration suggestions (“hard questions answered 88% correct → re-label to moderate”), leader stability, and export polish. Low risk, high signal.

#### E-ADV5 — Battle History + Battle Detail (platform-wide)
- **What it is:** Factory-floor view of every finished battle and the deep drill-down per battle.
- **What it actually does:** `GET /api/executive/battles` (`src/app/api/executive/battles/route.ts`) `quizzes.select` 1000 + `q` filter + paginated `participants` calc `avgScore/winner`; `GET /api/executive/battles/:id` (`src/app/api/executive/battles/[id]/route.ts:23`) hydrates `quiz + config/settings scoringConfig` + `questions orderBy sort_index` with `FAILED_PRECONDITION` fallback + `answerKeys` + batched `submissions` → `submissionsByUserId` + `battle_logs where quizId orderBy timestamp desc limit 200` with fallback. UI pages `src/app/executive/battles/page.tsx` + `battles/[id]/page.tsx` render timeline, leaderboard, per-question answer matrix.
- **Current condition:** **Working but rough.** The detail fetch is impressively resilient (graceful degrade on missing composite indexes). Timeline is 200 max, no filters, no replay anchored to question index, no export of per-participant item analysis.
- **Recommendation: ADVANCE** — **Core for executive oversight.** Read-only (`GET`) so no write-path fragility; upsides (replay scrub, timeline filters, CSV item analysis, diff-style answer comparison) are clear and bounded.

#### E-ADV6 — Global Search (`/executive/search`)
- **What it is:** Platform-wide executive search across users, question_bank, quizzes, audit logs, conversations, announcements, notifications, etc.
- **What it actually does:** `src/app/api/executive/search/route.ts` scans 10 collections (200 docs each) scoring 4/3/2 cap 8/type 60 total + `highlight` `<mark>`; UI `src/app/executive/search/page.tsx` debounced 200ms (min 2). Also `GlobalSearch` cmd-K in layout.
- **Current condition:** **Working but rough.** Correctly scoped (notifications via `where userId==auth.uid`). No `searchTokens` usage on executive path — brute力的 `select` + score, expensive in large workspaces; no recency boost, no negative query, no cross-collection join (e.g., “battles where gladiator email contains …”).
- **Recommendation: ADVANCE** — **Core daily tool, adequate not great.** Meaningful without touching auth: move to `searchTokens`/composite index path, add recency/role boosts, add `created_at` range chips. Call sites unchanged (`SEARCH_PER_USER` stays).

#### E-ADV7 — Executive Workspace (Mission Control) — `GET /api/executive/workspace`
- **What it is:** The `ROLE_HOME` dashboard for executives: health probes, analytics 8 panels, quick actions, realtime strips, recent lists.
- **What it actually does:** `src/app/api/executive/workspace/route.ts` aggregates commander/gladiator/battle counts, 7d/30d metrics, `systemHealth` (`listUsers(1)`, Firestore, `conversations`, AI keys, storage bucket), 30d AI + security summaries, live connections; `src/app/executive/workspace/page.tsx` renders `SystemHealth` expandable + polls `30s`.
- **Current condition:** **Solid and working, but has a dead link.** Probes + aggregates trace clean. **BUG:** `router.push('/executive/security-logs')` 404 — real route is `/executive/security` (`src/components/ExecutiveSidebar.tsx:80` correct). No refresh-on-push.
- **Recommendation: ADVANCE** — **Core entry point, worth incremental investment.** Fix dead link (trivial), then add actionable alerts (e.g., “stale `live` arenas >10” → link to `sweep-battles` count) and a one-click “see what’s live” → `command-center`. Low risk (read-only aggregation); clear gain over polish-for-its-own-sake.

#### E-ADV8 — Command Center (live battle monitoring)
- **What it is:** Live real-time monitor of every active arena.
- **What it actually does:** `src/components/executive/command-center/CommandCenter.tsx:58` live `onSnapshot` `quizzes where status in ACTIVE_BATTLE_STATUSES` + per-battle `subscribeToParticipants` + `subscribeToQuestions`, `derived sortedBattles useMemo + 1s now clock`; `CommandCenterStats` + `BattleSummaryCard` + `BattleDetailPanel`.
- **Current condition:** **Solid and working.** `tests/command-center.spec.ts:6` proves via emulator sign-in `exec@test.local` that live+waiting cards, `Live Leaderboard`, `Winner Prediction`, `Answer Heatmap`, `Participant Activity`, Ruby leader all render live (no hardcoded data).
- **Recommendation: ADVANCE** — **Core differentiator that is already working — worth deepening.** Known limitation: `src/app/executive/workspace` dead link (E-ADV7) and `ROADMAP.md:41` “spectator mode” suggests a natural next step: make the center’s detail panel a live spectator (read-only question view) reusing `applyOptionShuffle` without new writes. Pure read path, low risk.

#### E-ADV9 — AI Logs + Insights
- **What it is:** Observability for Genkit/Gemini usage and the aggregated insights atop it.
- **What it actually does:** `src/app/executive/ai-logs/page.tsx` `GET /api/executive/ai-logs?success/cursor` via `src/services/ai-log.service.ts:74` (`startAfter` cursor), export JSON; `GET /api/executive/insights/route.ts` aggregates 30d AI successRate/avgDuration/model breakdown/dailyActivity + security violations/authFailures; `SystemInsightsSection` renders.
- **Current condition:** **Working but rough.** Logs are real (`aiLogService.record` from all 4 flows). Insights is server-aggregated but thin (no per-commander quota burn, no per-model retry distribution, no “cache hit rate” from `forge_cache`).
- **Recommendation: ADVANCE** — **Core if the Forge is core.** Additive read-only gains: `forge_cache` hit rate, keys health (`src/ai/key-resolver.ts:84` `getKeyHealth`), and a “quota forecast” panel without touching transaction code.

### LEAVE ALONE

#### E-LEAVE1 — Question Detail (`/executive/question-bank/:id`) + Categories
- **What it is:** Single question view (meta chips, options correct-highlight, explanation, tags, delete) and the `GET /categories` distinct list.
- **What it actually does:** `GET/PATCH/DELETE /api/executive/question-bank/:id` (`src/app/api/executive/question-bank/[id]/route.ts`) + `GET /api/executive/question-bank/categories/route.ts` (`300 select('category')`).
- **Current condition:** **Solid and working.** Validates `text≥5`, `≥2` options, index in range, `searchTokens` refresh.
- **Recommendation: LEAVE ALONE** — **Already works well; further polish has little user effect.** Covered by E-ADV2/E-ADV3 curation work; this leaf view doesn’t need its own roadmap.

#### E-LEAVE2 — Requests triage (`/executive/requests`)
- **What it is:** Commander → Executive request queue (question_bank, student_report, arena_approval, other) with attachments.
- **What it actually does:** `GET /api/executive/requests?status` + `PATCH status pending/approved/rejected/completed + comment/attachments → notify commander` + `DELETE` cascade `notifications where metadata.requestId` (`src/app/api/executive/requests/route.ts`); UI `src/app/executive/requests/page.tsx` card→dialog with image/pdf/docx preview + `ExternalLink` + download, `executiveComment` + pending actions.
- **Current condition:** **Solid and working.** Types + status chips + attachment fetch trace clean.
- **Recommendation: LEAVE ALONE** — **Simple by design and does its job.** Further sophistication (SLA timers, assignment) is V1.2 “product & experience” without a current client — out-of-scope rubric.

#### E-LEAVE3 — User management — Commanders (`/executive/commanders`) + deep detail
- **What it is:** Create commander (`username@knowledgearena.app` + `institution_domain` `psgitech.ac.in` + password generate), disable, reset `mustChangePassword`, permanent delete preserving arenas, bulk selection, credential banner.
- **What it actually does:** `GET /api/admin/users?role=commander` + `POST/PATCH/DELETE` in `src/app/api/admin/users/route.ts` (regex, `validatePasswordStrength`, Auth+Firestore `users/{uid}`, audits); UI `src/app/executive/commanders/page.tsx` searchable `all/active/disabled/deleted` + detail `src/app/executive/commanders/[uid]/page.tsx` → `src/components/executive/user-detail.tsx`.
- **Current condition:** **Solid and working.** Enrichment `arenaCount/battleCounts` present; `domain` default handling correct.
- **Recommendation: LEAVE ALONE** — **Already works well; fragile area.** Touches Auth + Firestore cascade (conversations/messages/notifications/requests/participants/submissions). Regression risk outweighs minor UX nips. Also deliberately bounded (no `orgId` multi-tenant per `ROADMAP.md:50` — out of scope).

#### E-LEAVE4 — User management — Students/Gladiators (`/executive/students`)
- **What it is:** Gladiator roster via same admin route `?role=gladiator`, hard delete path.
- **What it actually does:** `src/app/executive/students/page.tsx` `getToken` 10×300ms retry, summary 3 cards, filters, bulk toggle/delete.
- **Current condition:** **Solid and working.**
- **Recommendation: LEAVE ALONE** — Same fragile Auth cascade + “simple by design” rationale as E-LEAVE3.

#### E-LEAVE5 — Backup export / import (`/executive/backup`)
- **What it is:** Whole-workspace snapshot (8 collections) + restore with `restoreTimestamps (_seconds/_nanoseconds→Timestamp)` `merge:true`.
- **What it actually does:** `POST /api/executive/backup/export` + `POST /api/executive/backup/import` (`src/app/api/executive/backup/*`) warnings per collection, audit `backup_created`/`backup_imported`; UI `src/app/executive/backup/page.tsx` blob `workspace-backup-YYYY-MM-DD.json` + in-memory `lastBackup` + confirmation `AlertDialog`.
- **Current condition:** **Working but rough.** Export/import real; `lastBackup` in-memory only (lost on reload) and no persistent history — cosmetic.
- **Recommendation: LEAVE ALONE** — **Deliberately bounded.** Full backup is already rare-operator tooling; `EXPORT_PER_USER` 5/min + audits are enough. Adding persistent history is polish for its own sake with little user effect.

#### E-LEAVE6 — Platform Settings (`/executive/settings`)
- **What it is:** Global `platform_settings/global` — workspaceName, institutionName/Logo, theme, auth switches, battle timer 30/maxQ 50/difficulty autoEnd, ai enabled/model/maxPdf 10, messaging toggles, export prefs, `Danger Zone` reset.
- **What it actually does:** `GET/PUT /api/executive/settings` (`src/app/api/executive/settings/route.ts`) merges defaults (`platform_settings.ai.defaultModel` via `resolveModel`, `messaging`, etc.) + `WRITE_PER_USER` + audit `settings_changed`; UI 6 tabs `src/app/executive/settings/page.tsx` uses `getAvailableModels()`.
- **Current condition:** **Solid and working.**
- **Recommendation: LEAVE ALONE** — **Simple by design.** A picker being simple is not a defect; `defaultModel` switching already handles shutdown prefixes (`src/ai/flows/generate-quiz-pdf-flow.ts:75` `SHUTDOWN_MODEL_PREFIXES`).

#### E-LEAVE7 — Audit Logs / Security Logs (pages + APIs)
- **What it is:** Two executive observability pages backed by `auditLogs` + `security_logs`.
- **What it actually does:** `GET /api/executive/audit-logs?page/cursor/action/actorRole` (`PAGE_SIZE 50 FILTER_WINDOW 1000` in-memory filter, returns `filters.actions/roles`) + `GET /api/executive/security-logs?event/cursor/page` + `src/lib/security-log.ts:85` (`recordSecurityEvent`, `logAuthFailure` throttled 60s, `logSecurityViolation`); UIs `src/app/executive/audit-logs/page.tsx` + `src/app/executive/security/page.tsx` with expandable metadata + JSON export.
- **Current condition:** **Working but rough.** `auditLogs` path is complete (`src/services/audit.service.ts:62`). `security_logs` only ever writes `invalid_token` + `security_violation` — `login_success/login_failed/logout/rate_limited` declared `SecurityEventType:5` but never emitted (known V1.1 gap in `ROADMAP.md:18`).
- **Recommendation: LEAVE ALONE** — **Deliberately bounded for now.** Fixing logging completeness is a defined V1.1 `LEAVE ALONE` here because the next stop (emit login events) risks coupling Auth to logging without a client contract — better parked as the single V1.1 hardening item when Kathir chooses it, not advanced ad-hoc here. Pages themselves are good enough.

#### E-LEAVE8 — Executive Messaging hub (`/executive/messages`)
- **What it is:** Executive ↔ Commander conversations + announcements broadcast/DM with attachment support.
- **What it actually does:** 8 routes `src/app/api/messaging/*` (conversations list `array-contains uid` 200, `POST` executive-only 1:1 transactional, `DELETE` cascade 500, `.../messages` `orderBy timestamp asc` `idempotencyKey` + `validateAttachments`, `announcements` fan-out via `notificationService.create`); UI `src/app/executive/messages/page.tsx` `Tabs` + `Input` sidebarSearch + `Plus` new convo (`GET /api/messaging/commanders`) + `collection(.../messages)` realtime + `typing.{uid}` debounce + optimistic `uuid`.
- **Current condition:** **Solid and working.** Rules `src/firestore.rules:376` `conversations/{conv} participants.hasAny` + `messages/{msg} senderId==uid` hold.
- **Recommendation: LEAVE ALONE** — **Already works well; further polish has little effect.** Real-time via Firestore `onSnapshot` is already there; adding presence indicators or read-receipt counts beyond `unreadCount` is `ROADMAP.md:38` polish for its own sake.

#### E-LEAVE9 — Executive Notifications (`/executive/notifications` + detail) + Announcements detail
- **What it is:** Inbox for `battle_completed`, `commander_request`, `new_message`, etc. (23 `NOTIFICATION_TYPES` `src/lib/constants.ts:113`) plus per-notification detail and announcement detail.
- **What it actually does:** `GET/PATCH /api/executive/notifications` cursor 100 + `getUnreadCount` + `PATCH markAllRead or ids[]` (`src/app/api/executive/notifications/route.ts`); detail `GET/DELETE /api/executive/notifications/:id` owner-check; announcements detail `GET /api/executive/announcements/:id` sender/readReceipts; UIs render `typeConfig` 25+ icons + `BulkSelection`.
- **Current condition:** **Working but rough.** Exec endpoint separate from generic `src/app/api/notifications/*` by design. **BUG:** `src/app/executive/announcements/[id]/page.tsx` back link `router.push('/executive/announcements')` 404 — no index page (only `[id]`).
- **Recommendation: LEAVE ALONE** — **Fragile hard-won area + simple fix.** Notifications touch `notificationService` fan-out + rules `write false`; broad UX redesign risks regression. Fix the one dead back link to `/executive/messages` (trivial) and leave the inbox pattern alone.

#### E-LEAVE10 — Executive Profile (`/executive/profile`)
- **What it is:** Secondary nav profile (avatar editor, display name, change password, recent activity count).
- **What it actually does:** `GET /api/executive/profile` + `GET /api/executive/notifications?unreadOnly` + `GET /api/messaging/conversations` counts; `PATCH /api/executive/profile {name,password}` + `validatePasswordStrength`; UI `src/app/executive/profile/page.tsx` `AvatarEditor`.
- **Current condition:** **Solid and working.**
- **Recommendation: LEAVE ALONE** — **Simple by design.** A profile editor being simple is not a defect.

#### E-LEAVE11 — Executive Exports (typed `users/questions/battles/audit-logs/analytics → json/csv`)
- **What it is:** One-shot exports with CSV injection guard.
- **What it actually does:** `GET /api/executive/export/route.ts` map `kind` → `json`/`csv` attachment; `EXECUTIVE_EXPORT_PER_USER` 5/min.
- **Current condition:** **Solid and working.** `analytics.service.ts:exportAnalyticsCSV/HTML` handles `ExportPreferences` toggles.
- **Recommendation: LEAVE ALONE** — **Simple by design.** Does its job; warehouse sync (`ROADMAP.md:54`) is the deliberate V2.0 out-of-scope path.

#### E-LEAVE12 — `/executive/dashboard` redirect
- **What it is:** `redirect('/executive/workspace')` only (`src/app/executive/dashboard/page.tsx:3`).
- **What it actually does:** Legacy bookmark compatibility; no UI.
- **Current condition:** **Partial / placeholder.**
- **Recommendation: LEAVE ALONE** — **Remove from route list or middleware, no product work.** Not a feature to advance.

#### E-LEAVE13 — `/executive/users/:uid` generic deep user utility
- **What it is:** Generic `<UserDetail uid>` with no `expectedRole` check.
- **What it actually does:** `src/app/executive/users/[uid]/page.tsx` + `src/app/api/executive/users/[uid]/route.ts` deep aggregator (users/{uid}+Auth+audit/security/ai/battle_logs + conversations + arenas/collectionGroup accuracy).
- **Current condition:** **Solid, hidden utility.**
- **Recommendation: LEAVE ALONE** — **Intentionally hidden** (only via `/executive/search` deep-link, not sidebar). Simplicity is not a defect; surfacing it as a nav item adds confusion.

---

## Commander-only

### ADVANCE

#### C-ADV1 — Arena Architect — Manual creation (+ AICopilot)
- **What it is:** Commander’s immediate path to a new arena without AI — `QuizCreatorForm` plus the in-form `AICopilot` chat.
- **What it actually does:** `src/app/create-quiz/page.tsx:28` tabs `Manual` → `src/components/quiz/QuizCreatorForm.tsx` → `src/services/arena-creation.service.ts:246` `createArenaAtomic` (validates `MIN_TITLE_LENGTH`, generates `roomCode` with retry `ROOM_CODE_RETRIES`, snapshots `institution_domain → allowed_gladiator_domain`, `writeBatch` chunked `MAX_BATCH_OPS 500` writing `quizzes/{code}`, `participants/{creator}`, `config/settings` (`scoring+governance+skipped_question_ids+created_by` for rules timing fix), then `questions+answerKeys` uuid, rollback `Promise.allSettled(deleteDoc)`); in-form `src/components/quiz/AICopilot.tsx` calls `POST /api/copilot` → `src/ai/flows/copilot-flow.ts` expert writer (30s timeout, `10/min` IP+UID).
- **Current condition:** **Working but rough.** `createArenaAtomic` atomicity + `getAfter` rule timing fix is battle-tested. `AICopilot` is a chat that returns `{text,options[4],correctAnswerIndex,explanation}` — no draft history, no undo, no per-question cost tracking.
- **Recommendation: ADVANCE** — **Core path to value (no Forge = product dies in classrooms without lectern PDFs).** Copilot quality is prompt-limited today; meaningful gains without touching transactions: few-shot exemplars, “tighten this question” prompts, draft history, and cost-per-draft display. Low regression, high daily use.

#### C-ADV2 — Arena Architect — AI Forge (Commander) (`/create-quiz` Forge tab)
- **What it is:** Same Forge pipeline as Executive but this is the Commander’s daily entry point (the page behind `/create-quiz` `Forge` tab + `QuestionReviewPanel` publish).
- **What it actually does:** Same `src/components/quiz/PDFQuizGenerator.tsx:57` (per E-ADV1) plus `src/app/create-quiz/page.tsx:42` `localStorage ka_draft_{uid}` auto-save 1s + restore dialog + `beforeunload` + `handleRegenerateQuestion` `generateQuizFromExtracted` 120s timeout + validation `text≥5/options≥2/index range/dedup` + back-confirm dialogs.
- **Current condition:** **Working but rough — same as E-ADV1 plus a Commander-specific draft UX.** Historical 4.5MB 413 trap and 504 timeout were fixed by `prepare-documents.ts` + async ticks; emulator proof exists (`AUDIT.md:16`) but no full emulator test for the `createForgeJob→runForgeTick` loop.
- **Recommendation: ADVANCE** — **The single highest-leverage ADVANCE for Commander.** Same gains as E-ADV1 apply, plus Commander-specific: category defaulting, per-document difficulty auto-detection, and a “keep editing while queued” UX (job ID persists). No auth/transaction hardening touched.

#### C-ADV3 — Question Review Panel → publish (`QuestionReviewPanel`)
- **What it is:** The post-Forge edit step before the arena exists in Firestore.
- **What it actually does:** `src/components/quiz/QuestionReviewPanel.tsx` renders `initialQuestions` (`text/options/correctAnswerIndex/explanation`) as editable cards, per-question `onRegenerateQuestion` via `generateQuizFromExtracted`, then publish calls `arenaCreationService.createArenaAtomic`.
- **Current condition:** **Working but rough.** No bulk edit, no re-order drag, no difficulty tag per question, no “re-validate vs forbidden patterns” after hand edit.
- **Recommendation: ADVANCE** — **Core loop.** Additive UX (bulk, reorder, per-question difficulty) is low risk and directly improves daily Commander time-to-publish.

#### C-ADV4 — Battle history + analysis drill-down + edit arena
- **What it is:** Commander’s view of own finished battles and the deep per-quiz analysis + edit for `waiting` arenas.
- **What it actually does:** `src/app/commander/history/page.tsx` `quizService.getQuizzesByCreator(uid)` → `status===finished && !archived` + search + `BattleHistoryCard` `subscribeToParticipants` (winner/avgScore) + `exportCSV`; `src/app/commander/analysis/[quizId]/page.tsx` → `src/components/commander/PostBattleAnalysis.tsx`; `src/app/commander/edit-arena/[quizId]/page.tsx` guards `created_by===uid && status==='waiting'` else “already live/finished”, then `questionService.getQuestionsByQuizId/getAnswerKeys → QuizEditor`.
- **Current condition:** **Working but rough.** History is a filtered list + CSV; analysis is `PostBattleAnalysis` charts (`PostBattleCharts.tsx`) without export of per-question `questionStats` deltas; edit-arena is owner + `waiting` gate.
- **Recommendation: ADVANCE** — **Core Commander product, adequate not excellent.** Add per-question `questionStats` drill-down reuse (same data as exec `battles/:id`), item-analysis tags (“too easy”, “ambiguous options”), and a read-only “view as it was” replay without touching live transactions.

#### C-ADV5 — Commander search (`/commander/search`)
- **What it is:** Commander’s own-arena search (own quizzes only).
- **What it actually does:** `GET /api/commander/search?q=` (`src/app/api/commander/search/route.ts:25`) `quizzes where created_by==uid` 200 filter title/id scoring exact>startsWith>includes max 12; UI `src/app/commander/search/page.tsx` debounced.
- **Current condition:** **Solid but basic.** Correctly scoped (not global). No `searchTokens`/`category` facet, no status facet, no recent boost.
- **Recommendation: ADVANCE** — **Core daily tool, basic today.** Meaningful low-risk gain: move to `searchTokens` index path + status/category chips + recent boost, all `SEARCH_PER_USER` preserved.

### LEAVE ALONE

#### C-LEAVE1 — Commander Dashboard (`/commander/dashboard`)
- **What it is:** Commander home — own arenas, pending requests, participants distinct, avgScore.
- **What it actually does:** `GET /api/commander/dashboard` (`src/app/api/commander/dashboard/route.ts`) `quizzes where created_by==uid` 500 + `executive_requests` + active/upcoming/recent, totalParticipants distinct, avgScore; UI `src/components/dashboard/CommanderDashboard.tsx` via `DynamicCommanderDashboard` `Suspense`.
- **Current condition:** **Solid and working.** Polls real data (not hardcoded).
- **Recommendation: LEAVE ALONE** — **Already works well; further polish has little effect.** Density tweak isn’t a priority versus Forge + history.

#### C-LEAVE2 — Commander Requests (`/commander/requests` — my requests)
- **What it is:** Commander’s own request queue to Executive.
- **What it actually does:** `GET/POST /api/commander/requests` (`src/app/api/commander/requests/route.ts`) `POST {title,type,description,attachments}` type ∈ `question_bank/student_report/arena_approval/other` → `auditService.record` + notify self; UI `src/app/commander/requests/page.tsx` `typeLabels`+`STATUS_VARIANT` + `downloadFile` data URI + create dialog `500KB pdf/csv/json/xlsx/txt` + detail `executiveComment` + `?requestId=` auto-select.
- **Current condition:** **Solid and working.**
- **Recommendation: LEAVE ALONE** — **Simple by design and does its job.** Further workflow (SLA, assignment) is out-of-scope without a client.

#### C-LEAVE3 — Commander Messages (`/commander/messages`)
- **What it is:** Commander side of conversations vs announcements (read-only announcements).
- **What it actually does:** `GET /api/messaging/conversations` polling 15s + `collection(.../messages) orderBy timestamp` + `typing.{uid}` listener + optimistic `opt_` + `uuid idempotencyKey` + attachments image/pdf + typing debounce 300ms + `announcements POST /read`; server enforces `POST conversations` executive-only so Commander cannot create conversations.
- **Current condition:** **Solid and working.**
- **Recommendation: LEAVE ALONE** — **Already works well.** Mirrors executive hub; commander cannot create conversations by design (not a defect). Presence typing is enough.

#### C-LEAVE4 — Commander Notifications (`/commander/notifications` + detail)
- **What it is:** Inbox for same 23 types, owner-scoped.
- **What it actually does:** `GET /api/notifications` cursor pagination + `typeConfig` 25+ icons + `unreadCount` badge + `Mark All Read` `PATCH` + `BulkSelection` delete/mark (`src/app/commander/notifications/page.tsx`); detail `GET /api/notifications/:id` owner-check + `PATCH` read + `DELETE` + link button (`src/app/commander/notifications/[id]/page.tsx`).
- **Current condition:** **Solid and working.** Near-duplicate of gladiator/executive inbox by design (role-specific endpoints `src/app/api/notifications/*` vs `src/app/api/executive/notifications/*`).
- **Recommendation: LEAVE ALONE** — **Already works well; further polish has little effect.** Inbox pattern is good enough.

#### C-LEAVE5 — Commander Profile (`/commander/profile`)
- **What it is:** Avatar ring + displayName + emoji picker (23) → `updateProfile`.
- **What it actually does:** `src/app/commander/profile/page.tsx` `updateProfile→/commander/dashboard`.
- **Current condition:** **Solid and working.**
- **Recommendation: LEAVE ALONE** — **Simple by design.**

#### C-LEAVE6 — Battle control — start/activate/advance/skip/pause/resume/end/archive/transfer (Commander)
- **What it is:** The Commander’s live control surface for an arena.
- **What it actually does:** `WaitingRoom` + `LiveQuiz:956` (`handleNext` `evaluateQuestion`+`advanceQuestion`, `handlePause/Resume/Skip/End/Leave`) + `BattleRoomLoader:37` `doActivate` (`starting→live` multi-client) → `src/services/battle.service.ts:79` thin client (`Bearer` + `getSessionToken` `ka_battle_session_{quizId}`) → `src/app/api/battle/*` + `src/lib/battle-server.ts:930` (`advanceQuestion` serialized tx + `alreadyAdvanced`, `skip` evaluate-then-skip `skip_penalty` loop, `pause/resume` + `finishBattle` + `notifyBattleCompleted` chunked 20).
- **Current condition:** **Solid and working, but fragile hardened area.** `AUDIT.md:40` five transaction anti-patterns re-verified (e.g., `battle-server.ts:424` `tx.get(partsCol)` inside tx on `ended`, `quiz.service.ts:199` `resetQuiz` single `runTransaction`). `isLegalStatusTransition` in `firestore.rules:114` is solid; `ALLOWED_QUIZ_TRANSITIONS` `src/lib/constants.ts:32` has correct `abandoned/archived` terminals.
- **Recommendation: LEAVE ALONE** — **Fragile already-hardened area where regression risk outweighs polish.** The control surface is good enough today (timers, standings, interstitial, `LiveQuiz` governance `reveal_timing` are already rich). Touching `advanceQuestion`/`evaluateQuestionForAll` for cosmetic gains risks double-score / staleness regressions (`430`-class `DOMAIN_ERROR_STATUS` paths). Fix only the one bug elsewhere (abandoned screen) and wire `assertQuizTransition` as an additive audit if Kathir insists — but otherwise leave the transition code alone.

---

## Gladiator-only

### ADVANCE

#### G-ADV1 — Join arena via room code (domain gate, late-join, blocked rejoin, session_token) — `/gladiator/dashboard?roomCode=`
- **What it is:** The gladiator’s only way in — typing a 6-char `roomCode` on the dashboard.
- **What it actually does:** `src/services/participant.service.ts:244` `joinQuiz` transaction gates `governance_config.allow_late_join`, `disabled` account, `PS_BLOCKED` rejoin block, `session_token` idempotency, and **per-arena domain snapshot** `allowed_gladiator_domain` (`src/lib/constants.ts:75` + `src/services/arena-creation.service.ts` snapshot from `commander.institution_domain`) enforced via authoritative `request.auth.token.email` (`firestore.rules:287` `isEmailDomainAllowed` exact `parts[1]==domain` prevents `notpsgitech.ac.in` bypass; `isAllowedDomainValidForCreate` `firestore.rules:46` prevents spoofing other institution’s domain; executives may set any). `BattleRoomLoader` `src/components/quiz/BattleRoomLoader.tsx:215` auto-joins in `waiting/ready`.
- **Current condition:** **Working but rough.** Transaction + `getAfter` batch handling trace clean. Domain snapshot has a minor rules limitation: no `trim` (comment notes) and `users/{uid}.email` doc field diverges from token email (documented as accepted — doc is server-only `name/avatar/onboarding_complete` whitelist `firestore.rules:194`).
- **Recommendation: ADVANCE** — **Core institutional differentiator (per-arena domain isolation).** Most meaningful gain is observability not enforcement: surface join-denied reasons to the gladiator (“your email domain `x` doesn’t match this arena’s `psgitech.ac.in`”) and a pre-flight `canJoin` check, both read-only — no hardening risk.

#### G-ADV2 — Weak Areas + Quiz Recommendations + Upcoming Arenas — `/gladiator/personalization` + `recommendations`
- **What it is:** Gladiator’s personal coaching surface (what to practice next).
- **What it actually does:** `GET /api/gladiator/personalization` finished quizzes ≤6 `submissions vs answerKeys` per difficulty → wrongRate top 5; `GET /api/gladiator/recommendations` `src/ai/engines/prediction-engine.ts:69` heuristic `getQuizRecommendations` (no Gemini, `max-age 60`, sorts `finished` vs `available where !participated` by `weakest category/difficulty` confidence 0.9/0.75/0.6); `UpcomingArenas` `waiting/ready` not yet joined (6). UIs `src/components/dashboard/WeakAreas.tsx`/`QuizRecommendations`/`UpcomingArenas`.
- **Current condition:** **Working but rough.** `personalization` recomputes via brute reads (≤6 quizzes × submissions/answerKeys); `recommendations` is deterministic heuristic, not AI.
- **Recommendation: ADVANCE** — **Core retention differentiator, adequate not excellent.** Low-risk gains: cache `personalization` per-user, add streak-based weak-spot weighting, and (if ever) call Genkit with the heuristic as context — all read-only, no battle engine touch.

#### G-ADV3 — Gladiator history (`/gladiator/history`)
- **What it is:** Gladiator’s record of battles played.
- **What it actually does:** `participantService.getStudentHistory(uid)` `collectionGroup participants where user_id==uid` (enable via `firestore.rules:480` + indexes `firestore.indexes.json:142`) → rank, title, status badge, date, score, `→/battle/:quizId` only if `finished` (`src/app/gladiator/history/page.tsx`).
- **Current condition:** **Solid but basic.** Rank is strictly `score desc` (ties `i+1` distinct — product decision, not bug; noted `AUDIT.md:87`). No filters, no accuracy trend sparkline, no per-quiz improvement delta.
- **Recommendation: ADVANCE** — **Core retention, basic today.** Add accuracy sparkline + trend chips (“+12% vs last 5”) from `questionStats` aggregates; read-only, no write-path risk.

### LEAVE ALONE

#### G-LEAVE1 — Gladiator Dashboard (`/gladiator/dashboard` + join `?roomCode=`)
- **What it is:** Wrapper `Suspense→DynamicGladiatorDashboard(initialRoomCode=searchParams.roomCode?.toUpperCase())` (`src/app/gladiator/dashboard/page.tsx:5`).
- **What it actually does:** Stats via `GET /api/gladiator/dashboard` `collectionGroup participants select user_id/score/status` → `totalBattles, finishedCount, wins, avgScore, accuracy, recentBattles 10, activeBattle` + the three coaching widgets.
- **Current condition:** **Solid and working.** `tests/landing.spec.ts:74` proves one-click gladiator demo sign-in path.
- **Recommendation: LEAVE ALONE** — **Already works well.** Shell is good enough; deeper work belongs in G-ADV2 personalization, not the wrapper.

#### G-LEAVE2 — Gladiator Notifications (`/gladiator/notifications` + detail)
- **What it is:** Owner-scoped inbox (`GET /api/notifications` cursor 100 + `PATCH markAllRead`/`ids[]`) + detail `GET /api/notifications/:id`.
- **What it actually does:** `src/app/gladiator/notifications/page.tsx` `typeConfig` 25+ icons + `BulkSelection` + deep-link `link||/gladiator/notifications/:id`.
- **Current condition:** **Solid and working.** Same near-duplicate pattern as commander by design.
- **Recommendation: LEAVE ALONE** — **Already works well; little user effect from more polish.**

#### G-LEAVE3 — Gladiator Profile (`/gladiator/profile`)
- **What it is:** Avatar + name + emoji grid + Save → `/gladiator/dashboard`, `Stats` `GET /api/gladiator/dashboard`.
- **What it actually does:** `src/components/profile/GladiatorProfile.tsx` 23 emojis + `useAuth().updateProfile`; stats loading skeletons.
- **Current condition:** **Solid and working.**
- **Recommendation: LEAVE ALONE** — **Simple by design.**

#### G-LEAVE4 — Gladiator search (`/gladiator/search`)
- **What it is:** Own participations search.
- **What it actually does:** `GET /api/gladiator/search?q=` own `participants` → `quizIds` → `title/status/id` contains query max 12 scoring exact>startsWith>includes (`src/app/api/gladiator/search/route.ts:26`).
- **Current condition:** **Solid and working.** Cannot search `question_bank` (by design — `question_bank` rules not needed).
- **Recommendation: LEAVE ALONE** — **Already works well; further sophistication is executive search scope.**

---

## Shared / cross-role (battle engine, auth, presence, live battle, AI shared, comms)

### ADVANCE

#### S-ADV1 — Live battle room (`LiveQuiz`) — timers, standings, interstitial, reveal governance
- **What it is:** The Gladiator + Commander live arena page (the product’s heartbeat).
- **What it actually does:** `src/components/quiz/LiveQuiz.tsx:389` — `useCommanderPresence` (`presence[quiz.created_by].online`), `independent` `question_order` + `participant.current_question_index` vs synchronized `quiz.current_question_index`, `applyOptionShuffle` (`src/lib/battle-machine.ts:103` anti-cheat), `CountdownTimer` (`timeLeft/totalSec` urgent/critical), `AnimatedScore`, `LiveLeaderboard` rank-delta ▲/▼ + podium, `ParticipantStats` RTDB presence-filtered roster + blocked/flagged unblock UI, `BattleInterstitial` rank delta + `auto-continue 2.5s`, `hold` reveal (`REVEAL_HOLD_MS 1500`) freezing old question for satisfying flash, `shouldRevealByGovernance` (`reveal_timing: after_timer vs never_during_battle`, `show_live_leaderboard`, `allow_late_join`, `negative_marking`, `anti_cheat_strictness` from `src/lib/battle-server.ts:97` defaults), `tryAutoAdvance` lowest-sorted online gladiator `→ /api/battle/auto-advance`, `handleAnswerSubmit` via `submissionService.submitAnswer` (`serverTimestamp+clientTime`) + `battleService.evaluateSelf` for independent, `handleNext/Skip/Pause/Resume/End/Leave`.
- **Current condition:** **Solid and working, with design decisions that deserve iteration.** Timer is now `deadline = answerStartAt + timer*1000` vs `Date.now()+offsetRef` sampled from `GET /api/clock` every 60s (`src/lib/client-clock.ts:61`), avoiding premature lockout (`LiveQuiz:784` 200ms clamp). Reveal is distinct from selection (primary ring vs success/destructive). Governance defaults preserve current behavior. Anti-cheat `usePageFocusChange` + `fullscreenchange` (`LiveQuiz:866` 2s throttle) writes `violations_count` → `blocked` or `flagged` (`auto_flag`). Known UX nits: `reveal` tied to `questionStats.correctOptionIndex` arrival (evaluated only after advance/skip); `interstitial` is synchronized-only.
- **Recommendation: ADVANCE** — **Core to what Quorena is, with clear low-risk UX wins without touching transactions.** Candidates: a richer `never_during_battle` spectator hint, streak anim in `LiveLeaderboard`, and a `hold` accessibility improvement (e.g., focus trap + `Esc` dismiss). All client-only.

#### S-ADV2 — Battle lifecycle — `commanderLastSeen` liveness, `paused_ms`, `question_start_at`, zombie sweep
- **What it is:** How an arena survives real life (dangling `live`, pauses, zombie sweeps).
- **What it actually does:** `src/lib/constants.ts:46` thresholds `QUIZ_ABANDONED_AFTER_MS 3h` / `QUIZ_WAITING_ABANDONED_AFTER_MS 30m` (logout lock) / `PRESENCE_WINDOW 30s` / `COMMANDER_PRESENCE 45s`; `src/lib/battle-server.ts:312` `abandonBattle` (only `live→abandoned` tx + `abandoned_at`, no notification fan-out) + `358` `sweepStaleLiveArena` lazy hot-path (`live && now - question_start_at >=3h → abandon`) called by `POST /api/battle/advance` + `GET /api/cron/sweep-battles` safety net (200/batch); `src/app/api/battle/pause/resume` manage `paused_at/paused_ms` + `question_start_at` refresh (`handleResume` restores exact remaining). `BattleRoomLoader:270` `presenceService.setPresence(quizId, uid, role)` RTDB `onDisconnect().remove()`.
- **Current condition:** **Working but rough.** Lazy sweep is hot-path; cron is second layer. Pause timers frozen was recently corrected (`handleResume` restores exact remaining). **BUG:** `src/components/quiz/BattleRoomLoader.tsx:363` abandoned branch is nested dead (see Shared LEAVE below for fix); `PRESENCE_WINDOW_MS` style constants exist but aren’t used to evict idle `waiting/ready` participants (intentional — product wants lobbies open).
- **Recommendation: ADVANCE** — **Core robustness, with a bounded improvement path.** Make `abandoned` rendering fix (one-line move before `live/paused`) + surface an “abandoned” reason to the commander (`command-center` stale card). No write-path rethink needed.

#### S-ADV3 — Scoring config + governance (`quizzes/{quizId}/config/settings`)
- **What it is:** The per-arena tuning: `scoring_config` + `skipped_question_ids` gated away from pre-join readers + `governance_config`.
- **What it actually does:** `src/lib/battle-server.ts:73` `quizConfigRef(quizId)` → `quizzes/{quizId}/config/settings` single doc; helpers `scoringConfigFrom(doc,legacyQuiz)` + `governanceConfigFrom` + `normalizeGovernanceConfig` (defaults `after_timer/true/true/false/warn_only`); `normalizeScoringConfig` (`src/lib/battle-machine.ts:58` `score_max 1000/min 100/wrong 0/skip 0/time_decay true/streak 0/limit 30s`); rules `src/firestore.rules:332` `canReadQuizConfig` (creator/participant/executive). `arena-creation.service.ts` + `quiz.service.ts` split config into gated doc; `isLegalQuizUpdate` whitelists parent fields (`title/archived/status/current_question_index/...`) and `isLegalStatusTransition` mirrors `src/lib/constants.ts:32`.
- **Current condition:** **Solid and working.** Gating prevents pre-join scoring leak; legacy fallback reads both `config/settings` and parent doc. `negative_marking` gates `wrong_penalty` (`src/lib/battle-server.ts:627` `governance.negative_marking ? rawConfig : { ...rawConfig, wrong_penalty:0 }`) but `skip_penalty` is independent (`Phase 114 Tier 1B` documented as designed).
- **Recommendation: ADVANCE** — **Core battle tuning, with low-risk clarity wins.** Add a live calibration hint in `LiveQuiz` (“current `skip_penalty 0` — consider 100 for this cohort”) without touching scoring math; and move `score_min/max` validation to a `beforeEvaluate` server guard already in place.

#### S-ADV4 — Mind map (`generateMindMap`) + Wrong-answer explanation (`getExplanation`)
- **What it is:** Post-battle learning surfaces (not battle-critical).
- **What it actually does:** `src/ai/flows/mindmap-flow.ts` structured `MindMapOutputSchema {title,nodes{topic,subtopics[]},connections{from,to,label}}` via `gemini-3.6-flash` (`callMindmapWithRotation` 3 attempts `withTimeout 35s`, `isAuthError 24h`, `isQuotaError→parseRetryDelayMs`), cache `ai_mindmaps` SHA256 `quizId:title:questions`; `src/ai/flows/explanation-flow.ts` 2-4 paragraph educator `labels A. … ✓ + ✗(student chose)`, cache `ai_explanations` `sha256(qId:wrongIdx)`; routes `POST /api/quiz/mindmap` + `POST /api/quiz/explanation` (`AI_MINDMAP_PER_USER 5/min`, `AI_EXPLANATION_PER_USER 30/min` per-uid `src/app/api/quiz/mindmap/route.ts:16`); UIs `MindMapSVG` + `WrongAnswerExplanation`.
- **Current condition:** **Working but rough.** `mindmap` cache was added `Phase 113C` (`AUDIT.md:91` per-quiz hash, `cached:true`); `explanation` same pattern; graceful degrade 401/429/504 with `Retry-After`. No image path in mindmap, no chunk fallback beyond `chunks[0]` for vision (flagged in `AUDIT.md:30` as harmless today at `40k` cap).
- **Recommendation: ADVANCE** — **Not battle-critical but clearly core to the learning promise, with easy additive gains.** Add a second-chunk retry for text-only mindmaps when `generateMindMap` returns `error`; add a “why this explanation” source-sentence attacher (no model change). No transaction risk.

#### S-ADV5 — Waiting Room (`WaitingRoom`) + `StartingScreen` countdown
- **What it is:** Lobby before `live` — ready toggles, `require_all_ready` gate, auto-join.
- **What it actually does:** `src/components/quiz/WaitingRoom.tsx` `subscribeToQuiz` + `subscribeToParticipants` + `presenceService` map + `battleService.start/activate`; `src/components/quiz/BattleRoomLoader.tsx:31` `StartingScreen` 3..0 `STARTING_TRANSITION_MS 4000` → `activateBattle` multi-client.
- **Current condition:** **Solid and working.** `presentStudentsReadyGate` logic traced clean.
- **Recommendation: ADVANCE** — **Core lobby experience, with a bounded polish path.** Add a lobby “late-join hint” when `governance.allow_late_join true` vs hard “Battle Already Started” (`BattleRoomLoader:385`) — read-only UI, no write risk.

### LEAVE ALONE

#### S-LEAVE1 — Auth / session (`verify-auth` + `ClientLayout` + portal layouts + `firestore.rules` matrix)
- **What it is:** Bearer-token verification + forced-password-change + role-then-route guard + Firestore rules allowlists + `isAllowedDomainValidForCreate`/`isEmailDomainAllowed` exact `parts[1]==domain`.
- **What it actually does:** `src/lib/verify-auth.ts:51` `verifyFirebaseTokenWithRole(token,role)` `customClaims.role` first else `users/{uid}` single-read for `role + mustChangePassword` (TOCTOU fix), `verifyFirebaseTokenWithAnyRole`; `src/components/ClientLayout.tsx:30` `specialPages` + `startsWith('/battle')` + `!user/!role/mustChangePassword` + `isExecutive/isCommander/isGladiator→ROLE_HOME` + per-portal `layout.tsx` `useAuth()→router.replace('/')` + `src/middleware.ts:15` pass-through `For now, pass through`; `firestore.rules:179` `users/{uid}` `isOwner||isExecutive` + `role==gladiator` creates + `diff.hasOnly([...])` updates; `src/lib/constants.ts:162` `STAFF_EMAIL_DOMAIN`.
- **Current condition:** **Solid and working, but fragile hardened area.** Phase 113C regression (`verifyFirebaseTokenWithRole` skipping `mustChangePassword` when `customClaims.role` present) was fixed; `middleware` is intentionally pass-through (client-then-API-then-rules is the real triad). `CRON_SECRET` paths use separate Bearer.
- **Recommendation: LEAVE ALONE** — **Fragile already-hardened area where regression risk outweighs polish.** Correct next V1.1 item is a single cookie-path addition if Kathir prioritizes it — but not ad-hoc “make auth more advanced” without an explicit hardening milestone. Session-cookie / revocation (`ROADMAP.md:17`) should stay parked until that milestone.

#### S-LEAVE2 — Battle transactions + scoring idempotency (`advanceQuestion` / `evaluate*` / `finishBattle`)
- **What it is:** The authoritative battle writes (the place where a regression becomes a data loss).
- **What it actually does:** `src/lib/battle-server.ts:256` `finishBattle` tx `live/paused→finished` nulled `question_start_at/paused_at` + denormalize `writeQuestionStats` all Q + `notifyBattleCompleted` chunked 20; `456` `advanceQuestion(expectedFromIndex)` serialized tx + `alreadyAdvanced` + `Participants not pre-fetched` retry + `ended` → mark `PS_FINISHED`; `577` `evaluateQuestionForUser` tx `streak current/best` + `skipped/answered/timed_out` idempotency + `computeCorrectScore+computeStreakBonus` + grace `ANSWER_GRACE 3s / 15s / 5s` + `logSecurityViolation` + `allFinished` when `independent`; `773` `evaluateQuestionForAll` pre-check `scored flag` idempotent + two-phase `plans[]` tx respects `negative_marking`; `909` `endBattleIfAllFinished` `all PS_FINISHED → finishBattle`.
- **Current condition:** **Solid and working, most hardened part of the codebase.** Five anti-patterns re-verified (`AUDIT.md:40` — `battle-server.ts:261` no N+1 inside `finishBattle`, `battle-server.ts:424` `tx.get(partsCol)` inside tx on `ended`, etc.).
- **Recommendation: LEAVE ALONE** — **Fragile hardened area.** Scoring math (`src/lib/battle-machine.ts:77` `timeFractionOf` + `computeCorrectScore` + `computeStreakBonus streak*multiplier`) is already `isBattleActive/isBattleTerminal` pure and used presentationally in `LiveQuiz`. Any “more advanced” scoring tweak should be a dedicated RFC, not a drive-by in this audit.

#### S-LEAVE3 — Presence (RTDB `presence/{battleId}/{uid}` + `onDisconnect` + `.info/connected`) + Clock skew (`/api/clock` + `client-clock`)
- **What it is:** Who is actually connected (RTDB) + whose clock is skewed.
- **What it actually does:** `src/services/presence.service.ts:88` RTDB `presence/{battleId}/{uid}` `onDisconnect().remove()` + `onDisconnect().cancel()` disposer; `BattleRoomLoader:273` `setPresence(quizId, uid, role)` while on battle screen; `LiveQuiz:494` `getServerOffset()` sampled vs `Date.now()+(sent+received)/2` TTL 60s, `offsetRef` fixes `deadline = answerStartAt + durationMs` vs `Date.now()+offset` (`LiveQuiz:784` 200ms clamp); `src/app/api/clock/route.ts` `clock:{ip}` IP rate limit + `{serverTime}`.
- **Current condition:** **Solid and working.** No major defect. `PRESENCE_WINDOW_MS` style constants not used to evict idle waiters — intentionally.
- **Recommendation: LEAVE ALONE** — **Already works well.** Wiring is hard-won (single-threaded `cooldowns` sync in `key-resolver`, `onDisconnect` semantics); more polish (heartbeat analytics) has little user effect.

#### S-LEAVE4 — Anti-cheat (tab `visibilitychange` + `fullscreenchange` 2s throttle → `violations_count` 2 → `blocked` vs `flagged`)
- **What it is:** Gladiator focus enforcement.
- **What it actually does:** `src/hooks/usePageFocusChange.ts` (`visibilitychange`) + `LiveQuiz:868` `fullscreenchange` → `onMalpractice` `lastViolationRef 2s` debounce → `participantService.updateParticipant violations_count+status` (`governance.antiCheatStrictness warn_only→blocked at 2`, `auto_flag→flagged` `LiveQuiz:846` → Commander `ParticipantStats` `flagged` amber list + `GladiatorSidebar` + `BattleRoomLoader:235` `blocked→/kicked` + `flagged` toast + rules `src/firestore.rules:292` allowing `violations_count > resource.violations_count` + `status in [blocked,flagged]`.
- **Current condition:** **Solid and working, but fragile (domain gate + severity).** `governance.anti_cheat_strictness` correctly parameterized; earlier `GladiatorSidebar` 3h vs 30m logout lock fixed (`src/lib/constants.ts:49` `QUIZ_ABANDONED_AFTER_MS` vs `QUIZ_WAITING_ABANDONED_AFTER_MS` + `GladiatorSidebar` `toMillis()` fallback).
- **Recommendation: LEAVE ALONE** — **Fragile + already parameterized — further “advanced” strictness has little effect and invites false positives in real classrooms.** The 2-violation threshold is an institutional policy choice, not a defect.

#### S-LEAVE5 — `/battle/:roomCode` wrapper + `BattleRoomLoader` branching (except S-ADV2 bug)
- **What it is:** The 5-line battle route + the big loader that decides which sub-screen to render.
- **What it actually does:** `src/app/battle/[roomCode]/page.tsx:1` → `BattleRoomLoader` `src/components/quiz/BattleRoomLoader.tsx:111` `subscribeToQuiz` + `subscribeToParticipants` (`quizService` + `participantService`) + `quizRef.current` + `initialJoinDoneRef` auto-join + `replaced` `session_token` (`ka_battle_session_{quizId}`) single-session + `recordReconnect` + branching (`waiting/ready`→`WaitingRoom`, `starting`→`StartingScreen`, `finished`→`QuizResults`, `live/paused`→`LiveQuiz`, fallback `Unexpected State`).
- **Current condition:** **Working but rough — with one nested bug.** Inside `if (quiz.status===LIVE||PAUSED): if (!participant && !isTeacher && firstPartSnap && !allowLateJoin): if (status===ABANDONED) …` (`BattleRoomLoader:363`) — abandoned never satisfies outer, so `Battle Abandoned` screen never renders (falls to `Unexpected State`). Everything else traces.
- **Recommendation: LEAVE ALONE** — **Fix only the one bug (move `ABANDONED` before `LIVE/PAUSED`), otherwise good enough.** The loader is already the most-branchy file — keep edits minimal.

#### S-LEAVE6 — Submission write path (`submissions/{uid}` + `isCurrentQuestion` + blocked/live gating)
- **What it is:** What holds cheating to the question on screen.
- **What it actually does:** `submissions/{userId}` `isOwner && isNotBlocked && isQuizParticipant && get(...).status=='live' && isCurrentQuestion(quizId,userId,questionId) && question_id==path && selected_option 0..3 && keys.hasOnly([...]) && submittedAt==request.time` (`src/firestore.rules:229`); `isCurrentQuestion` `src/firestore.rules:92` resolves `question_order[current_question_index]` (independent) else `sort_index == current_question_index` (synchronized) + bounds check; `LiveQuiz:877` `confirmedQuestionIds` + `hasAnswered` + `timeLeft` clamp + `submissionService.submitAnswer` `serverTimestamp+clientTime` + `isCurrentQuestion` server-side duplicate guard.
- **Current condition:** **Solid and working.**
- **Recommendation: LEAVE ALONE** — **Fragile hardened area (rules + pre-submission guard).** Already blocks question-id forging / pre-writing; more polish risks opening a bypass.

#### S-LEAVE7 — Notifications fan-out (arena publish + battle_completed)
- **What it is:** The `type:new_arena` + `type:battle_completed` broadcasts.
- **What it actually does:** `POST /api/arena/notify:23` `commander/executive` `roomCode/quizId+title` → `gladiators where role==gladiator` guard `≥500` skip + chunk 20 concurrent `notificationService.create type:new_arena link /battle/{roomCode}`; `src/lib/battle-server.ts:378` `notifyBattleCompleted` `score desc` rank `i+1` strict (ties distinct) + gladiator `Rank #` + commander `Battle Completed winner:` + same chunk 20 `notificationService.create`.
- **Current condition:** **Solid and working.** `AUDIT.md:176` Tier 3D accepted as inherent fan-out but bounded + guarded; tie distinct-rank is a product decision not a crash.
- **Recommendation: LEAVE ALONE** — **Already works well; further sophistication (shared rank, per-notification batch) has little user effect.** Fan-out cost is inherently N — adding complexity (queue, topic) without a client to justify it violates the “don’t build institutional-scale features without a client” rubric.

#### S-LEAVE8 — Messaging fan-out + conversations/announcements rules (no advance needed beyond leaves)
- **What it is:** Already covered Executive/Commander side — shared here for rules alignment.
- **What it actually does:** `src/firestore.rules:376` `conversations/{conv}` `participants.hasAny([uid])`, `messages/{msg}` `senderId==uid` + participant check, announcements `isExecutive` write / `isSignedIn` read.
- **Current condition:** **Solid and working.**
- **Recommendation: LEAVE ALONE** — **Simple by design — messaging being simple conversations + broadcast announcements is not a defect.** Further sophistication (threading, reactions) is polish for its own sake.

#### S-LEAVE9 — Copilot assist (`POST /api/copilot`)
- **What it is:** The in-form chat that suggests a single question (Commander only).
- **What it actually does:** `src/app/api/copilot/route.ts:8` minimal `userMessage` required + `Bearer || body.idToken` → `verifyFirebaseToken` → `enforceRateLimit('ai:copilot:'+uid)` `AI_COPILOT_PER_USER 10/min` → `copilotAssist` `src/ai/flows/copilot-flow.ts` expert `DefinePrompt` `output: {suggestion,generatedQuestion}` `withTimeout 30s`, multi-key rotation, `aiLogService`.
- **Current condition:** **Solid and working.** `handleRegenerateQuestion` in `src/app/create-quiz/page.tsx` already validates `text≥5/options≥2/index range/dedup` and 120s timeout with `warnings` render.
- **Recommendation: LEAVE ALONE** — **Already works well; further polish (streaming, context-attention) has little effect versus the Forge.** Copilot being a simple helper is not a defect — keep it simple and let Forge be the ADVANCE target.

#### S-LEAVE10 — Pubic / auth landing routes (`/`, `/login`, `/force-password-change`, `/kicked`, `/cheating-detected`)
- **What it is:** Public surface + forced password change + kicked/cheating screens.
- **What it actually does:** `src/app/page.tsx:7` `LandingNav/Hero/Demo/Showcases/Features/Architecture/Team/CTA/Footer`; `src/app/login/page.tsx:11` `LoginForm` + `?demo=role` `getDemoAccount` (shows email+password, `Suspense/Skeleton`); `src/app/force-password-change/page.tsx` `ShieldAlert` + `react-hook-form+zod` 8 chars lower/upper/number/special + `reauthenticateWithCredential` + `POST /api/auth/change-password`; `src/app/kicked/page.tsx` `sessionStorage blocked_at/blocked_violations` + `Multiple application switches` if ≥2 + Button → `/gladiator/dashboard`; `src/app/cheating-detected/page.tsx` static `ShieldX` deny. `src/middleware.ts:15` public/BATTLE/api/`/_next`/`manifest` pass, portal check otherwise `NextResponse.next()` (client-then-API-then-rules is real). `src/components/ClientLayout.tsx:30` handles `specialPages` + `mustChangePassword` + `isExecutive/isCommander/isGladiator→ROLE_HOME`. `src/lib/verify-auth.ts:51` blocks all other routes when `mustChangePassword true`.
- **Current condition:** **Solid and working.** `tests/landing.spec.ts` + `phase114-responsive.spec.ts:8` responsive 15/15 pass prove `/`, `/login`, kicked/cheating/force-password render without overflow; login prefill `exec@test.local/Test123456!` + sign-in via emulator confirmed.
- **Recommendation: LEAVE ALONE** — **Simple by design and already responsive/clean.** “More advanced” landing/marketing has little effect on actual battle users; keep as is.

---

## Platform / infrastructure

### ADVANCE

#### P-ADV1 — Firestore indexes + rule generation pipeline
- **What it is:** How the 15+ composite/field-overrides and the single-source rules stay correct.
- **What it actually does:** `firestore.indexes.json:170` defines `collectionGroup` quizzes/users/executive_requests/question_bank/auditLogs/security_logs/notifications/ai_logs/battle_logs/participants (covering `created_by+created_at`, `role+createdAt`, `category+createdAt`, `action+timestamp`, `actor+createdAt`, `userId+createdAt+__name__`, `quizId+timestamp`, `user_id` collectionGroup + fieldOverrides); `firestore.rules.template` → `scripts/generate-firestore-rules.js` → `firestore.rules:484` verbatim including `isAllowedDomainValidForCreate` + `isCurrentQuestion` + `isLegalStatusTransition`; `firebase.json:5` `predeploy: ["npm run rules:generate"]` ensures template → rules before deploy (`AUDIT.md:22` single source).
- **Current condition:** **Working but rough.** Generation pipeline holds (`AUDIT.md:22`). Index `FAILED_PRECONDITION` graceful degrades are now everywhere (`src/app/api/executive/battles/[id]/route.ts:66` sorts `sort_index`, `battle_logs where quizId orderBy timestamp`, `admin/users` etc. fallback to in-memory sort). Some `executive_requests` / `ai_logs` indexes exist but not all filtered paths are covered → fallback is in-memory `FILTER_WINDOW 1000` which bounds cost.
- **Recommendation: ADVANCE** — **Core scale lever with low product risk.** Add the missing indexes explicitly (don’t rely on fallback forever) and a CI check that `firestore.rules` hash matches generated output; both are small wins with outsized future protection.

#### P-ADV2 — CI (`typecheck` + `build` + Playwright on `firebase emulators:exec` → `landing` + `phase114-responsive`)
- **What it is:** Push/PR gate on `main`.
- **What it actually does:** `.github/workflows/ci.yml:11` `actions/setup-node 22` `npm ci` → `npm run typecheck` → `npm run build` (with `GOOGLE_GENERATIVE_AI_API_KEY` env) → `npx playwright install chromium` → `npm install -g firebase-tools` → `npx firebase emulators:exec --only firestore,auth --project demo-test "npx playwright test tests/phase114-responsive.spec.ts tests/landing.spec.ts"`.
- **Current condition:** **Solid but basic.** Only two specs run in CI (landing + responsive). `tests/phase113-e2e.spec.ts:13` (13 unauth 401 gates + manifest/icons + security headers + skip-link) is not in the gate. No authenticated E2E via emulator in CI.
- **Recommendation: ADVANCE** — **Core confidence mechanism, adequate not excellent.** Add `phase113-e2e` to the gate (unauth gates already run without creds) and an authenticated harness (seeded `scripts/seed-demo.ts` → `tests/command-center.spec.ts:6` approach already exists). No product code changed — high confidence for low effort.

#### P-ADV3 — Cron backstops (`/api/cron/sweep-battles` + `/api/cron/forge-worker`) + GitHub hourly forge worker
- **What it is:** The two crons that keep the product honest when tabs close.
- **What it actually does:** `vercel.json:8` `crons: [{path:/api/cron/sweep-battles schedule:"0 8 * * *"}, {path:/api/cron/forge-worker schedule:"0 2 * * *"}]` `maxDuration 60` + `src/app/api/cron/sweep-battles/route.ts:64` `Bearer CRON_SECRET` guard 401, sweeps `live where question_start_at` stale `≥3h` 200/batch `abandonBattle`; `src/app/api/cron/forge-worker/route.ts:52` same `CRON_SECRET` guard, `cleanupExpired` + `listRunnableJobs(6)` loop `elapsed<30s` each `runForgeTick` one Gemini call 35s; `.github/workflows/forge-worker.yml:16` hourly GitHub Action (`schedule "0 * * * *"` + `workflow_dispatch`) complements Vercel daily (free-tier `24 runs/day ≈720 min/mo` within 2000-min allowance).
- **Current condition:** **Working but rough.** Lazy hot-path (`sweepStaleLiveArena`) is primary; crons are safety nets (`AUDIT.md:32` blocked on Vercel creds for prod log proof). GitHub Action requires `CRON_SECRET` repo secret (setup step in file header).
- **Recommendation: ADVANCE** — **Core zero-dollar robustness story from `src/lib/constants.ts:164` comments.** Add a single `forge_worker` observable: `ai_logs` metric “jobs orphaned >1h” → notification to executive; no functional change otherwise.

### LEAVE ALONE

#### P-LEAVE1 — Manifest / PWA assets (`/manifest.webmanifest` + icons)
- **What it is:** Install payload.
- **What it actually does:** `src/app/manifest.ts:3` valid JSON `name Quorena icons 192/512`; `public/icons/icon-192.png 6783B` + `icon-512.png 24847B` PNG magic `89 50 4E 47`; `src/middleware.ts:26` allows `manifest.webmanifest`; `src/app/layout.tsx:32` `themeColor #8B1E2A`; `next.config.ts:8` `outputFileTracingIncludes pdfjs-dist/@napi-rs` + `serverExternalPackages`.
- **Current condition:** **Solid and working.** `tests/phase113-e2e.spec.ts:19` manifest returns `application/manifest+json` not HTML redirect; icons content-type PNG proven. Tier 4 `AUDIT.md:178` palette + responsive clean 15/15.
- **Recommendation: LEAVE ALONE** — **Deliberately bounded.** Full PWA (`next-pwa`, `public/sw.js`, FCM) is `ROADMAP.md:55` V2.0 with no client. No current client to justify service-worker caching complexity.

#### P-LEAVE2 — Rate limiting (Firestore fixed-window distributed per-key + IP helpers)
- **What it is:** Pre-`verify*` request throttles.
- **What it actually does:** `src/lib/rate-limiter.ts:43` `FirestoreRateLimiter {windowStart,count,expiresAt}` `runTransaction`, `expiresAt` TTL pruning, `getClientIp leftmost parts[0]`; `Limits: LOGIN_PER_IP/EMAIL 5, SIGNUP 5, AI 10, BATTLE_ACTION 30, SEARCH 20, MESSAGE 20, WRITE 15, ADMIN 10, AI_COPILOT 10/MINDMAP 5/EXPLANATION 30`; `buildRateLimitHeaders` `Retry-After`; `enforceRateLimit→429` plus `src/app/api/rate-limit/check` IP pre-check. Phase 115A sweep replaced in-memory sliding window with Firestore fail-open (`remaining Infinity`).
- **Current condition:** **Solid and working.** Distributed; correctly per-uid for AI (`AUDIT.md:172` IP→UID fix `src/app/api/quiz/mindmap:16` etc.); IP only where it is correct key (`clock`, `rate-limit/check`, `admin/users`).
- **Recommendation: LEAVE ALONE** — **Fragile already-hardened area.** Forgetting the sliding window nuance is expected (standard fixed-window primitive); further “more advanced” (Redis token-bucket) has little user effect on a free-tier product and violates “don’t build institutional-scale features without a client.” Also note `ROADMAP.md:14` distributed limiter is marked done — don’t re-tune.

#### P-LEAVE3 — Key resolver (multi-key rotation, quota-aware cooldown, bounded wait)
- **What it is:** How one free-tier project survives 429s.
- **What it actually does:** `src/ai/key-resolver.ts:438` `parseKeysFromEnv` `GEMINI_API_KEYS` comma-split deduped + legacy singles, `roundRobinIndex` + `cooldowns Map<apiKey,expiry>`, `getGeminiApiKey(scope?)` bounded `MAX_WAIT_MS 15s` shortest-cooldown wait else `ALL_GEMINI_KEYS_EXHAUSTED`, `isQuotaError/isAuthError/parseRetryDelayMs/markKeyCooldown 60s|300 cap|24h auth`, `withGeminiKeyRotation` distinct keys. Single-threaded `sleep` then sync writes (`AUDIT.md:168` race confirmed none).
- **Current condition:** **Solid and working.** `isAuthError` 24h cooldown fix holds (`AUDIT.md:103`); `isQuotaError` covers `retryDelay` JSON forms.
- **Recommendation: LEAVE ALONE** — **Fragile + already parameterized with low exploit risk.** Mutually contending `getGeminiApiKey` same key is “minor, not exploitable, just extra quota hit” per `AUDIT.md:102` — `ROADMAP.md:14` “add mutex” is polishing with no user-visible gain.

#### P-LEAVE4 — Build / types / dependencies (`npx tsc`, `next build`, audit overrides)
- **What it is:** How `main` stays green.
- **What it actually does:** `package.json:8` `typecheck: node node_modules/typescript/bin/tsc --noEmit`, `build: cross-env NODE_ENV=production next build` `94 routes, First Load JS 103kB Middleware 32.6kB` (`AUDIT.md:126` warnings only OTEL); `SECURITY_NOTES.md` overrides `brace-expansion 2.1.4/fast-uri 3.1.6/nanoid 3.3.18/fast-xml-parser 5.10.1/ip-address 10.3.1`; remaining 68 vulns gated behind `firebase-admin→@google-cloud, genkit→OTEL, next→sharp` chains (Phase 114 dep cleanup 6 dead deps removed + `next` `15.5.9→15.5.20`).
- **Current condition:** **Solid and working.** `AUDIT.md:126` `tsc` clean `LastExit 0`.
- **Recommendation: LEAVE ALONE** — **Already works well; further polish (fixing gated vulns via `npm audit fix`) hangs.** Don’t chase chains that upstream must fix.

#### P-LEAVE5 — Firebase config (`firebase.json:31`, `next.config.ts:34` webpack aliases, `vercel.json:5` `maxDuration 60`, `firestore.indexes.json:170`)
- **What it is:** The deployment plumbing: `firestore` rules/indexes predeploy, `database` RTDB rules, `emulators: firestore 8080 auth 9099 hosting 5000 ui 4000`, `storage` rules (Spark-only), `output standalone` + `outputFileTracingRoot` + `serverActions bodySizeLimit 20mb` + `serverExternalPackages` + webpack alias `firebase/app→dist/index.cjs.js` for server interop, headers `HSTS/nosniff/DENY/referrer/Permissions-Policy`, rewrites `/__/:path*` → Firebase host.
- **Current condition:** **Solid and working.** `AUDIT.md:192` confirms `tsc` + 4 `PDF_EXTRACTION` paths verified; tracing includes fix ensures `pdf.worker.mjs` present.
- **Recommendation: LEAVE ALONE** — **Fragile hardened plumbing.** Changes here break `pdfjs` worker or cold starts. No gain from “more advanced” config without a client.

#### P-LEAVE6 — Emulators + seed (`demo:seed` + `demo` + `scripts/seed-demo.ts` + `firebase.json:10` emulators)
- **What it is:** Local development + `tests/command-center.spec.ts` harness.
- **What it actually does:** `package.json:18` `demo:seed: cross-env FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 tsx scripts/seed-demo.ts`; seed creates `exec@test.local / Test123456!` + live `Midnight Clash` / `Waiting Arena` etc.
- **Current condition:** **Solid and working.** `tests/command-center.spec.ts:6` proves seed path.
- **Recommendation: LEAVE ALONE** — **Already works well.** Seed is enough for confidence; more seed data is polish.

#### P-LEAVE7 — `public/icons` / `supporting` infra (`AvatarEditor`, `ErrorBoundary`, `offline-detector`, `session-timeout`, onboarding)
- **What it is:** Supporting UI infra (not product differentiators).
- **What it actually does:** `src/components/AvatarEditor.tsx` + `src/components/ErrorBoundary.tsx` + `src/components/offline-detector.tsx` + `src/components/session-timeout.tsx` (`SessionTimeoutProvider`) + `src/components/onboarding/*` 3 tours; `src/components/GlobalSearch.tsx` cmd-K; `src/components/ExecutiveSidebar.tsx:68` badges polled 15s, header `BrainCircuit`.
- **Current condition:** **Solid and working.** `tests/phase113-e2e:164` `skip-link` + `aria-label Notifications` pass; responsive clean.
- **Recommendation: LEAVE ALONE** — **Already works well; further polish has little effect.** Onboarding being simple is not a defect.

#### P-LEAVE8 — Notification infra (`notifications` + `ai_logs` + `auditLogs` + `battle_logs` all server-only writes via `src/services/*.service.ts`)
- **What it is:** The log collections + `notifications` fan-out plumbing already covered per feature.
- **What it actually does:** `src/services/notification.service.ts:34` + `src/services/audit.service.ts:62` + `src/services/ai-log.service.ts:74` + `src/services/battle-log.service.ts:56` (+ server `src/lib/battle-server.ts:154` `writeBattleLog`, `src/lib/security-log.ts:85`).
- **Current condition:** **Solid and working.**
- **Recommendation: LEAVE ALONE** — **Server-only by design per `ROADMAP.md:64` deliberately out of scope (no direct client writes to logs).** Don’t “advance” by opening writes.

---

## Services & flows — cross-cutting (already referenced above, here grouped for discoverability)

The same `LEAVE ALONE` / `ADVANCE` rationale applies twice: once per page above and once per the underpinning service. For traceability:

| Service / flow | Primary consumer | Condition | Recommendation | Why (rubric) |
|----------------|-----------------|-----------|---------------|--------------|
| `src/services/quiz.service.ts:199` `quizService` (client CRUD, `roomCode` retry, `resetQuiz` single tx) | `WaitingRoom`, `BattleRoomLoader`, `commander/history` | Working but basic | **LEAVE ALONE** | Simple by design — `createQuiz` is low-level; real creation is `arena-creation.service`. No transaction to touch. |
| `src/services/arena-creation.service.ts:246` `createArenaAtomic` (writeBatch `500` chunk, domain snapshot, rollback) | `QuizCreatorForm`, `QuestionReviewPanel` | Solid, fragile | **LEAVE ALONE** | Fragile already-hardened atomic `writeBatch` + `created_by` `existsAfter` timing fix; no gain from “more advanced” creation. |
| `src/services/participant.service.ts:244` `participantService` (join gate: `allow_late_join`, domain, blocked, session_token) | `BattleRoomLoader`, `WaitingRoom`, `LiveQuiz` | Solid, fragile | **LEAVE ALONE** | Fragile domain gate + `session_token` idempotency; the ADVANCE is in the *observable* (G-ADV1) not the transaction. |
| `src/services/game.service.ts:288` `questionService`/`submissionService` (except dead `evaluateQuestion:111`) | `QuizEditor`, `LiveQuiz` | Partial (dead legacy) | **LEAVE ALONE** (except delete dead) | The dead `evaluateQuestion` is intentional legacy — delete it, don’t advance it. Remaining `createQuestions batch+uuid` + `submitAnswer serverTimestamp` are simple/good-enough. |
| `src/services/forge-job.service.ts:369` (`ai_jobs` split 200k, `forge_cache` 30d, lease `55s/stale 3m`) | `generate-quiz-pdf-flow`, `/api/cron/forge-worker` | Solid, fragile | **LEAVE ALONE** | Fragile async pipeline + single-writer lease; ADVANCE lives in prompt/UX (E-ADV1) not the lease math. |
| `src/services/battle-log.service.ts:56` + `src/lib/battle-server.ts:154` `writeBattleLog` | `WaitingRoom` + server | Solid | **LEAVE ALONE** | Good enough for timeline; replay (`ROADMAP.md:35`) is out-of-scope. |
| `src/services/audit.service.ts:62` + `src/lib/security-log.ts:85` | All `api/*` + `verify-auth` | Solid, logging completeness known gap | **LEAVE ALONE** | Same logging-completeness V1.1 park as E-LEAVE7. |
| `src/services/analytics.service.ts:534` pure `computeAnalytics` | `AnalyticsDashboard`, `/api/executive/analytics-data` | Working but rough | **ADVANCE** | Pure function, no DB risk — calibration + trends are low-risk high-signal (E-ADV4). |
| `src/services/notification.service.ts:34` + `src/lib/battle-server.ts:378` `notifyBattleCompleted` | `battle-server`, `/api/arena/notify` | Solid (chunked 20) | **LEAVE ALONE** | Fan-out is inherently N; “more advanced” shared-rank/queue violates out-of-scope rubric. |
| `src/ai/flows/generate-quiz-pdf-flow.ts:1658` (`createForgeJob/runForgeTick`, `repairJson`, model chain) | `PDFQuizGenerator`, `/api/cron/forge-worker` | Working but rough | **ADVANCE** | Core differentiator with clear prompt/output gains. |
| `src/ai/flows/copilot-flow.ts` | `POST /api/copilot` | Solid | **LEAVE ALONE** | Simple helper; advance Forge not copilot. |
| `src/ai/flows/mindmap-flow.ts` + `explanation-flow.ts` | `POST /api/quiz/mindmap` / `explanation` | Working but rough | **ADVANCE** | Learning promise, easy additive gains (S-ADV4). |
| `src/ai/key-resolver.ts:438` | All flows | Solid, fragile | **LEAVE ALONE** | Bounded `15s` wait + 24h auth cooldown already right; race is sync-serialized, not lock-worthy. |
| `src/lib/prepare-documents.ts:370` (`fflate`, `pdfjs`, `MAX_TOTAL_IMAGES` budget, `JPEG` re-encode) | `PDFQuizGenerator` | Solid, fragile | **LEAVE ALONE** | Hard-won 413 fix; `remainingImageSlots` budget already correct (`AUDIT.md:27`). Don’t re-tune without a new failure. |
| `src/lib/battle-machine.ts:127` (state machine `9` statuses, `computeCorrectScore`) | `battle-server` + `LiveQuiz` | Solid | **LEAVE ALONE** | Pure, already good + scoring model is deliberately frozen per `ROADMAP.md:63` out-of-scope. |
| `src/ai/engines/prediction-engine.ts:69` `getQuizRecommendations` (heuristic, live) | `GET /api/gladiator/recommendations` | Basic, not Genkit | **ADVANCE** (via G-ADV2) | Low-risk caching + weighting; not a transaction. |
| `src/ai/dev.ts` | none | Dead harness | **LEAVE ALONE** (delete) | Not a feature; keep deletion as housekeeping. |

---

## Planned-but-not-built — cross-reference `ROADMAP.md` + `docs/blueprint.md` + `docs/architecture.md`

Each was checked for a real writable/routable implementation; entries with no file/route hold are `NOT BUILT`. Recommendation applies the same rubric (is there a client to justify building now, and does building advance the core?).

### ROADMAP.md V1.1 — Hardening & Integrity

| # | Item | Status | What “would have been” | Recommendation | Why |
|---|------|--------|------------------------|----------------|-----|
| 1.1-1 | Server-side battle sweep (scheduler/CRON) | Built (`sweepStaleLiveArena` + `GET /api/cron/sweep-battles`) | — | — | Built |
| 1.1-2 | Distributed rate limiter | Built (`FirestoreRateLimiter` fixed-window) | — | — | Built |
| 1.1-3 | Server-side join validation + participant caps | **PARTIAL** — domain + `waiting/ready` validated server-side (`firestore.rules:287`); no per-arena `cap` field + no count guard | `quizzes/{id}` `max_participants` + rule `participants size < cap` | **ADVANCE** later | Core classroom safety; small schema + rule addition, no new service. Build when classrooms grow — not blocking now. |
| 1.1-4 | Enforce presence (`PRESENCE_WINDOW_MS` staleness → zombie eviction in waiting/ready) | **PARTIAL** — constants exist `src/lib/constants.ts:68` `PRESENCE_WINDOW_MS 30s / COMMANDER 45s`, tracked via RTDB `presence.service` but no `waiting/ready` zombie sweeper (only `live` sweep); lobby logout lock fixed via `QUIZ_WAITING_ABANDONED_AFTER_MS` but not eviction | Sweeper over `participants.lastSeen` | **LEAVE ALONE** for now | Out-of-scope without a classroom that leaves ghost waiters. Revisit only if Kathir sees a 500-waiting-rooms metric. |
| 1.1-5 | Session-cookie auth + token revocation on logout | **NOT BUILT** — Bearer ID tokens accepted until expiry after sign-out; `middleware.ts` pass-through + `AuthContext signOut` does not revoke refresh tokens | `verify-auth.ts` cookie path + `adminAuth.revokeRefreshTokens` | **LEAVE ALONE** now | Fragile already-hardened auth area + `ROADMAP.md:63` `out of scope: replacing Firebase Auth identity layer` adjacent. Needs explicit hardening milestone, not ad-hoc. |
| 1.1-6 | Logging completeness | **PARTIAL** — `auditLogs` complete; `security_logs` only `invalid_token/security_violation` (see S-LEAVE1) | `recordSecurityEvent` on login_success/failed/logout/rate_limited | **LEAVE ALONE** now | Defined as the single V1.1 hardening item — park until Kathir chooses the milestone; touching Auth to log there risks coupling. |
| 1.1-7 | Strict state-machine enforcement | Built via `firestore.rules:114` `isLegalStatusTransition` + `src/lib/battle-machine.ts:20` `canTransitionQuiz`; helper `assertQuizTransition` `src/lib/battle-machine.ts:26` is **dead** (no route imports) | Wire `assertQuizTransition` into `11` battle routes | **LEAVE ALONE** | Already correctly enforced by rules; adding `assert` is drop-in but is polish for its own sake vs real user gain. |
| 1.1-8 | Structured logging | **PARTIAL** — 3 bare `console.log` in messages route are gone; remaining are `console.error/warn` with stack (`AUDIT.md:20`); one `console.log` in `src/ai/genkit.ts:26` (`[Genkit] AI keys configured`) | Structured payloads | **LEAVE ALONE** | Don’t chase log aesthetics; already structured enough. |
| 1.1-9 | Idempotency regression tests | **NOT BUILT** — scoring guards `src/lib/battle-server.ts:773` `scored` re-check + `672` answered/timed_out/skipped + `456` `alreadyAdvanced` exist but `tests/phase113-e2e.spec.ts` only 401 gates | Playwright/unit around `evaluateQuestion*` | **ADVANCE (test-only, no code)** | Core hardened area deserves coverage. Add test-only without touching transactions — `battle-server` already has the behavior, just needs harness. |
| 1.1-10 | String-literal cleanup | Built — `QUIZ_*`/`PS_*`/`COLLECTIONS.*` everywhere | — | — | Built |

### ROADMAP.md V1.2 — Product & Experience

| # | Item | Status | Recommendation | Why |
|---|------|--------|----------------|-----|
| 1.2-1 | Notifications (realtime) — collection + API + page already exists, add live `onSnapshot` + `unreadBadge` offline-aware | **PARTIAL** — `notifications` collection + API + page exist; badge polls `15s` (`src/components/ExecutiveSidebar.tsx:62` interval) not `onSnapshot` | **LEAVE ALONE** now | Polish for its own sake. Existing polling is good enough; live listener adds Firestore reads for no new product capability. |
| 1.2-2 | AI version history — keep prior generations per quiz (diff, revert), new `quiz_generations` subcollection | **NOT BUILT** — no subcollection, no revert | **LEAVE ALONE** now | Core loop is manual Forge → publish. Versioning without a classroom requesting “where did this question come from” is out-of-scope. Park. |
| 1.2-3 | Multiple AI providers — `@genkit-ai/*` + catalog `src/config/gemini-models.ts` + `platform_settings.ai.defaultModel` | **NOT BUILT** — only `@genkit-ai/googleai` wired; `genkit.ts` single AI | **LEAVE ALONE** now | No client for OpenAI/Anthropic quota. Gemini chain + rotation is already multi-key — out-of-scope. |
| 1.2-4 | Replay — `battle_logs` full event stream → read-only timeline | **NOT BUILT** — no replay UI (logs exist `src/lib/battle-server.ts:30` 11 events) | **ADVANCE** (small, targeted) | Battle platform that cannot replay yesterday’s arena feels incomplete. Reuse already-built `battle_logs` + per-question `questionStats` — read-only, no new writes, natural extension of E-ADV5. Low risk, high classroom value. |
| 1.2-5 | Spectator mode — finished arenas already readable, add read-only “view battle” | **PARTIAL** — finished-arena read is already `canReadArenaContent` + `executive/battles/:id` read-only; no live spectator | **ADVANCE** (incremental) | Smallest V1.2 win: reuse `command-center` detail panel + `applyOptionShuffle` for live read-only spectator (executive/commander). Already sketched in S-ADV2/E-ADV8. |
| 1.2-6 | Achievements — `achievements` subcollection + flags in battle flows | **NOT BUILT** | **LEAVE ALONE** now | Gamification without a classroom incentive model is out-of-scope — `ROADMAP.md:64` adjacent (also a second-app-framework risk if gamification expands). |
| 1.2-7 | Offline support — Firestore cache + `offline-detector` + submission queue | **PARTIAL** — `offline-detector` exists (`src/components/offline-detector.tsx` + `useOnlineStatus`), no persistent cache/queue | **LEAVE ALONE** now | Classroom battles require a reliable room; offline queue for quizzes is speculative without a stable-PWA client (which is itself out-of-scope). |
| 1.2-8 | Internationalization (`next-intl`) | **NOT BUILT** | **LEAVE ALONE** now | No current client; all strings inlined. |
| 1.2-9 | Tournaments — `tournaments` collection + bracket subcollection | **NOT BUILT** | **LEAVE ALONE** now | Biggest V1.2 schema change — out-of-scope without an owning stakeholder. |

### ROADMAP.md V2.0 — Scale & Platform (all NOT BUILT by design)

| Item | Recommendation | Why |
|------|----------------|-----|
| Organization / multi-tenant `orgId` | **LEAVE ALONE** — deliberately out of scope per `ROADMAP.md:50` | No org to be tenant of. |
| Plugin architecture — pluggable Forge engines/providers | **LEAVE ALONE** — out of scope per `ROADMAP.md:64` (no second framework) | Flows behind stable interfaces is premature. |
| AI scheduler — automated arena / question-bank refresh jobs | **LEAVE ALONE** — out of scope, builds on sweeper infra not yet stressed | |
| Team battles — group model, per-team scoring | **LEAVE ALONE** — biggest schema change, requires `battle-server.ts:930` rework | |
| Analytics warehouse export — BigQuery sync | **LEAVE ALONE** — exports already typed (`GET /api/executive/export`); warehouse without a BI consumer is polish. | |
| PWA / mobile app — Next standalone + SW + FCM | **LEAVE ALONE** — manifest + icons already ship; full SW without a mobile client is polish. | |
| Multi-region Firestore | **LEAVE ALONE** — evaluates nothing without a second region latency problem. | |

### `docs/blueprint.md` + `docs/architecture.md` leftovers

| Mentioned | Reality | Status | Recommendation |
|-----------|---------|--------|----------------|
| `pdfreader` for PDF extraction | Replaced by `pdfjs-dist` + `fflate` `prepareDocuments` (browser) + Node `extractTextFromPdfBuffer` `src/ai/flows/generate-quiz-pdf-flow.ts:712` `DOMMatrix/Path2D` polyfills | PARTIAL in docs (stale) | **LEAVE ALONE** — doc drift, not product drift (already fixed). |
| Standalone output for Docker | Holds (`next.config.ts:6` `output:'standalone'`, `Dockerfile` present) | Built | — |
| Quiz state machine `draft→waiting→live→finished` (doc) | Actual `src/lib/constants.ts:8` 9 states `draft/waiting/ready/starting/live/paused/finished/archived/abandoned` + `ALLOWED_QUIZ_TRANSITIONS` | Doc stale | **LEAVE ALONE** — doc simplification; rules are correct. |
| Cyberpunk style (`Electric blue #7DF9FF`, Space Grotesk) | Evolved to earthy red/amber/olive `--primary 15 68%` etc. + `Inter + Playfair_Display`, `themeColor #8B1E2A` `src/app/layout.tsx:32` | Intentional | **LEAVE ALONE** — by design; Phase 114 palette clean. |

---

## Stub / dead-code / unreachable inventory (every file that exists but has no reachable UI — each still gets an entry)

| File / route | Reachability | What it is | Condition | Recommendation |
|--------------|-------------|-----------|-----------|----------------|
| `src/services/game.service.ts:111` `evaluateQuestion` | Zero importers (`grep from '@/services/game.service'` → `createQuestions/getQuestions/subscribe/replaceQuizContent/submitAnswer` only) — server `battle-server.ts:577` canonical | Client-side scorer (`SCORE_BASE 500 + timeFraction*SCORE_TIMED_BONUS`) divergent from `computeCorrectScore+streakBonus` | Dead legacy | **LEAVE ALONE (delete)** — safe to remove; don’t advance. |
| `src/lib/battle-machine.ts:26` `assertQuizTransition` | Defined, no `api/battle/*` imports; `firestore.rules:114` `isLegalStatusTransition` is real gate | Transition helper | Dead helper | **LEAVE ALONE (wire-or-delete, additive)** — add `assertQuizTransition(from,to)` audit line if desired, don’t refactor transitions. |
| `src/ai/engines/knowledge-engine.ts`, `decision-support-engine.ts`, `prediction-engine.ts:getPredictionSummary/getRecommendationPrompt` | `410 Gone` `src/app/api/predictions|knowledge|decision-support/summary` — header `PHASE 69 SHELVED — kept for future wiring` | Shelved Genkit prompts | Shelved, not bug | **LEAVE ALONE** — keep per header; don’t remove (spec says deliberately shelved) and don’t build until a client exists. |
| `src/ai/dev.ts` (`devAi = ai`) | `genkit:dev` doesn’t import any flow | Dead harness | Dead | **LEAVE ALONE (delete)** |
| `src/app/executive/dashboard/page.tsx:3` `redirect('/executive/workspace')` | No sidebar link; `ROLE_HOME` is `workspace` | Legacy bookmark compatibility | Redirect-only | **LEAVE ALONE** — let redirect stand or add `middleware` redirect; no product work. |
| `src/app/executive/users/[uid]/page.tsx` (generic `UserDetail`) | Only via `GlobalSearch` deep-link, not sidebar | Hidden utility | Working | **LEAVE ALONE** — intentionally hidden; simplicity not defect. |
| `src/app/executive/announcements/[id]/page.tsx` | Only via notification `link` or direct URL; back link `router.push('/executive/announcements')` 404 | Announcement detail | Working with dead back link | **LEAVE ALONE (fix dead link)** — `router.push('/executive/messages')` one-line fix, then leave. |
| `src/components/quiz/BattleRoomLoader.tsx:363` `if (status===ABANDONED)` nested dead branch | Inside `if (LIVE||PAUSED)` — never renders `Battle Abandoned` | Abandoned screen | Bug — dead branch | **ADVANCE (fix)** — move `if (status===ABANDONED)` before `if (LIVE||PAUSED)`; tests `Unexpected State` vs `Abandoned` — this is the one-line exception to the shared LEAVE ALONE, because the current leave-alone still leaves it broken. |
| `src/app/executive/ai-logs/page.tsx` `modelFilter` | Client-only filter not sent to `GET /api/executive/ai-logs` (server filters `success/userId`) | Dead param | Minor dead | **LEAVE ALONE** — cosmetic; not a feature defect. |
| `src/components/quiz/AICopilot.tsx:218` `{ /* TODO if API key missing: show disabled state … */ }` | Only `TODO` in `src/` | Benign UI polish | Minor | **LEAVE ALONE** |

No commented-out business code found; Phase-tagged comments (`Phase94/99/107/115B/C`) are explanatory.

---

## Condition rubric recap (what the words mean in this file)

- **Solid and working** — clean path with no gaps, and either a passing test covers it or a real local/emulator trace proves it (e.g., `tests/landing.spec.ts`, `tests/command-center.spec.ts`, `phase113-e2e` unauth gates).
- **Working but rough** — complete feature end-to-end, but basic/prompt-limited and with clear bounded improvement (Forge, analytics, sets, search, battle history).
- **Partial** — some of the described capability exists, some doesn’t (e.g., presence tracked but not enforced eviction; PWA manifest without SW).
- **Stub / NOT BUILT** — route exists as `410` by design or doc item has no file; deliberately shelved counts as NOT BUILT not broken.
- **Broken** — dead branch `BattleRoomLoader:363` abandoned screen (still reachable path is broken).

---

## What Kathir should do first (the ADVANCE priority order — if only 6 sprints exist)

1. **Fix the one bug:** move `ABANDONED` before `LIVE/PAUSED` in `src/components/quiz/BattleRoomLoader.tsx:363` (S-LEAVE5 exception). 5 minutes, visible correctness.
2. **Fix the two 404s:** `workspace → /executive/security` and `announcements `[id]` → /executive/messages` (E-ADV7/E-LEAVE9). Trivial.
3. **Advance the Forge** (E-ADV1/C-ADV2) — few-shot, per-difficulty prompts, format retry, de-dupe. Biggest user effect, low regression (prompt/output layer only).
4. **Advance analytics** (E-ADV4) — calibration suggestions and `forge_cache` hit-rate panel. Pure function, no DB.
5. **Advance curation** (E-ADV2/E-ADV3) — set ordering, tag taxonomy, inline edit. The daily executive job.
6. **Advance replay/spectator** (E-ADV5/S-ADV2 targeted) — read-only replay scrub + live spectator in `command-center`. Reuses `battle_logs` + `questionStats`; read-only.

Everything marked **LEAVE ALONE** should be left alone so the six above get focus — especially the battle-transaction and auth/session hardened paths.

---

## Status summary (counts from the file above)

- **Executive-only:** 9 ADVANCE, 13 LEAVE ALONE.
- **Commander-only:** 5 ADVANCE, 6 LEAVE ALONE.
- **Gladiator-only:** 3 ADVANCE, 4 LEAVE ALONE.
- **Shared / cross-role:** 5 ADVANCE, 10 LEAVE ALONE (plus the one Bug fix exception noted in S-LEAVE5).
- **Platform / infra:** 3 ADVANCE, 8 LEAVE ALONE (infra already solid).
- **Planned-but-not-built:** 1 ADVANCE-later (`participant caps`), 1 ADVANCE-test-only (`idempotency tests`), 2 ADVANCE-small (`replay`, `spectator`), 8+ LEAVE-ALONE out-of-scope (V1.2/V2.0) by design.
- **Stubs / dead / unreachable:** 2 ADVANCE-fix (abandoned screen + workspace/announcements links), rest LEAVE-ALONE-delete-or-keep.
