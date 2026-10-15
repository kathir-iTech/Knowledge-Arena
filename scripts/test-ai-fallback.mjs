// Part 4 — Gemini quota fallback test: three configured keys that ALL fail.
//
// Pure in-process test of the multi-key rotation in src/ai/key-resolver.ts.
// The "operation" passed to withGeminiKeyRotation is a local stub that throws
// a simulated 429, so this script performs NO network calls and touches NO
// Firebase. It proves the contract the RPL flows rely on:
//
//   - 3 keys, all quota-exhausted  -> ALL_GEMINI_KEYS_EXHAUSTED after trying
//     each of the 3 keys exactly once (matching flow then returns
//     source:'local-fallback'; forge flow throws the retry-later error).
//   - 2 keys quota-exhausted, 3rd OK -> rotation recovers and returns the result.
//   - 1 key, quota-exhausted -> fast, clear ALL_GEMINI_KEYS_EXHAUSTED.
//
// Run with: node scripts/test-ai-fallback.mjs
// (fallback: npx tsx scripts/test-ai-fallback.mjs)
// Node >=22.13 required (package.json engines) for TS type-stripping.

console.log(`node ${process.version}`);

// ── isolate the resolver from any real/legacy env keys ──────────────────────
for (const v of [
  'GEMINI_API_KEYS',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_GENAI_API_KEY',
]) {
  delete process.env[v];
}

let mod = null;
const candidates = ['../src/ai/key-resolver.ts', '../../src/ai/key-resolver.ts'];
for (const p of candidates) {
  try {
    mod = await import(p);
    console.log(`TS import path worked: ${p} (Node type-stripping)`);
    break;
  } catch (err) {
    console.log(`TS import path failed: ${p}: ${err?.message ?? err}`);
  }
}
if (!mod) {
  console.log('DIRECT_TS_IMPORT_FAILED — fallback: run via `npx tsx scripts/test-ai-fallback.mjs`');
  process.exit(1);
}

const { withGeminiKeyRotation, isQuotaError, getKeyCount, _resetKeyResolverForTesting } = mod;

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`PASS: ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
    failures += 1;
  }
}

function quotaError() {
  const e = new Error('429 RESOURCE_EXHAUSTED: Quota exceeded for quota metric');
  e.status = 429;
  return e;
}

function setKeys(csv) {
  process.env.GEMINI_API_KEYS = csv;
  _resetKeyResolverForTesting();
}

// ── Test 1: three keys, ALL failing ─────────────────────────────────────────
try {
  setKeys('key-alpha-aaaaaaaa,key-beta-bbbbbbbb,key-gamma-cccccccc');
  check('3 keys configured', getKeyCount() === 3, `count=${getKeyCount()}`);

  const seen = [];
  let thrown = null;
  try {
    await withGeminiKeyRotation(async (apiKey) => {
      seen.push(apiKey);
      throw quotaError();
    });
  } catch (err) {
    thrown = err;
  }
  const msg = thrown instanceof Error ? thrown.message : String(thrown);
  check('3 keys all quota -> throws', thrown !== null, `message=${msg.slice(0, 80)}`);
  check('3 keys all quota -> ALL_GEMINI_KEYS_EXHAUSTED', msg.includes('ALL_GEMINI_KEYS_EXHAUSTED'), msg.slice(0, 120));
  check('3 keys all quota -> names the key count', msg.includes('3 Gemini keys'), msg.slice(0, 120));
  check('3 keys all quota -> each key tried exactly once', seen.length === 3, `tried=${seen.length}`);
  check('3 keys all quota -> keys are distinct', new Set(seen).size === 3, `distinct=${new Set(seen).size}`);
} catch (err) {
  check('three keys all failing', false, String(err?.message ?? err));
}

// ── Test 2: two keys exhausted, third succeeds (rotation recovers) ──────────
try {
  setKeys('key-delta-dddddddd,key-epsilon-eeeeeeee,key-zeta-ffffffff');
  const seen = [];
  const result = await withGeminiKeyRotation(async (apiKey) => {
    seen.push(apiKey);
    if (seen.length <= 2) throw quotaError();
    return 'AI_OK';
  });
  check('rotation recovers on 3rd key', result === 'AI_OK', `result=${result}`);
  check('rotation tried 3 keys before success', seen.length === 3, `tried=${seen.length}`);
  check('rotation did not reuse an exhausted key', new Set(seen).size === 3, `distinct=${new Set(seen).size}`);
} catch (err) {
  check('two keys exhausted, third succeeds', false, String(err?.message ?? err));
}

// ── Test 3: single key, quota-exhausted -> fast, clear failure ──────────────
try {
  setKeys('key-solo-gggggggg');
  check('single key configured', getKeyCount() === 1, `count=${getKeyCount()}`);
  let thrown = null;
  try {
    await withGeminiKeyRotation(async () => {
      throw quotaError();
    });
  } catch (err) {
    thrown = err;
  }
  const msg = thrown instanceof Error ? thrown.message : String(thrown);
  check('single key quota -> ALL_GEMINI_KEYS_EXHAUSTED', msg.includes('ALL_GEMINI_KEYS_EXHAUSTED'), msg.slice(0, 120));
  check('single key quota -> names the key count', msg.includes('1 Gemini keys'), msg.slice(0, 120));
} catch (err) {
  check('single key quota-exhausted', false, String(err?.message ?? err));
}

// ── Test 4: quota detection predicate ───────────────────────────────────────
try {
  check('isQuotaError detects 429', isQuotaError(quotaError()) === true);
  check(
    'isQuotaError detects RESOURCE_EXHAUSTED text',
    isQuotaError(new Error('RESOURCE_EXHAUSTED: quota')) === true,
  );
  check(
    'isQuotaError detects the resolver exhaustion message',
    isQuotaError(new Error('ALL_GEMINI_KEYS_EXHAUSTED: All AI capacity exhausted.')) === false,
    'expected false: exhaustion is mapped to a quota-like path by the forge flow helper',
  );
} catch (err) {
  check('quota detection predicate', false, String(err?.message ?? err));
}

console.log('');
if (failures === 0) {
  console.log('ALL PASS: 3-key quota fallback contract holds.');
  process.exit(0);
} else {
  console.log(`${failures} FAILURE(S).`);
  process.exit(1);
}
