// A2 unit test — env-assigned RPL roles must never rewrite a Quorena account.
// Run with: node scripts/test-session-role.mjs
// (fallback: npx tsx scripts/test-session-role.mjs)
// Node >=22.13 required (package.json engines) for TS type-stripping.

console.log(`node ${process.version}`);

let mod = null;
let importPathUsed = null;
const candidates = ['../src/lib/session-role.ts', '../../src/lib/session-role.ts'];
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
  console.log('DIRECT_TS_IMPORT_FAILED — fallback: run via `npx tsx scripts/test-session-role.mjs`');
  process.exit(1);
}

const { resolveSessionRole, isQuorenaRole, QUORENA_ROLES } = mod;

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`PASS: ${name}${detail ? ` — ${detail}` : ''}`);
  else {
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
    failures += 1;
  }
}

function decision(input) {
  const d = resolveSessionRole(input);
  return `${d.action}:${d.role ?? 'null'}`;
}

// --- Quorena role classification ---
check(
  'isQuorenaRole recognizes executive/commander/gladiator',
  QUORENA_ROLES.length === 3 &&
    isQuorenaRole('executive') &&
    isQuorenaRole('commander') &&
    isQuorenaRole('gladiator') &&
    !isQuorenaRole('candidate') &&
    !isQuorenaRole('assessor') &&
    !isQuorenaRole('admin') &&
    !isQuorenaRole(null),
);

// --- env role + Quorena doc/claim => refuse (never rewrite) ---
check(
  'env admin + doc gladiator => env-conflict',
  decision({ envRole: 'admin', docRole: 'gladiator', docExists: true }) === 'env-conflict:null',
);
check(
  'env assessor + doc executive => env-conflict',
  decision({ envRole: 'assessor', docRole: 'executive', docExists: true }) === 'env-conflict:null',
);
check(
  'env admin + doc commander => env-conflict',
  decision({ envRole: 'admin', docRole: 'commander', docExists: true }) === 'env-conflict:null',
);
check(
  'env admin + claim gladiator (doc missing) => env-conflict',
  decision({ envRole: 'admin', claimRole: 'gladiator', docRole: null, docExists: false }) ===
    'env-conflict:null',
);
check(
  'env admin + legacy claim student (=gladiator) => env-conflict',
  decision({ envRole: 'admin', claimRole: 'student', docRole: null, docExists: false }) ===
    'env-conflict:null',
);

// --- env role applies when doc is missing or already RPL ---
check(
  'env admin + doc missing => refresh-claims admin',
  decision({ envRole: 'admin', docRole: null, docExists: false }) === 'refresh-claims:admin',
);
check(
  'env admin + doc candidate => refresh-claims admin',
  decision({ envRole: 'admin', docRole: 'candidate', docExists: true }) === 'refresh-claims:admin',
);
check(
  'env assessor + doc assessor => refresh-claims assessor',
  decision({ envRole: 'assessor', docRole: 'assessor', docExists: true }) ===
    'refresh-claims:assessor',
);
check(
  'env admin + claim already admin => mint admin',
  decision({ envRole: 'admin', claimRole: 'admin' }) === 'mint:admin',
);

// --- no env role: unchanged behavior ---
check(
  'no env + doc gladiator => refresh-claims gladiator (never rewritten)',
  decision({ docRole: 'gladiator' }) === 'refresh-claims:gladiator',
);
check(
  'no env + no claim/doc => role-missing',
  decision({}) === 'role-missing:null',
);
check('lookup failed => lookup-failed', decision({ lookupFailed: true }) === 'lookup-failed:null');

console.log(`importPathUsed=${importPathUsed}`);
if (failures > 0) {
  console.log(`${failures} test(s) FAILED`);
  process.exit(1);
} else {
  console.log('all tests PASSED');
}
