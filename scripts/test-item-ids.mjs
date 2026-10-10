// B4 tests — shared item-id scheme + legacy migration mapping (D4).
// Run with: node scripts/test-item-ids.mjs   (Node >=22.13 type-stripping)

async function loadTs(specifier) {
  const candidates = [`../../${specifier}`, `../${specifier}`];
  for (const p of candidates) {
    try {
      const mod = await import(p);
      console.log(`TS import worked: ${p}`);
      return mod;
    } catch (err) {
      console.log(`TS import failed: ${p}: ${err?.message ?? err}`);
    }
  }
  console.log(`DIRECT_TS_IMPORT_FAILED for ${specifier}`);
  process.exit(1);
}

const {
  performanceItemId,
  knowledgeItemId,
  itemIdFor,
  firestoreItemId,
  isCanonicalItemId,
  parseLegacyItemId,
} = await loadTs('src/lib/rpl/item-ids.ts');

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}\n       expected ${e}\n       actual   ${a}`);
  }
}

// --- 1. canonical scheme ----------------------------------------------------
console.log('\ncanonical scheme');
{
  check('performanceItemId', performanceItemId('ELE/N1301', 0), 'ELE/N1301::p0');
  check('knowledgeItemId', knowledgeItemId('ELE/N1301', 12), 'ELE/N1301::k12');
  check('itemIdFor performance', itemIdFor('CON/N0304-1', 'performance', 3), 'CON/N0304-1::p3');
  check('itemIdFor knowledge', itemIdFor('CON/N0304-1', 'knowledge', 3), 'CON/N0304-1::k3');
  check('firestoreItemId slashes -> underscores', firestoreItemId('ELE/N1301::p0'), 'ELE_N1301::p0');
  check('firestoreItemId keeps ::', firestoreItemId('CON/N0304-1::k2'), 'CON_N0304-1::k2');
  check('isCanonical performance', isCanonicalItemId('ELE/N1301::p0'), true);
  check('isCanonical knowledge', isCanonicalItemId('ELE/N1301::k0'), true);
  check('isCanonical legacy seeder id', isCanonicalItemId('ELE-N1301-p0'), false);
  check('isCanonical e2e legacy knowledge id', isCanonicalItemId('ELE-N1301-k0'), false);
}

// --- 2. legacy parser -------------------------------------------------------
console.log('\nparseLegacyItemId');
{
  check('seeder perf id', parseLegacyItemId('ELE-N1301-p3'), { kind: 'performance', index: 3 });
  check('e2e knowledge id', parseLegacyItemId('ELE-N1301-k0'), { kind: 'knowledge', index: 0 });
  check('dashed unit body (CON/N0304-1)', parseLegacyItemId('CON-N0304-1-p0'), {
    kind: 'performance',
    index: 0,
  });
  check('canonical id -> null (not legacy)', parseLegacyItemId('ELE/N1301::p0'), null);
  check('garbage -> null', parseLegacyItemId('random-item'), null);
}

// --- 3. seed -> open simulation (the D4 regression) --------------------------
// Mirrors the migration + the assess page's buildInitialItems lookup: seeded
// legacy items are mapped to canonical ids; the page's byId.get(performance
//ItemId(unit, idx)) must then find the pre-scored values.
console.log('\nseed -> open: migrated seeded items render in the assess page lookup');
{
  const SEED = [
    { legacy: 'ELE-N1301-p0', unitId: 'ELE/N1301', kind: 'performance', rubricScore: 4 },
    { legacy: 'ELE-N1301-p1', unitId: 'ELE/N1301', kind: 'performance', rubricScore: 3 },
    { legacy: 'ELE-N1302-p0', unitId: 'ELE/N1302', kind: 'performance', rubricScore: 2 },
  ];
  const byId = new Map();
  for (const s of SEED) {
    const parsed = parseLegacyItemId(s.legacy);
    check(`parse ${s.legacy}`, parsed !== null, true);
    const itemId = itemIdFor(s.unitId, parsed.kind, parsed.index);
    byId.set(itemId, s);
  }
  // What buildInitialItems does for unit ELE/N1301 idx 0..1:
  const prev0 = byId.get(performanceItemId('ELE/N1301', 0));
  const prev1 = byId.get(performanceItemId('ELE/N1301', 1));
  const missing2 = byId.get(performanceItemId('ELE/N1301', 2));
  check('pre-scored rubricScore found after migration', prev0?.rubricScore, 4);
  check('second criterion found', prev1?.rubricScore, 3);
  check('unscored criterion absent (renders empty)', missing2, undefined);
  // And the doc id the assess route would write to:
  check('doc id for migrated item', firestoreItemId(performanceItemId('ELE/N1301', 0)), 'ELE_N1301::p0');
}

// --- 4. no double-mapping ----------------------------------------------------
console.log('\nidempotence: migrating a canonical id is a no-op');
{
  const itemId = performanceItemId('ELE/N1301', 3);
  check('canonical passes through', isCanonicalItemId(itemId), true);
  check('parse returns null for canonical', parseLegacyItemId(itemId), null);
}

console.log(failures === 0 ? '\nALL ITEM-ID TESTS PASSED' : `\n${failures} ITEM-ID TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
