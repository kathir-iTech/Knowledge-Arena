// B2 tests — shared RPL scoring lib (src/lib/rpl/scores.ts).
// Run with: node scripts/test-scores.mjs   (Node >=22.13 type-stripping)
// Full coverage incl. the profile-identity check: npx tsx scripts/test-scores.mjs

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

const scores = await loadTs('src/lib/rpl/scores.ts');
const { scoreItemsAgainstUnits, computeAssessmentScores, storedAssessmentScore } = scores;

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

const UNITS = [
  { id: 'U1', name: 'Unit One', performanceCriteria: ['p0', 'p1', 'p2', 'p3'], knowledgeCriteria: [] },
  { id: 'U2', name: 'Unit Two', performanceCriteria: ['p0'], knowledgeCriteria: [] },
];

const perf = (unitId, idx, rubricScore) => ({
  itemId: `${unitId}::p${idx}`,
  assessmentId: 'a1',
  unitId,
  kind: 'performance',
  criterionText: `crit ${idx}`,
  rubricScore,
});
const knowledge = (unitId, idx, knowledgePass) => ({
  itemId: `${unitId}::k${idx}`,
  assessmentId: 'a1',
  unitId,
  kind: 'knowledge',
  criterionText: `know ${idx}`,
  knowledgePass,
});

// --- 1. rubric math: [4,3,4,4] -> 92, [3,3,2,4] -> 67, overall 80 ---------
console.log('\nscoreItemsAgainstUnits — documented formula, golden values');
{
  const items = [
    perf('U1', 0, 4), perf('U1', 1, 3), perf('U1', 2, 4), perf('U1', 3, 4),
    perf('U2', 0, 3), perf('U2', 1, 3), perf('U2', 2, 2), perf('U2', 3, 4),
  ];
  // U2 criteria only has 1 perf in UNITS — extra items still group by unitId.
  const { unitScores, overallScore } = scoreItemsAgainstUnits(UNITS, items);
  check('U1 score (mean 91.67 -> 92)', unitScores.U1.score, 92);
  check('U1 status competent (>=75)', unitScores.U1.status, 'competent');
  check('U2 score (mean 66.67 -> 67)', unitScores.U2.score, 67);
  check('U2 status partial (50-74)', unitScores.U2.status, 'partial');
  check('overall = round((92+67)/2)', overallScore, 80);
}

// --- 2. knowledge side + equal weighting ----------------------------------
console.log('\nscoreItemsAgainstUnits — performance+knowledge equal weighting');
{
  const items = [perf('U1', 0, 4), knowledge('U1', 0, true), knowledge('U1', 1, false)];
  // perf mean 100, knowledge mean 50 -> (100+50)/2 = 75 -> competent
  const { unitScores } = scoreItemsAgainstUnits(UNITS, items);
  check('mixed unit score 75', unitScores.U1.score, 75);
  check('knowledge gaps captured', unitScores.U1.knowledgeGaps, ['know 1']);
}

// --- 3. skipped-not-zeroed + empty units -----------------------------------
console.log('\nscoreItemsAgainstUnits — unscored items skipped, empty unit scores 0');
{
  const items = [perf('U1', 0, 4), knowledge('U1', 0, undefined), perf('U1', 9, 99)];
  // knowledge unanswered skipped; invalid rubric 99 skipped -> unit = 100
  const { unitScores } = scoreItemsAgainstUnits(UNITS, items);
  check('U1 = 100 with only valid perf', unitScores.U1.score, 100);
  check('U2 (no items) = 0 not_yet', [unitScores.U2.score, unitScores.U2.status], [0, 'not_yet']);
}

// --- 4. computeAssessmentScores: fields + raw scores map -------------------
console.log('\ncomputeAssessmentScores — write-path fields');
{
  const pack = { id: 'P', title: 'p', nsqfLevel: 4, sector: 's', trade: 't', competencyUnits: UNITS };
  const items = [
    perf('U1', 0, 4), perf('U1', 1, 3), perf('U1', 2, 4), perf('U1', 3, 4),
    knowledge('U2', 0, true),
  ];
  const fields = computeAssessmentScores(items, pack);
  // U1=92 (perf), U2=100 (knowledge-only pass) -> round((92+100)/2)=96
  check('overall is mean of rounded unit scores', fields.overallScore, 96);
  check('scores map: raw rubric preserved', fields.scores['U1::p0'], 4);
  check('scores map: knowledge -> 1', fields.scores['U2::k0'], 1);
  check('unitScores keyed by unit id', Object.keys(fields.unitScores).sort(), ['U1', 'U2']);
}

// --- 5. storedAssessmentScore: the admin read fallback chain ----------------
console.log('\nstoredAssessmentScore — shared admin read helper');
{
  check('prefers overallScore', storedAssessmentScore({ overallScore: 66, unitScores: { a: { score: 10 } } }), 66);
  check(
    'falls back to unitScores mean',
    storedAssessmentScore({ unitScores: { a: { score: 80 }, b: { score: 60 } } }),
    70,
  );
  check(
    'accepts bare-number unitScores',
    storedAssessmentScore({ unitScores: { a: 80, b: 60 } }),
    70,
  );
  check('falls back to raw scores map mean (legacy)', storedAssessmentScore({ scores: { x: 4, y: 2 } }), 3);
  check('empty doc -> null', storedAssessmentScore({}), null);
  check('non-finite overall ignored', storedAssessmentScore({ overallScore: NaN, unitScores: { a: { score: 50 } } }), 50);
}

// --- 6. identity with generateCompetencyProfile (needs extensionless import;
//        works under tsx, skipped under plain node) --------------------------
console.log('\nidentity — computeAssessmentScores vs generateCompetencyProfile');
{
  let cp = null;
  try {
    // competency-profile.ts value-imports './scores' extension-less, which
    // plain node type-stripping cannot resolve (tsx can). Skip when absent.
    cp = await import('../src/lib/rpl/competency-profile.ts');
  } catch {
    cp = null;
  }
  if (cp && cp.generateCompetencyProfile) {
    const pack = { id: 'P', title: 'p', nsqfLevel: 4, sector: 's', trade: 't', competencyUnits: UNITS };
    const items = [
      perf('U1', 0, 3), perf('U1', 1, 2), knowledge('U2', 0, false),
    ];
    const profile = cp.generateCompetencyProfile(items, pack);
    const fields = computeAssessmentScores(items, pack);
    check('overallScore identical', fields.overallScore, profile.overallScore);
    check('unitScores identical', fields.unitScores, profile.unitScores);
  } else {
    console.log('  skip identity check (plain node cannot resolve ./scores; run via npx tsx)');
  }
}

console.log(failures === 0 ? '\nALL SCORES TESTS PASSED' : `\n${failures} SCORES TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
