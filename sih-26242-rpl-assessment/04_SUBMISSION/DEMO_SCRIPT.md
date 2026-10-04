# Demo Script — SIH 2026 · SIH26242

**Target runtime:** 4 minutes of live demo, then Q&A.
**Hard rule:** demo a **preview** URL. Never the production link. Never `main`.

The demo has one job: prove the platform is a real, working system and that the human stays in
charge. It is not a feature tour. Every minute spent showing a feature the pitch already claims
is a minute not spent answering the question judges actually have.

---

## Before you present — 5 minutes of setup

- [ ] Preview URL open, cached, logged in as a Commander (assessor).
- [ ] Second browser profile logged in as a second Commander. **This is essential** — you cannot
      demonstrate inter-rater agreement with one person.
- [ ] NCVET qualification pack ready, **digital-native** (text layer present). See the warning below.
- [ ] Slide 7 (what we measure) on screen while you present. Do not rush past it.
- [ ] Know your `N` and your actual test figures. No hedging on numbers.

> **Scanned-pack warning:** if you upload a scanned PDF with no text layer, the Forge rejects it
> with `PDF_IMAGE_ONLY`. Have a digital-native pack as the primary demo asset and a scanned one
> as a *deliberate* demonstration of graceful failure — see §6. Never let it surprise you live.

---

## §1 · The hook — 30 seconds

> "Two workers. Identical skills. Two different assessors. One gets certified, one doesn't.
> Neither assessor is wrong — they just read the criteria differently. Nobody can even tell you
> how often this happens, because manual scoring leaves no record to compare.
>
> We're an RPL assessment engine, and the thing we build is a **measurement** of that
> disagreement."

**Do not** start with the product. Start with the inconsistency.

---

## §2 · Grounded generation — 60 seconds

1. Upload the NCVET qualification pack.
2. Show the parsing: chunks, content hash, the pack structure.
3. Generate the assessment. Point out the **content-hash cache** — re-uploading the same pack costs
   nothing. It is a small detail and it signals you understand production cost.
4. **Open one generated question and show the source anchor.** This is the credibility beat: the
   question is traceable to the official document.
5. Show a flagged question — content weakly supported by the source. The platform tells you it is
   not confident.

> "If the system can't ground a question in the official document, it says so at generation time.
> That's the difference between an assessment tool and a text generator."

---

## §3 · The versioned rubric — 45 seconds

1. Open `quizzes/{id}/config/settings`.
2. Change the pass threshold, or show the gating.
3. State the claim plainly: **the rubric is one versioned document, applied identically to every
   assessor, at every location.** Two assessors cannot diverge on the rubric because the rubric
   does not live in their heads.
4. Show the role switch. Worker · Assessor · Scheme administrator.

Do not over-claim. Say "structurally identical", not "guaranteed accurate". The rubric is
standardised; whether it is *valid* is a separate question and a separate study.

---

## §4 · The scorer — 45 seconds

1. Run an assessment in the worker view.
2. Deviate deliberately: submit an out-of-order or replayed submission to show it is rejected.
3. Show the audit log entry.
4. One line: **the answer path is server-write-only, scoring is transaction-safe and idempotent,
   and rate limiting is Firestore-backed.**

This section exists for the technical judges. Twenty-five seconds is enough — they want to see
that you know where the real security boundary is, and that you tested it.

---

## §5 · The differentiator — κ — 90 seconds

**This is the centre of the demo. Do not rush it. Do not skip it even if you are running late.**

1. Show the same candidate set scored by two assessors, unassisted → `κ_manual`.
2. Switch on the rubric-suggestion panel → `κ_assisted`.
3. Show the report: both values, the **delta**, the **95% bootstrap confidence interval**, the
   **per-category confusion matrix**, and **`N`**.

Say this, close to verbatim:

> "We don't claim our tool improves consistency. We measure it. `κ_manual` was X, `κ_assisted`
> was Y, the delta is Y−X with a confidence interval of [L, U] across N paired assessments.
>
> **If the interval contains zero, our tool did not improve agreement** — and we'd report that,
> because a ministry deciding on certification policy needs the number, not the reassurance."

Then the follow-up that most teams will not have ready:

> "κ measures agreement, not validity. Two assessors can agree completely and both be wrong.
> That's a different study, with a different method, and we're not claiming it."

---

## §6 · Graceful failure — 30 seconds

Deliberately upload the scanned PDF. Let it fail. Show the clear error.

> "A scanned pack with no text layer is rejected rather than silently mis-parsed. Silently
> generating an assessment from an empty parse is how you ship a certification nobody can defend.
> Rendering those pages is on our roadmap, scoped to our own module so it can't affect the live
> application."

Failing visibly, in a controlled way, is more persuasive than a flawless happy path. It also
disarms the question before a judge asks it.

---

## §7 · Human authority — 30 seconds

Open the sign-off route.

> "Every AI output is a suggestion. The assessor accepts, modifies, or rejects. And there is no
> code path in this platform that emits a certification without a named human sign-off, timestamped
> against the competency profile the decision was based on."

Quote the statement directly: *"the tool supports, but does not replace, the human assessor's final
decision."* Say it is structural, not a disclaimer.

---

## Q&A quick reference

Full answers in `../01_ANALYSIS/02_gap_analysis.md` §5. The five you will actually get:

| Question | Answer |
|---|---|
| "Isn't this just a quiz app?" | The quiz is the delivery mechanism. The product is the engine: grounded generation, a centrally versioned rubric, per-item statistics, and a κ measurement. |
| "What if the AI is wrong?" | The assessor can reject any suggestion; the decision is theirs. Weakly-supported items are flagged at generation. |
| "Does it work offline?" | **Not yet.** Connectivity awareness exists; offline capture and sync are P1, scoped to our own route. We chose not to claim what we haven't built. |
| "How do you know it's consistent?" | §5. Cohen's κ, both conditions, delta, CI, `N`. |
| "Can it read scanned documents?" | Images and embedded images, yes. Scanned PDFs without a text layer are rejected; rendering is roadmap. |

---

## Failure recovery

| If this breaks | Do this |
|---|---|
| Generation is slow | Move to §4 while it runs. It is the "note the hash cache" moment anyway. |
| Firebase is down | Screenshots of the assessment and the κ report. Say it is a live Firebase-backed demo, not a mock, and show the console. |
| You cannot get a second assessor logged in | **Do not fake a second assessor.** Say the paired-comparison run is pre-computed on the test set and show the stored report. Inventing a second human live is the one thing that would end the credibility you just built in §5. |
| The preview URL 404s | Confirm you are on the `sih-26242-rpl` branch, not `main`. Do not switch to production. |
| You are running out of time | Cut §4 entirely. **Never cut §5 or §7.** |

---

## The one-line close

> "Everyone here is trying to make AI generate better questions. We are measuring whether it
> makes assessors **agree more** — and we are prepared to publish the number even if it is zero."
