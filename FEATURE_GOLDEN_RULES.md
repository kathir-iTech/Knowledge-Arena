# Quorena — 20-Feature Golden Rules & Correlation Map

**Date:** 2026-09-06
**Commit:** `e90c75b` (HEAD `main`)
**Status:** Research document — no code changes in this round. Kathir reviews this, brings findings to Claude, then an implementation prompt is written. If you wanted to fix something while reading, note it here — don't touch code yet.
**How built:** File-by-file re-verification of `FEATURE_INVENTORY.md:1` (47 pages, 71 API routes) + `features_audit_1.md:1` + current code `src/lib/prepare-documents.ts:370` `src/ai/flows/generate-quiz-pdf-flow.ts:1658` `src/services/forge-job.service.ts:369` `src/components/quiz/PDFQuizGenerator.tsx:588` `src/ai/key-resolver.ts:438` `src/lib/constants.ts:217` `src/lib/battle-server.ts:930` `src/lib/battle-machine.ts:127` `firestore.rules:484` `next.config.ts:123` `vercel.json:18` `firebase.json:31` `firestore.indexes.json:170`. Gemini plan `D:\Developer\Downloads\Gemini-20-Feature OpenCode Optimization Plan-20260906-0905.md:62` was compared — its citations `[cite:1,2,3]` are placeholders, its "AST-aware parsing / RTDB shadow / full IRT at N=6 / full TF-IDF" claims are over-specified (see each section's caveat).

> **Long-term framing (from your prompt):** PSG iTech pilot → product that could stand against Kahoot/Quizizz/Blooket. Current differentiators (per-arena domain isolation `firestore.rules:57`, PDF-to-quiz `prepare-documents.ts`, anti-attendance-gaming `usePageFocusChange`) are real but "copyable in 8-12 weeks" per prior audit. This doc maps for each of 20 features what *would* be hard to casually clone without deliberate sustained effort — and what else touches it so the later implementation round doesn't repeat the stale-rules-template-undoes-fix pattern.

**How to read:** 20 sections in the order you specified. Each has exactly 5 parts. `Gladiator search` is intentionally out of unified search (Feature 9). `$0` means Vercel Hobby + Firebase Spark + free Gemini keys `GEMINI_API_KEYS` csv per `src/ai/key-resolver.ts:32`.

---

## 1. AI Forge — document-to-quiz generation, all entry points

*Same underlying pipeline, both roles — `FEATURE_INVENTORY.md:30 row 7/32`, `features_audit_1.md: E-ADV1/C-ADV2`, `src/lib/prepare-documents.ts`, `src/ai/flows/generate-quiz-pdf-flow.ts`, `src/services/forge-job.service.ts`, `src/components/quiz/PDFQuizGenerator.tsx`.*

### 1. Golden rules — the genuinely unavoidable constraints

* **Vercel hard payload ceiling 4.5 MB** — not `next.config.ts:32` `serverActions bodySizeLimit: '20mb'` (that only raises Next's parser). Base64 inflates raw file +33% (`src/lib/prepare-documents.ts:1-16` comment: `4.44 MB PDF → 5.92 MB JSON body → 413`). **Therefore** browser must extract text + render scanned pages to bounded JPEGs; raw bytes never cross the wire. Raising any payload cap in code cannot bypass this infra limit.
* **Vercel `maxDuration 60`** `vercel.json:4` `app/**/*.js` — previous `30` caused `504 FUNCTION_INVOCATION_TIMEOUT` for 20-40s Gemini on large/hard/25Q. Current tick decomposition keeps each invocation inside this ceiling (see below).
* **Firestore doc 1 MiB hard limit** — why payload is sharded: `FORGE_PAYLOAD_TEXT_PART 200k` chars `src/lib/constants.ts:215` (~200-400KB UTF-8) per `text_0..N` + one doc per `img_0..N`. Whole payload (24 images + 500k chars `MAX_EXTRACTED_TEXT_CHARS` `src/ai/flows/generate-quiz-pdf-flow.ts:545`) would exceed a single doc.
* **Client budgets:** `MAX_TEXT_PAGES 100`, `MAX_TEXT_CHARS 40000`, `MAX_SCANNED_PAGE_IMAGES 6` per doc, `MAX_TOTAL_IMAGES 24` shared, `RENDER_LONG_SIDE 2240`, `IMAGE_LONG_SIDE 1600`, `JPEG_QUALITY 0.8` `src/lib/prepare-documents.ts:70-77` — `extractPdfFile(remainingImageSlots)` receives shared budget so N scanned PDFs cannot blow the request.
* **Server budgets:** `MAX_FILE_SIZE_BYTES 10MB` `src/ai/flows/generate-quiz-pdf-flow.ts:45` + `MAX_EXTRACTED_IMAGES 24 / MAX_EXTRACTED_TEXT_CHARS 500k` `545-546` `checkForgePayload()` → `PDF_TOO_LARGE`.
* **Per-tick budgets:** `FORGE_TICK_QA 5`, `FORGE_TEXT_CHUNK 40000`, `GEMINI_TIMEOUT 35s` `src/ai/flows/generate-quiz-pdf-flow.ts:47`, `EXTRACTION_TIMEOUT 30s` `46`, `MAX_RETRIES_PER_MODEL 3`, `MAX_TICKS 40`, `FORGE_MAX_CONSECUTIVE_FAILURES 4` `src/lib/constants.ts:186-208` — each tick = exactly one Gemini call, `lease 55s / stale 3m`, backoffs `quota 60s / timeout 20s / generic 10s`.
* **Data model is additive-only:** `ai_jobs/{jobId}` `ForgeJobDoc` `src/services/forge-job.service.ts:50-76` (`status queued|running|done|failed|cancelled`, `cursor {chunkIndex,modelIndex,ticks}`, `generatedCount`, `progressNote`, `engine`, `error`, `consecutiveFailures`, `nextAttemptAt`, `workerToken 24B hex`, `contentHash sha256(documents+difficulty+questionCount)` **names excluded**, `leaseBy/leaseExpiresAt`, `expiresAt = createdAt + 6h` `FORGE_JOB_TTL_MS`, `questions arrayUnion`) + `ai_jobs/{jobId}/payload/{text_N, img_N}` `kind:'text'/'image'` + `forge_cache/{contentHash}` `{questions, engine, createdAt, expiresAt +30d}`. No breaking migration — Forge must keep legacy `generateQuizFromPDF` (`pdfDataUri` `||PDF_SEPARATOR||`) alongside `generateQuizFromExtracted` for non-browser callers.
* **$0 + single-person team:** `GEMINI_API_KEYS` csv vs legacy singles `src/ai/key-resolver.ts:32`, `cache hit → sha256 exclude names` saves quota, `firestore rate_limits` fixed-window vs Redis, `vercel.json` crons `sweep-battles 0 8 * * *` + `forge-worker 0 2 * * *` plus `GITHUB forge-worker.yml hourly 0 * * * *` (24 runs/day ≈720 min/mo inside 2000-min private allowance). No vector DB, no paid queue.

### 2. What would actually be hard to casually copy

**Honest moat is not parser — it's output discipline + async durability.** A competitor spending a sprint on a "PDF→quiz" button will have `pdfjs` + `genkit` too; what they won't have without sustained effort:

* **Hard:** Cross-tick question dedupe + grounding verification. `J(A,B) |Tokens(Q)∩Tokens(D)|/|Tokens(Q)|` and `GroundingScore <0.70 → secondary Genkit pass` (`Gemini §3.1` formula, corrected from invented AST) requires a term-level check across `40000-char` chunks + `chunks[0]` vision limit (`AUDIT.md:30` notes vision uses only `chunks[0]` — harmless at `40k` cap but silently drops text if cap raised). Persisting dedupe across `arrayUnion` ticks with single-writer `claimNextTick` is not weekend work.
* **Hard:** Bounded tick durability with back-pressure. `lease 55s` single-writer `FIRESTORE_RATE_LIMITS 60/min tick / 10/min create / 5/min legacy` `src/lib/rate-limiter.ts:43` + `nextAttemptAt` gate making job `busy` even if `queued`, plus client `PDFQuizGenerator:189` 4-step `Extracting→Sending→Generating→Reviewing` with per-file `pending|reading|done|error` + `truncationNote` + error-code→guidance map `252-321` (`PDF_ENCRYPTED/IMAGE_ONLY/CONTENT_TOO_SHORT/QUOTA_RETRY_AFTER`) — replicating parity takes trials.
* **Not moat, just solid:** Few-shot exemplars. `Prompt_final = SystemRole + Σ_3 Exemplar_k + Context_quiz + UserQuery` is well-executed prompt engineering — a weekend can match it, but matching *consistently* across `easy/moderate/hard` while preserving `QuizQuestionOutputSchema` `text/options[4]/correctAnswerIndex 0-3/explanation` Zod + `repairJson` 3 tiers (fence→quote→brace→whitespace) `src/ai/flows/generate-quiz-pdf-flow.ts:182` without `PARSE_FAILED` requires sustained tuning — that's the sustained effort.
* **Anti-moat honesty:** If advanced as prompt-only, this is "well executed, not impossible to beat" — defensibility comes from the *system* (cache 30d + `getKeyHealth` + backoff) not a single trick.

### 3. Correlated files — direct

* `src/lib/prepare-documents.ts` (370L browser extraction + JPEG re-encode)
* `src/ai/flows/generate-quiz-pdf-flow.ts` (1658L — largest module: legacy `pdfDataUri` + `generateQuizFromExtracted` + `createForgeJob:1419` `runForgeTick:1497` `generateContentFromExtracted` `callModelWithRetry:247` `callGeminiWithFallback:357`)
* `src/services/forge-job.service.ts` (369L `ai_jobs` split 200k + `forge_cache` + `claimNextTick`)
* `src/components/quiz/PDFQuizGenerator.tsx` (588L 4-step UI, `createForgeJob→runForgeTick` loop `retryAfterMs 1-5s` `mountedRef`)
* `src/ai/key-resolver.ts` (438L `getGeminiApiKey` round-robin + `MAX_WAIT 15s` `DEFAULT_COOLDOWN 60s` `auth 24h` `parseRetryDelayMs` `markKeyCooldown`)
* `src/lib/constants.ts:186-215` (`FORGE_*`, `COLLECTIONS.AI_JOBS/FORGE_CACHE/RATE_LIMITS`, `MAX_TEXT_CHARS` etc.)
* `src/app/api/cron/forge-worker/route.ts` (52L `RUN_WINDOW 30s` `MAX_PER_RUN 6`)
* `firestore.rules:457-468` (`ai_jobs`/`forge_cache` `if false`)
* `src/ai/genkit.ts` (`createGenkitForKey(apiKey)` per-request — singleton `ai` breaks rotation)
* `src/lib/rate-limiter.ts:43` (`FirestoreRateLimiter` `rate_limits/{key} {windowStart,count,expiresAt}` TTL)
* `src/config/gemini-models.ts` (catalog `gemini-2.5` — **does not affect Forge** which hardcodes `googleAI.model('gemini-3.6-flash')` + `platform_settings.global ai.defaultModel` fallback `src/ai/flows/generate-quiz-pdf-flow.ts:80-94` `SHUTDOWN_PREFIXES` block)
* `vercel.json:4` (`maxDuration 60`), `next.config.ts:32` (`serverExternalPackages pdfjs-dist,@napi-rs/canvas` + `outputFileTracingIncludes` + `bodySizeLimit 20mb`), `firebase.json:31` (emulators), `public/pdfjs/pdf.worker.min.js` (`PDF_WORKER_SRC '/pdfjs/pdf.worker.min.js'` `prepare-documents.ts:24`)

### 4. Correlated files — indirect

* `src/lib/firebase-admin.ts` (`getAdminDb` singleton for `forge-job.service`, `rate-limiter`, `ai-log`, `generate-quiz-pdf-flow`)
* `src/lib/verify-auth.ts:51` (`verifyFirebaseTokenWithRole` executive|commander — gladiator blocked, `mustChangePassword` TOCTOU single-read)
* `src/services/ai-log.service.ts:74` (`aiLogService.record` every Forge path `unknown` on exception) + `src/lib/security-log.ts:85` (`logAuthFailure`) + `src/lib/firebase-auth-errors.ts`
* `.github/workflows/forge-worker.yml:16` (hourly backstop `CRON_SECRET` must match Vercel env — mismatch → 401 → orphaned jobs after tab close)
* `firestore.indexes.json:170` (no dedicated `ai_jobs` composite — `listRunnableJobs where status in [queued,running] limit max*4` then client filters `nextAttemptAt/leaseExpiresAt`)
* `firestore.rules.template` → `scripts/generate-firestore-rules.js:27` `predeploy: ["npm run rules:generate"]`
* `src/app/create-quiz/page.tsx` (`dynamic ssr:false` `PDFQuizGenerator` + `QuestionReviewPanel` host + `localStorage ka_draft_{uid}` + `handleRegenerateQuestion 120s` `generateQuizFromExtracted`)
* `src/app/executive/question-bank/page.tsx` (executive `PDFQuizGenerator` with `showCategorySelector` + `ExecutiveQuestionReviewPanel`)
* `src/components/quiz/QuizCreatorForm.tsx` / `QuestionReviewPanel.tsx` (manual vs Forge tabs), `src/components/ui/*` (`button/card/input/label/slider`), `src/lib/utils.ts` (`cn`), `src/hooks/use-toast.ts`, `src/firebase/provider.tsx`
* `package.json` (`pdfjs-dist` legacy `pdf.mjs` + `fflate unzipSync` + `@genkit-ai/googleai` + `zlib` docx inflate + `@napi-rs/canvas` externalized)

### 5. Risk level if this specific feature is touched

**HIGH boundary — prompt/output safe, payload/lease/model-chain fatal.**

* **Safe to advance substantially (zero risk):** `generate-quiz-pdf-flow.ts:1040-1098` `buildPrompt/buildVisionPrompt` few-shot + `repairJson` + `validateQuestions duplicate/empty option warnings` + `QuestionReviewPanel` dedupe + `forge_cache hit-ratio`/`getKeyHealth` observability add — prompt layer only.
* **Do not touch to advance:** `prepare-documents.ts:70` `MAX_TOTAL_IMAGES/MAX_TEXT_CHARS` budget or `FORGE_PAYLOAD_TEXT_PART 200k` or `FORGE_TICK_QA 5` or `GEMINI_TIMEOUT 35s` or `maxDuration 30` regress → `413`/`504`; `firestore.rules:457` `ai_jobs/forge_cache if false` (security bypass + cache poisoning); singleton `ai` instead of `createGenkitForKey` (rotation breaks → `ALL_GEMINI_KEYS_EXHAUSTED` never rotates); `contentHash include name` (rename miss) or `exclude imageDataUris` (false hit → wrong questions); `claimNextTick` removing `nextAttemptAt` gate or lease check (hammer Gemini during cooldown → quota burn, duplicate `arrayUnion`).

---

## 2. Question Bank sets + bulk curation (Executive)

*`E-ADV2` `src/app/api/executive/question-bank/sets/*`.*

### 1. Golden rules

* **Vercel `60s` `runtime='nodejs'`** `vercel.json:4` — all `sets` routes run `nodejs`. Bulk `fetchSetDocs` loops `N setIds` sequentially; `50×1000 docs = 50K reads` must stay <60s or `504`.
* **Firestore `$0 Spark`:** `SET_SCAN_LIMIT 5000` `src/lib/quiz-sets.ts` paginates `1000 by createdAt desc` up to `5000`. Every filter change with debounce triggers it; `searchTokens array-contains` first term is the *only* server-filtered path — docs before `searchTokens` introduction are invisible to search. `MAX_BATCH_OPS 500` `src/lib/constants.ts:140` hard caps `POST /bulk` (`src/app/api/executive/question-bank/bulk/route.ts` `≤50 sets ≤500 ops`) — exceeding → `400`.
* **Data model additive:** Group key `i:${importSessionId}` if present else `g:${createdAtMs}|${createdBy}|${source}|${category}` `src/lib/quiz-sets.ts:26`. Title shared only if all docs share same `title` else `category · date`. `setStatus null` = `active` (`summarizeSet` picks first non-null → partial batch = inconsistent status). `searchTokens` lowercased `/[a-z0-9]+/g ≥2 chars` from `title, category, tags` — title rename must rebuild tokens for all docs or set disappears.
* **Team:** Unified `question_bank` (platform library) vs `quizzes/*/questions` (arena copies). `source enum manual/ai/ai_pdf_forge/pdf` drives `isAiQuestion` `src/app/api/executive/analytics-data/route.ts` analytics. `importSessionId` UUID is the only stable set identity; legacy `g:` shifts if `createdAt` precision edited.

### 2. What would actually be hard to casually copy

* **Hard:** `docGroupKey` fallback + `encodeSetId base64url` + `summarizeGroups` sorting that preserves legacy `g:` sets without data migration — naive copy loses pre-token sets.
* **Hard:** `buildSearchTokens` dedup + `array-contains` first-term + residual filter (if search has 3 tokens, first goes to Firestore, remaining 2 filter in-memory) — without it, `5000-doc` scan kills Spark quota.
* **Hard:** Duplicate `title (Copy)` + new `importSessionId` + `createdBy: auth.uid` provenance that resets `createdAt` → new set drifts to top — competitor dedupe without provenance loses audit.
* **Not moat:** Bulk tag dedup case-insensitive preserving original string — solid, not defensible (honest: "well executed").

### 3. Correlated files — direct

* `src/app/api/executive/question-bank/sets/route.ts` (GET list `fetchSetSummaries + in-mem filters paginate 12/50`)
* `src/app/api/executive/question-bank/sets/export/route.ts` (POST `≤50 setIds → kind:quiz_sets v1`)
* `src/app/api/executive/question-bank/sets/[setId]/route.ts` (GET detail / PATCH `title 1-120 / status published|archived|active→null` / DELETE batch)
* `src/app/api/executive/question-bank/sets/[setId]/export/route.ts` (GET single `kind:quiz_set v1`)
* `src/app/api/executive/question-bank/sets/[setId]/duplicate/route.ts` (POST `new importSessionId UUID + audit question_bank_set_duplicated`)
* `src/app/api/executive/question-bank/bulk/route.ts` (POST `difficulty+tag ≤50 ≤500 ops tag dedup + searchTokens refresh`)
* `src/app/api/executive/question-bank/route.ts` (GET `50+1 cursor` / POST `import questions[] → batch + buildSearchTokens + importSessionId` `question_bank_import`)
* `src/app/api/executive/question-bank/[id]/route.ts` (GET/PATCH/DELETE single, `searchTokens` rebuild from stored `title`)
* `src/app/api/executive/question-bank/categories/route.ts` (GET `300 select('category')` sorted)
* `src/lib/quiz-sets.ts` (core `docGroupKey`, `buildSearchTokens`, `encode/decodeSetId base64url`, `scanAllQuestionDocs`, `fetchSetDocs`, `summarizeSet`, `fetchSetSummaries`)
* `src/app/executive/question-bank/page.tsx` (+ `layout.tsx` `maxDuration` hint), `src/components/quiz/QuizLibraryManager.tsx`, `src/components/quiz/ExecutiveQuestionReviewPanel.tsx` (`POST /question-bank`), `src/components/quiz/QuestionPreviewModal.tsx`, `src/components/quiz/QuestionBankImportModal.tsx`

### 4. Correlated files — indirect

* `src/lib/constants.ts` (`COLLECTIONS.QUESTION_BANK`, `MAX_BATCH_OPS 500`, `Limits.READ 30/min, WRITE 15/min, EXEC_EXPORT 5/min`)
* `src/lib/verify-auth.ts` (`verifyFirebaseTokenWithRole executive`) + `src/lib/rate-limiter.ts` (`FirestoreRateLimiter` `rate_limits/{key}` TTL + `getClientIp leftmost`) + `src/lib/firebase-admin.ts` + `src/lib/schemas.ts` (`QuestionDoc`) + `src/lib/quiz-validator.ts` (9 IssueTypes `duplicate_question ... invalid_json` `severity error|warning` global `correctAnswer identical` warning)
* `src/services/audit.service.ts` (`question_bank_* imported/updated/deleted/set_updated/deleted/duplicated/bulk_updated`) + `src/services/ai-log.service.ts` + `src/config/gemini-models.ts` (forge fallback before import) + `src/lib/prepare-documents.ts` (`PreparedDocument`)
* `src/components/ui/*` (`dialog/select/badge/skeleton/empty-state`), `src/hooks/use-toast.ts`/`useAuth.ts`/`firebase/provider.tsx`
* `firestore.rules:362` `question_bank allow read executive|commander, write executive only` (searchTokens not gated but write gated; commander forge cannot write directly — must `POST /question-bank` Admin SDK), `firebase.json` + `firestore.indexes.json` (`question_bank category+createdAt`, `searchTokens array-contains`), `vercel.json maxDuration 60`

### 5. Risk level

**HIGH — batch limit, stable grouping, and search index are load-bearing.**

* UI + `quiz-sets.ts` search logic can be reworked (ordering controls, taxonomy chips, Jaccard `J(A,B)=|A∩B|/|A∪B| >0.85` flag `Gemini §3.2` in-memory) with zero risk.
* **Do not touch:** `MAX_BATCH_OPS` or removing `SET_SCAN_LIMIT` → unbounded pagination + billing spike; `docGroupKey/buildSearchTokens` → orphans sets + breaks search; `question_bank write executive only` widening → library curation leak.

---

## 3. Quiz Set Detail — inline curation

*`E-ADV3` `src/app/executive/question-bank/sets/[setId]/*`.*

### 1. Golden rules

* **Vercel 60s:** Single-set `fetchSetDocs` `where importSessionId==` indexed else full `scanAll 5000` for `g:` must stay <60s. Batch `batch.update per doc updatedAt Timestamp` — `500` limit caps set size ≤500 or PATCH fails partial (no chunking).
* **Firestore $0:** No pagination — detail reads every question of set (up to `1000 limit`). `searchTokens rebuild on title rename` uses `buildSearchTokens(title, category, tags)` — `tags` comma-string vs array inconsistency can cause token drift.
* **Data model:** Per-question PATCH `POST /question-bank/[id]` separate from set route. `setStatus` per-doc denormalized — UI `PATCH → setStatus + title + updatedAt` to **all** docs in set; two execs editing same set → last-write-wins, no tx. `difficulty moderate` vs `medium` both valid legacy — `DIFFICULTY_OPTIONS` in page vs `ALLOWED_DIFFICULTIES` in bulk must stay synced.

### 2. What would actually be hard to casually copy

* **Hard:** Shared title detection `Set([...titles]).size==1` vs fallback `category · date` — wrong fallback hides sets.
* **Hard:** Expandable answer matrix `correctAnswerIndex` highlight + `expandedId` single-open + `correctAnswerIndex re-index on option delete >oi ? -1` `src/app/executive/question-bank/sets/[setId]/page.tsx:674`.
* **Not moat:** `PreviewModal totalQuestions vs questionIndex off-by-one`, `difficulty select` — solid UX, not defensibility.

### 3. Correlated files — direct

* `src/app/executive/question-bank/sets/[setId]/page.tsx` (674L `fetch PATCH/DELETE/duplicate/export`, expandable questions, inline `Dialog`, `QuestionPreviewModal` `timer 30`)
* `layout.tsx` pass-through
* `src/app/api/executive/question-bank/sets/[setId]/route.ts`, `export/route.ts`, `duplicate/route.ts`

### 4. Correlated files — indirect

* `src/app/api/executive/question-bank/[id]/route.ts` (per-question PATCH/DELETE), `src/lib/quiz-sets.ts` (`decodeSetId/fetchSetDocs/summarizeSet/buildSearchTokens`), `src/lib/constants.ts` (`Limits.WRITE/EXEC_EXPORT`), `src/lib/verify-auth.ts`/`rate-limiter.ts`/`firebase-admin.ts`, `src/services/audit.service.ts` (`question_bank_set_updated/deleted/duplicated`), `src/components/quiz/QuestionPreviewModal.tsx`, `src/components/ui/*`, `src/hooks/use-toast.ts`, `src/lib/types.ts` (`Role`), `firestore.rules:362` (`question_bank write executive only`).

### 5. Risk level

**MEDIUM-HIGH — PATCH validation + grouping.**

* Inline edit + calibration `p-value` hints (`E-ADV4` reuse), drag reorder can be added with zero risk.
* **Do not touch:** `PATCH title 1-120 / status enum` widening → injection or orphans; `searchTokens` rebuild on rename; `set grouping` `title|importSessionId` key; `difficulty enum` sync between page vs bulk.

---

## 4. Platform Analytics + Analytics Dashboard

*`E-ADV4` `src/services/analytics.service.ts`, `src/app/api/executive/analytics-data/route.ts`, `src/components/analytics/*`, `src/hooks/useAnalytics.ts`.*

### 1. Golden rules

* **Vercel 60s:** `analytics-data` `4 parallel select()` (`users/quizzes/question_bank/conversations`) + in-mem bucketing `localDateStr` local timezone grouping — shift if Vercel region changes; `CommanderPerformanceTable`/`DifficultyCalibrationTable` run **client** `getDocs(collection)` requiring `firestore.rules:207` `allow read if isExecutive()` for list — non-executive redirect via `executive/layout.tsx` + `ClientLayout`; caps `QUIZ_CAP 100 / QUESTION_CAP 200` bound `Spark` free-tier `50K reads/day`.
* **Firestore $0:** `useAnalytics` caps `quizIds 100` + 3 parallel `Promise.all(quizIds.map getDocs(subcollection))` 300 reads/refresh. Old impl scanned `submissions` per question `10K reads` → replaced by denormalized `questionStats` `src/lib/battle-server.ts:200` `submittedCount/optionCounts/correctCount/timestamps[500]/userTimes` written at `finishBattle/advanceQuestion/evaluate*` via `set({merge:true})` outside tx `Promise.all`.
* **Data model:** `timestamps sliced 500`, `userTimes` `clientTime fallback submittedAt`, `computeAnalytics` `responseTimes earliest timestamp as proxy start` → assumes simultaneous start; `QuizAnalytics.duration = max-min timestamps` not `ended_at-created_at` if stats missing; `StudentAnalytics` filters `user_id !== created_by` excludes commander self-participant. Two sources must stay consistent on `isAiQuestion = createdBy==='ai_import' || source in ['ai','ai_pdf_forge','pdf']` + `categoryUsage = subject||category||General`.
* **Team:** `CACHE_TTL 5min` `useAnalytics role==='executive' ? 'all' : teacherId` `abortRef`.

### 2. What would actually be hard to casually copy

* **Hard:** Denormalized write-time vs read-time split — `writeQuestionStats` collapsed `submissions` into counts + `userTimes` + `timestamps` so dashboard avoids `N×M` reads; a sprint clone reverts to per-submission scan and exhausts `Spark`.
* **Hard:** `engagement = completion*40 + (30-dropout*30) + max(0,30-(violations+blocked*3)/total*10)` capped 100 — not obvious tuning.
* **Hard:** `30s heatmap bucket Math.floor(t/30000)*30000` + `exportCSV/HTML ExportPreferences toggles includeStudentNames/scores/timestamps` `escCsv/escHtml` injection-safe; cache `5min`.
* **Not moat:** `recharts` chart choice — solid.

### 3. Correlated files — direct

* `src/services/analytics.service.ts` (534L `QuestionStatsDoc`, `computeAnalytics` pure, `export`, `scoreHistogram`, `engagement`, `buildTimelineFromTimestamps`)
* `src/app/api/executive/analytics-data/route.ts` (30d time-series `dailyBattles/weeklyBattles/monthlyUsers/commanderActivity/gladiatorParticipation/categoryUsage/aiUsage/messageActivity` `select` projections)
* `src/hooks/useAnalytics.ts` (`CACHE_TTL 5min` `slice 100 quizIds`)
* `src/components/analytics/AnalyticsDashboard.tsx` (`Tabs overview/commander/difficulty` + `exportPreferences` `GET /settings`), `AnalyticsCharts.tsx` (`Area dailyBattles`, `Bar monthlyUsers/commanderActivity`, `Pie categoryUsage`, `Line aiUsage/messageActivity`), `CommanderPerformanceTable.tsx` (`QUIZ_CAP 100` `Live` badge), `DifficultyCalibrationTable.tsx` (`QUESTION_CAP 200` `wrongRate` `hardest/easiest 3`), `charts/index.tsx`, `QuizAnalyticsSection`, `QuestionAnalyticsSection`, `StudentAnalyticsSection`, `SystemInsightsSection`, `QuizOverviewCards`, `src/app/executive/analytics/page.tsx:20` (`dynamic ssr:false`)

### 4. Correlated files — indirect

* `src/lib/battle-server.ts:200` (`writeQuestionStats`), `src/lib/constants.ts` (`QUIZ_FINISHED`, `COLLECTIONS.*`, `MAX_BATCH_OPS`), `src/lib/schemas.ts` (`ValidatedQuiz/Participant/QuestionDoc`), `src/lib/verify-auth.ts`/`rate-limiter.ts`/`firebase-admin.ts` (`analytics-data` `READ_PER_USER`), `src/hooks/useAuth.ts`, `src/firebase/provider.tsx`, `src/services/audit.service.ts`/`battle-log.service.ts`/`ai-log.service.ts` (insights overlap), `src/app/api/executive/insights/route.ts`, `src/app/api/executive/settings/route.ts` (`exportPreferences`), `firestore.rules` (`quizzes participants read canReadArena / questions canReadArenaContent / answerKeys finished+participant` — client `useAnalytics` must be `isExecutive`), `vercel.json` (no cron, on-demand), `src/lib/battle-machine.ts` (scoring reused).

### 5. Risk level

**MEDIUM — pure function safe, caps fatal.**

* **Safe to advance substantially:** `computeAnalytics` IRT extension `P_i(θ)=1/(1+e^{-a_i(θ-b_i)})` 2PL when `submittedCount≥30` else `p-value`, difficulty re-label flag — pure, no schema.
* **Do not touch:** Remove `questionStats` denormalization → `10×` amplification; remove `slice(0,100)` / caps → `1000×` reads + `60s` timeout; `analytics-data select` → full docs → payload bloat.

---

## 5. Battle History + Battle Detail (platform-wide, executive oversight)

*`E-ADV5` `src/app/api/executive/battles/*`, `src/app/executive/battles/*`, `src/lib/battle-server.ts:200` `writeQuestionStats`.*

### 1. Golden rules

* **Vercel `nodejs` 60s:** `GET /battles` `1000 select` + `Promise.allSettled per-battle participants (≤50 paginated)` must stay <60s; `GET /battles/[id]` `safeQuery FAILED_PRECONDITION` fallback → in-mem sort + `Promise.all per question submissions batched` → `50 questions → 50 get()` >60s risk → degrades to empty array not 500; `writeQuestionStats` `set({merge:true})` outside tx `Promise.all` stays under `500 writes/tx`.
* **Firestore $0:** `select('title','status',...)` reduces billed bytes; legacy `sort_index` missing → unordered + in-mem sort; `battle_logs where quizId orderBy timestamp desc limit 200` missing index → equality-only + in-mem sort `timestamp||createdAt`; `finished && !archived` filter (soft-delete `archived` disappears from history).
* **Data model:** `scoring_config` migrated `quizzes/{id}.scoring_config` → `quizzes/{id}/config/settings` `src/lib/battle-server.ts:73` `scoringConfigFrom(doc,legacyQuiz)` fallback; `questionStats` optional; `submissions.submittedAt Timestamp|number → toMillis`; `streak current/best server-only`; `abandoned` terminal filtered out.

### 2. What would actually be hard to casually copy

* **Hard:** `writeQuestionStats` privacy — aggregate `counts` on `question` doc readable by participants who answered, `scores` never included.
* **Hard:** `safeQuery FAILED_PRECONDITION` pattern for missing `sort_index` + `battle_logs` index — graceful degrade not obvious.
* **Hard:** Batched `submissions per question → Map<userId, submissions[]>` `O(1)` vs per-participant loop `participants×questions` — saves `30×30` reads.
* **Hard:** `finishBattle` tx `FINISHED|ARCHIVED` early return idempotent + `notifyBattleCompleted ranking chunk 20 + commander vs gladiator distinction`.
* **Not moat:** `Timeline 50/200` cap, `winner first score>0 sorted desc else null`.

### 3. Correlated files — direct

* `src/app/api/executive/battles/route.ts` (list `1000 select` `q` filter `offset/limit 50` `avgScore/winner`)
* `src/app/api/executive/battles/[id]/route.ts` (`quiz + config/settings scoring_config` + commander `users/{created_by}` + `questions orderBy sort_index fallback` + `answerKeys` + `participants + batched submissions → submissionsByUserId` + `battle_logs 200` + `stats accuracy/completion winner`)
* `src/app/executive/battles/page.tsx` (`search 250ms PageSize 50 Load More` `Swords`), `src/app/executive/battles/[id]/page.tsx` (`6 StatTile`, `Timeline 50`, `Leaderboard` ranked, `Questions & Answers` per-participant matrix `success/destructive`, `Config grid` 422L)
* `src/lib/battle-server.ts:200` (`writeQuestionStats` + `finishBattle/abandonBattle/sweep/advance/evaluate/notifyBattleCompleted`)

### 4. Correlated files — indirect

* `src/lib/constants.ts` (`QUIZ_FINISHED/ARCHIVED/LIVE/ABANDONED`, `QUIZ_ABANDONED_AFTER_MS 3h`, `PS_BLOCKED/FINISHED`, `SCORE_*`), `src/lib/schemas.ts`, `src/lib/battle-machine.ts` (`normalizeScoringConfig` + `computeCorrectScore` + `computeStreakBonus`), `src/lib/verify-auth.ts`/`rate-limiter.ts`/`firebase-admin.ts`, `src/services/battle.service.ts` (client HTTP), `src/services/battle-log.service.ts` (`battle_logs`), `src/services/notification.service.ts` (`notifyBattleCompleted chunk 20`), `src/services/participant.service.ts`, `src/services/game.service.ts` (`questions/answerKeys/submissions`), `src/lib/security-log.ts` (`submission_clock_skew/answer_after_timeout`), `src/lib/client-clock.ts`, `firestore.rules`, `src/components/ui/*`, `src/components/quiz/PostBattleAnalysis.tsx`, `src/app/battle/[roomCode]/page.tsx` + `LiveQuiz`, `vercel.json` (`sweep-battles` cron impacts `finished` filter).

### 5. Risk level

**MEDIUM-HIGH — history is read-heavy, easy to explode, but additive replay is safe.**

* **Safe:** Add read-only `State(t)=State(0)+ Σ Δe_k·𝕀(t_k≤t)` second-by-second replay `battle_logs + submission timelines` step-through + rank trajectories + diff matrix in `commander/analysis/[quizId]` + `executive/battles/[id]` — no new writes.
* **Do not touch:** Remove `writeQuestionStats` → analytics + detail `correctCount` fallback breaks; `finished` include `abandoned` → zombie leak; `config/settings` fallback removal breaks legacy pre-Phase 94; per-participant `submissions` loop → cost spike.

---

## 6. Executive Workspace (Mission Control)

*`E-ADV7` `src/app/api/executive/workspace/route.ts`, `src/app/executive/workspace/page.tsx`.*

### 1. Golden rules

* **Vercel:** `11 Promise.all` `select()` `limit 5000/2000/100/200/50` must stay <60s + chunked `30 Promise.allSettled(participants select score)` for `averageScore + realtime connections` — if `2000 finished → 67 chunks ×30 =2010 reads` >60s + `Spark` overrun.
* **Firestore $0:** `select()` everywhere; `question_bank 5000` cap — if >5000 `questionsAddedThisWeek` + `aiImportedCount` truncated; `ai_logs 200` + `security_logs 100` `30d` in-mem filter truncated if >200/100; `Promise.allSettled fulfilled` ignore failures but log.
* **Data model:** `isAiQuestion = createdBy==='ai_import' || source in ['ai','ai_pdf_forge','pdf']` reused from analytics; `averageBattleScore` includes zeros not inflated; `avgDuration only finished with created_at && finished_at`; `realtime.connections status != 'blocked'` `status==='live'` strictly (excludes `paused/ready/starting`); `lastBackupAt` `auditLogs where action==='backup_created'` lost if audit rotated.

### 2. What would actually be hard to casually copy

* **Hard:** `getSystemHealth` 3 probes `listUsers(1)` + Firestore `limit1` + `conversations limit1` + `getKeyHealth available = health.filter(!inCooldown).length` + `aiSummary topModel reduce` + `recentBattles 5 sorted created_at + commander name resolve`.
* **Not moat:** Poll `30s`, `AnimatedValue`, `QuickActions 5 hrefs` — solid.

### 3. Correlated files — direct

* `src/app/api/executive/workspace/route.ts` (400L `executive READ_PER_USER` + 11 gets + `HealthIndex`), `src/app/executive/workspace/page.tsx` (863L poll `30s` + `SystemHealth` + `QuickActions` + `Primary stats 4` + `Realtime 4` + `Analytics 8` + `Three-col recent battles/requests/notifications` + `Two-col active commanders/AI/recent/security/health/DB`).

### 4. Correlated files — indirect

* `src/lib/constants.ts` (`COLLECTIONS.*`, `Limits.READ_PER_USER`), `src/lib/verify-auth.ts`/`rate-limiter.ts`/`firebase-admin.ts` `getAdminAuth`, `src/ai/key-resolver.ts` (`getKeyHealth`), `src/services/audit.service.ts`/`ai-log.service.ts`/`security-log.ts`, `src/components/ui/*`, `src/hooks/useAuth.ts`, `src/app/api/executive/notifications|audit-logs|ai-logs|security-logs|requests|announcements/[id]` siblings, `src/app/executive/command-center`/`analytics`/`battles`/`question-bank`/`commanders`/`settings` (quickActions targets), `src/components/analytics/*`, `firestore.rules` (`users auditLogs/ai_logs/security_logs executive only` — workspace Admin bypass), `vercel.json maxDuration 60`.

### 5. Risk level

**MEDIUM — select/chunk fatal if touched.**

* **Safe:** Fix dead link `/security-logs` → `/security`, add actionable `HealthIndex = w1·DB+w2·Auth+w3·AI - w4·stale` alert `stale live >3h` → `command-center`, keep `30s` poll.
* **Do not touch:** Remove `select()` or raise `limit 5000→10000` → `60s` timeout + `Spark` spike; chunk `30→100` → throttling; `getSystemHealth throw vs warning` → `500` when AI rotates; `isAiQuestion` predicate desync workspace vs analytics.

---

## 7. Command Center — live battle monitoring / potential spectator mode

*`E-ADV8` `src/components/executive/command-center/*`, `src/lib/command-center.ts`, `src/services/participant.service.ts`, `src/services/game.service.ts`.*

### 1. Golden rules

* **Vercel zero server cost** — all `onSnapshot` client. Must not move to API aggregation or will `60s` timeout + reads duplication; `onSnapshot where status in ACTIVE_BATTLE_STATUSES` `in` ≤10 (5 values) safe.
* **Firestore $0:** No `select()` on quizzes — full docs per status change; `where('status','in',...)` single-field index default. `pendingRef Set` dedup avoids `N×` `getDoc(users/{uid})` per-second when participants update rapidly. `PRESENCE_WINDOW 30s` `src/lib/constants.ts` defines `isOnline` `src/lib/command-center.ts` — if Vercel client clock skewed >5s vs `lastSeen serverTimestamp` flickers.
* **Data model:** `CommandParticipant answered/timedOut/skipped arrays` → heatmap, `CommandQuestion sort_index not createdAt`, `battleSortKey rank live<starting<paused<ready<waiting` live always top, `computeWinnerPrediction score>0 || answered>0` excludes idle joiners, `buildHeatmap cap 24 ranked + columnsShown 12 sliding from max(0,to-12+1)`, `getTimerInfo question_start_at + timer*1000` requires Firestore not client clock.
* **Team:** Executive `useAuth guard if (!user) return` — non-executive redirect relies on `executive/layout.tsx` + `ClientLayout`.

### 2. What would actually be hard to casually copy

* **Hard:** Single `now setInterval 1000` shared across timer + presence, `prevPartsRef` diff `joined/left` `eventId(prefix):${Date.now()}:${random7}`, `profilesRef+pendingRef` dedup, `subsRef per-battle lifecycle create if !subs[id] delete if !ids.includes(k) + try/catch`, `sortedBattles useMemo + profiles enrichment + questionsByBattle fallback []` `tests/command-center.spec.ts:6` proves `live+waiting` cards + `Live Leaderboard/Winner Prediction/Answer Heatmap/Participant Activity` via `Midnight Clash` seed.
* **Not moat for clone's weekend:** The 1s clock — easy.

### 3. Correlated files — direct

* `src/components/executive/command-center/CommandCenter.tsx` (337L `onSnapshot quizzes ACTIVE + per-battle participants/questions`, profiles `getDoc users`, `now 1s`, `sortedBattles useMemo + battleSortKey`, `selected events`), `CommandCenterStats.tsx`, `BattleSummaryCard.tsx`, `BattleDetailPanel.tsx` (176L `rankParticipants`, `isOnline`, `getTimerInfo`, `WinnerPrediction`, `ActivityHeatmap`, `ActivityFeed`), `ActivityHeatmap.tsx` (`buildHeatmap 12 cols`), `WinnerPrediction.tsx` (`computeWinnerPrediction`), `ActivityFeed.tsx` (`joined/left`), `src/lib/command-center.ts` (200L `ACTIVE_BATTLE_STATUSES`, `CommandParticipant/Battle`, `isOnline PRESENCE_WINDOW`, `rankParticipants`, `getTimerInfo`, `computeWinnerPrediction`, `buildHeatmap up to 24`, `battleSortKey`), `src/services/participant.service.ts:244` (`getAllParticipantsBulk`, `joinQuiz governance + domain`, `subscribeToParticipants`), `src/services/game.service.ts:288` (`subscribeToQuestions`), `src/app/executive/command-center/page.tsx:8` wrapper.

### 4. Correlated files — indirect

* `src/lib/constants.ts` (`PRESENCE_WINDOW 30000`, `QUIZ_*`, `BATTLE_MODE`, `COLLECTIONS`), `src/lib/schemas.ts`, `src/lib/types.ts`, `src/firebase/provider.tsx` (`initializeFirebase`), `src/hooks/useAuth.ts`, `src/services/presence.service.ts` (RTDB sibling — center uses `lastSeen` not RTDB but sibling), `src/services/battle.service.ts` (client HTTP — center read-only no write), `src/lib/battle-server.ts` (`advance/finish`), `src/lib/battle-machine.ts` (`score displayed`), `src/components/ui/*`, `firestore.rules` (`quizzes in` + `participants canReadArena` + `questions canReadArenaContent` + `users isOwner||isExecutive` — executive passes), `vercel.json` (no server function — listeners persist beyond `maxDuration`), `tests/command-center.spec.ts` (`live+waiting` cards, Ruby leader 1240).

### 5. Risk level

**CRITICAL if listeners touched, LOW for UI.**

* Removing `where status in` or adding `finished` leaks archived, doubles reads; `onSnapshot→getDocs` polling breaks real-time + `command-center.spec.ts`; `PRESENCE_WINDOW`/`isOnline` miscount; `buildHeatmap columnsShown 12 / rank 24` fidelity loss.
* **Safe to advance substantially:** Read-only spectator drawer using `P^{-1}` `src/lib/battle-machine.ts:121` `invertPermutation` option inversion — pure inversion, no `battle-server` tx.

---

## 8. AI Logs + Insights (observability for the AI surface)

*`E-ADV9` `src/app/api/executive/insights/route.ts`, `src/ai/key-resolver.ts` health, `src/services/ai-log.service.ts`, `src/app/executive/ai-logs/page.tsx`.*

### 1. Golden rules

* **Vercel:** `ai_logs orderBy createdAt desc limit 200` + `security_logs 100` `30d` in-mem filter — if >200/100 in `30d` truncated; `GEMINI_TIMEOUT 35s` < `maxDuration 60`.
* **Firestore $0:** `aiLogService.record` every Forge/mindmap/explanation/copilot `unknown` on exception; `getKeyHealth available = health.filter(!inCooldown).length` multi-key length implicit.
* **Data model:** `insight: successRate = successes/total, avgDuration, model breakdown, dailyActivity` server aggregated — thin.

### 2. What would actually be hard to casually copy

* **Hard:** `H_key = 1 - ΣErrors_24h/ΣRequests_24h`, `CacheHitRatio = N_cache/N_total` from `forge_cache` (`30d TTL`) + `getKeyHealth:84` read-only `preview`. Competitor with single key has `H_key` 0/1 not distribution.
* **Not moat:** Top model `reduce` frequency — solid.

### 3. Correlated files — direct

* `src/app/api/executive/insights/route.ts` (`AI_API_PER_USER` 30d), `src/ai/key-resolver.ts:255` (`getConfiguredKeys`, `getKeyHealth`, `isQuotaError/isAuthError`, `parseRetryDelayMs 60s/24h`, `markKeyCooldown`), `src/services/ai-log.service.ts:74` (`record`, `startAfter cursor`), `src/app/executive/ai-logs/page.tsx` (`success/cursor`, client `modelFilter` not sent — minor dead param), `src/app/api/executive/ai-logs/route.ts`.

### 4. Correlated files — indirect

* `src/ai/flows/generate-quiz-pdf-flow.ts` (`aiLogService.record` all paths), `src/ai/flows/mindmap-flow.ts`/`explanation-flow.ts`/`copilot-flow.ts`, `src/lib/verify-auth.ts`/`rate-limiter.ts`/`firebase-admin.ts`, `src/components/analytics/SystemInsightsSection.tsx`, `firestore.rules` (`ai_logs read executive only`), `vercel.json maxDuration`.

### 5. Risk level

**LOW — observability additive.**

* Expose `getKeyHealth` panel + `forge_cache` hit-ratio read-only, retaining synchronous `key-resolver:255-324` mutual-exclusion `sleep→sync writes` (no `await` between `Date.now()` + `cooldowns`). Do not refactor that sync block to async lock — low risk of contention noted `AUDIT.md:102` `minor, not exploitable, just extra quota`.

---

## 9. Unified search (Executive + Commander)

*`E-ADV6/C-ADV5` `src/app/api/executive/search/route.ts`, `src/app/api/commander/search/route.ts` — **Gladiator `G-LEAVE4` `collectionGroup participants where user_id==uid` out of scope — do not touch without saying so explicitly**.*

### 1. Golden rules

* **Vercel `nodejs` `Limits.SEARCH_PER_USER 20/min` fixed-window `rate_limits/{key}` per-uid** `src/lib/rate-limiter.ts` — **never `getClientIp`** (throttles entire college NAT — `src/app/api/copilot/route.ts` comment `throttles college behind shared IP`). `q.trim().length<2 → {results:[],total:0}` lowercased once, `relevance 4=exact 3=startsWith 2=includes -1=no-match`.
* **Firestore Admin `getAdminDb()` `MAX_PER_COLLECTION 200 (auditLogs 100)` `select()` projections** — prod parallel `10×200` `executive` vs `commander where created_by==uid select title... limit 200 slice 12` never leaks. Missing composite `where+orderBy` on `auditLogs orderBy timestamp desc` needs index or `500`.
* **Team:** Unified naming but scoped implementations — executive returns `score, highlight start/end titleLower.indexOf(query), uid/role/email/avatar, roomCode, participants, lastActivity, readBy.length`; commander `href /battle/{id}` not `executive/battles/{id}`.

### 2. What would actually be hard to casually copy

* **Hard:** Per-type `MAX_PER_TYPE 8` + global `MAX_TOTAL 60` + `seen Set(`${type}:${id}`)` + `score` then `title.localeCompare` sort prevents one collection flooding — race without dedup is easy bug.
* **Hard:** Conversation 2-phase: first `userIds whose name/email matched`, then `participants.some(uid=>uidQuerySet || uid.includes(query)) || lastMessage.includes` — cross-matches userIds that matched query.
* **Not moat:** String matching itself — well executed, not defensible beyond `TF·log(N/DF)·e^{-λΔt}` upgrade.

### 3. Correlated files — direct

* `src/app/api/executive/search/route.ts` (10-collection fan-out `users/question_bank/quizzes/auditLogs/conversations/announcements/notifications/security_logs/ai_logs/executive_requests` `MAX_PER_TYPE 8` `highlight`), `src/app/api/commander/search/route.ts` (`where created_by==uid` limit 200 slice 12 `href /battle`).

### 4. Correlated files — indirect

* `src/lib/verify-auth.ts` (`verifyFirebaseTokenWithRole executive|commander` + `mustChangePassword`), `src/lib/firebase-admin.ts`, `src/lib/rate-limiter.ts` (`SEARCH_PER_USER`), `src/lib/security-log.ts`, `src/lib/constants.ts` (`COLLECTIONS`, `MIN_SEARCH_LENGTH 2`, `DEFAULT_QUERY_LIMIT`, `RATE_LIMITS`), `src/components/executive/ExecutiveWorkspace` search bar / `src/app/commander/dashboard` search input, `firestore.rules` `users isOwner||isExecutive` `rate_limits if false` (search must be Admin), `firestore.indexes.json` (`auditLogs action/actorRole/actor+timestamp`), `src/app/api/copilot/route.ts` pattern for per-uid limit.

### 5. Risk level

**MEDIUM-HIGH — data leakage & cost.**

* **Safe:** Migrate to `searchTokens array-contains first term` + `TF·log(N/DF)` + `e^{-λΔt}` recency — additive, call sites unchanged `SEARCH_PER_USER`.
* **Do not touch:** `select()→get()` or removing `notifications where userId==auth.uid` → PII leak; raising `200→1000` ×10 = `2000 reads/request ×20/min ×N` → `Firestore` explosion + `>10s` timeout; touching `relevance thresholds`/`highlight indexOf` off-by-one breaks UI; swapping to IP-based throttles college NAT; adding `where+orderBy` without index → `500`; removing commander `where created_by` leaks all arenas; **do not let unified search touch `G-LEAVE4` `participantService.getStudentHistory` `collectionGroup`** without explicit say so.

---

## 10. Arena Architect — manual creation + AI Copilot

*`C-ADV1` `src/components/quiz/QuizCreatorForm.tsx`, `src/components/quiz/AICopilot.tsx`, `src/ai/flows/copilot-flow.ts`, `src/app/api/copilot/route.ts`, `src/services/arena-creation.service.ts`, `src/lib/quiz-validator.ts`.*

### 1. Golden rules

* **Zod:** `title min 3`, `questions min1` manual vs `3` review, `text 5-500 / options 2-4 ×1-200 / correctAnswer 0-3 / timer 5-120 default 30 / timeBonus true / streak 0-100 / scoreMax 100-5000 default1000 / scoreMin 0-1000 default100 / reveal_timing after_timer|never_during / showLiveLeaderboard true / allowLateJoin true / negativeMarking false / antiCheat warn_only|auto_flag` `src/lib/constants.ts`.
* **Auth:** Manual creation client `user.role commander|executive` relies on `firestore.rules:212` `isQuizCreator` `isAllowedDomainValidForCreate`; Copilot `verifyFirebaseToken` route + `verifyFirebaseTokenWithRole commander|executive` flow + `mustChangePassword` block — gladiator 401.
* **Rate limit:** Copilot dual-layer `enforceRateLimit ai:copilot:{uid} 10/min` route **and** `rateLimiter.check 10/min` flow `429 Retry-After 60` — removing second leaves `copilotAssist` direct call unbypassed.
* **AI:** `googleAI.model('gemini-3.6-flash')` `src/ai/genkit.ts` `createGenkitForKey(apiKey)` per-request `COPILOT_TIMEOUT 30s` `src/ai/key-resolver.ts` rotation `getGeminiApiKey` round-robin + cooldown `60s/24h` `parseRetryDelayMs`.
* **Atomicity:** `arena-creation.service:246` `writeBatch chunk 500` `ROOM_CODE 6 A-Z0-9 crypto.getRandomValues` `ROOM_CODE_RETRIES 5` `submittedRef+isSubmitting` no double-submit, rollback `Promise.allSettled(deleteDoc committedRefs)`. `submitted` failure shows `Creation Failed`, `notify fetch catch(()=>{})` never overwrites success toast `router.push('/battle/{code}')`.
* **Client SDK:** `initializeFirebase().firestore` not Admin for creation.

### 2. What would actually be hard to casually copy

* **Hard:** Batched atomic creation with gated config `quizzes/{id}` `title/status waiting/current_question_index -1/question_count/created_by/Date.now()/battle_mode synchronized/allowed_gladiator_domain snapshotted` + `participants/{createdBy} score 0 status playing violations 0 lastSeen serverTimestamp` + `config/settings scoring_config, governance_config, skipped_question_ids [], created_by` **never** on parent (pre-join leak prevention `src/firestore.rules:129` forbids `scoring_config` on parent), `isQuizCreatorAfter existsAfter/getAfter` parent-not-yet-exists same batch, `created_by` fallback avoids `10-get limit` `questions allow create:225`.
* **Hard:** Domain snapshot `users/{createdBy}.institution_domain regex /^[a-z0-9.-]+\.[a-z]{2,}$/ lower()` fail-open `null` + `isAllowedDomainValidForCreate` `lower()` mirror executive bypass `firestore.rules:46`.
* **Hard:** `negative_marking true + wrong_penalty 0 → 250` else `0` `src/components/quiz/AdvancedGovernanceSection` mapping + batch timing fix `config/settings created_by`.
* **Not hard:** `fetch('/api/arena/notify').catch` isolation, `uuidv4` ids, `hasDuplicateOptions trim lower Set` `addOption caps 4`, `AdvancedScoring/Governance controlled value/onChange` mirroring `form.watch/setValue`, `onDirtyChange isDirty → beforeunload` draft, `quiz-validator 9 IssueTypes duplicate_question ... invalid_json severity error|warning global correctAnswer identical` — solid.

### 3. Correlated files — direct

* `src/components/quiz/QuizCreatorForm.tsx` (`useFieldArray + uuidv4 + AdvancedScoring/Governance`), `src/components/quiz/AICopilot.tsx` (inline `userMessage`, `questionContext`, `titleContext`), `src/ai/flows/copilot-flow.ts` (`DefinePrompt SystemRole + UserQuery → {suggestion, generatedQuestion text/options[4]/correctAnswer 0-3/explanation} fallback text.slice(0,500)` `aiLogService even on failure`), `src/app/api/copilot/route.ts:8` (thin auth/rate proxy `Bearer||body.idToken`), `src/services/arena-creation.service.ts:246` (`createArenaAtomic`), `src/lib/quiz-validator.ts` (`validateQuiz`), `src/components/quiz/AdvancedScoringSection.tsx` (`DEFAULT_ADVANCED_SCORING toScoringConfig`), `src/components/quiz/AdvancedGovernanceSection.tsx` (`DEFAULT_ADVANCED_GOVERNANCE toGovernanceConfig`).

### 4. Correlated files — indirect

* `src/ai/genkit.ts` (`ai`, `createGenkitForKey`), `src/ai/key-resolver.ts`, `src/services/ai-log.service.ts`, `src/lib/verify-auth.ts`/`rate-limiter.ts`/`firebase-admin.ts`/`utils.ts` (`generateRoomCode, cn`), `src/hooks/useAuth.ts`/`use-toast.ts`/`firebase/{index,config}`, `src/app/api/arena/notify/route.ts`, `src/lib/battle-machine.ts` (`normalizeScoringConfig`), `src/components/ui/*`, `src/components/quiz/QuestionBankImportModal.tsx`, `COLLECTIONS, QUIZ_CONFIG_SETTINGS_DOC='settings', QUIZ_WAITING, PS_PLAYING, ROOM_CODE_RETRIES, MAX_BATCH_OPS, MIN_TITLE_LENGTH 3, MIN_QUESTIONS 1, DEFAULT_SCORE_*`, `firestore.rules:212` `quizzes allow create isSignedIn && role commander|executive && created_by==uid && isAllowedDomainValidForCreate` + `questions/answerKeys allow create isQuizCreator||isQuizCreatorAfter||created_by==uid` + `config/{docId} allow create isQuizCreator||isQuizCreatorAfter||isExecutive||created_by==uid hasOnly([scoring_config,governance_config,skipped_question_ids,created_by])`.

### 5. Risk level

**HIGH — scoring leak, atomicity, domain bypass.**

* Safe to advance substantially: few-shot `Σ Exemplar_k` domain+difficulty matching `Prompt_final = SystemRole + Σ_3 Exemplar + Context_quiz + UserQuery`, generation stack undo/redo + `tokenEstimate` in `AICopilot.tsx` — prompt/output only.
* **Do not touch:** Move `scoring_config` to parent `quizzes` → `canReadArena` non-participant leak; `writeBatch → individual setDoc` without `deleteDoc(committedRefs)` rollback → orphan `questions/answerKeys` zombie arena; remove `allowed_gladiator_domain` snapshot or `isAllowedDomainValidForCreate` → spoof other institution or break `participants allow create isEmailDomainAllowed`; `createGenkitForKey` → singleton `ai` → rotation break `429` blocks all; remove second `rateLimiter.check` → bypass; skip `hasDuplicateOptions/validateQuiz` before `createArenaAtomic` → `correctAnswer -1` runtime; remove `submittedRef` → duplicate room codes.

---

## 11. Question Review Panel → publish

*`C-ADV3` `src/components/quiz/QuestionReviewPanel.tsx`, `src/app/create-quiz/page.tsx`.*

### 1. Golden rules

* **Vercel:** `dynamic(...,{ssr:false})` for `QuizCreatorForm/PDFQuizGenerator/QuestionReviewPanel` — avoids `window/crypto/localStorage` SSR mismatch.
* **Validation:** `useEffect → validateQuiz(mapped) on questions change` `hasInvalid = issues.some(severity error)` blocks `handleCreateRoom`; `questions.length<3` also blocks (stricter than manual `1`).
* **Auth:** Same `commander|executive` + `Bearer` fan-out `await getIdToken()` for `/api/arena/notify`.
* **Persistence:** `localStorage ka_draft_{uid} {timestamp, activeTab, generatedQuestions, difficulty, forgeParams}` `1000ms debounce + beforeunload saveDraft()`, restore dialog on mount.
* **Regeneration:** `handleRegenerateQuestion(idx) → generateQuizFromPDF or generateQuizFromExtracted src/ai/flows/generate-quiz-pdf-flow.ts idToken race Promise.race 120s TIMEOUT` validates `text≥5 / options≥2 / correctAnswer 0-3 range / duplicate options Set` → `setGeneratedQuestions(updated)` `prevInitialRef` diff-merge preserves `id` + local edits.
* **Timer:** Review uses **global** `globalTimer default 30 10-120` applied to **all** `timer: globalTimer` on publish (vs manual per-question timer). `quizTitle maxLength 60`.

### 2. What would actually be hard to casually copy

* **Hard:** `prevInitialRef` per-index `oldGen.text !== newGen.text || JSON.stringify(options) !== ... || correctAnswerIndex !== ...` then `...q, text,options,correctAnswerIndex,explanation` — preserves shuffle/edits on AI-refine else full `uuidv4` reset. Naive full reset loses Commander's shuffle.
* **Hard:** `handleShuffleOptions(id) isCorrect originalIndex → Fisher-Yates → newCorrectIndex = findIndex(isCorrect)` — answer integrity after shuffle.
* **Hard:** Validation UX per-question `bg-destructive/5 vs bg-warning/5` + global `questionIndex -1` `duplicate_correct_answer` banner + `shuffle/regenerate/delete` preserve recompute + same `arenaCreationService.createArenaAtomic({title:quizTitle, questions: map(timer:globalTimer), scoringConfig: toScoringConfig(scoring), governanceConfig: toGovernanceConfig(governance)})` + `submittedRef/isSubmitting` + isolated `fetch notify catch(()=>{})` + `toast Room Code + router.push('/battle/{code}') + onArenaCreated:clearDraft` + `AdvancedScoring/Governance` identical shape.
* **Not moat:** `activeTab manual|forge persisted`, `Suspense fallback h-96`.

### 3. Correlated files — direct

* `src/components/quiz/QuestionReviewPanel.tsx` (review/edit/shuffle/validate/publish modal)
* `src/app/create-quiz/page.tsx` (`Manual|AI Forge` tabs + draft + back guards `hasUnsavedWork manualDirty||forgeDirty showBackConfirm` + `showEditConfirm`)

### 4. Correlated files — indirect

* `src/services/arena-creation.service.ts`, `src/lib/quiz-validator.ts`, `src/ai/flows/generate-quiz-pdf-flow.ts` (`generateQuizFromPDF`, `generateQuizFromExtracted`, `PreparedDocument`), `src/lib/prepare-documents.ts`, `src/services/ai-log.service.ts`, `src/components/quiz/AdvancedScoringSection.tsx`/`AdvancedGovernanceSection.tsx`/`PDFQuizGenerator.tsx`/`QuizCreatorForm.tsx`/`QuestionBankImportModal.tsx`, `src/components/ui/*` (`button/card/badge/input/textarea/label/radio-group/dialog/alert-dialog`), `src/lib/constants.ts`, `src/lib/utils.ts`, `src/hooks/useAuth.ts`/`use-toast.ts`/`firebase/*`, `src/lib/auth-redirect.ts` (`ROLE_HOME`), same collections + `ai_jobs/forge_cache/ai_logs` `firestore.rules` as Feature 10.

### 5. Risk level

**MEDIUM-HIGH — draft loss / validation bypass.**

* **Safe to advance substantially:** Batch text transforms (option simplification, distractor tuning), drag `sort_index` `∀q_i sort_index=i` reflow, `katex` math rendering pre-`createArenaAtomic`.
* **Do not touch:** Remove debounce/`beforeunload` → AI work lost on refresh; `prevInitialRef` always reset → loses edits/shuffles; `questions<3 →1` breaks product rule; remove `hasInvalid` → `empty_option`/`correct_answer_missing` → evaluation crash; per-question `q.timer vs globalTimer` diverges from spec `30s` `DEFAULT_TIME_LIMIT_SECONDS`; `toScoringConfig/governanceConfig undefined` desyncs UI vs defaults.

---

## 12. Commander battle history + analysis + edit arena

*`C-ADV4` `src/app/commander/history/*`, `src/app/commander/analysis/[quizId]/*`, `src/app/commander/edit-arena/[quizId]/*`, `src/components/commander/PostBattleAnalysis.tsx`, `src/services/quiz.service.ts`.*

### 1. Golden rules

* **Auth/rules:** History `query(quizzes where created_by==uid)` `firestore.rules:210` `resource.data.created_by==uid || status in [waiting,ready]` list needs `resource != null` branch; Analysis `verifyFirebaseTokenWithRole commander|gladiator|executive` loop + `rateLimit read:{uid} 30/min` + `quizzes/{id} exists` → creator OR participant OR `isExecutive` else 403; Edit `getQuizById + created_by!==uid → Not authorized` + `status !== waiting → Can only edit waiting` `ShieldX Cannot Edit`; `replaceQuizContent` re-checks `waiting` server-side.
* **Firestore reads:** Analysis `Promise.all([config/settings, questions orderBy sort_index, answerKeys, participants]) + per-question submissions parallel Promise.all(map q→ submissions.get())` capped `MAX_ANALYSIS_QUESTIONS 30 / GLADIATORS 60` must stay `<1MiB` + `60s` + response <5MB JSON.
* **Runtime `nodejs` + `onSnapshot` real-time `subscribeToParticipants`.**

### 2. What would actually be hard to casually copy

* **Hard:** Analysis engine reconstruction: `normalizeScoringConfig configSnap.scoring_config ?? quizData.scoring_config` `src/lib/battle-machine.ts` (`score_max 1000, score_min 100, wrong 0, time_decay true, streak 0, time_limit 30`), `questionBreakdown: submittedCount/correctCount/optionCounts/avgTimeSec earliest as start avg diffs <1h else 0/mostCommonWrong max excluding correct`, `engagement progression per gladiator running, streak → elapsed=max(0,submittedAt-earliest) ||1000 timeLimit=q.timer||scoring.time_limit_seconds*1000 base=computeCorrectScore(fraction) bonus=streak*multiplier running+=base+bonus / wrong streak 0 running=max(0,running-wrong_penalty) total=running progression[] for PostBattleCharts engagementChartData`, `detailedRows pointsAwarded base+bonus else -wrong_penalty / timeTakenSec round((submittedAt-earliest)/1000) / answerGiven options[selected]||'—'` capped warnings, `GET ?format=csv Content-Disposition attachment` `replace(/"/g,'""')` horizon.
* **Hard:** History `finished && !archived` + `title|id includes search` sorted `created_at desc` per-card `subscribeToParticipants` `filter user_id !== created_by` sorted `score desc` `winner` `avgScore round(sum/len)` `exportCSV Blob text/csv`.
* **Hard:** Edit atomic `QuizEditor buildDefaultQuestions ExistingQuestion+AnswerKey map → correctAnswerIndex ||0` → `updateQuiz title (isLegalQuizUpdate)` then `replaceQuizContent: delete answerKeys → per questions/{id} delete submissions+doc → setDoc uuidv4 + answerKeys newIds + update question_count` rollback `Promise.all(deleteDoc created)` + `AICopilot+BankImport onApplyQuestion append uuidv4 with from-bank badge`, `updateQuizStatus runTransaction ALLOWED_QUIZ_TRANSITIONS`, `resetQuiz tx deletes submissions/participants/answerKeys/config + status waiting -1 null`.

### 3. Correlated files — direct

* `src/app/commander/history/page.tsx` (`finished, !archived, search, CSV, Analysis/View`), `src/app/commander/analysis/[quizId]/page.tsx` (`PostBattleAnalysis` host), `src/app/commander/edit-arena/[quizId]/page.tsx` (`waiting+owner guard + QuizEditor`), `src/components/commander/PostBattleAnalysis.tsx` (`fetch /api/battle/{quizId}/analysis`, breakdown/engagement/CSV, `PostBattleCharts` `dynamic ssr:false`), `src/services/quiz.service.ts` (`getQuizById/getQuizzesByCreator/updateQuiz/replaceQuizContent/deleteQuiz/resetQuiz duplicateQuiz/subscribeToQuiz/updateQuizStatus/startQuiz/advanceToQuestion`), `src/components/quiz/QuizEditor.tsx` (`title + questions + AICopilot + BankImport`), `src/app/api/battle/[quizId]/analysis/route.ts` (`GET ?format=csv`).

### 4. Correlated files — indirect

* `src/services/game.service.ts` (`questionService/submissionService`), `src/services/participant.service.ts` (`subscribeToParticipants`, `getAllParticipantsBulk`, `joinQuiz allow_late_join`), `src/lib/battle-machine.ts` (`normalizeScoringConfig/computeCorrectScore/computeStreakBonus`), `src/lib/constants.ts` (`QUIZ_* , ALLOWED_QUIZ_TRANSITIONS, COLLECTIONS, QUIZ_CONFIG_SETTINGS_DOC, MAX_BATCH_OPS, ABANDONED_AFTER_MS`), `src/lib/verify-auth.ts`/`firebase-admin.ts`/`rate-limiter.ts` (`READ_PER_USER 30/min`), `src/lib/schemas.ts` (`ValidatedQuiz/Participant/QuestionDoc`), `src/lib/utils.ts` (`cn`, `generateRoomCode`), `src/hooks/useAuth.ts`, `src/firebase/*`, `src/components/commander/PostBattleCharts.tsx` (`recharts`), `src/components/LoadingScreen.tsx`, `src/components/ui/*`, `src/app/battle/[id]/page.tsx` (`LiveQuiz` links `analysis/edit`), `firestore.rules` (`canReadArena waiting/ready open`, `canReadArenaContent` questions gate, `canReadQuizConfig`, `isLegalQuizUpdate isLegalStatusTransition`, `isCurrentQuestion shuffled vs sort_index`, `isQuizCreatorAfter` batch), `src/lib/battle-machine.ts` caps `30/60`.

### 5. Risk level

**CRITICAL if caps/divergence/transition/guard touched, FEATURE work otherwise safe.**

* **Safe to advance substantially:** `questionStats` drill-down reuse (`p-value` hints), `item-analysis tags too easy/ambiguous`, read-only replay without live tx — all `ADVANCE`.
* **Do not touch:** Remove `30/60` caps → `40k docs` + `Vercel 504` + `>5MB JSON`; touch `computeCorrectScore time_decay` vs `game.service evaluateQuestion SCORE_BASE 500+ timeFraction*500` divergence → `total` mismatch `participant.score` vs analysis; edit `ALLOWED_QUIZ_TRANSITIONS` without `firestore.rules isLegalStatusTransition` + `battle-machine canTransitionQuiz` → client `finished→waiting` bypasses `resetQuiz` tx corruption; remove `status !== waiting` `edit-arena`/`replaceQuizContent` → edit `live` with `submissions` exists → corruption; move `scoring_config` to parent → pre-join leak via `canReadArena`; bare loop without `createdQuestions/Keys` tracking → half-deleted arena requiring manual repair; `status !== blocked`/`isCreator` filter missing → blocked Commander in average/winner.

---

## 13. Gladiator join flow — domain gate, late-join, session handling

*`G-ADV1` `src/services/participant.service.ts`, `allowed_gladiator_domain` `firestore.rules`.*

### 1. Golden rules

* **Firestore `10-get limit`:** `isQuizCreatorAfter existsAfter/getAfter` allows `writeBatch quizzes/{id} + participants/{uid} + config/settings + N questions/answerKeys` atomically without per-doc parent `get()`; `created_by` fallback avoids limit for large batches `questions allow create:225`.
* **No `trim()` in rules:** Client `trim().toLowerCase()` `participant.service:96` vs rules `lower() + trim()==''` `firestore.rules:60` diverges on whitespace — intentional comment acknowledges.
* **Transaction governance:** `joinQuiz transaction.get(cfgRef)` inside same tx as quiz check; on failure **fail-open `allowLateJoin = true`** `participant.service:100` to not transiently block.
* **RTDB presence:** `.info/connected` rewrites on reconnect; `onDisconnect().remove()` `src/services/presence.service.ts:40` — Firestore `lastSeen` heartbeat ghosting removed (Phase 64).
* **Session:** `sessionStorage ka_battle_session_{quizId}` base-36 random `src/services/battle.service.ts:24` — cross-tab persistence fails → `ReplacedScreen` `BattleRoomLoader:94`.

### 2. What would actually be hard to casually copy

* **Hard:** Dual-domain gate — client friendly error using `auth.currentUser.email` authoritative (same authority as `request.auth.token.email` rules) not `users/{uid}.email` (stale) `firestore.rules:287`; Commander bypass `userId !== created_by` (`knowledgearena.app` vs `psgitech.ac.in` institution).
* **Hard:** `getAfter/existsAfter` vs `get/exists` atomic batch distinction — naive `get` fails on `writeBatch` emulator.
* **Hard:** `governance_config.allow_late_join === false` strict equality default `true` legacy, `PS_BLOCKED` rejoin block across sessions, `disabled` `users/{uid}.disabled` check, `60s` suspicion `RECONNECT_SUSPICION`, `session_replaced` dual signals `security_logs` + `battle_logs` `src/app/api/battle/reconnect/route.ts:40`.
* **Not moat:** Whitelist `participants keys.hasOnly [user_id,score,status,violations_count,ready,lastSeen,session_token,name]` `firestore.rules:280` — solid.

### 3. Correlated files — direct

* `src/services/participant.service.ts:55-135` `joinQuiz()`, `firestore.rules:37,46,57,157,145,276-287` `getAllowedGladiatorDomain/isAllowedDomainValidForCreate/isEmailDomainAllowed/canReadArena/canReadQuizConfig/participants allow create`, `database.rules.json` `presence/{battleId}/{uid}`, `src/components/quiz/BattleRoomLoader.tsx:214-243` initial join + `140-163` late-join governance fetch + `sessionToken`, `src/app/api/battle/reconnect/route.ts:74`, `src/services/arena-creation.service.ts:91-126` snapshot `institution_domain → allowed_gladiator_domain` `regex /^[a-z0-9.-]+\.[a-z]{2,}$/` fail-open, `src/services/battle.service.ts:24` `getSessionToken/recordReconnect` `src/services/quiz.service.ts subscribeToQuiz`, `src/lib/constants.ts:18` `ROOM_CODE 6 / RECONNECT_SUSPICION 60s / ABANDONED 3h`, `src/lib/battle-machine.ts:32` `canJoinArena/isBattleActive`, `firestore.rules.template` `scripts/generate-firestore-rules.js:27`.

### 4. Correlated files — indirect

* `src/lib/battle-server.ts:73` `quizConfigRef`, `src/lib/verify-auth.ts`, `src/lib/rate-limiter.ts` `BATTLE_ACTION_PER_USER`, `src/lib/firebase-admin.ts`, `src/contexts/AuthContext.tsx:38` domain snapshot deprecation, `src/services/quiz.service.ts`, `src/services/presence.service.ts`, `src/components/quiz/WaitingRoom.tsx` `presenceService`, `src/lib/constants.ts` `QUIZ_WAITING_ABANDONED_AFTER_MS 30m` logout lock `src/components/GladiatorSidebar.tsx:23`.

### 5. Risk level

**CRITICAL — domain + session.**

* **Safe to advance substantially:** Read-only `POST /api/battle/can-join` `AccessAllowed = 𝕀(ExtractDomain(E_user)==D_arena) ∧ 𝕀(¬IsBlocked)` pre-flight diagnostic with `psgitech.ac.in` vs `knowledgearena.app` message — no transaction change.
* **Do not touch:** `isEmailDomainAllowed` `parts[1]==lowerDomain` → `contains` re-enables `notpsgitech.ac.in` bypass; `isAllowedDomainValidForCreate` widen → spoof other institution; `joinQuiz` read doc `email` instead of `token` → stale divergence; `allowLateJoin default false` → locks all legacy `config/settings` missing arenas; `session_token` whitelist `firestore.rules:280` break join; `ReplacedScreen` without `firstPartSnapRef` guard false positives; reconnect `BATTLE_ACTION` rate limit weaken → session spam.

---

## 14. Gladiator personalization — weak areas, recommendations, upcoming arenas

*`G-ADV2` `src/ai/engines/prediction-engine.ts`, `src/app/api/gladiator/personalization/route.ts`, `src/app/api/gladiator/recommendations/route.ts`, `src/components/dashboard/WeakAreas.tsx/UpcomingArenas/QuizRecommendations.tsx`.*

### 1. Golden rules

* **CollectionGroup `participants where user_id==uid` composite `firestore.indexes.json:143` `participants collectionGroup user_id ASC`** — `select('user_id','score','status')` cuts bandwidth; without `select` full doc ×6 quizzes ×per-question `submissions/{uid}` sequential `Promise.all` `personalization 6` `20q ×6 =120 reads` + initial quiz `db.getAll chunk 30` must stay `<1MiB/500 ops`.
* **N+1 penalty:** Brute `questions/answerKeys/submissions/{uid}` per finished quiz — `30` chunk already.
* **Cache `private max-age 30` `personalization` vs `60 stale-while-revalidate 300` `recommendations` never `public` cross-user leak; `withRetry 3× exponential` `prediction-engine:40` `ai.definePrompt` needs Gemini key not per-user rate-limited → shelved `410` avoids quota burn.
* **Data model:** `WeakAreas wrongRate ≥40% per battle + per-difficulty total≥2 && wrong/total ≥0.6` sorted `wrongRate desc`; recommendation `weakestCategory/Difficulty Math.round(v.total/completed.length)` (divides by total not category — legacy intentional) `0.9/0.75/0.7/0.6/0.5` excludes completed `quizIds`; upcoming `status in ['waiting','ready'] orderBy created_at desc limit 20 !joinedSet slice 6`.

### 2. What would actually be hard to casually copy

* **Hard:** Mastery decay `M_c(t)= Σ Correct·e^{-λΔt} / Σ Total·e^{-λΔt}` memory retention `R=e^{-t/S}` — recency-naive average is weekend clone; decay needs `λ` tuning via `personalization` route without touching heuristic `40%/0.6`.
* **Hard:** Upcoming `!joinedSet.has(id)` slice `6` avoids full scan — comment preserved.
* **Not moat:** `WeakAreas + UpcomingArenas` duplicate `GET /personalization` call — intentional simple cache, not defect.

### 3. Correlated files — direct

* `src/ai/engines/prediction-engine.ts:195` `getQuizRecommendations LIVE` + `getPredictionSummary 410 SHELVED`, `src/app/api/gladiator/personalization/route.ts:138`, `src/app/api/gladiator/recommendations/route.ts:26` (`Limits.AI_API 10/min` but heuristic no Gemini), `src/components/dashboard/WeakAreas.tsx:103`, `UpcomingArenas.tsx:111` (`status waiting|ready`), `QuizRecommendations.tsx:148`, `src/components/dashboard/GladiatorDashboard.tsx:307`.

### 4. Correlated files — indirect

* `src/lib/firebase-admin.ts` `collectionGroup select` projections, `src/lib/constants.ts` (`COLLECTIONS`), `src/lib/rate-limiter.ts` (`READ/AI_API`), `src/lib/verify-auth.ts` (`verifyFirebaseTokenWithRole gladiator`), `firestore.indexes.json:143` `participants`, `src/ai/genkit.ts` (`ai.definePrompt` Gemini key `GEMINI_API_KEYS` csv), `src/components/ui/*`, `src/hooks/useAuth.ts`, duplicate `GET /personalization` network call (intentional).

### 5. Risk level

**MEDIUM — collectionGroup index + cache.**

* **Safe to advance substantially:** `weakAreas` cache per-user + streak-weight + time-decay `M_c(t)` in `personalization` — read-only, no battle engine.
* **Do not touch:** `where('status','==','finished')` on quiz doc (status on quiz not participant — current filters client after `quizMap` `db.getAll chunk 30`); `select` removal or `limit 50→1000` → quota/latency; `WeakAreas 40%/0.6` thresholds inflating false positives; `question_count>0` filter removal showing empty quizzes.

---

## 15. Gladiator history

*`G-ADV3` `src/app/gladiator/history/*`, `participantService.getStudentHistory`, `src/app/api/gladiator/dashboard/route.ts`.*

### 1. Golden rules

* **CollectionGroup `collectionGroup where(documentId()==userId)` `fieldOverrides user_id ASC COLLECTION_GROUP`** `firestore.rules:480` `match /{path=**}/participants/{userId} allow read if auth.uid==userId` — enables `getStudentHistory`; `dashboard where user_id==uid` `firestore.indexes.json:143` different indexes both work but required separately.
* **UI** `min-w-[360px]` mobile overflow, `status === finished` gate `→/battle/:id` review prevents peeking live via history; sorting client `created_at desc`.

### 2. What would actually be hard to casually copy

* **Hard:** `quizId = d.ref.parent.parent?.id` depth fragile if subcollection depth changes; `created_at||0` prevents sort NaN; `title||'Untitled'` fallback; `collectionGroup` rule `documentId` vs `user_id` field mismatch intentional but working.
* **Not moat:** `recentBattles.slice(0,10)` no load-more, `status badge finished/live/waiting`.

### 3. Correlated files — direct

* `src/app/gladiator/history/page.tsx:120`, `src/services/participant.service.ts:219` `getStudentHistory()`, `src/app/api/gladiator/dashboard/route.ts:90` (`collectionGroup select user_id/score/status, recent 10, stats totalBattles/finishedCount/wins/avgScore`).

### 4. Correlated files — indirect

* `firestore.rules:480`, `src/lib/constants.ts`, `src/hooks/useAuth.ts`, `src/components/ui/empty-state.tsx`, `firestore.indexes.json:143`, `firestore.rules.template`.

### 5. Risk level

**LOW — read-only history.**

* **Safe to advance:** Rolling `Percentile=(1-(Rank-1)/(N-1))*100` sparkline + accuracy trajectory `improvement vector` read `participants` + `quizMap` — no write.
* **Do not touch:** Removing `collectionGroup` rule blocks all client history; `where user_id==` without index → missing index `500`; `slice(0,10)` without pagination hides older data silently.

---

## 16. Live battle room — the real-time experience itself

*`S-ADV1` `src/components/quiz/LiveQuiz.tsx:389` `1055L` — product's heartbeat.*

### 1. Golden rules

* **Timer authority vs client:** `question_start_at` server-written; client `deadline = answerStartAt + timer*1000` corrected by `offsetRef` `GET /api/clock 60s` `src/lib/client-clock.ts:15` `(sent+received)/2`; without offset skewed clocks lock submit early; server grace `ANSWER_GRACE 3s / VIOLATION 15s / SKEW 5s` `src/lib/constants.ts:71-73` separate.
* **Firestore submission rule:** `submittedAt == request.time` `firestore.rules:243` prevents forgery; `clientTime` analytics only.
* **RTDB vs Firestore:** Presence `onDisconnect` `.info/connected` `src/services/presence.service.ts:40` — Firestore `lastSeen` heartbeat ghosting removed Phase 64.
* **Anti-cheat:** `usePageFocusChange visibilitychange+blur+pagehide` debounced `2000ms lastViolationRef` + `governance.anti_cheat_strictness blocked vs flagged` `src/components/quiz/LiveQuiz.tsx:846` `isTeacher` guard.
* **Shuffle:** `shuffledOrder/buildOptionShuffle/applyOptionShuffle/invertPermutation` `src/lib/battle-machine.ts:103` `participant.option_shuffle[questionId]` deterministic per-gladiator.

### 2. What would actually be hard to casually copy

* **Hard:** `hold / revealSnapshotRef + REVEAL_HOLD 1500` freeze old question after `questionStats.correctOptionIndex` appears before transition — race between `onSnapshot` question switch and stats arrival.
* **Hard:** `independent` `participant.question_order/current_question_index/question_start_at` per-participant vs `quiz.current_question_index` synchronized; `submittedCount vs finishedCount` branching; streak `computeStreakBonus streak*multiplier` server-only `current_streak/best_streak`.
* **Hard:** Auto-advance election lowest-sorted online UID `presence gladiator sort[0]` triggers `autoAdvance` only `COMMANDER_PRESENCE_WINDOW 45s + timeLeft≤0` per-question `autoAdvanceAttemptedRef` dedupe `src/api/battle/auto-advance:68` relies only on RTDB `presence/{quizId}/{commanderUid}` missing (no longer `commanderAbsentSinceRef` client trust `AUDIT.md:68`).
* **Not moat:** `AnimatedScore`, `LiveLeaderboard rank-delta ▲/▼ podium`, `isQuestionTimerActive quiz.status=='live' && (!isTeacher||!independent)`.

### 3. Correlated files — direct

* `src/components/quiz/LiveQuiz.tsx:389` (`useCommanderPresence`, `independent`, `CountdownTimer`, `LiveLeaderboard`, `ParticipantStats RTDB filtered roster`, `BattleInterstitial`, `hold`, `shouldRevealByGovernance reveal_timing after_timer/never_during + show_live_leaderboard/allow_late_join/negative_marking/anti_cheat`, `submit via submissionService.submitAnswer serverTimestamp+clientTime + evaluateSelf independent`, `skip evaluateQuestion before skip`), `src/lib/battle-machine.ts:127` (`canJoinArena/canSubmitAnswer/isBattleActive/isBattleTerminal normalizeScoringConfig timeFractionOf computeCorrectScore shuffledOrder` etc), `src/lib/client-clock.ts:61` (`getServerOffset+offsetRef`), `src/services/presence.service.ts:88`, `src/hooks/usePageFocusChange.ts:41`.

### 4. Correlated files — indirect

* `src/services/game.service.ts` (`questionService.subscribeToQuestions`, `submissionService.submitAnswer`), `src/services/battle.service.ts` (`evaluateSelf/autoAdvance/pause/resume/skip/end/advanceQuestion getSessionToken ka_battle_session_{quizId}`), `src/lib/constants.ts` (`ANSWER_GRACE 3s / SKEW 5s / PRESENCE 30s / COMMANDER 45s / STARTING 4000`), `src/lib/battle-server.ts:577` `evaluateQuestionForUser/ForAll writeQuestionStats governanceConfig`, `firestore.rules:228` `submissions allow create isCurrentQuestion selected 0..3 submittedAt==request.time question_id==path`, `src/components/ui/*` (`avatar/button`), `src/lib/security-log.ts` (`submission_clock_skew answer_after_timeout`), `src/lib/verify-auth.ts`, `src/lib/rate-limiter.ts` (`BATTLE_ACTION 30/min`), `src/firebase/provider.tsx`.

### 5. Risk level

**CRITICAL — clock, submission forgery, presence, anti-cheat are load-bearing.**

* UI polish (streak anim, interstitial focus trap `Esc`) safe client-only.
* **Do not touch:** `offsetRef` or `deadline` race check `handleAnswerSubmit` `timeLeft==0` false block reintroduces Phase 107 first-render bug; `isCurrentQuestion question_order` ignore → question-id forging/pre-submission; `onDisconnect` leak → false `commanderOnline` blocks auto-advance forever; `governance.revealTiming` bypass leaks `questionStats.correctOptionIndex` before timer expiry `after_timer vs never_during`.

---

## 17. Battle lifecycle robustness — zombie sweep, abandoned-state handling

*`S-ADV2` `src/lib/battle-server.ts` (`abandonBattle`, `sweepStaleLiveArena`), `src/components/quiz/BattleRoomLoader.tsx:363` dead branch.*

### 1. Golden rules

* **Transaction serialization:** `abandonBattle only live→abandoned inside runTransaction` if concurrent `finishBattle` wins no-op `src/lib/battle-server.ts:325`; lazy `sweepStaleLiveArena getMs(question_start_at)` fallback `Date.now()` conservative refuse sweep `lastActivityMs<=0`, threshold `question_start_at nulled on finished/abandoned` normal timers seconds << `3h` safe `src/lib/constants.ts:42`.
* **Cron limits:** Hobby `maxDuration 60s` `vercel.json` `200 docs/invocation <30s` daily `0 8 * * *` `src/app/api/cron/sweep-battles:64` safety net, primary lazy hot path `src/app/api/battle/advance:19` `loadQuizDoc→sweepStaleLiveArena → 409` if zombie; `CRON_SECRET Bearer` guard.
* **Constants:** `ALLOWED_QUIZ_TRANSITIONS live→[paused,finished,abandoned] paused→[live,finished,abandoned] abandoned→[] archived→[]` `src/lib/constants.ts:42`.

### 2. What would actually be hard to casually copy

* **Hard:** Dual sweeper lazy hot-path (`advance/auto-advance after loadQuizDoc`) + cron — most clones cron-only.
* **Hard:** `abandonBattle` deliberately **no `notifyBattleCompleted` fan-out** vs `finishBattle` winner ranking + `abandoned_at` field + `writeBattleLog battle_abandoned system/system reason:stale_live_arena`; `advanceQuestion expectedFromIndex precondition + alreadyAdvanced idempotency + Participants not pre-fetched retry reads-before-writes`.

### 3. Correlated files — direct

* `src/lib/battle-server.ts:312-372` (`abandonBattle`, `sweepStaleLiveArena:358`, `finishBattle:256`, `advanceQuestion:456`, `writeBattleLog`, `QUIZ_ABANDONED_AFTER_MS`), `src/app/api/cron/sweep-battles/route.ts:64` (`MAX_SWEEP_BATCH 200 Bearer CRON_SECRET now-question_start_at ≥3h`), `src/components/quiz/BattleRoomLoader.tsx:361-405` **dead branch**.

### 4. Correlated files — indirect

* `src/lib/constants.ts:18,42,49` (`QUIZ_ABANDONED 'abandoned'`, `ALLOWED_QUIZ_TRANSITIONS`, `QUIZ_ABANDONED_AFTER_MS 3h`, `QUIZ_WAITING_ABANDONED 30m` `src/components/GladiatorSidebar.tsx:23` logout lock), `src/lib/battle-machine.ts:40` (`isBattleActive/Terminal`), `src/app/api/battle/advance:19`/`auto-advance:50` `sweepStaleLiveArena →409`, `src/app/api/battle/start/activate/pause/resume` status transitions, `vercel.json:10` (`crons sweep-battles`), `firestore.rules:119` `isLegalStatusTransition` mirrors `battle-machine`, `src/lib/schemas.ts:45` `abandoned_at`.

### 5. Risk level

**MEDIUM-HIGH with one CRITICAL exception unfixed.**

* **CRITICAL unfixed:** `BattleRoomLoader:363` currently:
  ```tsx
  if (LIVE||PAUSED) { if (!participant && !isTeacher && firstPartSnap && !allowLateJoin) { if (ABANDONED) { return <Battle Abandoned> } return <Battle Already Started> } }
  ```
  `ABANDONED` nested inside `LIVE||PAUSED` is unreachable (`LIVE||PAUSED true excludes ABANDONED`) — zombie swept to `abandoned` falls to `Unexpected State`. Must move `if (status===ABANDONED) return <Battle Abandoned>` *before* `LIVE||PAUSED`. **This is the one line reverting to plan-mode "note, don't fix" must become first code change after approval.**
* **Otherwise safe:** Lowering `3h` to minutes abandons legitimate paused long battles; removing `status !== LIVE` early return allows terminal overwrite; `CRON_SECRET Bearer` removal allows DoS forced abandons.

---

## 18. Scoring configuration + governance

*`S-ADV3` `quizzes/{quizId}/config/settings`, `src/lib/battle-machine.ts`, `src/lib/battle-server.ts`, `src/components/quiz/AdvancedGovernanceSection.tsx`.*

### 1. Golden rules

* **Gated config:** `quizzes/{id}/config/settings` readable `canReadQuizConfig creator||participant||executive` `firestore.rules:145` `332` — pre-join room-code holders never see `scoring_config/skipped_question_ids`; Admin SDK bypasses for server evaluation; parent `quizzes` doc listable `waiting/ready` but config not.
* **Legacy fallback:** `scoringConfigFrom(doc,legacyQuiz)` checks config first then parent `quiz.scoring_config` pre-Phase 94; atomic `writeBatch created_by` hack on `config/settings creation` so `isQuizCreatorAfter existsAfter/getAfter` passes even when parent not yet exists.
* **Negative marking:** UI `negativeMarking bool → wrong_penalty 250 if true else 0` `src/services/arena-creation.service.ts:140`; server `evaluate* governance.negative_marking ? rawConfig : {...rawConfig, wrong_penalty:0}` `src/lib/battle-server.ts:627`.
* **Time decay:** `S = S_max - (1-frac)*(S_max-S_min)` `frac=1-t/T`, `Math.round`, if `!time_decay||max<=min → max` `src/lib/battle-machine.ts:77`.
* **Constants:** `DEFAULT_SCORE_MAX 1000 / MIN 100 / WRONG 0 / SKIP 0 / time_decay true / streak 0 / time_limit 30` `src/lib/constants.ts:59`.

### 2. What would actually be hard to casually copy

* **Hard:** Dual persistence never on parent after Phase 94 — clones keep `scoring_config` on parent leaking via `canReadArena`.
* **Hard:** Streak `streak*multiplier` server-only `current_streak/best_streak + last_streak_bonus` not client-computed + `skip_penalty` reconcile `evaluateQuestion before skipQuestion` to avoid orphan `submissions`.
* **Hard:** `invertPermutation` `src/lib/battle-machine.ts:121` option shuffle undo for evaluation; `shuffledOrder/buildOptionShuffle/applyOptionShuffle`.

### 3. Correlated files — direct

* `src/lib/battle-machine.ts` (`ScoringConfig`, `normalizeScoringConfig`, `computeCorrectScore`, `computeStreakBonus`, `timeFractionOf`, `shuffledOrder`), `src/lib/battle-server.ts:73` (`quizConfigRef`, `scoringConfigFrom`, `governanceConfigFrom`, `normalizeGovernanceConfig`, `DEFAULT_GOVERNANCE after_timer/true/true/false/warn_only`, `evaluateQuestionForUser 577`, `evaluateQuestionForAll 773`, `advanceQuestion`, `skip_penalty`), `src/components/quiz/AdvancedGovernanceSection.tsx:150` (`reveal_timing, show_live_leaderboard, allow_late_join, negative_marking, anti_cheat strictness warn_only|auto_flag`), `src/components/quiz/AdvancedScoringSection.tsx:113` (`timeBonus, streakMultiplier, scoreMax/Min`), `src/services/arena-creation.service.ts:140` (`scoring_config + governance_config creation`), `quizzes/{id}/config/settings` doc.

### 4. Correlated files — indirect

* `firestore.rules:142-151/332-351` (`canReadQuizConfig`, `config/{docId} create/update/delete hasOnly([scoring_config,governance_config,skipped_question_ids,created_by])`), `src/lib/constants.ts:59` (`DEFAULT_*`, `QUIZ_CONFIG 'config'`), `src/lib/schemas.ts:36` (legacy parent-field), `src/services/quiz.service.ts:288` (`setDoc merge` split), `scripts/backfill-arena-configs.mjs` (legacy backfill), `src/app/api/battle/skip:134` legacy `tx.set(cfgRef, {skipped..., scoring_config: quiz.scoring_config})`, `src/components/quiz/WaitingRoom.tsx` (`start_config.require_all_ready`, `battle_mode`), `src/components/quiz/LiveQuiz.tsx:452` (`onSnapshot configRef` governance), `src/lib/battle-server.ts` `governanceConfigFrom` defaults match current behavior verbatim so existing arenas unaffected.

### 5. Risk level

**LOW for hints, CRITICAL for scoring math.**

* **Safe to advance:** Live calibration hint `current skip_penalty 0 — consider 100 for this cohort` in `LiveQuiz` without touching `computeCorrectScore` — hints only.
* **Do not touch:** Move `scoring_config` to parent → leak; `normalizeScoringConfig Math.max(0, ...)` allow negative `max` → score exploit; `wrong_penalty` mapping without `negative_marking` guard double-penalizes; `computeCorrectScore rounding` changes rank ordering (`ROADMAP.md:63` `out of scope: rewriting scoring model`).

---

## 19. Mind maps + wrong-answer explanations

*`S-ADV4` `src/ai/flows/mindmap-flow.ts`, `src/ai/flows/explanation-flow.ts`, `src/app/api/quiz/mindmap/route.ts`, `src/app/api/quiz/explanation/route.ts`.*

### 1. Golden rules

* **Vercel `maxDuration 60` but `MINDMAP_TIMEOUT 35s` / `EXPLANATION 30s` with `withTimeout` must stay inside;** free-tier `GEMINI_API_KEYS` csv `round-robin + MAX_WAIT 15s` `maxAttempts = min(keys.length,3)` `24h` authCooldown `parseRetryDelayMs`.
* **Rate limit:** `mindmap 5/min per uid` `Limits.AI_MINDMAP_PER_USER` + flow `rateLimiter.check 5/min`; explanation `30/min` (`30/min` allows per-question bulk) — double-enforced route + flow; per-uid not IP.
* **Cache:** `ai_mindmaps doc sha256(quizId:title:q.text|correct) slice 40` `ai_explanations sha256(questionId:wrongOptionIndex)` read before generation `cached:true/false` critical for free tier.
* **Auth:** `mindmap commander|executive only` (`verifyFirebaseTokenWithAnyRole commander|executive`) because needs all `questions+answerKeys`; explanation `gladiator|commander|executive` per wrong answer — Admin SDK bypasses `answerKeys read finished+participant` rule `firestore.rules:250`.
* **Output:** `MindMapOutputSchema title/nodes[{topic,subtopics[]}]/connections[{from,to,label}]` fallback raw `text` JSON then minimal single-node; explanation labels `A. … ✓ + ✗(student chose)` 2-4 paragraphs.

### 2. What would actually be hard to casually copy

* **Hard:** `callMindmapWithRotation / callExplanationWithRotation isAuthError vs isQuotaError branching + markKeyCooldown` — most clones single-key no rotation.
* **Hard:** `Hash stability: mindmap includes quizId` so duplicate arenas different cache (intentional per-arena) vs `explanation Hash=SHA256(quizId+questionId+wrongOptionIndex)` exact — deduplicates across duplicate arenas correctly.
* **Hard:** `GEMINI_QUOTA_EXCEEDED → 429 Retry-After from message retry after ~Xs`.
* **Not moat:** `aiLogService unknown user on exception`.

### 3. Correlated files — direct

* `src/ai/flows/mindmap-flow.ts:187`, `src/ai/flows/explanation-flow.ts:163`, `src/app/api/quiz/mindmap/route.ts:107` (`AI_MINDMAP_PER_USER`), `src/app/api/quiz/explanation/route.ts:101` (`AI_EXPLANATION_PER_USER`).

### 4. Correlated files — indirect

* `src/ai/genkit.ts` (`ai.defineFlow/createGenkitForKey`), `src/ai/key-resolver.ts` (`getGeminiApiKey/isQuotaError/isAuthError/parseRetryDelayMs/markKeyCooldown/getConfiguredKeys rotation`), `src/lib/verify-auth.ts` (`verifyFirebaseTokenWithAnyRole`), `src/lib/rate-limiter.ts`, `src/services/ai-log.service.ts`, `src/lib/firebase-admin.ts`, `src/lib/constants.ts` (`googleAI.model('gemini-3.6-flash')` hard-coded).

### 5. Risk level

**MEDIUM — quota + cache.**

* **Safe to advance:** Multi-chunk fallback `chunks[0]` today (vision uses only `chunks[0]` `AUDIT.md:30` harmless at `40k` cap but silently drops text if raised) — second chunk retry, plus explanation source-sentence attacher linking to document sentences — both additive, no tx.
* **Do not touch:** Raise `MINDMAP_TIMEOUT > maxDuration` → `504`; remove `cached early return` → burns quota every click; lower `30/min` too low blocks bulk per-question; raise `5/min` too high enables attack; widen mindmap auth to gladiator leaks `answerKeys` before `finished` (route Admin bypass).

---

## 20. Waiting room + starting countdown

*`S-ADV5` `src/components/quiz/WaitingRoom.tsx`, `src/components/quiz/BattleRoomLoader.tsx:31` `StartingScreen`.*

### 1. Golden rules

* **Two-phase start:** `handleStartQuiz → POST /api/battle/start waiting|ready→starting started_at=now` `src/app/api/battle/start/route.ts` → `BattleRoomLoader detects QUIZ_STARTING → StartingScreen 3→0 Math.ceil((4000-elapsed)/1000) → POST /api/battle/activate starting→live` `src/app/api/battle/activate/route.ts` `current_question_index 0 question_start_at` `STARTING_TRANSITION_MS 4000` `src/lib/constants.ts:67` after `elapsed >=4000` — prevents race where gladiators miss Q1.
* **Multi-client activation:** `StartingScreen activatedRef + isActivating` ensures one `activateBattle` per client, but *any* client (commander or gladiator) may activate after countdown — `firestore.rules isLegalQuizUpdate isQuizCreator` but `activate/route` is Admin SDK bypass so gladiator countdown can trigger activation (verified: `activate/route` `verifyFirebaseToken` any auth).
* **Ready gate:** `require_all_ready boolean quiz.start_config` `WaitingRoom:324` `readyGate = requireAllReady && readyCount < studentCount` disables Start + `Waiting for N more...`; `ready bool writable by owner only firestore.rules:313` when `status in [waiting,ready]`.
* **Presence:** `studentParticipants = isCommander check filtered + presence==null ? true : presence[uid]!=null` ghosts from closed tabs instantly hidden — ghosts removed by RTDB `onDisconnect`.
* **Resilience:** `WaitingRoom:71-145` double listener `subscribeToParticipants + subscribeToQuiz` + `offline/online/pageshow re-subscribe + isReconnecting banner`.

### 2. What would actually be hard to casually copy

* **Hard:** `seconds = max(0, ceil((4000-(now-started_at))/1000)) + elapsed>=4000 immediate activation` — late joiners landing mid-countdown show `1s not 3s` (not obvious).
* **Hard:** `presenceService` dual presence (`waiting` + `live`) same `onDisconnect` so waiting-room count === live leaderboard count.
* **Hard:** `joinedLoggedRef once-per-mount battleLogService.record gladiator_joined` dedup + `Blocked participants section` allows immediate unblock without leaving.

### 3. Correlated files — direct

* `src/components/quiz/WaitingRoom.tsx:639L`, `src/components/quiz/BattleRoomLoader.tsx:31` (`StartingScreen`) + `315-332` `waiting/starting` branching, `src/services/quiz.service.ts` (`subscribeToQuiz, updateQuiz {start_config, battle_mode}`), `src/services/participant.service.ts` (`subscribeToParticipants, setReady, block/unblock, leaveQuiz`), `src/services/presence.service.ts` (`subscribeToPresence`), `src/services/battle.service.ts` (`startBattle/activateBattle`), `src/services/battle-log.service.ts` (`record gladiator_joined/ready/blocked`), `src/lib/constants.ts:67` (`STARTING_TRANSITION 4000`, `QUIZ_WAITING/READY/STARTING`), `src/app/api/battle/start/route.ts` (`waiting|ready→starting`), `src/app/api/battle/activate/route.ts` (`starting→live` `elapsed >=4000`, `current_question_index 0`), `src/lib/schemas.ts` (`start_config.require_all_ready`, `battle_mode`).

### 4. Correlated files — indirect

* `src/lib/battle-machine.ts` (`isBattleActive/Terminal`, `ALLOWED_QUIZ_TRANSITIONS`), `src/lib/constants.ts` (`QUIZ_*`), `src/lib/verify-auth.ts`, `src/lib/rate-limiter.ts`, `src/app/api/battle/pause/resume/skip` status transitions, `firestore.rules:113` `isLegalStatusTransition` mirrors `battle-machine`, `src/components/ui/*` (`avatar/button`), `src/hooks/useAuth.ts`, `src/firebase/provider.tsx`.

### 5. Risk level

**MEDIUM-HIGH if transition math touched.**

* **Safe to advance:** Late-join status badge `allow_late_join` notice + RTDB latency metrics `PRESENCE_WINDOW 30s` in `WaitingRoom` — read-only.
* **Do not touch:** Changing `STARTING_TRANSITION_MS 4000` without `activate/route:44 Date.now()-startedAt <4000 check` → `409` rejected activation; removing `require_all_ready ready` rule check lets gladiators toggle after `starting/live`; `StartingScreen interval` cleanup leak (`return ()=>clearInterval`) after unmount.

---

## What `FEATURE_INVENTORY.md` / `features_audit_1.md` already flagged vs what this doc re-verified

* `BattleRoomLoader:363` **still unfixed verbatim** — `ABANDONED` inside `LIVE||PAUSED` unreachable → `Unexpected State` for abandoned — `FEATURE_INVENTORY` called it a bug, `features_audit_1` made it the one exception to LEAVE ALONE; confirmed still present in `e90c75b`.
* `FEATURE_INVENTORY` said `fetchSetSummaries` `searchTokens array-contains` is the only server-filtered query — this doc notes **in-mem residual** `+5000 scan` for `g:` legacy docs: docs before `searchTokens` invisible.
* `FEATURE_INVENTORY` `isAiQuestion` consistency claim — this doc notes `workspace` vs `useAnalytics` `subject||category||General` fallback can drift if `subject` vs `category` populated differently.
* `PDFQuizGenerator:43` `CLIENT_TIMEOUT 15m` vs UI `setStepError guidance 3 minutes` mismatch flagged in this doc — inventory quoted `15m`.
* `getStudentHistory documentId()==userId fieldOverrides` vs `dashboard where user_id==` divergent indexes — both work but required separately `firestore.indexes.json:143` (inventory listed one).

*No contradictions with `AUDIT.md` beyond those already in `FEATURE_INVENTORY` 13 dead links / shelved 410s — `firestore.rules.template→rules:generate` `predeploy` holds, `key-resolver 24h/60s` holds, `middleware pass-through` holds.*

---

## How to turn this into code — Kathir's loop

1. **You review this doc line-by-line** — mark `λ` for recency decay, confirm `½ s` vs `1s` `now` tick, confirm `P_i(θ)` threshold `b_i >2.0 && low-θ>80%` relearns, confirm Jaccard `0.85` not `0.90`.
2. **You bring findings back to Claude** — Claude will diff against this doc's golden rules and hard-to-copy notes.
3. **Then prompt OpenCode for implementation** — that prompt will copy *this* doc's **Direct/Indirect** lists as the correlation map and **Risk boundary** sentences verbatim (e.g., "UI + prompt layer can be reworked — do not touch `advanceQuestion tx.get/tx.set` order") so no future edit repeats the stale-template regression.

This doc is the reference `FEATURE_GOLDEN_RULES.md` will be written from on approval. In plan mode it is not yet written.

