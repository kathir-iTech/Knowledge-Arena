// B1–B3 regression guard (static analysis).
// Run: node scripts/test-rpl-declare-status.mjs
//
// These items are enforced by Next API routes that need Firestore, so they are
// verified here by asserting the source contracts, and end-to-end by
// tests/rpl-e2e.spec.ts (Playwright, Firebase emulator).

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let pass = 0;
let fail = 0;
function ok(name, cond, detail = '') {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const declareRoute = read('src/app/api/rpl/declare/route.ts');
const declarePage = read('src/app/(rpl)/rpl/declare/page.tsx');
const statusRoute = read('src/app/api/rpl/status/[workerId]/route.ts');
const landing = read('src/app/(rpl)/rpl/page.tsx');
const resultPage = read('src/app/(rpl)/rpl/declare/result/page.tsx');
const statusPage = read('src/app/(rpl)/rpl/status/page.tsx');
const nav = read('src/components/rpl/RPLGladiatorNav.tsx');

console.log('\nB1 — require at least one claimed skill');
{
  ok('declare API returns NO_SKILL_CLAIMED', declareRoute.includes("'NO_SKILL_CLAIMED'"));
  ok('declare API rejects an empty claim set with 400', /claimedSkillCount === 0[\s\S]{0,200}status: 400/.test(declareRoute));
  ok('wizard blocks Next until a skill is claimed', /step === 1 && !hasClaimedSkill/.test(declarePage));
  ok('wizard shows an inline reason', declarePage.includes('Mark at least one skill as'));
  ok('submit button also blocked when nothing claimed', /disabled=\{submitting \|\| !step1Valid \|\| !hasClaimedSkill\}/.test(declarePage));
}

console.log('\nB2 — human reference codes, never the UID');
{
  ok('declare API imports allocateReferenceCode', declareRoute.includes('allocateReferenceCode'));
  ok('declare API no longer stores the uid as the code', !/assessmentReferenceCode:\s*uid\b/.test(declareRoute));
  ok('declare API no longer returns the uid as the code', !/referenceCode:\s*uid\b/.test(declareRoute));
  ok('reference-code module exists and exports isReferenceCode', read('src/lib/rpl/reference-code.ts').includes('export function isReferenceCode'));
  ok('status UI links by reference code', statusPage.includes('isReferenceCode(status.referenceCode)'));
  ok('sidebar nav links by reference code', nav.includes('isReferenceCode(status.referenceCode)'));
  ok('profile page renders the reference code, not the uid', !/Worker \{profile\.workerId\}/.test(read('src/app/(rpl)/rpl/profile/[workerId]/page.tsx')));
  ok('offline sync surfaces returned reference codes', read('src/lib/rpl/offline-sync.ts').includes('referenceCodes'));
}

console.log("\nB3 — own record with no declaration answers { status: 'none' }");
{
  ok('status route returns the none shape', /status:\s*'none'/.test(statusRoute));
  ok('status route returns 200 (not 404) for own missing record', /status: 'none' \}, \{ status: 200 \}/.test(statusRoute));
  ok('landing redirects only on a real stage', /typeof body\.stage === 'string'/.test(landing));
  ok('status page handles the none shape', statusPage.includes("body.status === 'none'"));
  ok('result page handles the none shape', resultPage.includes("body.status === 'none'"));
  ok('nav falls back on a missing stage', nav.includes("typeof body.stage !== 'string'"));
}

console.log("\nB4 — only claimed packs, with score + reason");
{
  ok('types expose matchScore/matchReason', /matchScore\?: number;[\s\S]{0,120}matchReason\?: string;/.test(read('src/lib/rpl/types.ts')));
  ok('status route derives packs from per-unit claims', statusRoute.includes('declarationsByPack'));
  ok('status route skips packs with no claimed unit', /claimedIds\.size === 0\) continue/.test(statusRoute));
  ok('status route sets matchScore', /matchScore:\s*Math\.round/.test(statusRoute));
  ok('status route sets matchReason', /matchReason:\s*`You declared/.test(statusRoute));
  ok('result page renders the match score', resultPage.includes('pack.matchScore'));
  ok('result page renders the match reason', resultPage.includes('pack.matchReason'));
  ok('status page renders the match score', statusPage.includes('pack.matchScore'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
