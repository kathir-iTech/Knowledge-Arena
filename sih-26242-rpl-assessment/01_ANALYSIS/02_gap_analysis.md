# Gap Analysis & Anti-Overclaim Reference

The purpose of this file is narrow and defensive: **it exists so the pitch never says something
the code cannot do.** A hackathon judge who finds one false claim discounts the rest of the
deck. One overstated feature is worth more than a hundred accurate ones, because it teaches the
judge to distrust everything else.

Every limitation below was read in code during this analysis.

---

## 1. Claims that MUST NOT appear in the pitch

| ❌ Do not claim | ✅ What is true | Evidence |
|---|---|---|
| "Reads scanned documents / auto-OCR" | Uploads images and embedded images are read by Gemini vision. A **scanned PDF with no text layer is rejected** with `PDF_IMAGE_ONLY`. | `generate-quiz-pdf-flow.ts:930`, `:971-974` |
| "Multilingual / regional language support" | **There is none.** The translate route returns `410 Gone` — "Set 2 ships cache + contract only; model call is deferred". | `src/app/api/quiz/translate/route.ts:38-42` |
| "Adaptive testing / computerised adaptive testing" | The CAT engine exists but its **only importer is a test file**. It is dead code in the app. | `src/lib/cat-engine.ts:58`; only referenced at `tests/battle-idempotency.spec.ts:2` |
| "IRT-validated / psychometrically calibrated" | 2PL difficulty is computed behind an `n ≥ 30` gate, but **no UI renders it**, and `irtDiscrimination` depends on a per-user correctness vector that no writer ever produces — so it is structurally `null`. | `analytics.service.ts:182`, `:566-570` |
| "Document storage / evidence vault" | **Zero** calls to `uploadBytes`, `getStorage`, or `firebase/storage` anywhere in `src/`. Files are parsed in-browser and passed as data URIs; nothing is persisted. | repo-wide search, 0 matches |
| "Works offline / offline-first" | Connectivity **awareness banner only**. No service worker, no IndexedDB persistence, no answer queue. | `src/components/offline-detector.tsx:15-19`; `src/hooks/useOnlineStatus.ts` |
| "Supports SSO" | Google OAuth popup and email/password only. No SAML/OIDC enterprise SSO. | `src/contexts/AuthContext.tsx` |
| "Plagiarism detection" | The Forge "grounding" check measures whether a generated question overlaps its **source document**. That is a hallucination guard, not plagiarism detection. Conflating them is a serious credibility risk. | `generate-quiz-pdf-flow.ts:1239-1260` |
| "Content moderation" | Not built. No moderation queue, no report-a-question path. | — |
| "Squads / team battles" | `src/lib/squads.ts` is imported only by tests. | repo-wide import search |
| "SIEM integration" | CEF formatting helpers exist but are never dispatched. | `src/lib/siem.ts` |
| "Multi-tenant institution management" | Domain gating is **per-arena**, not global, and a blank `institution_domain` fails open. There is no `orgId` tenant entity. Say "institution-domain-scoped assessments". | `src/services/arena-creation.service.ts:88-122` |
| "200+ tests" | **8** Playwright spec files. `AUDIT.md:203` cites "15/15 on Vercel" for unauth gating. | `tests/`, `e2e/` |

## 2. Caution: this repo's own docs overstate it

`FEATURES_COMPLETE.md` and `FEATURE_GOLDEN_RULES_ROUND2.md` are **written as if the build is
finished**, and at least one claim in them is not true of the code.

The concrete case: `FEATURE_GOLDEN_RULES_ROUND2.md:373` states that per-route `hasPermission`
guards were added across `src/app/api/executive/*` and `src/app/api/commander/*`, alongside
`verifyFirebaseTokenWithRole`. A repo-wide search for `hasPermission` returns matches in only
three places —

- `src/lib/permissions.ts` (the definition)
- `src/lib/verify-auth.ts:4,7` (the import and re-export)
- `tests/battle-idempotency.spec.ts:5` (the only caller)

**No API route imports it.** The capability masks are dead code. Role checking is real but coarse.

**Why this matters for the pitch:** the fastest way to walk into an overclaim is to read this
repo's feature documentation and believe it. If a judge is handed `FEATURES_COMPLETE.md`, or if
you quote "50+ features complete" from it, the specific claim that dissolves under one grep is
enough to discredit the ones that are true. **Cite code, never the feature docs.** This file
exists because every citation in the matrix was read in source, not in the docs.

## 3. One real security finding — disclose it if asked, do not volunteer it

`src/app/api/copilot/route.ts` verifies the Firebase token and rate-limits, but **performs no
server-side role check**. The "Commander only" restriction exists solely as client-side UI copy.
Any authenticated student can call the endpoint directly.

Judge framing if it comes up: *"Yes — it's a known finding, here's the fix, and it shows we audit
our own auth boundaries."* Volunteers on a security-conscious judging panel respond well to that.
Getting caught hiding it does not.

## 4. The differentiator: inter-assessor agreement (κ)

This is the highest-leverage item in the entire plan, and it is **zero UI work** — it is
arithmetic over data the system already stores.

### Why it matters

The PS names it as an explicit expected outcome:

> *"Evidence of consistency improvement over unassisted manual scoring (e.g., inter-assessor
> agreement on a test set)."*

Nearly every competing team will satisfy this with a slide saying *"our system is consistent."*
Very few will produce an actual agreement statistic. It is unglamorous, and unglamorous is
exactly why it gets skipped.

### How to do it rigorously

Cohen's κ for two assessors over *N* items and *K* categories:

```
κ = (P_o − P_e) / (1 − P_e)

P_o = observed proportion of agreement
P_e = Σ_k (p_ assessorA(k) × p_assessorB(k))   // chance agreement
```

To claim **improvement over unassisted scoring**, run the same candidate set twice:

| Condition | What happens |
|---|---|
| **Unassisted** | Two assessors score independently. AI panel hidden. Compute `κ_manual`. |
| **AI-assisted** | Same two assessors, AI rubric-suggestion panel visible. Compute `κ_assisted`. |
| **Report** | `κ_assisted − κ_manual`, with a 95% bootstrap confidence interval, and `N` stated. |

The data needed already exists: per-item correct counts and per-option distributions are written
on every submission (`analytics.service.ts:539` onwards). Cohen's κ itself is ~30 lines of
arithmetic — **no new dependency, no `package.json` change** (Boundary B).

### Honesty requirements — non-negotiable

1. **State `N`.** κ is badly behaved on small samples. Below ~30 paired items, report it as
   indicative only and say so.
2. **Report a null result if that is what you find.** If the AI panel does not improve agreement,
   say so. *"We measured it, here is the number, here is what it tells us"* is a stronger
   scientific claim than a favourable number with no methodology.
3. **Never present κ as proof of certification validity.** It measures assessor agreement, not
   competence. Overclaiming here re-breaks the "supports, not replaces" guarantee the PS demands.

### Why this survives contact with a judge

A judge can ask "how do you know it's consistent?" — a team without this has nothing but
assertion. This team has a number, a method, a sample size, and a confidence interval. That
exchange is the single highest-value moment available in the pitch.

---

## 5. Judge-hostile questions — short answers

**"Isn't this just a quiz app?"**
"The quiz is the delivery mechanism, not the product. The product is the assessment engine:
calibrated generation from official documents, a rubric that is centrally versioned rather than
per-assessor, and per-item statistics. Swap the quiz skin for any assessment UI and the engine
still works. Here is the evidence that the scoring is not in the UI —" (`quizzes/{id}/config/settings`).

**"How is this different from Kahoot?"**
Different category entirely — Kahoot is a live polling tool, this is a certification assessment
workflow with an assessor sign-off path, an audit trail, and inter-rater statistics. We are not
competing for classroom engagement.

**"What happens if the AI is wrong?"**
The assessor can reject any suggestion, and the final decision is theirs — the statement requires
the tool to support and not replace. We also flag questions whose content is weakly supported by
the source document at generation time (`generate-quiz-pdf-flow.ts:1239-1260`).

**"Does it work without internet?"**
Not yet, and we say so. Offline capture and sync are on the roadmap, scoped so they do not touch
the live app. What exists today is connectivity awareness — we detect disconnection and tell the
user. We chose not to claim offline capability we have not built.

**"Why should a certification body trust this?"**
Because it does not take the decision away from them. Our contribution is standardisation and
evidence — a defensible, versioned rubric plus a measured agreement statistic — while the
certification decision stays human and auditable.

---

## 6. Credibility rule

When a judge finds a gap, the correct response is **"correct, it is not built, here is the plan"**
— never a hedge, never a redirect. The gap analysis in this folder is the internal version of
that answer. The pitch version is in `02_PROBLEM_STATEMENT/OUR_PROBLEM_STATEMENT.md` §5, which
states the support/replace boundary explicitly rather than burying it.