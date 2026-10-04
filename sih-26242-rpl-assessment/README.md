# SIH 2026 — Problem Statement 26242 Working Folder

**Target:** `SIH26242` — *AI-Assisted Skill Assessment Tool for Recognition of Prior Learning (RPL)*
**Organization:** Ministry of Skill Development and Entrepreneurship (MSDE)
**Theme:** Smart Education · **Category:** Software
**Status (live, re-verified `2026-10-01 18:56:08` UTC):** `5/500` ideas submitted · deadline **5 October 2026**

> This folder is a **local-only planning artifact**. It is not part of the Knowledge Arena
> application, it is not committed to git, and it is never pushed to GitHub.

---

## 1. What this folder is

It is the working set for entering **Quorena** (repo folder `Knowledge-Arena`) in SIH 2026
against problem statement 26242, and for answering one question honestly:

> *Which SIH 2026 problem statement does this codebase actually satisfy, and what would that
> statement say if we rewrote it around what we have already built?*

Nothing in here is code. Nothing in here ships. It is the evidence base for the pitch, the
gap analysis, and the build plan.

---

## 2. HARD BOUNDARIES — non-negotiable

These are stated separately from file-path isolation on purpose, because **path isolation alone
does not make the work safely portable.** Two files are shared infrastructure that *both*
branches read, and no amount of careful new-file placement protects them:

### Boundary A — Branch isolation
1. All SIH work lives on branch **`sih-26242-rpl`**, forked from `main` at `32c51b7`.
2. This branch is **never merged into `main` during the competition.** Judges receive a
   **Vercel preview URL**, not the production URL.
3. The Vercel **production branch setting is never modified.** A push to `main` deploys to
   production and the live URL the real pilot uses. That does not happen from this branch.

### Boundary B — Shared-file isolation (the one that is easy to get wrong)
Path isolation protects *application code*. It does **not** protect these two:

| Shared file | Risk if SIH work edits it carelessly | Required handling |
|---|---|---|
| `firestore.rules` | Widening or reordering rules can silently change behaviour for **every** collection, not just `rpl_*`. A single stray `allow` can expose live data. | SIH work adds **one** self-contained, clearly-delimited additive `match /rpl_.../` block, appended in its own region of the file. Never edits or reorders an existing `match` block. Verify with `npm run rules:generate` and the emulator suite before any commit. |
| `package.json` / `package-lock.json` | A new npm dependency changes the dependency graph for **both** branches and the lockfile produces merge conflicts that are painful to unwind later. | **If P0/P1 code work ever needs a new npm dependency, flag it explicitly and get sign-off before adding it.** Do not just add it. Prefer Node built-ins and already-present dependencies. |

### Boundary C — Post-SIH portability
The intent is that this work **folds back into the personal Knowledge Arena project after SIH
without rework.** That property only survives if it is designed in from day one, so:

- **No renames. No moves. No edits to existing files.** Every SIH artifact is a *new* file in a
  *new* path (`src/app/(rpl)/rpl/*`, `src/lib/rpl/*`, `rpl_*` collections).
- The eventual merge back to `main` must be **purely additive** and conflict-free.
- `03_ROADMAP/NON_INVASIVE_ARCHITECTURE.md` carries the step-by-step port-back plan.

---

## 3. The timeline has TWO gates — do not collapse them

This is the single most commonly misread thing about SIH, and getting it wrong is expensive.

| Gate | Date | What it is |
|---|---|---|
| Problem statements released | **August 2026** | PS live on the portal; institutes run internal hackathons against them. |
| **National idea submission** | **5 October 2026** | Every one of the 260 rows on the SIH portal carries the column `Deadline for Idea Submission` = `5 October 2026`. **This is the national portal's own field — not a college-internal date.** Teams are SPOC-nominated and submit ideas here. |
| Grand Finale | **December 2026** | Offline 36-hour build sprint. The exact date has **not** been independently confirmed on the portal — verify before relying on it. |

**"We have until December" is true only conditional on clearing 5 October.** October is the
gate *into* December, not a lesser one. Internal round is already cleared for this team.

---

## 4. Why 26242 and not the better-fitting statements

Two statements fit the codebase considerably better. Both are closed:

| PS | Why it fits | Why not |
|---|---|---|
| `SIH26101` — MoSPI, *AI-enabled learning platform… generates Quizzes and MCQs from uploaded learning materials* | Near-verbatim match to the Forge pipeline. The single closest statement published. | **`500/500` — closed.** |
| `SIH26075` — MoES (IMD), *CAPACITY CONNECT* LMS | Structural 1:1: Trainee/Trainer/Admin maps to gladiator/commander/executive, subject-wise MCQs, trainer library, admin dashboards, announcements. | **`497/500` — effectively closed.** |

The cap is **500 ideas per problem statement**. Teams reaching it are genuinely blocked and have
had to switch statements mid-competition. **`SIH26242` at `5/500` is effectively untouched.**

That count is **live and moves** — it drifted `4/500 → 5/500` in three minutes during
preparation. Re-verify before submitting with `node 00_SOURCE_OF_TRUTH/extract-sih242.mjs`.

`SIH26242` is the best *available* fit, not the best possible fit, and the pitch should never
pretend otherwise.

---

## 5. Folder map

```
00_SOURCE_OF_TRUTH/
  SIH26242_VERBATIM.md     Exact scrape of every published field. Nothing paraphrased.
  extract-sih242.mjs       Re-runnable extractor. Node built-ins only, no dependencies.

01_ANALYSIS/
  01_coverage_matrix.md    Clause-by-clause: PS clause -> our capability -> status -> file:line
  02_gap_analysis.md       What is genuinely missing, and how to answer judges without overclaiming

02_PROBLEM_STATEMENT/
  OUR_PROBLEM_STATEMENT.md The rewritten PS in official SIH format
  PITCH_6_SLIDES.md        Outline mapped to the official SIH Idea PPT format

03_ROADMAP/
  PRIORITISED_GAPS.md      P0/P1/P2 build plan with effort estimates
  NON_INVASIVE_ARCHITECTURE.md  Import-reuse-never-fork rules + post-SIH port-back plan

04_SUBMISSION/
  SUBMISSION_CHECKLIST.md  Compliance + two-gate timeline + day-by-day countdown
  DEMO_SCRIPT.md           4-minute judge walkthrough using only verifiable live features
```

---

## 6. The one-line answer

> **Knowledge Arena already contains the hardest technical capability this statement asks for** —
> turning uploaded NCVET qualification-pack documents into calibrated, scored assessment items
> that are traceable to the source document. Its 3-role RBAC maps to worker/assessor/admin. Its
> per-item analytics are the raw material for the one thing almost no competing team will
> compute: a **real inter-assessor agreement statistic**. What it does **not** yet have is offline
> capture, NSQF pack mapping, video evidence, scanned-page ingestion, and that agreement metric —
> which is precisely the roadmap.

**Do not overclaim.** Translation returns `410 Gone`. IRT/CAT is test-only with `discrimination`
structurally `null`. Firebase Storage has zero uploads. There is no SSO. **A scanned PDF with no
text layer is rejected, not read** — do not write "including scanned pages" anywhere.
`01_ANALYSIS/02_gap_analysis.md` exists to keep the pitch on the right side of that line, and
it also records why `FEATURES_COMPLETE.md` must **not** be quoted: it claims capability guards
that no API route actually uses. **Cite code, never the repo's feature docs.**

---

## 7. Verify the ignore rails at any time

```powershell
git check-ignore -v sih-26242-rpl-assessment/     # must resolve to .git/info/exclude
git status --short                                # must show nothing for this folder
git rev-parse --abbrev-ref HEAD                    # must be sih-26242-rpl
```