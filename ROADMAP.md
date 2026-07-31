# Knowledge Arena — Long-Term Architecture Roadmap

**Basis:** current architecture (Next.js App Router + Firebase Auth/Firestore/Storage + Genkit/Gemini). Every item below fits the existing structures (collections, route patterns, services, flows) — nothing requires a platform rewrite. This roadmap is forward-looking; the release gate for the current milestone is `FINAL_PROJECT_REPORT.md`.

---

## Version 1.1 — Hardening & Integrity (next release)

Small, low-risk improvements that close the gaps found in the final audit. No new user-facing features.

| Item | Why | Fit |
|---|---|---|
| Server-side battle sweep (scheduler/CRON) | Independent-mode battles never auto-end when a participant disconnects (`endBattleIfAllFinished` requires all finished); dangling `live` arenas accumulate | Adds a periodic job over `quizzes` (created_at/status) — no schema change |
| Distributed rate limiter | In-memory limiter is per-instance; limits multiply with serverless scale | Swap `SlidingWindowLimiter` store for a Firestore (or Redis) backend behind the same interface; all call sites unchanged |
| Server-side join validation + participant caps | `joinQuiz` is a client-side transaction; no server cap per arena | New route or rules upgrade using existing `participants` subcollection + quiz caps field |
| Enforce presence (`PRESENCE_WINDOW_MS` / `COMMANDER_PRESENCE_WINDOW_MS`) | Constants exist but are unused — staleness never enforced; zombies stay in `waiting`/`ready` rooms | Sweeper uses the existing lastSeen field |
| Session-cookie auth + token revocation on logout | ID tokens accepted until expiry after sign-out; no server-side logout | `verify-auth.ts` gains a cookie path alongside the Bearer path; AuthContext signOut revokes refresh tokens |
| Logging completeness | `login_success/login_failed/logout`, `unauthorized_access`, `rate_limited` are declared but never written; insights pages count impossible events | Add server-side login-event capture (client posts to a new `security` log endpoint, or the existing audit route pattern); align insights queries |
| Strict state-machine enforcement | `battle-machine.ts` helpers are dead code; routes check status inline; commander `end` can force `finished` from any state | Wire `assertQuizTransition` into the 11 battle routes (drop-in, behavior-identical for legal flows) |
| Structured logging | 3 bare `console.log` calls in the messages route | Small refactor — logs stay in platform logs, structured payloads |
| Idempotency regression tests | Scoring guards added at the final audit need coverage | Playwright/unit tests around `evaluateQuestionForUser`/`evaluateQuestionForAll` |
| String-literal cleanup | `'ready'`/`'finished'` literals in a few places vs `QUIZ_*`/`PS_*` constants | Mechanical refactor |

---

## Version 1.2 — Product & Experience

User-visible features that slot into existing pages, collections, and services.

| Item | Why / notes | Architecture fit |
|---|---|---|
| Notifications (realtime) | `notifications` collection + API + page already exist; add live listener + unread badge (offline-aware) | New subscription in an existing service; reuse `NOTIFICATION_TYPES` |
| AI version history | Review panel already regenerates questions; keep prior generations per quiz (diff view, revert) | New `quiz_generations` subcollection + UI in existing review panel; `ai_logs` already records each run |
| Multiple AI providers | Genkit supports providers; catalog (`gemini-models.ts`) already models model choice; `platform_settings.ai.defaultModel` exists | Add `@genkit-ai/*` provider plugin + catalog entries; route through `resolveModel` (currently bypassed) |
| Replay | `battle_logs` already records the full event stream (join/start/advance/score/finish) | Read-only replay UI replaying logs on a timeline; no new writes |
| Spectator mode | Finished arenas are already readable by participants; add a read-only "view battle" for executives/commanders | Existing `canReadArena` + participants read; new page in commander/executive portals |
| Achievements | Users/profile already central; add `achievements` subcollection + earned flags in battle flows | Write paths in `battle-server.ts` + a profile page section |
| Offline support | Firestore persistent cache + `offline-detector` exist; enable offline read caching and a submission queue | `initializeFirestore` cache settings + queue service |
| Internationalization | All strings are inline; introduce a locale layer (next-intl or lightweight dictionary) | Wraps existing pages; no data model change |
| Tournaments | Built on `quizzes` + `battle_logs`; a bracket needs a parent entity | New `tournaments` collection + bracket subcollection; reuses the battle lifecycle |

---

## Version 2.0 — Scale & Platform

Structural growth; each item still fits the current core (no rewrite), but changes shared contracts.

| Item | Notes |
|---|---|
| Organization / multi-tenant management | Executives manage orgs of commanders/arenas; add `orgId` to users/quizzes, tenant-scoped rules + workspace queries (index additions; rules `getOrgRole` helper) |
| Plugin architecture | AI Forge flows as pluggable engines (PDF, engines, providers) behind stable interfaces; enables third-party question sources |
| AI scheduler | Automated arena scheduling / question-bank refresh jobs using the sweeper infra from V1.1; cron → Cloud Tasks for scale |
| Team battles | Participant group model (team docs, per-team scoring) — the biggest schema change; requires participant/scoring rework in `battle-server.ts` |
| Analytics warehouse export | Move heavy analytics (currently in-executive reads) to scheduled BigQuery sync; dashboards read aggregates |
| PWA / mobile app | Next standalone + service worker; push via FCM (sender id already configured) |
| Multi-region Firestore | Enable for global latency; evaluate consistency implications of transactions |

---

## Explicitly out of scope (don't build)

- Replacing Firestore or the Firebase Auth identity layer
- Rewriting the battle state machine or scoring model
- Introducing a second app framework (client or server)
- Public staff self-signup (security boundary, by design)
- Direct client writes to log collections (server-only by design)
