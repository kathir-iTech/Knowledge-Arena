// Kappa smoke tests — run with: node scripts/test-kappa.mjs
// (fallback if Node type-stripping fails: npx tsx scripts/test-kappa.mjs)
// Node >=22.13 required (package.json engines).

console.log(`node ${process.version}`);

let kappaMod = null;
let importPathUsed = null;

// REQUIRED primary path (Node type-stripping). Try it first verbatim.
const candidates = ['../../src/lib/rpl/kappa.ts', '../src/lib/rpl/kappa.ts'];
for (const p of candidates) {
  try {
    kappaMod = await import(p);
    importPathUsed = p;
    console.log(`TS import path worked: ${p} (Node type-stripping)`);
    break;
  } catch (err) {
    console.log(`TS import path failed: ${p}: ${err?.message ?? err}`);
  }
}

if (!kappaMod) {
  console.log('DIRECT_TS_IMPORT_FAILED — fallback: run via `npx tsx scripts/test-kappa.mjs`');
  process.exit(1);
}

const { computeKappa, computeMultiRaterKappa, computeKappaImprovement } = kappaMod;

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`PASS: ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
    failures += 1;
  }
}

// ---------------------------------------------------------------------------
// Test 1: identical ratings => kappa exactly 1.0, 'Almost perfect'.
// ---------------------------------------------------------------------------
try {
  const A = [1, 2, 3, 4, 1, 2, 3, 4];
  const B = [1, 2, 3, 4, 1, 2, 3, 4];
  const r = computeKappa(A, B);
  check(
    'identical ratings kappa exactly 1.0 Almost perfect',
    r.kappa === 1 && r.interpretation === 'Almost perfect',
    `kappa=${r.kappa} interpretation=${r.interpretation} CI=[${r.confidence}]`
  );
} catch (err) {
  check('identical ratings kappa exactly 1.0 Almost perfect', false, String(err?.message ?? err));
}

// ---------------------------------------------------------------------------
// Test 2: hand-computed contingency example.
// ratingsA = [1,1,2,2], ratingsB = [1,1,1,2], k = 4, linear weights
// w_ij = 1 - |i-j|/3.
//
// Contingency (rows A, cols B), n = 4:
//   n11 = 2, n21 = 1, n22 = 1, rest 0.
//   p11 = 0.5, p21 = 0.25, p22 = 0.25.
// Row marginals: p1. = 0.5, p2. = 0.5, p3. = p4. = 0.
// Col marginals: p.1 = 0.75, p.2 = 0.25, p.3 = p.4 = 0.
// Weights: w11 = 1, w21 = w12 = 2/3, w22 = 1.
// Po = 1*0.5 + (2/3)*0.25 + 1*0.25 = 0.5 + 0.1666667 + 0.25 = 11/12 ≈ 0.9166667.
// Pe = 1*0.5*0.75 + (2/3)*0.5*0.25 + (2/3)*0.5*0.75 + 1*0.5*0.25
//    = 0.375 + 0.0833333 + 0.25 + 0.125 = 5/6 ≈ 0.8333333.
// kappa = (Po - Pe)/(1 - Pe) = (11/12 - 5/6)/(1 - 5/6)
//        = (1/12)/(1/6) = 1/2 = 0.5  →  'Moderate' (0.4 <= k < 0.6).
// Independently verified by direct fraction arithmetic above.
// ---------------------------------------------------------------------------
try {
  const A = [1, 1, 2, 2];
  const B = [1, 1, 1, 2];
  const r = computeKappa(A, B);
  const ok = Math.abs(r.kappa - 0.5) < 1e-9 && r.interpretation === 'Moderate';
  check('hand-computed example kappa 0.5 Moderate', ok, `kappa=${r.kappa} interpretation=${r.interpretation}`);
} catch (err) {
  check('hand-computed example kappa 0.5 Moderate', false, String(err?.message ?? err));
}

// ---------------------------------------------------------------------------
// Test 3: multi-rater identical => 1.0.
// ---------------------------------------------------------------------------
try {
  const m = [
    [1, 1, 1],
    [2, 2, 2],
    [3, 3, 3],
    [4, 4, 4],
  ];
  const k = computeMultiRaterKappa(m);
  check('multiRater identical => 1.0', k === 1, `kappa=${k}`);
} catch (err) {
  check('multiRater identical => 1.0', false, String(err?.message ?? err));
}

// ---------------------------------------------------------------------------
// Test 4a: improvement +0.15 => significant true.
// Test 4b: improvement +0.05 => significant false.
// ---------------------------------------------------------------------------
try {
  const r1 = computeKappaImprovement(0.5, 0.65);
  check(
    'improvement +0.15 significant true',
    r1.isSignificant === true && Math.abs(r1.improvementPct - 30) < 1e-9,
    `improvementPct=${r1.improvementPct} isSignificant=${r1.isSignificant}`
  );
} catch (err) {
  check('improvement +0.15 significant true', false, String(err?.message ?? err));
}

try {
  const r2 = computeKappaImprovement(0.5, 0.55);
  check(
    'improvement +0.05 significant false',
    r2.isSignificant === false && Math.abs(r2.improvementPct - 10) < 1e-9,
    `improvementPct=${r2.improvementPct} isSignificant=${r2.isSignificant}`
  );
} catch (err) {
  check('improvement +0.05 significant false', false, String(err?.message ?? err));
}

console.log(`importPathUsed=${importPathUsed}`);
if (failures > 0) {
  console.log(`${failures} test(s) FAILED`);
  process.exit(1);
} else {
  console.log('all tests PASSED');
}
