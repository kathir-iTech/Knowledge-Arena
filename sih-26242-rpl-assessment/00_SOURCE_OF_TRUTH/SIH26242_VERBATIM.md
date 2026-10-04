# SIH26242 — VERBATIM SOURCE OF TRUTH

Every field below is reproduced **exactly as published** on the Smart India Hackathon portal.
Nothing is paraphrased, summarised, reordered, or "improved". Source typos and spacing quirks are
preserved deliberately and marked, because altering published text in a working reference is how
details get silently lost between one session and the next.

---

## Provenance

| | |
|---|---|
| Source URL | `https://www.sih.gov.in/sih2026PS` |
| First retrieved (UTC) | `2026-10-01 ~18:30` (full-page scrape of all 260 rows) |
| **Live re-verification (UTC)** | **`2026-10-01 18:40:38`** |
| Byte size at retrieval | `2,995,774` |
| Portal page integrity | **260/260 rows** carry `Deadline for Idea Submission` = `5 October 2026`. Exactly one distinct value across the whole page. |

### ⚠️ The idea count is already moving — this is not a stable number

Two live reads, three minutes apart, in the same session:

| Read (UTC) | Count |
|---|---|
| `2026-10-01 18:35:30` | **`4/500`** |
| `2026-10-01 18:38:39` | **`5/500`** |
| `2026-10-01 18:40:38` | **`5/500`** (stable across two further reads) |

One team registered between the first and second read. **Do not treat any cached figure in these
docs as current.** Re-run the extractor immediately before submitting:

```powershell
node extract-sih242.mjs
```

At 5/500 the statement is effectively untouched — there is no reason to rush on account of
competition. The binding constraint is the calendar, not the field.

Regenerate any time with:

```powershell
node extract-sih242.mjs
```

---

## Table row (verbatim, as it appears in the portal table)

```html
<td>SIH26242</td>
<td>5/500</td>
<td>Smart Education</td>
<td>5 October 2026</td>
```

---

## Published fields

| Field | Published value |
|---|---|
| Problem Statement ID | `26242` |
| Problem Statement Number | `SIH26242` |
| Title | `AI-Assisted Skill Assessment Tool for Recognition of Prior Learning (RPL)` |
| Organization | `Ministry of Skill Development and Entrepreneurship (MSDE)` |
| Department | `Ministry of Skill Development and Entrepreneurship (MSDE)` |
| Category | `Software` |
| Theme | `Smart Education` |
| YouTube Link | *(empty — the cell contains only an anchor with a blank href)* |
| Dataset Link | `NCVET RPL qualification packs (public); dummy worker-assessment data to be provided for hackathon evaluation.` |
| Contact info | *(empty — the cell contains only an anchor with a blank href)* |
| Submitted Idea(s) Count | `5/500` (live as of `2026-10-01 18:40:38` UTC — see drift note above) |
| Deadline for Idea Submission | `5 October 2026` |

---

## Description — VERBATIM

### Background of the Problem Statement:

A large share of India's workforce has acquired trade skills informally, through apprenticeship-style on-the-job experience rather than structured, certified training and has no formal credential to show for it. NCVET's Recognition of Prior Learning (RPL) framework exists precisely to certify such workers against NSQF levels without requiring them to repeat training they have effectively already completed. In practice, RPL assessment still depends heavily on manual practical evaluation by assessors, which is slow to scale, inconsistent across assessors and locations, and difficult to schedule for workers who cannot easily take time off. A structured, AI-assisted assessment tool that can evaluate an informal worker's practical competence against NSQF-aligned criteria combining structured self-declaration,practical task evaluation aids, and assessor-support scoring, would let RPL assessment scale reach far more of the informal workforce than manual-only assessment currently allows.

### Description of the Problem Statement:

The challenge is to build an AI-assisted RPL assessment tool that can:
- Guide a worker through a structured self-declaration of prior experience, mapped automatically to the closest relevant NSQF qualification pack(s).
- Support practical skill evaluation through guided task checklists, and where feasible,video- or image-based assessment aids that help an assessor score consistently against NSQF criteria.
- Standardise scoring rubrics across assessors and locations to reduce evaluator-to-evaluator variance in RPL outcomes.
- Generate an NSQF-aligned competency profile and certification recommendation for assessor sign-off (the tool supports, but does not replace, the human assessor's final decision).
- Work in low-connectivity settings, with offline data capture and later sync, given that much of the informal workforce is in semi-urban and rural locations.

### Expected Solutions / Outcomes:
- A working assessment workflow covering self-declaration through an assessor-facing scoring interface for at least one trade.
- An NSQF qualification-pack mapping engine.
- Evidence of consistency improvement over unassisted manual scoring (e.g., inter-assessor agreement on a test set).
- An offline-capable mobile/web interface.
- A clear description of where the tool supports versus replaces assessor judgement, to preserve certification integrity.

---

## Source quirks — preserved, not corrected

These are reproduced faithfully. Do not "fix" them in this file; if the portal text changes, the
extractor will surface the diff and *that* is when to update.

| Location | Quirk |
|---|---|
| Background, clause 2 | `structured self-declaration,practical task evaluation aids` — missing space after the comma |
| Description, clause 2 | `where feasible,video- or image-based assessment aids` — missing space after the comma |

Both are original. They are preserved here so that a future reader diffing this file against the
portal sees a true match rather than a silent discrepancy.

---

## Read this before treating the numbers as permanent

`5/500` was live-verified at `2026-10-01 18:40:38 UTC`, after drifting from `4/500` earlier the
same session. It moves in real time as teams register on the portal. If the count has climbed
sharply, the fallback candidates are:

| PS | Ideas at first scrape | Note |
|---|---|---|
| `SIH26241` — MSDE, *AI-Enabled Career Counselling and Family Decision-Support Platform for Vocational Education* | `0/500` | Weaker fit — requires regional-language conversational AI and a verified outcome-data backend. Translation is currently `410 Gone` in this codebase. |
| `SIH26245` — MSDE, *AI-Based Real-Time Monitoring of Training Centres* | `2/500` | **Not a viable fallback.** Requires live camera-feed video analytics, which this codebase does not do at all. |
| `SIH26246` — MSDE, *AI-Enabled Labour Market Intelligence and Skill Demand-Supply Forecasting Engine* | `2/500` | Requires labour-market data aggregation and forecasting; no overlap with the assessment core. |

Only `SIH26242` matches the Forge assessment engine. The others are different products.