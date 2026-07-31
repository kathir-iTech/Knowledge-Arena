# Knowledge Arena — Final Project Report

**Date:** July 31, 2026
**Baseline:** commit `085ee42` (Phase 4) → `ff1aec7` (Phase 5) → final audit commit
**Author:** Final engineering milestone — full certification review of the sole implementation in this repository.

---

## 1. Executive Summary

Knowledge Arena is a real-time classroom quiz-battle platform: commanders create AI-assisted arenas, gladiators join and compete in live battles, and executives operate the platform (analytics, security, messaging, question bank, admin). It is a Next.js 15 (App Router) application on Firebase (Auth, Firestore, Storage) with a Genkit/Gemini AI Forge.

The final audit — five phases of hardening plus this certification review — leaves the product **ready for controlled production deployment**. All five phases are committed and pushed; the TypeScript preflight over every source file in Phases 1–5 is **CLEAN**; the two remaining blocking checks (`npm run build`, `next lint`) are environment-only failures (missing SWC binary, ESLint flat-config mismatch) that resolve with a clean install on a networked machine — they are not repository defects.

This release's final fixes address **score integrity** (idempotency guards in both battle evaluation paths) and complete the production story: rate limiting on every write route, Firestore read projections, uniform UX error states, accessibility/mobile pass, dead-code removal, docs/env hygiene, and a full deployment playbook (`DEPLOYMENT.md`) plus roadmap (`ROADMAP.md`).

---

## 2. System Overview

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 App Router, React 19, Tailwind CSS, shadcn/Radix UI components, Recharts, lucide-react |
| Backend | Next.js API routes (Node runtime), server actions, Genkit flows |
| Identity | Firebase Auth (Email/Password for staff, Google for gladiators), Admin SDK server-side |
| Data | Cloud Firestore (client SDK realtime + Admin SDK server access) |
| AI | Genkit (Google AI plugin, Gemini 2.0-flash default / 2.5 catalog), pdfreader for PDF parsing |
| Storage | Firebase Storage (attachments) |
| QA | Playwright specs + operational scripts |

**Roles:** `executive` (platform operator) · `commander` (arena creator/host) · `gladiator` (student participant). No public staff signup — staff accounts are provisioned by admin API or bootstrap script.

**Domain model:** `users`, `quizzes` (+ `questions`, `answerKeys`, `participants`, `submissions` subcollections), `executive_requests` (+ `responses`), `question_bank`, `platform_settings`, `conversations` (+ `messages`), `announcements`, `notifications`, `auditLogs`, `battle_logs`, `ai_logs`, `security_logs`.

---

## 3. Architecture Overview

- **Presentation** — client components everywhere (rich realtime UI); server components only for shells/layouts. Three portal sidebars (executive/commander/gladiator) + public pages.
- **Application** — API routes are thin orchestrators: verify auth → rate limit → validate → run service logic (often a Firestore transaction) → log → standardized errors (`battleErrorResponse` domain-error map). Services (`src/services/*`) encapsulate Firestore access; battle logic centralizes in `src/lib/battle-server.ts`.
- **Realtime** — `onSnapshot` subscriptions for quiz state, participants, questions, submissions (live), battle logs, and conversations; heartbeats (`lastSeen` + per-tab `session_token`) every 15 s; offline detector + re-subscribe logic.
- **AI Forge** — Genkit flows/server actions: PDF→questions pipeline with extraction, chunking, fallback model chain, validation warnings; three engine prompts (prediction, knowledge, decision-support) behind thin API routes.
- **Security** — two enforcement layers: Firestore rules (role reads per request, transition validation, server-only log collections) and API route verification (ID token + role per call). Client-side role gating for UX; middleware passes through by design.
- **Build/deploy** — `output: 'standalone'`; security headers via `next.config.ts`; deployment recommended on Cloud Run or Vercel (see `DEPLOYMENT.md`).

---

## 4. Repository Structure

```
.
├── src/
│   ├── app/                    # App Router: pages + API routes (47 route files)
│   │   ├── (public) /executive/ /commander/ /gladiator/ /battle/[roomCode]/
│   │   └── api/                # battle(11) messaging(8) executive(17) commander(2)
│   │                           # gladiator(1) admin(1) audit(1) rate-limit(1) AI engines(3)
│   ├── ai/                     # genkit.ts, flows/generate-quiz-pdf-flow.ts, engines/*, dev.ts
│   ├── components/             # ui/ (shadcn), quiz/, analytics/, dashboard/, auth/, portal shells
│   ├── contexts/AuthContext.tsx
│   ├── firebase/               # client init, config, error emitter/listener
│   ├── hooks/                  # useAuth, useAnalytics, useOnlineStatus, usePageFocusChange, use-toast
│   ├── lib/                    # battle-server, battle-machine, verify-auth, rate-limiter,
│   │                           # security-log, constants, schemas, quiz-validator, firebase-admin …
│   ├── services/               # quiz, participant, game, battle, battle-log, notification,
│   │                           # arena-creation, analytics, audit, ai-log, …
│   └── types/                  # ambient type fallbacks (pdfreader, react-hook-form env shim)
├── tests/                      # Playwright specs (qa-workflows, diagnostic) + QA helpers
├── scripts/                    # bootstrap-executive, api-test, e2e-test, cleanup, …
├── docs/                       # architecture, blueprint, DEMO_SCRIPTS, JUDGE_QA, …
├── firestore.rules             # 291-line ruleset: roles, transitions, server-only logs
├── firestore.indexes.json      # 11 composite indexes + 1 field override
├── firebase.json               # rules/indexes deploy, emulators, (stale) hosting block
├── next.config.ts              # standalone output, security headers, rewrites
├── DEPLOYMENT.md               # production deployment guide (new)
├── ROADMAP.md                  # V1.1 / V1.2 / V2.0 roadmap (new)
└── PHASE{2,3,4,5}-REPORT.md    # phase reports
```

---

## 5. Implemented Features

- **Battle Engine** — 8-state lifecycle, 2 battle modes (synchronized/independent), timed questions, time-decay scoring with penalties, pause/resume with clock shifting, skip/advance, auto-end when all finished, ownership transfer, archive.
- **AI Forge** — PDF/DOCX/TXT/image → validated questions (10 MB cap, chunked, fallback models, repair/parse fallbacks), Gemini-powered prediction/knowledge/decision-support insights.
- **Messaging** — executive→commander conversations with attachments, read receipts, commander↔commander messaging, executive announcements, per-user rate limits.
- **Requests** — commander→executive request workflow with attachments and responses (audited).
- **Admin** — executive user management (create/disable/reset-password/delete commanders) with per-IP rate limiting.
- **Executive workspace** — quiz overview, student rosters, question analytics, exports (JSON/CSV), backup import/export, platform settings.
- **Analytics** — quiz/student/question analytics dashboards + 30-day AI and security insights.
- **Security** — security logs + viewer, audit logs + viewer, AI logs + viewer, session timeout, force-password-change, anti-cheat (clock skew, late answers, reconnect suspicion, session replacement).
- **Notifications** — typed notifications with read state and bulk actions.
- **Gladiator dashboard** — arena join by room code, QR, profile/avatar editing, history.
- **Global UX** — unified error states + retries, skeletons, empty states, offline banner, Firebase permission-error boundary.

---

## 6. AI Forge

- **Stack:** `genkit` (lockfile 1.39.x) with `@genkit-ai/googleai`, default model `gemini-2.0-flash`; UI catalog `gemini-models.ts` exposes 2.5-lite/flash/pro.
- **PDF flow (`generate-quiz-pdf-flow.ts`):** server action → Genkit flow. Auth (executive/commander), inline 5/min rate limit, 10 MB cap, type detection (pdf/docx/txt-md/image), pdfreader extraction with 30 s timeout, `/Encrypt` and corrupt-file detection, 40 000-char sentence-boundary chunking with per-chunk quotas, per-model 3-retry backoff, structured-output schema + `repairJson`/`tryParseQuestions` text fallbacks, warning-only validation, results reviewed before import; every run recorded to `ai_logs` (silent-failure by design).
- **Engines:** prediction (last-5 quizzes trend), knowledge (platform coverage from up to 1 000 arenas), decision-support (fairness/optimization advice) — each a `definePrompt` behind `/api/{predictions,knowledge,decision-support}/summary` (10/min per engine, per user).
- **Known drift (documented):** runtime model chain bypasses the UI catalog's `resolveModel`; `genkit:dev` harness doesn't import the flow; image handling forces `image/png`; some declared failure paths are dead code. None block production use of the primary text/PDF path.

---

## 7. Battle Engine

- **States:** `draft → waiting → ready → starting → live ⇄ paused → finished → archived` (mirrored in `firestore.rules`).
- **Scoring:** `score_max`(1000)/`score_min`(100), time-decay on correct answers, optional wrong/skip penalties, 3 s grace window, violations at >15 s late and 5 s clock skew.
- **Modes:** synchronized (commander advances, `evaluateQuestionForAll` scores everyone in one transaction with a `scored` flag) and independent (each gladiator self-advances via `evaluateQuestionForUser`; auto-end when all finish).
- **Anti-cheat:** per-tab `session_token`, 60 s reconnect-suspicion window, blocked-participant enforcement client+server, `/kicked` and `/cheating-detected` screens.
- **11 routes** (`battle/{start,activate,pause,resume,advance,skip,evaluate,end,archive,transfer-ownership,reconnect}`): shared shape — auth → `BATTLE_ACTION_PER_USER` 30/min → transaction → battle log → `battleErrorResponse`.
- **Final-audit fixes:** idempotency guards added in both evaluation paths (previously a retried evaluate could double-score and double-advance).
- **Remaining notes (documented):** commander `end` is intentionally a forced-finish; presence window constants unused; `questionService.evaluateQuestion` is dead legacy code; `violations_count` has no server increment path; client-side join has no server-side cap.

---

## 8. Security

- **Rate limiting:** in-memory sliding window (`src/lib/rate-limiter.ts`), 11 limit groups, 34 call sites across 29 routes; 429 responses carry `Retry-After`-style headers; login pre-check dual-buckets (IP + email).
- **Logging:** `security_logs` (invalid tokens/role mismatches throttled 60 s, security violations with kinds), `auditLogs` (executive/commander actions), `battle_logs` (event stream), `ai_logs` (generation runs). All log collections are server-write-only in rules.
- **Headers:** HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, powered-by disabled.
- **Auth hardening:** force-password-change gate for staff, 30-min idle session timeout, error-message mapping, no client writes to privileged collections, `role` immutability in rules, no public staff signup.

---

## 9. Analytics

- **Dashboards:** quiz overview cards, student analytics, per-question analytics, system insights (30-day AI + security metrics), charts via Recharts.
- **API surface:** `executive/analytics-data`, `executive/insights`, `executive/battles` (aggregates + CSV), `executive/security-logs`, `executive/ai-logs`, `executive/audit-logs` — cursor-paginated, executive-only, `.select()`-projected in hot paths.
- **Cost posture:** page limits (50–1000 docs) and projections; whole-collection scans in analytics-data/backup-export/export/workspace remain documented tech debt.

---

## 10. Executive Workspace

- Pages: dashboard, workspace (arena/student overview + health check), students, question bank (CRUD + AI import), requests (approve/deny with responses), commanders (admin), messages (conversations + announcements), notifications, security logs, AI logs, audit logs, analytics, battles, backup (export/import), settings (platform settings), profile.

---

## 11. API Inventory

47 route files, all Node runtime, ID-token verified, rate-limited where mutating:

| Group | Routes |
|---|---|
| Battle (11) | start, activate, pause, resume, advance, skip, evaluate, end, archive, transfer-ownership, reconnect |
| Messaging (8) | conversations, conversations/[id], [id]/read, [id]/messages, [id]/messages/[messageId], commanders, announcements, announcements/[id]/read |
| Executive (17) | workspace, settings, search, requests, question-bank, profile, notifications, notifications/[id], insights, export, battles, backup/export, backup/import, audit-logs, analytics-data, ai-logs, security-logs |
| Commander (2) | dashboard, requests |
| Gladiator (1) | dashboard |
| Admin (1) | users |
| Audit (1) | audit/log |
| Rate-limit (1) | rate-limit/check (login pre-check) |
| AI engines (3) | predictions/summary, knowledge/summary, decision-support/summary |

---

## 12. Firestore Collections

| Collection | Reads | Writes |
|---|---|---|
| `users` | owner, commanders, executives | self-create (gladiator), owner update (no role change), admin/API |
| `quizzes` | executive, creator, participants (finished) | commander/executive create; creator update along validated transitions |
| `quizzes/{id}/questions`, `answerKeys`, `participants`, `submissions` | role-gated | creator (questions/keys), self (participants/submissions with timing/field whitelists) |
| `executive_requests` + `responses` | executive, owning commander | commander create; executive respond |
| `question_bank` | executive, commander | executive |
| `platform_settings` | executive | executive |
| `conversations` + `messages` | participants of the conversation | participants send; executive manage |
| `announcements` | all signed-in | executive |
| `notifications` | owner, executive | server-only |
| `auditLogs`, `ai_logs`, `security_logs` | executive | server-only |
| `battle_logs` | participants/creator/executive | self-authored client events; server otherwise |

Indexes: 11 composite + participants `user_id` collection-group override.

---

## 13. Security Model

Defense in depth: (1) Firestore rules validate every client read/write (roles via per-request user doc reads, field whitelists, transition map, server-time equality for submissions); (2) every API route independently verifies the Bearer ID token and role; (3) rate limits bound every mutating surface; (4) client UX gates routes and role behavior. Rule writes for log collections are denied outright — the Admin SDK (service account) is the only writer.

---

## 14. Authentication Flow

- **Staff:** email/password directly against Firebase Auth (client SDK) after a rate-limited pre-check; email normalization to `@knowledgearena.app`; post-auth role gate (executive/commander); force-password-change on first login; 30-min idle session timeout.
- **Gladiator:** Google sign-in redirect (`select_account`, 180 s pending marker); profile auto-created with `role: gladiator`; arena access by room code/QR.
- **Provisioning:** commanders via executive admin API (Admin SDK); executives via `scripts/bootstrap-executive.ts` (must-change-password).
- **Session:** Firebase Auth persistent sessions (default browser persistence), per-call ID tokens (`Authorization: Bearer`) minted client-side; no session cookies (documented trade-off; token revocation is a V1.1 item).

---

## 15. Authorization Model

Two independent enforcement points, both authoritative:

- **Server (APIs):** `verifyFirebaseToken` (any authenticated user) / `verifyFirebaseTokenWithRole` (exact role) / `verifyFirebaseTokenWithAnyRole` (executive or commander) — each reads `users/{uid}.role` per request, so role changes apply immediately.
- **Firestore:** rules re-read the same role per operation; quiz ownership via `created_by`; participant-scoped reads; collection-group self-reads for student history.

---

## 16. Battle State Machine

```
                commander            commander/gladiator
 draft ──────► waiting ──► starting ──► live ⇄ paused
                 ▲  │         │ ▲        │
                 │  │ 4s      │ │        ├──► finished ──► archived
                 └──┘ countdown└─┘        │
                 ready ─────────────►     └──► (all finished auto-end)
```

Transitions enforced in `firestore.rules` (`isLegalStatusTransition`) and inline in routes; scoring anchored to `question_start_at` with pause-shift compensation; terminal states idempotent; evaluation idempotency guarded in both paths (final audit fix).

---

## 17. Performance Summary

- **Reads:** projections (`.select`) on 6 hot routes; cursor pagination everywhere lists exceed 50 docs; page caps 50–1000.
- **Realtime:** 6 subscription types, all cleaned up on unmount; heartbeat every 15 s; offline re-subscribe with debounce.
- **Writes:** single-doc writes + Firestore transactions for scoring; batch writes for quiz creation (rules support `getAfter` for batch-created parents).
- **Rendering:** client-rendered portals; skeletons; no server render-blocking work.
- **Known costs (documented):** unbounded whole-collection reads in 4 executive routes; N+1 participant reads inside finish/evaluate transactions; in-memory rate limiter per-instance; 1 000-doc snapshots for insights/knowledge engines.

---

## 18. Production Readiness

**Gate results:**
- TypeScript preflight: **CLEAN** (all Phase 1–5 files).
- `npm run build`: **blocked in this environment only** — SWC binary missing, npm registry unreachable; no repository defect.
- `next lint`: blocked by ESLint flat-config mismatch (legacy `.eslintrc.json`); documented.
- Playwright: configured (`localhost:3456`, chromium, retries 1) with workflow/diagnostic specs + operational scripts.
- Rules/indexes: deployable (`firebase.json`), indexes list complete for all current queries.
- Secrets: none committed; `.env.example` covers all 5 variables.

**Release action items (in `DEPLOYMENT.md`):** clean install + build on a networked machine, deploy rules/indexes and wait for index enablement, bootstrap an executive, create a commander, run the production checklist smoke tests.

---

## 19. Known Limitations

1. Build/lint verification unavailable in the audit environment (SWC binary, npm registry) — must be re-verified in CI on a networked machine.
2. In-memory rate limiting is per-warm-instance (multiples under scale).
3. No session cookies → no server-side sign-out/revocation (ID tokens valid ~1 h).
4. Middleware passes through (no server-side page gate); protected-page data is safe via rules + APIs, but direct page loads render then redirect client-side.
5. Client-side join has no server-side participant cap; presence windows not enforced.
6. `mustChangePassword` is a client-side gate, not a server-side block.
7. AI: runtime model chain may drift from the UI model catalog; image extraction forces PNG; PDF-image-only imports report generic errors.
8. `getClientIp` trusts the platform edge (Vercel header; else last XFF hop) — deploy behind a trusted proxy that strips inbound XFF (see DEPLOYMENT.md).
9. `react-hook-form`/`@hookform/resolvers` types are broken in the local node_modules; an ambient shim (`src/types/react-hook-form.d.ts`) restores type-checking. Root fix: clean reinstall.
10. Firebase Hosting block in `firebase.json` is a Studio artifact — do not use for this app.

---

## 20. Technical Debt

| Debt | Location | Impact |
|---|---|---|
| Unbounded collection reads | `executive/{analytics-data,backup/export,export,workspace}` | Cost at scale — chunked-read helper recommended |
| N+1 participant reads in scoring transactions | `battle-server.ts` finish/evaluate | Latency at 100+ participants |
| Dead machine helpers | `battle-machine.ts:17-27` (never called) | Route-level inline checks duplicate logic |
| Dead legacy scorer | `game.service.ts:108-180` (`questionService.evaluateQuestion`) | Divergent scoring formula, no callers |
| Unused constants | `PRESENCE_WINDOW_MS`, `COMMANDER_PRESENCE_WINDOW_MS` | Presence never enforced |
| Log-type drift | 7 declared security events never written; insights count impossible events | Monitoring blind spots |
| `genkit:dev` harness | `ai/dev.ts` never imports the PDF flow | Dev-only, flow missing from Genkit UI |
| Literal status strings | `'ready'`, `'finished'` in 3 files | Constant refactor |
| `offline-detector` timeout cleanup, `use-toast` listener re-registration, CommanderDashboard memoization, AuthContext `useMemo` deps | components/hooks/contexts | Minor hygiene |
| Msg bucket split | `msg:` vs `messaging:` rate-limit prefixes | Separate buckets undercount combined messaging |
| AI limits ×3 | one 10/min bucket per engine | Effectively 30/min across engines |
| Emoji grid, `.env*` ignore, stale `firebase.json` hosting | config | Resolved in Phase 5 where code-visible; hosting block documented |

---

## 21. Deployment Guide

See **`DEPLOYMENT.md`** — env vars (5), Firebase setup (rules/indexes/storage/accounts), hosting options (Cloud Run recommended; Vercel; VM + reverse proxy with XFF stripping), production checklist, security checklist, monitoring checklist, backup (PITR + daily exports, cross-region), disaster recovery table (RTO/RPO targets), and rollback strategy (immutable image rollback, code-then-data order).

---

## 22. Operations Checklist

- [ ] Daily: Firestore cost trend, 5xx/429 rate, `security_logs` volume, Gemini quota usage
- [ ] Weekly: review executive security dashboard; check index health; spot-check battle completion (no dangling `live`)
- [ ] Monthly: restore drill from backup to scratch project; rotate secrets; review audit log for anomalies; update Playwright smoke suite
- [ ] Per release: `DEPLOYMENT.md` production checklist + manual QA checklist from `PHASE5-REPORT.md` §13

---

## 23. Future Roadmap

See **`ROADMAP.md`**: **V1.1** hardening (battle sweeps, distributed rate limiting, server-side join caps, presence enforcement, session-cookie auth + revocation, logging completeness, strict machine enforcement, idempotency tests); **V1.2** product (realtime notifications, AI version history, multi-provider, replay, spectator mode, achievements, offline queue, i18n, tournaments); **V2.0** scale (organizations, plugin architecture, AI scheduler, team battles, analytics warehouse, PWA/FCM, multi-region). Excluded by design: Firestore/Auth replacement, battle-machine rewrite, second framework, public staff signup, client writes to log collections.

---

## 24. Release Recommendation

**APPROVED FOR CONTROLLED PRODUCTION DEPLOYMENT** on completion of the `DEPLOYMENT.md` production checklist — with the required post-conditions:

1. `npm ci && npm run build` green on a networked CI machine (unblocks the only remaining gate).
2. Firestore rules + indexes deployed and indexes **Enabled** before traffic.
3. One executive bootstrapped, one commander created; staff force-password-change verified.
4. Smoke: full battle lifecycle + PDF import + export paths.
5. Monitoring alerts configured (5xx, 429, security violations, Gemini quota).
6. V1.1 hardening items tracked in the roadmap (distributed rate limiter, server-side sweeps, session revocation) scheduled as the next milestone.

The repository is internally consistent, all phases are committed and pushed, release documentation is complete, and the architecture review and roadmap are recorded. This closes the engineering lifecycle for Knowledge Arena.
