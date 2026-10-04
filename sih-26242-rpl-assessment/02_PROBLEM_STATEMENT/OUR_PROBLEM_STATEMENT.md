# Our Problem Statement — Knowledge Arena as an RPL Assessment Engine

**For:** SIH 2026 · `SIH26242` · Ministry of Skill Development and Entrepreneurship
**Theme:** Smart Education · **Category:** Software

This is the same problem statement, restated in the platform's own terms. It exists for two
reasons: to align the pitch to the exact published wording, and to make the "supports, not
replaces" boundary an explicit, structural part of the design rather than a footnote.

The published text is the authority. Where this document paraphrases, the original always wins.
See `00_SOURCE_OF_TRUTH/SIH26242_VERBATIM.md`.

---

## 1. Background

India's skilling economy certifies a large informal workforce under NCVET's Recognition of Prior
Learning framework, so that workers with real trade experience can be assessed against NSQF
levels without repeating training they have already effectively completed.

RPL assessment still depends heavily on **manual practical evaluation by individual assessors**.
That model has three structural failures, and they compound:

1. **It does not scale.** Assessment capacity is bounded by assessor availability, so informal
   workers in semi-urban and rural locations — who often cannot take time off — are systematically
   under-assessed.
2. **It is not consistent.** Each assessor applies their own interpretation of criteria. Outcomes
   therefore vary by assessor and by location for candidates whose actual competence is identical.
   That variance degrades the credibility of every certification the scheme issues.
3. **It produces no evidence.** Manual scoring leaves no auditable record of *why* a decision was
   reached, so inter-assessor agreement cannot be measured, audited, or improved. There is
   consequently no evidence base showing whether any assistive tool improves consistency.

Existing AI efforts target assessment *content generation*. Almost none target **rubric
standardisation and inter-rater reliability** — which is where the actual inconsistency lives.

## 2. What we propose

An **AI-assisted RPL assessment platform** that keeps the certification decision firmly with the
human assessor, while attacking variance with three mechanisms:

### 2.1 Document-grounded assessment generation

An NCVET qualification pack uploaded once becomes a calibrated, scored assessment. The engine
extracts the pack, identifies its competency elements, and generates task-oriented items anchored
to the source text — so assessment content is traceable to the official document rather than
invented. Item generation accepts PDF, DOCX, TXT, MD and image inputs, chunking long documents,
caching by content hash so the same pack is never paid for twice, and running a model fallback
chain with per-model retries for resilience.

*Known limit, stated plainly: a scanned PDF with no text layer is rejected with a clear error
rather than silently mis-parsed. Text-layer documents are handled at up to 500,000 characters and
24 images.*

### 2.2 A centrally versioned rubric

The scoring rubric lives in a **single versioned document per assessment**, not in application
code and not in each assessor's head. Two assessors administering the same assessment are
structurally unable to diverge on the rubric — this is guaranteed by architecture, not by
training. Scoring rules, pass thresholds, and applicability conditions are configured once and
applied identically to every candidate.

### 2.3 The inter-assessor agreement statistic

This is the core contribution. We do not assert our approach improves consistency; **we measure
it.**

Two assessors independently score the same candidate set under two conditions — AI rubric
suggestions hidden, then visible. We compute Cohen's κ for each condition and report the delta
with a confidence interval and an explicit sample size.

- `κ_manual` — inter-assessor agreement, unassisted.
- `κ_assisted` — inter-assessor agreement, AI-assisted.
- **Reported delta**, with `N` and a 95% bootstrap CI.

If the delta is null, we report that. A measured null result with sound methodology is a stronger
scientific claim than a favourable number produced without one, and certification bodies need the
first kind of evidence far more than they need another vendor assertion.

### 2.4 Human authority preserved

Every AI output is a **suggestion an assessor can accept, modify, or reject**. The competency
profile and certification recommendation are inputs to an assessor's decision, never a substitute
for it. The platform records who decided what, when, and on what basis.

## 3. Target users and workflow

| Role | Function in RPL terms | Platform role |
|---|---|---|
| **Worker** | Informal worker claiming prior competence | Gladiator — declared experience, completes the assessment |
| **Assessor** | Certified assessor conducting evaluation | Commander — authors the assessment, controls delivery, scores, signs off |
| **Scheme administrator** | NCVET / Sector Skill Council | Executive — oversight across assessors, locations, and cohorts |

**End-to-end flow:** worker self-declares prior experience → declaration maps to candidate NSQF
qualification pack(s) → pack is ingested and converted into a calibrated assessment → assessor
administers it under the versioned rubric → per-item competency profile is produced → system
proposes a certification recommendation → **assessor reviews and signs** → agreement statistics
are computed across assessors and surfaced to the administrator.

## 4. Expected solution

- **AI-powered RPL assessment generation** from uploaded NCVET qualification packs, with every
  generated item traceable to its source document and weakly-supported items flagged at creation.
- **NSQF qualification-pack mapping engine** mapping declared experience to the closest relevant
  pack and its competency elements.
- **Structured worker self-declaration** flow feeding the pack-mapping engine.
- **Centrally versioned scoring rubric** applied identically across all assessors and locations.
- **NSQF-aligned competency profile** built from per-item statistics — difficulty, discrimination
  proxies, distractor analysis and response-time behaviour — updated as evidence accumulates.
- **Assessor sign-off workflow** with a decision audit trail; the platform supports the decision
  and never makes it.
- **Inter-assessor agreement reporting** (Cohen's κ, with confidence intervals and sample size)
  measured unassisted versus assisted.
- **Analytics and dashboards** at candidate, assessor, cohort and scheme level, with CSV/JSON
  export for audit.
- **Secure role-based access** with domain-scoped assessment access and server-side enforcement.

## 5. Where the tool supports versus replaces assessor judgement

The statement requires this be explicit, so it is stated explicitly rather than buried.

| The tool **DOES** | The tool **DOES NOT** |
|---|---|
| Generate candidate assessment items grounded in official documents | Decide whether a candidate is competent |
| Surface rubric-based scoring suggestions | Override or constrain an assessor's decision |
| Compute and present per-item competency statistics | Convert statistics into an automatic certification |
| Measure and report inter-assessor agreement | Evaluate what the agreement means for validity |
| Record the audit trail of decisions | Sign on an assessor's behalf |

**Any certification outcome in this platform originates from a named human assessor.** The system
measures, standardises and evidences. It does not certify. This boundary is a product
requirement, not a disclaimer — the architecture has no path that emits a certification without
an identified human sign-off.

## 6. What we are not claiming

Stated here so the deck and the demo stay honest:

- No offline capture or sync today — connectivity awareness only. On the roadmap.
- Scanned PDFs without a text layer are rejected, not auto-OCR'd.
- No multilingual support. Translation is not implemented.
- Adaptive testing exists as a library but is not wired into the product.
- Inter-rater statistics are a roadmap deliverable, currently unbuilt — which is precisely why
  §2.3 is the project's focus rather than a footnote.