# Non-Invasive Architecture & Port-Back Plan

The purpose: guarantee that SIH work is **additive, conflict-free, and reversible**, and that it
folds back into the personal Knowledge Arena project after SIH without rework.

---

## 1. The one rule

> **Import, reuse, never fork.**

The existing application is not modified. New capability is added beside it and calls into it
through its existing public interfaces — Genkit flows, services, libs, Firestore collections.

A fork of `analytics.service.ts` or `generate-quiz-pdf-flow.ts` into an RPL copy would be a
regression factory. The next bug fixed in one copy stays broken in the other.

---

## 2. What gets ADDED

| Path | Status | Purpose |
|---|---|---|
| `src/app/(rpl)/rpl/declare/page.tsx` | **NEW** | Worker self-declaration |
| `src/app/(rpl)/rpl/consistency/page.tsx` | **NEW** | Inter-assessor κ report |
| `src/app/(rpl)/rpl/signoff/page.tsx` | **NEW** | Assessor decision + audit |
| `src/app/(rpl)/rpl/offline-queue.ts` | **NEW** | IndexedDB queue (route-scoped) |
| `src/lib/rpl/nsqf-packs.ts` | **NEW** | Pack taxonomy (static data) |
| `src/lib/rpl/pack-mapping.ts` | **NEW** | Declaration → ranked packs |
| `src/lib/rpl/agreement.ts` | **NEW** | Cohen's κ, McNemar, bootstrap CI |
| `src/lib/rpl/render-scanned.ts` | **NEW** | Scanned page → image data URI |

Firestore collections, all new and top-level:

```
rpl_declarations     worker experience declarations
rpl_assessments      RPL assessment instances linked to a qualification pack
rpl_evidence         assessor-uploaded evidence
rpl_decisions        sign-off records — the audit backbone
rpl_agreement_reports cached κ computations
```

## 3. What gets REUSED (never copied)

| Existing asset | Reused via |
|---|---|
| Document → assessment generation | `generateQuizFromPDF` / `createForgeJob` in `src/ai/flows/generate-quiz-pdf-flow.ts` |
| Per-item statistics | `src/services/analytics.service.ts` (read-only) |
| Scoring rules | `quizzes/{id}/config/settings` via `computeCorrectScore`, `src/lib/battle-machine.ts:77` |
| Authentication | `AuthContext`, `verifyFirebaseToken`, `verifyFirebaseTokenWithRole` |
| RBAC roles | existing `executive` / `commander` / `gladiator` |
| UI primitives | `src/components/ui/*`, `class-variance-authority`, existing theming |
| AI runtime | `src/ai/genkit.ts`, `src/ai/key-resolver.ts` (multi-key rotation) |
| Rate limiting | `src/lib/rate-limiter.ts` |
| Audit logging | `src/lib/security-log.ts`, `auditLogs` |
| Exports | `src/app/api/executive/export` (CSV/JSON) |

### Role mapping — UI copy only

RPL language over existing roles. **No logic change, no new role, no schema change.**

| RPL term | Existing role | Where the change happens |
|---|---|---|
| Worker | `gladiator` | New RPL page labels only |
| Assessor | `commander` | New RPL page labels only |
| Scheme administrator | `executive` | New RPL page labels only |

If RPL-specific labels ever leak into a shared component, that is a regression — check it before
any commit.

---

## 4. The two shared files — Boundary B

Path isolation does **not** protect these. They are read by every branch.

### `firestore.rules`

- SIH work adds **one** self-contained additive block, appended in its own delimited region:

```
// ───── RPL (SIH26242) — additive block, no existing match modified ─────
match /rpl_declarations/{declId} { ... }
match /rpl_assessments/{assessmentId} { ... }
match /rpl_evidence/{evidenceId} { ... }
match /rpl_decisions/{decisionId} { ... }
match /rpl_agreement_reports/{reportId} { ... }
// ───── end RPL block ─────
```

- **Never edit or reorder an existing `match` block.** Rules are order-sensitive: inserting
  `allow` ahead of a `deny` changes behaviour for live collections.
- Every `rpl_*` rule must be **deny-by-default** first, then grant narrowly. Default-permit is
  how live assessment data gets exposed.
- Verify before every commit:
  ```powershell
  npm run rules:generate
  npm run typecheck
  npm test
  ```

### `package.json` / `package-lock.json`

- **No new dependency without explicit sign-off.** These are the shared lockfiles and a
  conflict here is painful to unwind later.
- As designed, **P0 requires nothing**: Cohen's κ, McNemar, and bootstrap CI are ~150 lines of
  arithmetic. NSQF pack mapping is static data. Self-declaration is forms plus Zod, and Zod is
  already a dependency.
- Only P1-2 (evidence aids) introduces a real new subsystem — Firebase Storage, which currently
  has **zero** usage in `src/` — and it also touches `storage.rules`, a third shared file. Treat
  that item as requiring explicit sign-off.
- Already-present and usable: `zod`, `uuid`, `genkit`, `@genkit-ai/googleai`, `recharts`,
  `react-hook-form`.

---

## 5. Verification that the live app is unaffected

Run before **every** commit on this branch:

```powershell
git diff --stat HEAD                          # must show ONLY new files, zero deletions
git diff --name-only HEAD -- firestore.rules package.json package-lock.json
npm run typecheck
npm run lint
npm test
```

The second command must print **nothing**. If it prints anything, Boundary B has been breached —
stop and reassess before committing.

`git diff --stat` showing any `M` (modified) file for `src/` outside `src/app/(rpl)/` and
`src/lib/rpl/` is also a breach.

---

## 6. Post-SIH port-back plan

The intent is that this work becomes part of the personal project with no rework.

1. **Confirm `main` never moved.** `git log main --oneline` should match the pre-SIH history.
2. **Merge, do not cherry-pick.** Every SIH commit adds only new files, so a fast-forward or a
   clean merge into `main` resolves with **zero conflicts**. If a conflict appears, something was
   not additive — investigate the assumption, do not resolve the conflict by hand.
3. **Rebase order.** Merge the SIH branch into `main` *after* any pending personal work, not
   before. Additive files do not conflict either way, but this keeps `main` deployable throughout.
4. **Run the full gate on `main` post-merge:** `typecheck`, `lint`, `test`, and the emulator suite.
5. **Vercel.** The merged result deploys to production **only** at that point — deliberately, and
   only after the rules block has been reviewed. During the competition this never happens.
6. **Update docs.** Add the RPL route group to `README.md`, `API.md`, `DATABASE.md`, and
   `ARCHITECTURE.md` §10 indexes, so the merged state is documented rather than mysterious.

### Files that will need updating on merge
These are tracked files, so they are edited **after** the merge, never during SIH work:

- `README.md` — route list, features
- `API.md` — new endpoints
- `DATABASE.md` — new `rpl_*` collections
- `ARCHITECTURE.md` §10 — Firestore indexes
- `firestore.indexes.json` — new composite indexes

---

## 7. Kill criteria

Abandon and restart from a clean branch if any of these become true:

- `git diff --stat HEAD` ever shows a **deleted** or **modified** `src/` file outside the RPL paths.
- A `firestore.rules` edit touches an existing `match` block.
- `package.json` changed without explicit sign-off.
- The RPL route group becomes reachable from the main navigation — it must be opt-in only.
- Any instinct arises to "just tweak the Forge flow for RPL". That is the exact moment this
  architecture starts paying for itself. Add a new module instead.