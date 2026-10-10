// Static-analysis tests for B5–B10 defects (SIH-26242).
// Each test greps the source tree and asserts the fix is present.
// Run: node scripts/test-sih-gaps.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
function ok(name, condition, detail) {
  if (condition) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

function walk(dir, ext) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!['node_modules', '.next', '.git', 'screenshots', 'screenshots-sih'].includes(entry)) {
        results.push(...walk(full, ext));
      }
    } else if (ext.some(e => entry.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

function grepIn(files, pattern) {
  const hits = [];
  for (const f of files) {
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (pattern.test(line)) hits.push({ file: f.replace(ROOT + '\\', '').replace(ROOT + '/', ''), line: i + 1, text: line.trim() });
    });
  }
  return hits;
}

// ── B5: every /api/rpl route enforces rate limiting ─────────────────────────
console.log('\nB5 — Rate limiting on all /api/rpl routes');
{
  const apiFiles = walk(join(ROOT, 'src', 'app', 'api', 'rpl'), ['.ts']);
  const routeFiles = apiFiles.filter(f => f.endsWith('route.ts'));
  const missing = routeFiles.filter(f => !readFileSync(f, 'utf8').includes('enforceRateLimit'));
  ok('every /api/rpl/**/route.ts imports enforceRateLimit', missing.length === 0,
    missing.length ? `missing in: ${missing.map(f => f.replace(ROOT + '\\', '')).join(', ')}` : undefined);
  ok('at least 10 RPL route files exist', routeFiles.length >= 10, `found ${routeFiles.length}`);
}

// ── B6: suggest route has no fabricated score fallback ─────────────────────
console.log('\nB6 — AI suggest returns honest errors');
{
  const suggest = join(ROOT, 'src', 'app', 'api', 'rpl', 'assess', 'suggest', 'route.ts');
  const src = readFileSync(suggest, 'utf8');
  ok('AI_TIMEOUT status present', src.includes('AI_TIMEOUT'));
  ok('AI_PARSE_FAILED status present', src.includes('AI_PARSE_FAILED'));
  ok('AI_UNAVAILABLE status present', src.includes('AI_UNAVAILABLE'));
  ok('no fabricated score: 2 fallback', !/score:\s*2\b/.test(src) && !/score: 2,/.test(src));
  ok('no FALLBACK_SCORE constant', !/FALLBACK/.test(src));
}

// ── B7: rpl_forge_cache denied in rules, rules == template ─────────────────
console.log('\nB7 — Firestore rules');
{
  const rules = readFileSync(join(ROOT, 'firestore.rules'), 'utf8');
  const template = readFileSync(join(ROOT, 'firestore.rules.template'), 'utf8');
  ok('firestore.rules contains rpl_forge_cache deny', /match \/rpl_forge_cache/.test(rules));
  ok('firestore.rules.template contains rpl_forge_cache deny', /match \/rpl_forge_cache/.test(template));
  ok('firestore.rules == firestore.rules.template', rules === template);
}

// ── B9: service worker does not cache authenticated API responses ──────────
console.log('\nB9 — Service worker safety');
{
  const sw = readFileSync(join(ROOT, 'public', 'rpl-sw.js'), 'utf8');
  ok('cache name is rpl-precache-v2', /rpl-precache-v2/.test(sw));
  ok('skips redirected responses', /res\.redirected/.test(sw));
  ok('SW returns 202 for offline declare POST (does not replay)', /status:\s*202/.test(sw));
  ok('posts RPL_SYNC_PENDING to clients', /RPL_SYNC_PENDING/.test(sw));
  ok('does not cache /api/rpl/status responses', /Status reads are NOT cached/.test(sw));
}

// ── B10: no hardcoded API key in scripts or src outside config ─────────────
console.log('\nB10 — Firebase web API key hygiene');
{
  const allFiles = [
    ...walk(join(ROOT, 'scripts'), ['.ts', '.mjs', '.js']),
    ...walk(join(ROOT, 'src'), ['.ts', '.tsx']),
  ];
  const keyHits = grepIn(allFiles, /AIza[0-9A-Za-z_-]{35}/);
  const allowed = keyHits.filter(h => h.file.includes('src') && h.file.includes('firebase') && h.file.includes('config.ts'));
  const forbidden = keyHits.filter(h => !(h.file.includes('src') && h.file.includes('firebase') && h.file.includes('config.ts')));
  ok('no AIza key outside src/firebase/config.ts', forbidden.length === 0,
    forbidden.length ? `found in: ${forbidden.map(h => h.file).join(', ')}` : undefined);
  ok('scripts/e2e-test.ts reads key from env', readFileSync(join(ROOT, 'scripts', 'e2e-test.ts'), 'utf8').includes('FIREBASE_WEB_API_KEY'));
  ok('scripts/api-test.ts reads key from env', readFileSync(join(ROOT, 'scripts', 'api-test.ts'), 'utf8').includes('FIREBASE_WEB_API_KEY'));
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
