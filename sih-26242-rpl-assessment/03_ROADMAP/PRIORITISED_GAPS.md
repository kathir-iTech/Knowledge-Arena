# Prioritised Build Roadmap — SIH26242

Ordered by **judging value per unit of effort**, not by ease. Effort is in person-days for one
developer working alongside the team.

Every item states which files it adds and confirms it edits nothing existing. If any item cannot
honour that, it belongs on a separate branch and is flagged as such.

---

## P0 — Before 5 October idea submission

These three items are what turn a partial fit into a defensible one. All three are additive new
files. **None requires a new npm dependency.**

### P0-1 · Worker self-declaration flow — *0.5 day*

Closes clause **A1** and completes workflow outcome **B1**.

- Add `src/app/(rpl)/rpl/declare/page.tsx` — new route group, unreachable unless navigated to.
- Add `src/lib/rpl/declaration.ts` — pure types + Zod schema for a declared-experience record.
- Add `src/lib/rpl/declaration.schema.ts` if kept separate from types.
- Firestore: new top-level collection `rpl_declarations`. Additive.
- **Edits nothing existing.** Reuses `AuthContext`, existing Firestore client, existing UI primitives.

Capture: trade applied for, years of experience, work context, tools used, prior certification if
any. Structured, not free-text — it has to feed a mapping engine.

### P0-2 · NSQF qualification-pack mapping engine — *1 day*

Closes clause **A1** (second half) and outcome **B2**.

- Add `src/lib/rpl/nsqf-packs.ts` — pack taxonomy as typed static data. **Start with ONE trade**
  (the statement only requires one). Suggested: a plumbing or electrician qualification pack.
- Add `src/lib/rpl/pack-mapping.ts` — pure function, declaration → ranked candidate packs.
- Add `src/lib/rpl/pack-mapping.test.ts` — pure unit tests, no Firestore.
- **Edits nothing existing. No dependency** — scoring is keyword/heuristic plus an optional
  Gemini re-rank through the existing `googleAI` instance.

Rule: **do not claim ML classification.** A transparent, inspectable heuristic with a stated
accuracy on a small labelled set beats an unvalidated model and is defensible to a ministry jury.

### P0-3 · Inter-assessor agreement report (Cohen's κ) — *1 day*

Closes outcome **B3**. **This is the headline. Do not cut it, do not demote it, do it before
P0-4.**

- Add `src/lib/rpl/agreement.ts` — pure statistics: Cohen's κ, per-category confusion matrices,
  McNemar's test, bootstrap CI. ~150 lines, no dependency.
- Add `src/lib/rpl/agreement.test.ts` — validate against hand-computed fixtures, including
  known-value cases and a "chance agreement" sanity check.
- Add `src/app/(rpl)/rpl/consistency/page.tsx` — assessor-facing report.
- Read-only from existing `questionStats` / per-option distributions (`analytics.service.ts:539+`).
  **No write path changes, no schema migration, no transaction changes.**
- **Edits nothing existing. No dependency.**

Non-negotiable reporting rules are in `../01_ANALYSIS/02_gap_analysis.md` §4 — state `N`, report
a null result if that is the finding, and never present κ as validity.

### P0-4 · Documents, not code — *0.5 day*

- `OUR_PROBLEM_STATEMENT.md` §5 — the support/replace boundary. Already drafted. Closes **B5**.
- `PITCH_6_SLIDES.md`. Already drafted.
- Get NCVET pack + dummy assessment dataset from MSDE. The statement offers both. **Without real
  data the κ computation is hypothetical**, which removes most of its value.

### P0 total: **≈ 3 days.** Feasible before 5 October.

---

## P1 — After submission, before the Grand Finale

### P1-1 · Offline capture and sync — *2–3 days*

Closes clause **A5** and outcome **B4**. This is the largest honest gap and the most-cited
requirement in the statement.

- Add `src/app/(rpl)/rpl/offline-queue.ts` — IndexedDB queue module.
- Add `src/app/(rpl)/rpl/service-worker.ts` — scoped registration.
- **Critical:** scope the worker to `/rpl/*` only. Do **not** register it globally, or you have
  just modified the behaviour of the live application on a shared codebase. That would break
  Boundary C.
- Replay on reconnect; conflict policy: assessor decisions are last-write-wins with an audit entry
  rather than silent overwrite, because a certification decision is not a like-for-like sync.
- Additive `firestore.rules` block only (Boundary B).

### P1-2 · Image/video evidence aids — *2 days*

Closes the second half of clause **A2**.

- Video: **P1-3 is higher value; do P1-3 first.** Video handling is absent entirely, and a
  half-built video feature is worse than none.
- Image evidence: reuse the existing image ingestion path
  (`generate-quiz-pdf-flow.ts:679`, `:957`, cap 24 at `:561`). Additive upload surface plus
  `rpl_evidence` collection.
- **Requires Firebase Storage.** There are currently **zero** calls to `uploadBytes` /
  `getStorage` / `firebase/storage` anywhere in `src/`. So this introduces a genuinely new
  subsystem, plus a `storage.rules` edit — a second shared file. Flag it explicitly per Boundary B.

### P1-3 · Assessor sign-off workflow with decision audit — *1.5 days*

Closes the second half of clause **A4**.

- Add `rpl_decisions` collection: assessor identity, decision, timestamp, the competency profile
  and recommendation the decision was based on, and whether the recommendation was accepted,
  modified, or rejected.
- New route `src/app/(rpl)/rpl/signoff/`.
- This is what makes "supports, not replaces" **structural** rather than a claim. No code path
  emits a certification without a human sign-off record.

### P1-4 · Scanned-PDF ingestion — *1–2 days*

Not a named requirement, but NCVET packs include scanned material, so the demo will hit it.

- Add a render-page-to-image step in a **new** module (`src/lib/rpl/render-scanned.ts`) that
  produces data URIs the existing multimodal path already consumes.
- **Do not modify `generate-quiz-pdf-flow.ts`.** Call it from the RPL route instead. This is
  exactly the kind of change that looks harmless and breaks the live app's PDF path.

---

## P2 — Only if time remains

| Item | Effort | Note |
|---|---|---|
| Competency profile UI (NSQF-aligned) | 1.5 d | Data mostly exists; the NSQF mapping does not |
| Assessor agreement heatmap across locations | 0.5 d | Cheap once κ exists — strong visual for the pitch |
| Cohort analytics at scheme level | 1 d | Reuse existing export/analytics infrastructure |
| Multilingual worker interface | 3+ d | **Do not attempt.** Translation is `410` and a regional-language UI is a project of its own. |
| Adaptive testing via CAT | 2 d | Library exists but is test-only; wiring it is real work. Only if P0–P1 are all done. |

---

## Effort summary

| Phase | Scope | Effort |
|---|---|---|
| **P0** | Declaration, NSQF mapping, **Cohen's κ**, docs | **≈ 3 days** |
| **P1** | Offline sync, evidence aids, sign-off, scanned PDFs | **≈ 7–9 days** |
| **P2** | Competency UI, heatmap, cohort analytics | **≈ 3 days** |

**The Grand Finale is a 36-hour build sprint.** It is not the place to discover that offline sync
does not work. P1 must be finished and rehearsed **before** December.

---

## Sequencing note

If time is short, the correct cut order is **P2 → P1-2 → P1-4 → P1-1 → P1-3**, and **P0-3 is
never cut**. The order reflects one judgement: the inter-assessor agreement statistic is the only
item on this list that a competitor is unlikely to build at all, and it satisfies a requirement
the statement names in as many words. The rest are table stakes.