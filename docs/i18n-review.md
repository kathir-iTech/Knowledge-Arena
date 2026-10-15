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

## Per-key review table (all keys)

Every Hindi and Tamil string is machine-drafted. A native reviewer
marks the last column per row. Keep the `// machine-drafted, needs
native review` comment in `src/lib/rpl/i18n.ts` until that row is approved.

| key | English source (authoritative) | Hindi (machine-drafted) | Tamil (machine-drafted) | native reviewer OK? |
| --- | --- | --- | --- | --- |
| `step1` | Personal & trade context | व्यक्तिगत एवं व्यापार संदर्भ | தொடர்பு தகவல் |  |
| `step2` | Experience declaration | अनुभव घोषणा | அனுபவ அறிவிப்பு |  |
| `step3` | Evidence summary | साक्ष्य सारांश | சான்று சுருக்கம் |  |
| `step4` | Review & submit | समीक्षा और प्रस्तुत करना | மதிப்பீடு மற்றும் சமர்ப்பிப்பு |  |
| `personalTradeContext` | Tell us about your work | अपने काम के बारे में बताएं | உங்கள் வேலை பற்றி சொல்லுங்கள் |  |
| `experienceDeclaration` | Mark each skill honestly | कौशल का ईमानदारी से चयन करें | ஒவ்வொரு திறனையும் நேர்மையாகக் குறிக்கவும் |  |
| `evidenceSummary` | Describe when and where you did this work | यह बताएं कि कब और कहाँ इस काम किया | எப்போது, எங்கே இந்த வேலை செய்தீர்கள் |  |
| `reviewSubmit` | Check everything before submitting | जमा करने से पहले जांचें | சமர்ப்பிக்குவதற்கு முன் அனைத்தையும் சரிபார்க்கவும் |  |
| `trade` | Trade / occupation | व्यवसाय / पेशा | தொழில் / வேலை |  |
| `sector` | Sector | क्षेत्र | துறை |  |
| `years` | Years of experience | वर्षों का अनुभव | அனுபவ வருடங்கள் |  |
| `location` | Location (state) | स्थान (राज्य) | இடம் (மாநிலம்) |  |
| `employerType` | Employer type | नियोक्ता प्रकार | வேலைவழங்குநர் வகை |  |
| `canDo` | I can do this | मैं इसे कर सकता हूँ | நான் இதைச் செய்ய முடியும் |  |
| `doneBefore` | I have done this before | मैं पहले ऐसा कर चुका हूँ | நான் இதை முன்பு செய்துள்ளேன் |  |
| `neverDone` | I have never done this | मैं पहले ऐसा कभी नहीं किया | நான் இதை முன்பு ஒருபோதும் செய்யவில்லை |  |
| `findMatching` | Find matching qualifications | योग्यता से मिलान खोजें | பொருந்தும் தகுதிகளை கண்டறியவும் |  |
| `analyzing` | Analyzing your experience... | आपके अनुभव का विश्लेषण कर रहा है... | உங்கள் அனுபவம் பகுப்பாய்வு செய்யப்படுகிறது... |  |
| `submitting` | Submitting... | जमा किया जा रहा है... | சமர்ப்பிக்கப்படுகிறது... |  |
| `offlineSaved` | Saved on this device — it will sync automatically when you reconnect. | इस उपकरण पर बचाया गया — यह स्वतः सिंक हो जाएगा जब आप फिर से जुड़ेंगे। | இந்த சாதனத்தில் சேமிக்கப்பட்டது — மீண்டும் இணைக்கும்போது தானாக ஒத்திசைக்கப்படும். |  |
| `offlineNotice` | You're offline — your declaration will be saved and submitted when you reconnect. | आप ऑफ़लाइन हैं — आपकी घोषणा सहेजी जाएगी और जब आप फिर से जुड़ेंगे तो जमा कर दी जाएगी। | நீங்கள் ஆஃப்லைனில் இருக்கிறீர்கள் — உங்கள் அறிவிப்பு சேமிக்கப்படும், மீண்டும் இணைக்கும்போது சமர்ப்பிக்கப்படும். |  |
| `success` | Declaration submitted successfully! | अनुभव घोषणा सफलतापूर्वक जमा की गई! | அனுபவ அறிவிப்பு வெற்றிகரமாக சமர்ப்பிக்கப்பட்டது! |  |
| `referenceCode` | Your reference code is | आपका संदर्भ कोड है | உங்கள் குறிப்பு குறியீடு இது |  |
| `noSkillsMarked` | Mark at least one skill as "I can do this" or "I have done this before" to continue. | कम से कम एक कौशल "मैं इसे कर सकता हूँ" या "मैं पहले ऐसा कर चुका हूँ" के रूप में चिह्नित करें जारी रखने के लिए। | தொடர குறைந்தது ஒரு திறனை "நான் இதைச் செய்ய முடியும்" அல்லது "நான் இதை முன்பு செய்துள்ளேன்" எனக் குறிக்கவும். |  |
| `tradeRequired` | Trade and years of experience (0-60) are required before submitting. | घोषणा जमा करने से पहले व्यापार और 0-60 वर्षों का अनुभव आवश्यक है। | சமர்ப்பிக்கும் முன் தொழில் மற்றும் 0-60 அனுபவ வருடங்கள் தேவை. |  |
| `skillRequired` | Mark at least one skill as "I can do this" or "I have done this before" before submitting. | घोषणा जमा करने से पहले कम से कम एक कौशल "मैं इसे कर सकता हूँ" या "मैं पहले ऐसा कर चुका हूँ" के रूप में चिह्नित करें। | சமர்ப்பிக்கும் முன் குறைந்தது ஒரு திறனை "நான் இதைச் செய்ய முடியும்" அல்லது "நான் இதை முன்பு செய்துள்ளேன்" எனக் குறிக்கவும். |  |
| `aiMatchNoteUnavailable` | AI ranking is unavailable right now, so these are keyword matches. You can still continue. | AI रैंकिंग अभी उपलब्ध नहीं है, इसलिए ये कीवर्ड मिलान हैं। आप आगे बढ़ सकते हैं। | AI தரவரிசை இப்போது கிடைக்கவில்லை, எனவே இவை முக்கியசொல் பொருத்தங்கள். தொடரலாம். |  |
| `aiMatchNoteFailed` | We could not rank the matches just now. Showing keyword matches — you can still continue. | हम अभी मिलानों को रैंक नहीं कर सके। कीवर्ड मिलान दिखाए जा रहे हैं — आप आगे बढ़ सकते हैं। | பொருத்தங்களை இப்போது தரவரிசைப்படுத்த முடியவில்லை. முக்கியசொல் பொருத்தங்கள் காட்டப்படுகின்றன. |  |
| `translationNotice` | This translation is machine-drafted and is being reviewed by native speakers. English is authoritative. | यह अनुवाद मशीन द्वारा तैयार किया गया है और मूल वक्ताओं द्वारा इसकी समीक्षा की जा रही है। अंग्रेज़ी मानक है। | இந்த மொழிபெயர்ப்பு இயந்திரத்தால் உருவாக்கப்பட்டது, தாய்மொழி பேசுபவர்களால் மதிப்பாய்வு செய்யப்படுகிறது. ஆங்கிலமே அதிகாரப்பூர்வமானது. |  |

(29 keys. Generated from `src/lib/rpl/i18n.ts` by `node scripts/_tmp-i18n-table.mjs`;
regenerate after any string change. Reviewer note: `ta.step1` reads as "contact
information" — see the concern table above; `hi/aiMatchNote*` keep the Latin
acronym "AI", which is intentional unless a native reviewer prefers otherwise.)
