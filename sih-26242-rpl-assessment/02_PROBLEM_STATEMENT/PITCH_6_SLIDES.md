# Pitch Outline — SIH 2026 Idea PPT

**Target:** `SIH26242` · MSDE · Smart Education · Software
**Template:** the official SIH 2026 Idea Presentation format
(`https://www.sih.gov.in/letters/2026/SIH2026-IDEA-Presentation-Format.pptx`)

Download the official template and use **its** layout. This is the narrative to place inside it,
not a substitute for it. Never restyle the SIH-branded template.

---

## Slide 1 — Title

> **Recognise What Workers Already Know**
> An AI-Assisted Assessment Engine for Recognition of Prior Learning (RPL)
> Team · PSG iTech · Problem Statement 26242

Team name, college, and PS number. Nothing else.

## Slide 2 — The problem

- Informal workers hold real trade skills and no credential. RPL exists to fix exactly this.
- RPL assessment is still manual, assessor-by-assessor. It does not scale, it is not consistent,
  and it produces no evidence.
- **The inconsistency is the real problem.** Two assessors can certify two identical candidates
  differently — and nobody can measure that, because manual scoring leaves no comparable record.
- Ask: *who here has been assessed by two different assessors and got two different results?*

That question is the hook. Let it sit for a beat.

## Slide 3 — Why existing tools miss it

- AI in assessment mostly generates *content*. Content was not the bottleneck.
- The bottleneck is **rubric consistency and inter-rater reliability**.
- Almost nothing measures whether an assistive tool actually improves agreement. Vendors assert;
  they rarely publish a number.
- **We measure it.** That is this project.

## Slide 4 — Our solution, three mechanisms

| # | Mechanism | One line |
|---|---|---|
| 1 | **Grounded assessment generation** | An NCVET pack becomes a calibrated, source-traceable assessment. |
| 2 | **Centrally versioned rubric** | The rubric is one document, not one assessor's habit. Two assessors *structurally cannot* diverge. |
| 3 | **Measured inter-rater agreement** | Cohen's κ, unassisted vs assisted, with CI and sample size. |

Mechanism 3 is the differentiator. Give it the most space on the slide.

## Slide 5 — Workflow and roles

Worker → declaration → pack mapping → assessment → assessor administers → competency profile →
recommendation → **assessor signs** → agreement reported to administrator.

Show the three roles: **Worker · Assessor · Scheme administrator.**

Put the sign-off step in a visually distinct box. It is the trust argument.

## Slide 6 — Built vs roadmap

Two honest columns. Never one column pretending to be both.

**Already built and demoable**
- PDF/DOCX/TXT/MD/image ingestion → generated assessment items
- Source-document grounding with weak-support warnings
- Content-hash caching, chunking, model fallback chain
- Centrally versioned, gated scoring configuration
- Server-authoritative scoring, transaction-safe, idempotent submissions
- Three-role RBAC with server-side enforcement and Firestore rules
- Per-item analytics, distractor analysis, difficulty-calibration flags
- Analytics dashboards, replay, CSV/JSON export, audit trail

**Building for this problem**
- NSQF qualification-pack mapping engine
- Structured worker self-declaration
- **Inter-assessor Cohen's κ with confidence intervals**
- Offline capture and sync (scoped to the RPL route only)
- Assessor sign-off workflow with decision audit chain

A judge who sees an honest split trusts everything above it. A judge who spots a fake "built" item
stops trusting the whole deck.

## Slide 7 — What we measure

- `κ_manual` vs `κ_assisted`, delta with 95% bootstrap CI, `N` stated
- McNemar's test for the paired disagreement change
- Reported **even if null**
- Per-item difficulty and distractor profiles
- Assessor-level agreement heatmap across locations

State the sample size and the limitation. Statistically literate judges reward this.

## Slide 8 — Where the human stays in charge

Quote the boundary directly from the statement:

> *"the tool supports, but does not replace, the human assessor's final decision"*

- AI output is a suggestion. Assessors accept, modify, or reject.
- **No certification is emitted without a named human sign-off.**
- Every decision carries an audit record: who, when, on what basis.

## Slide 9 — Architecture that survives production

- Next.js 15, TypeScript strict, Firebase (Auth, Firestore, Realtime DB), Gemini via Genkit
- Answer path is **server-write-only**; Admin-SDK transactions for all score mutation
- Idempotent submissions, Firestore-backed distributed rate limiting
- Three-layer authorisation: route guards, API role checks, Firestore security rules
- Deployed and exercised against live production, not a local mock

Point at a real screen, not an architecture diagram, if the demo allows it.

## Slide 10 — Team & ask

- 6 members, ≥1 female, same institution, majority strong programming skills (SIH requirement)
- Roles: AI/prompt engineering · backend & data · security & rules · frontend · design · QA/pitch
- What we need from MSDE: one NCVET qualification pack, and the dummy worker-assessment dataset
  the statement already offers

Ask for the dataset explicitly. It shows you read the statement and it makes your κ computation
real rather than hypothetical.

---

## Craft notes

- **Six slides is a guideline, not a limit.** Six tight slides beat twelve padded ones.
- **Demo over decoration.** Slide 9's credibility is best won by letting a judge drive.
- **Rehearse the offline question.** It is the obvious objection and the answer is in
  `../01_ANALYSIS/02_gap_analysis.md` §5.
- **Rehearse the scanned-PDF question.** Also in §4 and §1. Do not be surprised by it.
- **Have the real test numbers memorised** — including `N`. A judge asking for the sample size and
  getting an answer is a very different experience from getting a deflection.