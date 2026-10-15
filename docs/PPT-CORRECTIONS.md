# PPT / pitch corrections — κ and other unverified numbers

Purpose: the presentation (and any marketing copy) must not show numbers the
app cannot produce. This file lists every **κ claim we are aware of**, the
**value the app actually computes**, and a suggested replacement. It is the
actionable companion to the note in `docs/RPL-COMPASS-PROJECT-GUIDE.md`
("PPT claims κ = 0.71 and 0.58. Our seeded data computes κ = 0.3846 … Never
show invented numbers as real results.").

Scope note: the only deck in this repo, `docs/HACKVERSE_PPT.md`, is the
**Knowledge Arena quiz-platform** deck and contains **no κ claims**. The RPL
Compass deck with the 0.71 / 0.58 figures is **not in this repository**, so it
is corrected here rather than edited in place.

## The numbers the app really computes

Computed from the seeded demo ratings in `src/lib/rpl/demo-data.ts` with the
app's own `src/lib/rpl/kappa.ts` (Cohen's linear-weighted κ, 4 ordered
categories, Fleiss/Cohen/Everitt 95% CI). Command used:

```
npx tsx scripts/_tmp-kappa-values.mjs      # temporary, prints DEMO_RATINGS kappas
```

Output (n = number of paired item scores per pack):

```
ele: kappa=0.3846 Fair CI[-0.03, 0.80] n=8
con: kappa=0.7647 Substantial CI[0.33, 1.00] n=8
ssc: kappa=0.4545 Moderate CI[-0.06, 0.97] n=8
```

| Pack | Claim seen in deck | Actual computed κ | Interpretation | 95% CI | N |
| --- | --- | --- | --- | --- | --- |
| ELE/Q1301 (Electrician) | **0.71** / **0.58** | **0.3846** | Fair | −0.03 … 0.80 | 8 |
| CON/Q0304 (Plumber) | (none) | **0.7647** | Substantial | 0.33 … 1.00 | 8 |
| SSC/Q2212 (IT-ITeS Data Entry) | (none) | **0.4545** | Moderate | −0.06 … 0.97 | 8 |

**0.71 and 0.58 are not produced by anything in the app.** Do not present them
as results. The honest ELE figure is 0.3846 and it is *deliberately low*: it is
the demo case that makes the low-agreement alert fire (`κ < 0.4`). Present that
as the feature working, not as a failure.

Also corrected: the landing consistency panel previously showed "ELE/Q1301 ·
N = 42 item-pairs" with κ 0.78/0.64/0.35. Those were invented, and the seeded
ELE pack has **N = 8**, not 42. The landing panel is now labelled **Sample
data** and no longer attributed to a real pack as a live result (see
`src/components/landing/LandingShowcases.tsx`).

## Suggested replacement copy

**If your deck has an "accuracy" or "agreement" slide with 0.71 / 0.58:**

> Inter-assessor agreement is computed live with Cohen's linear-weighted κ
> (95% CI, Landis & Koch band), never hard-coded. In our seeded demo the
> Electrician pack (ELE/Q1301, N = 8 overlapping item-pairs) sits at
> **κ = 0.38 (Fair, CI −0.03–0.80)** — on purpose, because that is exactly the
> case the tool is built to catch: it raises an admin calibration alert instead
> of rubber-stamping the certificate.

**If you want to show a "good agreement" example,** use the Plumber pack:
**CON/Q0304, κ = 0.76 (Substantial, CI 0.33–1.00)** — a genuinely computed
value, and label it "synthetic demo data".

Rules for the slide:

1. Never state a κ the app did not compute. Re-derive it or omit it.
2. Always show N with κ (small N ⇒ wide CI ⇒ "preliminary").
3. Label seeded numbers **synthetic demo data**, never "pilot results".
4. Frame low κ as *detection*, not as tool accuracy.

## Claim classification (required labels)

Each checkable claim below is marked **VERIFIED-BY-TEST** (an automated test
asserts it — name cited), **BUILT-NOT-TESTED** (the code exists, no automated
test asserts it), or **NOT-BUILT** (not in the app). Status is as of the
current tree; re-check after any refactor.

| # | Claim (as a slide might state it) | What the app actually does | Label + evidence |
| --- | --- | --- | --- |
| 1 | "κ = 0.71 / 0.58" | Nothing in the app produces these. Seeded ELE/Q1301 computes **κ = 0.3846 (Fair)**. | Honest correction in this file (see table above). The 0.3846 value itself is VERIFIED-BY-TEST: `tests/rpl-demo-guide.spec.ts` — "after Load demo data, every walkthrough step shows Ready" (asserts the κ text and the fired alert). |
| 2 | "Per-criterion 1–4 rubric" | Assessors score each criterion 1–4 (`src/app/(rpl)/rpl/assess`, `assess/[assessmentId]`); score maths in `src/lib/rpl/scores.ts`. | BUILT-NOT-TESTED as a range claim: `scripts/test-scores.mjs` covers the score formulae (ALL SCORES TESTS PASSED) but no test asserts the 1–4 range end-to-end. |
| 3 | "κ < 0.4 raises a calibration alert" | `src/lib/rpl/kappa-monitor.ts` (`< 0.2` critical, `< 0.4` warning) + `GET /api/rpl/admin/overview` kappa-alert events; ELE/Q1301 (0.3846) fires it by design. | VERIFIED-BY-TEST: `tests/rpl-demo-guide.spec.ts` — every-step-Ready asserts step 2 reads "Ready" with the alert present. |
| 4 | "Offline-first: declare offline, sync later" | Declare POST fails offline → IndexedDB queue (`offline-store.ts`) → replay with a fresh token on reconnect (`offline-sync.ts`); SW answers 202 and never replays itself. | VERIFIED-BY-TEST: `tests/rpl-offline-mobile-axe.spec.ts` — "offline replay: exactly one POST with a fresh token, no duplicate"; `scripts/test-offline-sync.mjs` (ALL OFFLINE-SYNC TESTS PASSED); `scripts/test-sih-gaps.mjs` B9 (SW 202 contract). |
| 5 | "English / Hindi / Tamil UI" | Declare wizard is trilingual (`src/lib/rpl/i18n.ts`); HI/TA are machine-drafted, English authoritative, disclosed in-app. | VERIFIED-BY-TEST with caveat: `scripts/test-i18n.mjs` (428 checks: key parity, truncation, placeholders, mixed-script) + `tests/rpl-i18n.spec.ts` (banner renders). Native-speaker review is still open — see `docs/i18n-review.md`. |
| 6 | "AI suggestions are flagged, never silent" | `aiSuggestionUsed` is persisted `true` only when `aiAccepted === true && aiProposedScore === rubricScore` on ≥1 item (`src/app/api/rpl/assess/route.ts`); unassisted/assisted κ split in `recompute-consistency.ts`. | BUILT-NOT-TESTED: the conditional is code-verified (above) but no test asserts the flag flips only on apply. |
| 7 | "CON/Q0304 κ = 0.7647, SSC/Q2212 κ = 0.4545" | Computed from `DEMO_RATINGS` with the project's `kappa.ts` (see output block above); demo load returns them in `packs[]`. | BUILT-NOT-TESTED as exact numbers: no spec asserts 0.7647/0.4545 literally (the demo-guide Load test asserts a `kappa` line is present, not its values). Re-derive before quoting. |

## DemoBadge audit — every surface that shows a demo-derived κ

`DemoBadge` renders only when the backing doc carries `isDemoData: true`
(never a hard-coded string), so real data is never mislabelled.

| Surface | κ shown | Labelled? | How |
| --- | --- | --- | --- |
| `/rpl/consistency/[packId]` overall + pairs | overall κ, pair κs, per-criterion κs | Yes | `<DemoBadge isDemoData={report.isDemoData}>` (pre-existing). |
| `/rpl/admin` per-pack rows | pack κ + interpretation | Yes | `<DemoBadge isDemoData={pack.isDemoData}>` (pre-existing). |
| `/rpl/admin` Inter-assessor agreement gauge | average κ across packs | Yes (this pass) | Badge + "· includes demo-seeded packs" when a demo pack with non-null κ contributes. |
| `/rpl/assessor` My consistency vs panel | pack κ, pair κs | Yes (this pass) | `GET /api/rpl/assess/my-consistency` now returns `isDemoData` per pack; badge next to the pack title. |
| Assessor nav chip (sidebar) | avg κ | Yes (this pass) | Same endpoint flag; `<DemoBadge>` beside the κ chip when demo contributes. |
| Alert texts (`kappa-monitor.ts`, admin overview kappa-alert events) | κ in the message string | Yes (this pass) | Messages append `" (demo data)"` when the consistency doc is demo-seeded (alerts render as plain text with no badge slot). |
| Landing consistency panel | illustrative κs | Equivalent | Labelled **Sample data** with an "illustrative, not a live result" caption (Part 7); the landing is marketing, not an RPL surface, so it uses the sample-data label instead of the DemoBadge component. |
| `/rpl/admin/demo-guide` expected numbers | κ in the presenter script | Equivalent | Page header carries a "Synthetic demo data" badge; footer points at this file before quoting numbers. |

## Other numbers in the deck to verify before presenting

These are plausible but were not verified in this pass — either measure them or
soften the wording:

- "30+ REST endpoints" — count them from `src/app/api/**/route.ts` or say "30+".
- "99.9% uptime" (Slide 6 visual) — not measured anywhere; drop it or replace
  with "multi-model fallback + retry".
- "5 req/min per user" rate limit and "10 MB PDF" cap — confirm against
  `src/app/api/**` limits before stating exact figures.
- "500 base + 500 speed bonus" scoring — confirm against the quiz scoring code.
- Roadmap quarters (Q2–Q4 2026) — these are intentions, not shipped features;
  keep them clearly under "future scope".

## What was intentionally NOT changed

- **Seeded ratings are unchanged.** `ELE/Q1301` must keep computing κ = 0.3846
  (the required `κ < 0.4` alert demo). Re-tuning the ratings to hit 0.71 would
  either be fabricated or would break the demo's point.
- **No "improved seed" was added.** A higher-agreement dataset would have to be
  a second, clearly-labelled synthetic pack; that is a product decision for the
  team, not a code fix, and changing the existing arrays risks the 0.3846
  invariant. Recommended instead: present CON/Q0304 (κ = 0.76) as the
  "good agreement" example, labelled synthetic.
