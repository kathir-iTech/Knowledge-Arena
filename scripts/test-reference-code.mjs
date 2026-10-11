// B2 unit test — human-readable assessment reference codes.
// Run with: node scripts/test-reference-code.mjs
// (fallback: npx tsx scripts/test-reference-code.mjs)
// Node >=22.13 required (package.json engines) for TS type-stripping.
//
// reference-code.ts is runtime-import-free on purpose so this runs under plain
// `node` (the module under test is imported directly, type-stripping the
// `import type { Firestore }`).

console.log(`node ${process.version}`);

let mod = null;
let importPathUsed = null;
const candidates = ['../src/lib/rpl/reference-code.ts', '../../src/lib/rpl/reference-code.ts'];
for (const p of candidates) {
  try {
    mod = await import(p);
    importPathUsed = p;
    console.log(`TS import path worked: ${p} (Node type-stripping)`);
    break;
  } catch (err) {
    console.log(`TS import path failed: ${p}: ${err?.message ?? err}`);
  }
}

if (!mod) {
  console.log('DIRECT_TS_IMPORT_FAILED — fallback: run via `npx tsx scripts/test-reference-code.mjs`');
  process.exit(1);
}

const {
  generateReferenceCode,
  isReferenceCode,
  allocateReferenceCode,
  REFERENCE_CODE_ALPHABET,
  REFERENCE_CODE_REGEX,
} = mod;

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`PASS: ${name}${detail ? ` — ${detail}` : ''}`);
  else {
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
    failures += 1;
  }
}

// --- alphabet hygiene -------------------------------------------------------
check(
  'alphabet excludes ambiguous 0/O/1/I/L',
  !/[0O1IL]/.test(REFERENCE_CODE_ALPHABET) && REFERENCE_CODE_ALPHABET.length === 31,
  `len=${REFERENCE_CODE_ALPHABET.length}`,
);

// --- generation -------------------------------------------------------------
const generated = [];
for (let i = 0; i < 200; i += 1) generated.push(generateReferenceCode());
check(
  'all generated codes match RPL-XXXX-XXXX',
  generated.every((c) => REFERENCE_CODE_REGEX.test(c)),
);
check('generated code has no UID-like characters', generated.every((c) => !/[0O1IL]/.test(c.slice(4))));
check(
  'codes are collision-free over 200 draws',
  new Set(generated).size === generated.length,
  `${new Set(generated).size}/${generated.length} unique`,
);

// deterministic: injected RNG fully controls the code
const fixed = generateReferenceCode(() => 0);
check('deterministic with random()=0 → alphabet[0]', fixed === 'RPL-2222-2222', fixed);
const high = generateReferenceCode(() => 0.999999);
check(
  'deterministic with random()→1 stays in alphabet',
  REFERENCE_CODE_REGEX.test(high),
  high,
);

// --- validation -------------------------------------------------------------
check('accepts a generated code', isReferenceCode('RPL-2345-6789'));
check('rejects the alphabet-ambiguous letters', !isReferenceCode('RPL-01LL-OOOO'));
check('rejects lowercase', !isReferenceCode('rpl-2345-6789'));
check('rejects a Firebase UID', !isReferenceCode('aBcD1234EfGhIjKlMnOpQrStUvWx'));
check('rejects empty / null / number', !isReferenceCode('') && !isReferenceCode(null) && !isReferenceCode(42));
check('rejects wrong group sizes', !isReferenceCode('RPL-234-5678') && !isReferenceCode('RPL-2345-56789'));

// --- allocation against a fake db ------------------------------------------
function fakeDb(existingCodes, maxQueries = 100) {
  let queries = 0;
  return {
    queries: () => queries,
    collection() {
      return {
        where(field, _op, value) {
          if (field !== 'assessmentReferenceCode') throw new Error(`unexpected field ${field}`);
          return {
            limit() {
              return {
                async get() {
                  queries += 1;
                  if (queries > maxQueries) throw new Error('too many queries');
                  return { empty: !existingCodes.has(value) };
                },
              };
            },
          };
        },
      };
    },
  };
}

{
  const db = fakeDb(new Set());
  const code = await allocateReferenceCode(db);
  check('allocates a valid code when none collide', isReferenceCode(code), code);
}

{
  // First candidate is taken → must retry and return a different, free code.
  let call = 0;
  const takeFirst = () => {
    call += 1;
    return call === 1 ? 0 : 0.5;
  };
  const firstCode = generateReferenceCode(() => 0);
  const db = fakeDb(new Set([firstCode]));
  const code = await allocateReferenceCode(db, 8, takeFirst);
  check('retries past a taken code', code !== firstCode && isReferenceCode(code), code);
}

{
  const db = fakeDb(new Set());
  let threw = false;
  try {
    // Force every probe to report "taken" so allocation exhausts its retries.
    const alwaysTaken = {
      collection: () => ({
        where: () => ({ limit: () => ({ get: async () => ({ empty: false }) }) }),
      }),
    };
    await allocateReferenceCode(alwaysTaken, 3);
  } catch {
    threw = true;
  }
  void db;
  check('throws (never fabricates) after exhausting retries', threw);
}

console.log(`importPathUsed=${importPathUsed}`);
if (failures > 0) {
  console.log(`${failures} test(s) FAILED`);
  process.exit(1);
} else {
  console.log('all tests PASSED');
}
