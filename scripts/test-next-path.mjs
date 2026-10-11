// Unit tests for ?next= handling (sanitizeNextPath) — RPL Compass login.
// Run with: node scripts/test-next-path.mjs (Node >=22.13, type-stripping).

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

const { sanitizeNextPath } = await loadTs('src/lib/next-path.ts');

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

console.log('\nsame-origin paths are honoured');
check('null -> null', sanitizeNextPath(null), null);
check('undefined -> null', sanitizeNextPath(undefined), null);
check('empty string -> null', sanitizeNextPath(''), null);
check('whitespace only -> null', sanitizeNextPath('   '), null);
check('plain /rpl', sanitizeNextPath('/rpl'), '/rpl');
check('nested path keeps query', sanitizeNextPath('/rpl/assessor?page=2'), '/rpl/assessor?page=2');

console.log('\nabsolute and hostile URLs are rejected');
check('https://evil.com rejected', sanitizeNextPath('https://evil.com'), null);
check('scheme-relative //evil.com rejected', sanitizeNextPath('//evil.com'), null);
check('javascript: rejected', sanitizeNextPath('javascript:alert(1)'), null);
check('mailto: rejected', sanitizeNextPath('mailto:e@x.com'), null);
check('backslash trick rejected', sanitizeNextPath('/\\evil.com'), null);
check('protocol-relative with backslash rejected', sanitizeNextPath('\\\\evil.com'), null);
check('parent traversal rejected', sanitizeNextPath('/rpl/../../admin'), null);
check('data: URI rejected', sanitizeNextPath('data:text/html,x'), null);
check('control char rejected', sanitizeNextPath('/rpl\u0000https://evil.com'), null);

console.log('\nencoded tricks are still caught after URL decoding');
check('%2F%2F decoded scheme-relative rejected', sanitizeNextPath('//evil.com'), null);
check('encoded backslash rejected', sanitizeNextPath('/.%5C..%5C'), null);

console.log(failures === 0 ? '\nALL NEXT-PATH TESTS PASSED' : `\n${failures} NEXT-PATH TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);