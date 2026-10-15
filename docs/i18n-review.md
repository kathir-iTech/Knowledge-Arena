# RPL declaration UI — i18n review status (EN / HI / TA)

Status: **English is authoritative. Hindi and Tamil are machine-drafted and
have NOT been reviewed by a native speaker.** The app tells the user this
in-app (see "In-app disclosure" below). This document records what is known
about each language so the work can be picked up by a native reviewer.

- Source of truth: `src/lib/rpl/i18n.ts`
- Integrity test: `node scripts/test-i18n.mjs` (also run in CI/regression)
- UI surface: the declaration wizard at `/rpl/declare` (the only RPL page that
  currently uses `t(...)`). Language is chosen via `src/components/rpl/LanguageToggle.tsx`.

## How the strings are used

`t(key, lang)` resolves in this order:

1. the key in the active language dictionary (`en` / `hi` / `ta`),
2. the shared `common` dictionary (`back`, `next`, `submit`, `reviewing`,
   `cancel`),
3. the raw key (this fallback is a bug magnet — see "Key leakage" below).

The four step labels drive a 4-step progress indicator, so any string that is
too long wraps awkwardly at 390 px. Prefer short noun phrases for `step1..step4`.

## Fixes applied (Part 6)

### 1. Truncated Tamil strings (real bug)

Four Tamil strings were cut off mid-sentence and could not be read as Tamil.
They were completed with machine-drafted text and are still flagged for native
review:

| key | before (truncated) | after |
| --- | --- | --- |
| `experienceDeclaration` | `ஒவ்வொரு திறனையும் உ,` | `ஒவ்வொரு திறனையும் நேர்மையாகக் குறிக்கவும்` |
| `offlineNotice` | `…உங்கள் அறிவிப்பு சேமிக்கப்படும் மற்றும் மீண்டும் இணை` | `…சேமிக்கப்படும், மீண்டும் இணைக்கும்போது சமர்ப்பிக்கப்படும்.` |
| `noSkillsMarked` | `குறைந்தது ஒரு திறனைய` | `தொடர குறைந்தது ஒரு திறனை "…" அல்லது "…" எனக் குறிக்கவும்.` |
| `skillRequired` | `சமர்ப்பிக்கும் முன் குறைந்தது ஒரு திறனை` | `சமர்ப்பிக்கும் முன் குறைந்தது ஒரு திறனை "…" அல்லது "…" எனக் குறிக்கவும்.` |

`employerType` (TA) previously read `மூலம் வகை` ("source type"); corrected to
`வேலைவழங்குநர் வகை` ("employer type").

### 2. Key leakage (real bug, fixed earlier in Part 4)

`aiMatchNoteUnavailable` and `aiMatchNoteFailed` are rendered on the declare
step but were missing from all three dictionaries, so the UI printed the raw
key string. They are now defined in `en`, `hi` and `ta`, and
`scripts/test-i18n.mjs` now scans `declare/page.tsx` for every literal
`t('...')` reference and fails if a key has no `en`/`common` entry.

### 3. In-app disclosure

`translationNotice` was added to all three languages and is rendered as a
`role="note"` banner at the top of `/rpl/declare` **only when the active
language is not English** (`isMachineDrafted(lang)`). This means a Hindi/Tamil
user is told the translation is machine-drafted and under review, rather than
being shown it as final copy.

## Test coverage added

`scripts/test-i18n.mjs` now enforces (on top of the original Unicode-block
strictness and en/hi/ta key parity):

- non-empty strings and no engineering markers (`placeholder`, `todo`,
  `fixme`, `lorem ipsum`, `xxx`);
- **no truncated translations**: a string ending in `,` `;` `:` is a failure,
  and if the English string ends in `.` `!` `?` the translation must end in
  `.` `!` `?` `।`;
- **no key leakage**: every literal `t('key')` / `tCard('key')` in the declare
  page must resolve in `en` or `common`;
- hi/ta must actually contain their own script (no ASCII-only swathes).

The truncation rule was verified against a real regression: re-introducing the
old `experienceDeclaration` value makes the test exit 1 with
`FAIL ta.experienceDeclaration: ends with dangling punctuation`.

## What still needs a native reviewer

Every Hindi and Tamil string below is **machine-drafted**. Priority is given to
strings a worker reads while deciding what to submit.

| key | concern |
| --- | --- |
| `step1` | TA `தொடர்பு தகவல்` reads as "contact information", not "Personal & trade context". Needs a better noun phrase. |
| `experienceDeclaration` | HI `कौशल का ईमानदारी से चयन करें` ("select skills honestly") — confirm register. |
| `evidenceSummary` | HI `यह बताएं कि कब और कहाँ इस काम किया` is slightly ungrammatical ("इस काम किया" → "यह काम किया"). Confirm and fix. |
| `sector`, `years`, `location`, `employerType` | Short labels; TA/HI look plausible but need a native check for the domain sense (RPL/NSQF). |
| `canDo`, `doneBefore`, `neverDone` | The three self-assessment marks. Meaning-critical — please confirm they read as mutually exclusive options. |
| `noSkillsMarked`, `skillRequired`, `tradeRequired` | Validation messages; wording must match the form's own vocabulary (`trade`, `skill`, `years`). |
| `offlineSaved`, `offlineNotice` | Offline/sync messaging. Confirm tone and that "saved on this device" is not read as "submitted". |
| `aiMatchNoteUnavailable`, `aiMatchNoteFailed` | AI-fallback explanations; confirm they do not over-promise AI. |
| `translationNotice` | The disclosure itself — make sure the Hindi/Tamil text says clearly that English is authoritative. |

Reviewer checklist:

1. Read each string in context on `/rpl/declare` after switching language.
2. Propose replacements in `src/lib/rpl/i18n.ts` (keep the `// machine-drafted,
   needs native review` comment until reviewed).
3. Remove the comment only for strings you have personally approved.
4. Run `node scripts/test-i18n.mjs` — it must stay at `0 failure(s)`.
5. When all Hindi/Tamil strings are approved, `isMachineDrafted()` can be
   tightened and the in-app notice removed for that language.
