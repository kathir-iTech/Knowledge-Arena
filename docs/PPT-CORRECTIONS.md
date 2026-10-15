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
