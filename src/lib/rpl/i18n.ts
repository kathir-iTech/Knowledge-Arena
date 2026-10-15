// SIH-26242 RPL — declaration UI i18n structure (EN/HI/TA).
// Every non-English string is marked "machine-drafted, needs native review".
// The calling pages render the active language strings and may fall back
// to the English default when the translation key is missing.

export type Lang = 'en' | 'hi' | 'ta';

const common: Record<string, string> = {
  back: 'Back',
  next: 'Next',
  submit: 'Submit declaration',
  reviewing: 'Review & submit',
  cancel: 'Cancel',
};

const en: Record<string, string> = {
  /** Step labels (4-step pipeline) */
  step1: 'Personal & trade context',
  step2: 'Experience declaration',
  step3: 'Evidence summary',
  step4: 'Review & submit',
  /** Card titles & descriptions */
  personalTradeContext: 'Tell us about your work',
  experienceDeclaration: 'Mark each skill honestly',
  evidenceSummary: 'Describe when and where you did this work',
  reviewSubmit: 'Check everything before submitting',
  /** Form labels */
  trade: 'Trade / occupation',
  sector: 'Sector',
  years: 'Years of experience',
  location: 'Location (state)',
  employerType: 'Employer type',
  /** Radio marks */
  canDo: 'I can do this',
  doneBefore: 'I have done this before',
  neverDone: 'I have never done this',
  /** Buttons */
  findMatching: 'Find matching qualifications',
  analyzing: 'Analyzing your experience...',
  submitting: 'Submitting...',
  /** P11b offline */
  offlineSaved: 'Saved on this device — it will sync automatically when you reconnect.',
  offlineNotice: 'You\'re offline — your declaration will be saved and submitted when you reconnect.',
  /** Result / confirmation */
  success: 'Declaration submitted successfully!',
  referenceCode: 'Your reference code is',
  /** General */
  noSkillsMarked: 'Mark at least one skill as "I can do this" or "I have done this before" to continue.',
  tradeRequired: 'Trade and years of experience (0-60) are required before submitting.',
  skillRequired: 'Mark at least one skill as "I can do this" or "I have done this before" before submitting.',
  /** Part 4 AI-fallback notes (additive; shown on the declare step) */
  aiMatchNoteUnavailable:
    'AI ranking is unavailable right now, so these are keyword matches. You can still continue.',
  aiMatchNoteFailed:
    'We could not rank the matches just now. Showing keyword matches — you can still continue.',
};

const hi: Record<string, string> = {
  // machine-drafted, needs native review
  step1: 'व्यक्तिगत एवं व्यापार संदर्भ',
  step2: 'अनुभव घोषणा',
  step3: 'साक्ष्य सारांश',
  step4: 'समीक्षा और प्रस्तुत करना',
  personalTradeContext: 'अपने काम के बारे में बताएं',
  experienceDeclaration: 'कौशल का ईमानदारी से चयन करें',
  evidenceSummary: 'यह बताएं कि कब और कहाँ इस काम किया',
  reviewSubmit: 'जमा करने से पहले जांचें',
  trade: 'व्यवसाय / पेशा',
  sector: 'क्षेत्र',
  years: 'वर्षों का अनुभव',
  location: 'स्थान (राज्य)',
  employerType: 'नियोक्ता प्रकार',
  canDo: 'मैं इसे कर सकता हूँ',
  doneBefore: 'मैं पहले ऐसा कर चुका हूँ',
  neverDone: 'मैं पहले ऐसा कभी नहीं किया',
  findMatching: 'योग्यता से मिलान खोजें',
  analyzing: 'आपके अनुभव का विश्लेषण कर रहा है...',
  submitting: 'जमा किया जा रहा है...',
  offlineSaved: 'इस उपकरण पर बचाया गया — यह स्वतः सिंक हो जाएगा जब आप फिर से जुड़ेंगे।',
  offlineNotice: 'आप ऑफ़लाइन हैं — आपकी घोषणा सहेजी जाएगी और जब आप फिर से जुड़ेंगे तो जमा कर दी जाएगी।',
  success: 'अनुभव घोषणा सफलतापूर्वक जमा की गई!',
  referenceCode: 'आपका संदर्भ कोड है',
  noSkillsMarked: 'कम से कम एक कौशल "मैं इसे कर सकता हूँ" या "मैं पहले ऐसा कर चुका हूँ" के रूप में चिह्नित करें जारी रखने के लिए।',
  tradeRequired: 'घोषणा जमा करने से पहले व्यापार और 0-60 वर्षों का अनुभव आवश्यक है।',
  skillRequired: 'घोषणा जमा करने से पहले कम से कम एक कौशल "मैं इसे कर सकता हूँ" या "मैं पहले ऐसा कर चुका हूँ" के रूप में चिह्नित करें।',
  // machine-drafted, needs native review
  aiMatchNoteUnavailable:
    'AI रैंकिंग अभी उपलब्ध नहीं है, इसलिए ये कीवर्ड मिलान हैं। आप आगे बढ़ सकते हैं।',
  aiMatchNoteFailed:
    'हम अभी मिलानों को रैंक नहीं कर सके। कीवर्ड मिलान दिखाए जा रहे हैं — आप आगे बढ़ सकते हैं।',
};

const ta: Record<string, string> = {
  // machine-drafted, needs native review
  step1: 'தொடர்பு தகவல்',  // placeholder
  step2: 'அனுபவ அறிவிப்பு',  // placeholder
  step3: 'சான்று சுருக்கம்',  // placeholder
  step4: 'மதிப்பீடு மற்றும் சமர்ப்பிப்பு',  // placeholder
  personalTradeContext: 'உங்கள் வேலை பற்றி சொல்லுங்கள்',  // placeholder
  experienceDeclaration: 'ஒவ்வொரு திறனையும் உ,',  // placeholder
  evidenceSummary: 'எப்போது, எங்கே இந்த வேலை செய்தீர்கள்',  // placeholder
  reviewSubmit: 'சமர்ப்பிக்குவதற்கு முன் அனைத்தையும் சரிபார்க்கவும்',  // placeholder
  trade: 'தொழில் / வேலை',  // placeholder
  sector: 'துறை',  // placeholder
  years: 'அனுபவ வருடங்கள்',  // placeholder
  location: 'இடம் (மாநிலம்)',  // placeholder
  employerType: 'மூலம் வகை',  // placeholder
  canDo: 'நான் இதைச் செய்ய முடியும்',  // placeholder
  doneBefore: 'நான் இதை முன்பு செய்துள்ளேன்',  // placeholder
  neverDone: 'நான் இதை முன்பு ஒருபோதும் செய்யவில்லை',  // placeholder
  findMatching: 'பொருந்தும் தகுதிகளை கண்டறியவும்',  // placeholder
  analyzing: 'உங்கள் அனுபவம் பகுப்பாய்வு செய்யப்படுகிறது...',  // placeholder
  offlineSaved: 'இந்த சாதனத்தில் சேமிக்கப்பட்டது — மீண்டும் இணைக்கும்போது தானாக ஒத்திசைக்கப்படும்.',  // placeholder
  offlineNotice: 'நீங்கள் ஆஃப்லைனில் இருக்கிறீர்கள் — உங்கள் அறிவிப்பு சேமிக்கப்படும் மற்றும் மீண்டும் இணை',  // placeholder
  success: 'அனுபவ அறிவிப்பு வெற்றிகரமாக சமர்ப்பிக்கப்பட்டது!',  // placeholder
  referenceCode: 'உங்கள் குறிப்பு குறியீடு இது',  // placeholder
  noSkillsMarked: 'குறைந்தது ஒரு திறனைய',  // placeholder
  tradeRequired: 'சமர்ப்பிக்கும் முன் தொழில் மற்றும் 0-60 அனுபவ வருடங்கள் தேவை.',  // placeholder
  skillRequired: 'சமர்ப்பிக்கும் முன் குறைந்தது ஒரு திறனை',  // placeholder
  submitting: 'சமர்ப்பிக்கப்படுகிறது...',  // placeholder
  aiMatchNoteUnavailable:
    'AI தரவரிசை இப்போது கிடைக்கவில்லை, எனவே இவை முக்கியசொல் பொருத்தங்கள். தொடரலாம்.',  // placeholder
  aiMatchNoteFailed:
    'பொருத்தங்களை இப்போது தரவரிசைப்படுத்த முடியவில்லை. முக்கியசொல் பொருத்தங்கள் காட்டப்படுகின்றன.',  // placeholder
};

// Active language, set by the provider page. Default to English.
// eslint-disable-next-line prefer-const
export let activeLang: Lang = 'en';

// Exported strings — caller should use i18n.common and i18n[activeLang].
export const i18n = {
  en,
  hi,
  ta,
};

export function t(key: string, lang: Lang = activeLang): string {
  const translations = lang === 'en' ? en : lang === 'hi' ? hi : ta;
  return translations[key] || common[key] || key;
}

export function tCard(key: string, _lang: Lang = activeLang): string {
  // Deck-specific labels that live alongside the common dict.
  const deck: Record<string, string> = {
    back: 'Back',
    next: 'Next',
    submit: 'Submit declaration',
    reviewing: 'Review & submit',
    cancel: 'Cancel',
    personalTradeContext: 'Personal & trade context',
    experienceDeclaration: 'Experience declaration',
    evidenceSummary: 'Evidence summary',
    reviewSubmit: 'Review & submit',
    trade: 'Trade / occupation',
    sector: 'Sector',
    years: 'Years of experience',
    location: 'Location (state)',
    employerType: 'Employer type',
    canDo: 'I can do this',
    doneBefore: 'I have done this before',
    neverDone: 'I have never done this',
    findMatching: 'Find matching qualifications',
    analyzing: 'Analyzing your experience...',
    offlineSaved: 'Saved on this device — it will sync automatically when you reconnect.',
    offlineNotice: "You're offline — your declaration will be saved and submitted when you reconnect.",
    success: 'Declaration submitted successfully!',
    referenceCode: 'Your reference code is',
    noSkillsMarked: 'Mark at least one skill as "I can do this" or "I have done this before" to continue.',
    tradeRequired: 'Trade and years of experience (0-60) are required before submitting.',
    skillRequired: 'Mark at least one skill as "I can do this" or "I have done this before" before submitting.',
  };
  return deck[key] || common[key] || key;
}

export function isMachineDrafted(lang: Lang): boolean {
  return lang !== 'en';
}