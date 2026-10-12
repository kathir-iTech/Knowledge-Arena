// SIH-26242 RPL — i18n unit test.
// Each translation language may only use characters inside its sanctioned
// Unicode blocks plus ASCII punctuation/digits (0x20-0x7E). Non-ASCII
// punctuation from General Punctuation (em dash, curly quotes, ellipsis) and
// NBSP are also permitted — but a *letter* from any other script is a bug
// (e.g. a Latin 'w' or Chinese '后' inside a Tamil string).
// Run with: node scripts/test-i18n.mjs  (Node >=22.13, type-stripping).

console.log(`node ${process.version}`);

async function loadTs(specifier) {
  const candidates = [`../../${specifier}`, `../${specifier}`];
  for (const p of candidates) {
    try {
      const mod = await import(p);
      console.log(`TS import worked: ${p} (Node type-stripping)`);
      return mod;
    } catch (err) {
      console.log(`TS import failed: ${p}: ${err?.message ?? err}`);
    }
  }
  console.log(`DIRECT_TS_IMPORT_FAILED for ${specifier}`);
  process.exit(1);
}

const { i18n } = await loadTs('src/lib/rpl/i18n.ts');

// Sanctioned letter/mark blocks per language (plus ASCII 0x20-0x7E always).
const BYTES = (lo, hi) => [lo, hi];
const BLOCKS = {
  // English: ASCII only.
  en: [BYTES(0x0000, 0x007f)],
  // Hindi: Devanagari (U+0900-U+097F).
  hi: [BYTES(0x0900, 0x097f)],
  // Tamil: Tamil (U+0B80-U+0BFF).
  ta: [BYTES(0x0b80, 0x0bff)],
};

// ASCII (space..DEL) is always fine; NBSP + General Punctuation non-letters too.
function isAscii(cp) {
  return cp >= 0x20 && cp <= 0x7e;
}

function isAllowed(cp, lang) {
  if (isAscii(cp)) return true;
  if (cp === 0x00a0) return true; // NBSP
  if (cp >= 0x2000 && cp <= 0x206f) return true; // General Punctuation
  for (const [lo, hi] of BLOCKS[lang]) {
    if (cp >= lo && cp <= hi) return true;
  }
  return false;
}

let failures = 0;
let checked = 0;

function scan(lang, label, text) {
  const bad = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (!isAllowed(cp, lang)) {
      bad.push(`U+${cp.toString(16).toUpperCase().padStart(4, '0')} '${ch}'`);
    }
  }
  checked += 1;
  if (bad.length) {
    failures += 1;
    console.log(`  FAIL ${lang}.${label}: ${JSON.stringify(text)}`);
    console.log(`       out-of-block chars: ${bad.join(', ')}`);
  } else {
    console.log(`  ok   ${lang}.${label}`);
  }
}

for (const lang of ['en', 'hi', 'ta']) {
  const dict = i18n[lang] ?? {};
  const keys = Object.keys(dict);
  if (keys.length === 0) {
    failures += 1;
    console.log(`  FAIL ${lang}: no translations found`);
    continue;
  }
  // Also confirm every key in hi/ta exists in en (parity).
  for (const key of keys) {
    scan(lang, key, String(dict[key]));
    if (lang !== 'en') {
      checked += 1;
      if (!(key in i18n.en)) {
        failures += 1;
        console.log(`  FAIL ${lang}.${key}: missing English sibling`);
      }
    }
  }
  // Parity: every English key must exist in hi and ta.
  for (const key of Object.keys(i18n.en)) {
    if (!(key in dict)) {
      checked += 1;
      failures += 1;
      console.log(`  FAIL ${lang}.${key}: English key missing in ${lang}`);
    }
  }
}

// Guard against a regex-swathe of whitespace languages: hi/ta must actually
// use their own scripts for non-ASCII content.
for (const lang of ['hi', 'ta']) {
  const dict = i18n[lang] ?? {};
  const nonAscii = Object.values(dict)
    .map((s) => String(s))
    .flatMap((s) => [...s])
    .some((ch) => !isAscii(ch.codePointAt(0)));
  checked += 1;
  if (!nonAscii) {
    failures += 1;
    console.log(`  FAIL ${lang}: file contains no non-ASCII characters at all`);
  } else {
    console.log(`  ok   ${lang}: uses non-ASCII script content`);
  }
}

console.log(`\n${checked} string(s) scanned, ${failures} failure(s)`);
if (failures > 0) process.exit(1);
console.log('i18n block strictness: PASS');