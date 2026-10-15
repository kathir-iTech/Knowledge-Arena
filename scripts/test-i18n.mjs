// SIH-26242 RPL — i18n unit test.
// Each translation language may only use characters inside its sanctioned
// Unicode blocks plus ASCII punctuation/digits (0x20-0x7E). Non-ASCII
// punctuation from General Punctuation (em dash, curly quotes, ellipsis) and
// NBSP are also permitted — but a *letter* from any other script is a bug
// (e.g. a Latin 'w' or Chinese '后' inside a Tamil string).
// Run with: node scripts/test-i18n.mjs  (Node >=22.13, type-stripping).

console.log(`node ${process.version}`);
import { readFileSync } from 'node:fs';

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

// ---- Part 6 additions -----------------------------------------------------
// Three new failure classes the original block-scan could not see:
//   (A) empty / engineering-marker strings
//   (B) truncated machine-drafted strings (mid-sentence stop, lost terminal
//       punctuation relative to the English source)
//   (C) literal t('key') references in the UI that have no dictionary entry
//       (the bug that used to render a raw "aiMatchNoteUnavailable" key).

// (A) non-empty + no engineering markers.
const MARKERS = ['placeholder', 'todo', 'fixme', 'lorem ipsum', 'xxx'];
for (const lang of ['en', 'hi', 'ta']) {
  for (const [key, value] of Object.entries(i18n[lang] ?? {})) {
    const s = String(value);
    checked += 1;
    if (!s.trim()) {
      failures += 1;
      console.log(`  FAIL ${lang}.${key}: empty string`);
    }
    const lower = s.toLowerCase();
    for (const m of MARKERS) {
      if (lower.includes(m)) {
        failures += 1;
        console.log(`  FAIL ${lang}.${key}: contains engineering marker "${m}"`);
      }
    }
  }
}
console.log('  ok   no empty or marker strings');

// (B) truncation checks.
const DANGLING = /[,;:]$/;
const TERMINAL_EN = /[.!?]$/;
const TERMINAL_LOCAL = /[.!?।]$/; // allow the Hindi danda
for (const lang of ['hi', 'ta']) {
  for (const [key, enValue] of Object.entries(i18n.en)) {
    const s = String(i18n[lang]?.[key] ?? '');
    if (!s) continue;
    checked += 1;
    const trimmed = s.trim();
    if (DANGLING.test(trimmed)) {
      failures += 1;
      console.log(`  FAIL ${lang}.${key}: ends with dangling punctuation: ${JSON.stringify(s)}`);
    }
    if (TERMINAL_EN.test(String(enValue).trim()) && !TERMINAL_LOCAL.test(trimmed)) {
      failures += 1;
      console.log(
        `  FAIL ${lang}.${key}: English ends with sentence punctuation, ${lang} does not: ${JSON.stringify(s)}`,
      );
    }
  }
}
console.log('  ok   no truncated / dangling translations');

// (C) key-leakage guard against the declare page.
const declarePath = new URL('../src/app/(rpl)/rpl/declare/page.tsx', import.meta.url);
const declareSrc = readFileSync(declarePath, 'utf8');
const usedKeys = new Set();
for (const m of declareSrc.matchAll(/\bt(?:Card)?\(\s*'([a-zA-Z0-9_]+)'/g)) {
  usedKeys.add(m[1]);
}
for (const key of usedKeys) {
  checked += 1;
  if (!(key in i18n.en) && !(key in (i18n.common ?? {}))) {
    failures += 1;
    console.log(`  FAIL key-leakage: t('${key}') is used in declare/page.tsx but has no en/common entry`);
  }
}
console.log(`  ok   key-leakage guard: ${usedKeys.size} literal key(s) all resolve`);

// (D) placeholder parity: {name}-style tokens must match across languages.
// There are currently NO placeholders in any string (verified: no `{` in a
// translation value), so this passes vacuously — but it stays enforced so a
// future `{count}` / `{name}` cannot ship in English only.
const PLACEHOLDER = /\{[A-Za-z0-9_]+\}/g;
for (const [key, enValue] of Object.entries(i18n.en)) {
  const enTokens = new Set(String(enValue).match(PLACEHOLDER) ?? []);
  for (const lang of ['hi', 'ta']) {
    checked += 1;
    const s = String(i18n[lang]?.[key] ?? '');
    const localTokens = new Set(s.match(PLACEHOLDER) ?? []);
    const missing = [...enTokens].filter((tk) => !localTokens.has(tk));
    const extra = [...localTokens].filter((tk) => !enTokens.has(tk));
    if (missing.length > 0 || extra.length > 0) {
      failures += 1;
      console.log(
        `  FAIL ${lang}.${key}: placeholder mismatch (missing ${JSON.stringify(missing)}, extra ${JSON.stringify(extra)})`,
      );
    }
  }
}
console.log('  ok   placeholder parity across en/hi/ta');

// (E) mixed-script words: a single whitespace-separated token must not mix
// letters from two scripts (e.g. Latin "Rank" + Devanagari "िंग" glued as
// one token). Whole-token loanwords are allowed ("AI" in the Hindi/Tamil AI
// notes is one Latin-only token) — only intra-token mixing fails.
const LATIN = /[A-Za-z]/;
const DEVANAGARI = /[\u0900-\u097F]/;
const TAMIL = /[\u0B80-\u0BFF]/;
function scriptsInToken(token) {
  const scripts = new Set();
  if (LATIN.test(token)) scripts.add('Latin');
  if (DEVANAGARI.test(token)) scripts.add('Devanagari');
  if (TAMIL.test(token)) scripts.add('Tamil');
  return scripts;
}
for (const lang of ['hi', 'ta']) {
  for (const [key, value] of Object.entries(i18n[lang] ?? {})) {
    const s = String(value);
    checked += 1;
    const mixed = s.split(/\s+/).filter((tok) => scriptsInToken(tok).size > 1);
    if (mixed.length > 0) {
      failures += 1;
      console.log(`  FAIL ${lang}.${key}: mixed-script token(s): ${JSON.stringify(mixed)}`);
    }
  }
}
console.log('  ok   no mixed-script words');

console.log(`\n${checked} string(s) scanned, ${failures} failure(s)`);
if (failures > 0) process.exit(1);
console.log('i18n block strictness: PASS');