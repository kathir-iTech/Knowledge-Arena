# Submission Checklist — SIH 2026

**Target statement:** `SIH26242` · MSDE · Smart Education · Software
**Prepared:** `2026-10-01` · **Idea submission deadline:** `5 October 2026`
**Internal round:** ✅ already cleared (per team)

---

## 1. THE TIMELINE HAS TWO GATES — DO NOT COLLAPSE THEM

| Gate | Date | Status |
|---|---|---|
| Problem statements released | August 2026 | ✅ |
| Internal hackathon + SPOC nomination | before submission | ✅ **done** |
| **GATE 1 — National idea submission** | **5 October 2026** | ⬜ **~4 days** |
| **GATE 2 — Grand Finale, offline 36-hour build** | **December 2026** | ⬜ upcoming |

**Why this matters:** every one of the 260 rows on the SIH portal carries the column
`Deadline for Idea Submission` = `5 October 2026`. That is the **national portal's own field**,
not a college-internal date.

> *"We have until December, so there's no rush"* is **half true.** December is real — SIH's
> Grand Finale is a 36-hour offline build sprint. But it is reached **only by clearing 5
> October**. October is the gate into December, not a lesser version of it.

**Strategic consequence:** Gate 1 is a *submission*, not a build. What must exist on 5 October is
a credible proposal — problem fit, approach, team, and a plan. Gate 2 is where the build is judged.
This is the single most useful reframe for how to spend the next four days.

---

## 2. Hard eligibility requirements (from the SIH FAQ)

| Requirement | Rule | Note |
|---|---|---|
| Team size | **Exactly 6 members**, including the leader | |
| Female member | **At least one** — mandatory | |
| Institution | **All members from the same college** | Inter-college teams are not permitted |
| Branches | Members may be from different disciplines **within** the institution | Encouraged |
| Software majority | **Majority must have strong programming skills** | Mandatory for the Software edition |
| Ideas per team | **Maximum 2 ideas** | Choose one; do not dilute |
| Internal hackathon | **Mandatory**, with a report in the required format | ✅ done |
| Entry route | College SPOC nominates on the portal | SPOC logs in at `sih.gov.in` |
| External participants | Distance / part-time / working professionals — **not eligible** | |
| Prize | INR 1.5 lakh | |
| Mentors | After shortlisting, up to 2, each with 5+ years' experience | Post-shortlisting only |

**Note:** universities and institutes **cannot submit problem statements** for SIH 2026 — they can
only nominate students or act as nodal centres. Irrelevant to us as an entrant, but relevant if
anyone suggests pitching your own statement instead of an official one.

---

## 3. Team assembly

Six seats, one institution:

| Seat | Suggested owner | Why |
|---|---|---|
| 1 · Team Leader | — | SPOC coordination, final submission |
| 2 · AI / prompt engineering | — | Forge pipeline, grounding, mapping model calls |
| 3 · Backend & data | — | Firestore schema, `rpl_*` collections, κ computation |
| 4 · Security & rules | — | `firestore.rules` block, role enforcement, audit chain |
| 5 · Frontend / UX | — | RPL routes, declaration flow, consistency report UI |
| 6 · QA / pitch | — | Test gate, κ fixtures, demo rehearsal |

**Constraint:** seat 6 may be filled by the only female member, and at least one seat must be.

---

## 4. Countdown — from today (Thu 1 Oct 2026)

| Day | Date | Deliverable |
|---|---|---|
| **1** | Thu 1 Oct | ✅ *This folder built.* P0-1 declaration flow, P0-2 NSQF mapping |
| **2** | Fri 2 Oct | **P0-3 Cohen's κ + tests.** Start drafting the Idea PPT |
| **3** | Sat 3 Oct | PPT complete. Dry-run demo end to end. |
| **4** | Sun 4 Oct | Re-verify idea count. Finalise PPT. **Submit early — do not leave it to the last hour.** |
| — | **Mon 5 Oct** | **Deadline. Submission is what counts.** |
| Nov | | Shortlisting, mentor nomination, Grand Finale prep |
| **Dec** | | **GATE 2 — Grand Finale, 36-hour offline build** |

**Submit on 4 October.** Portals degrade under deadline load, and there is no upside to
submitting at 23:57 on the final day.

---

## 5. Before submitting

### Technical
- [ ] `npm run typecheck` clean
- [ ] `npm run lint` clean
- [ ] `npm test` green (8 Playwright specs)
- [ ] `git diff --stat HEAD` shows **only new files**
- [ ] `git diff --name-only HEAD -- firestore.rules package.json package-lock.json` prints **nothing**
- [ ] Demo runs from a **Vercel preview URL** — never the production link
- [ ] Demo rehearsed with a **digital-native** NCVET pack (a scanned pack will hit the known limit)

### Narrative
- [ ] Fit to `SIH26242` stated in the published statement's own vocabulary
- [ ] The **support/replace** boundary stated explicitly, unprompted
- [ ] Cohen's κ framed as a **measurement commitment**, not a claim of superiority
- [ ] Sample size `N` decided in advance, even if the demo data is small
- [ ] Known limits stated proactively — offline, scanned PDF, no translation

### Administrative
- [ ] SPOC has portal credentials and is ready to submit
- [ ] All 6 members confirmed, same institution, ≥1 female
- [ ] Internal hackathon report submitted in the required format
- [ ] Only **one** idea submitted against `SIH26242` (2 is the cap; 1 is the strategy)
- [ ] **Re-verify the idea count** — it drifted `4/500 → 5/500` in three minutes on 1 Oct

---

## 6. Live re-verification

```powershell
node 00_SOURCE_OF_TRUTH/extract-sih242.mjs
```

Prints the current idea count, deadline, every published field, and the full verbatim
description. **Run this immediately before submitting.**

Fallback if the statement is closed (it reaches 500/500): `SIH26241` is the only other
plausible option, but it is a **weaker fit** — it needs regional-language conversational AI and
a verified outcome-data backend, and translation is not implemented. `SIH26245` is **not** a
fallback: it requires live camera-feed video analytics, which this codebase does not do at all.

---

## 7. Contamination check

This folder is **local-only** and must never reach GitHub:

```powershell
git check-ignore -v sih-26242-rpl-assessment/   # must resolve to .git/info/exclude
git status --short                                # must show nothing for this folder
git rev-parse --abbrev-ref HEAD                    # must be sih-26242-rpl
```

Run these immediately before any `git add`, `git commit`, or `git push`. The SIH working folder
stays on this machine; the Knowledge Arena project stays clean and deployable.