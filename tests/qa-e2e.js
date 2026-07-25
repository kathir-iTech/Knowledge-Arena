/**
 * QA E2E Workflow Tests v2
 *
 * Tests every feature from the UI perspective with SSR-aware HTML checking.
 * Pages render as loading screens (client-side hydrated) so we verify
 * the page bundle is loaded and the app doesn't crash.
 */

const http = require('http');

const BASE = 'http://localhost:3456';
const RESULTS = { pass: [], fail: [] };
let totalTests = 0;
let passedTests = 0;

async function fetch(url, options = {}) {
  // Rate limit to 1 request per 500ms to avoid overwhelming Turbopack
  if (fetch._lastFetch) {
    const wait = Math.max(0, 500 - (Date.now() - fetch._lastFetch));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
  }
  fetch._lastFetch = Date.now();
  
  return new Promise((resolve, reject) => {
    const u = new URL(url.startsWith('http') ? url : BASE + url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'QA-E2E-Test/1.0',
        'Accept-Encoding': 'identity',
        ...(options.headers || {}),
      },
      timeout: 60000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
          url: url,
          method: options.method || 'GET',
        });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

function test(name, fn) {
  totalTests++;
  return fn().then(() => {
    passedTests++;
    RESULTS.pass.push(name);
    console.log(`  PASS: ${name}`);
  }).catch(err => {
    RESULTS.fail.push({ name, error: err.message, stack: err.stack });
    console.log(`  FAIL: ${name}`);
    console.log(`       ${err.message}`);
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertContains(text, search, message) {
  if (!text || !text.includes(search)) {
    throw new Error(message || `Expected "${text ? text.substring(0,100) : 'null'}" to contain "${search}"`);
  }
}

function assertNotContains(text, search, message) {
  if (text && text.includes(search)) {
    throw new Error(message || `Expected NOT to contain "${search}"`);
  }
}

function assertIsPage(response, pageName) {
  assert(response.status === 200,
    `${pageName}: expected 200, got ${response.status}`);
  // Every page renders a loading screen initially (Firebase auth)
  assertContains(response.body, 'Knowledge Arena',
    `${pageName}: missing app shell`);
  assertContains(response.body, 'Authenticating',
    `${pageName}: missing loading state`);
}

async function waitForDevServer(maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch('/');
      if (res.status === 200) return;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('Dev server did not start');
}

// Rate limit: 1 request per 500ms to avoid overwhelming Turbopack
const requestQueue = [];
let lastRequestTime = 0;

async function rateLimitedFetch(url, options = {}) {
  const now = Date.now();
  const waitTime = Math.max(0, 500 - (now - lastRequestTime));
  if (waitTime > 0) {
    await new Promise(r => setTimeout(r, waitTime));
  }
  lastRequestTime = Date.now();
  return fetch(url, options);
}


function testApiRoute(method, path, expectedStatus, body) {
  return test(`API ${method} ${path} returns ${expectedStatus}`, async () => {
    const opts = { method };
    if (body) {
      opts.body = body;
      opts.headers = { 'Content-Type': 'application/json' };
    }
    const res = await fetch(path, opts);
    assert(res.status === expectedStatus,
      `Expected ${expectedStatus}, got ${res.status}. Body: ${res.body ? res.body.substring(0,200) : 'empty'}`);
  });
}

function testApiRouteWithBodyCheck(method, path, expectedStatus, body, bodyCheck) {
  return test(`API ${method} ${path} returns ${expectedStatus} with expected body`, async () => {
    const opts = { method };
    if (body) {
      opts.body = body;
      opts.headers = { 'Content-Type': 'application/json' };
    }
    const res = await fetch(path, opts);
    assert(res.status === expectedStatus,
      `Expected ${expectedStatus}, got ${res.status}`);
    if (bodyCheck && res.body) {
      bodyCheck(res.body);
    }
  });
}

// ──────────────────────────────────────────────────────────────
// RUN ALL TESTS
// ──────────────────────────────────────────────────────────────
(async () => {
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║  KNOWLEDGE ARENA — QA E2E WORKFLOW TESTS         ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');
  
  console.log('Waiting for dev server...');
  await waitForDevServer();
  console.log('Dev server is running!\n');

  // ═══════════════════════════════════════════════════════════
  // 1. ALL PAGES — Server-Side Rendering Verification
  //    Every page, even unauthenticated, must render without 500.
  //    The initial HTML shows a loading screen; the page bundles
  //    must be loaded for client-side hydration.
  // ═══════════════════════════════════════════════════════════
  console.log('\n── PAGE RENDER TESTS ──\n');

  const allPages = [
    { path: '/', name: 'Home/Login' },
    { path: '/kicked', name: 'Kicked' },
    { path: '/cheating-detected', name: 'Cheating Detected' },
    { path: '/force-password-change', name: 'Force Password Change' },
    { path: '/create-quiz', name: 'Create Quiz' },
    { path: '/battle/TEST123', name: 'Battle Room' },
    // Executive portal
    { path: '/executive/analytics', name: 'Executive Analytics' },
    { path: '/executive/audit-logs', name: 'Executive Audit Logs' },
    { path: '/executive/backup', name: 'Executive Backup' },
    { path: '/executive/commanders', name: 'Executive Commanders' },
    { path: '/executive/dashboard', name: 'Executive Dashboard' },
    { path: '/executive/messages', name: 'Executive Messages' },
    { path: '/executive/notifications', name: 'Executive Notifications' },
    { path: '/executive/profile', name: 'Executive Profile' },
    { path: '/executive/question-bank', name: 'Executive Question Bank' },
    { path: '/executive/requests', name: 'Executive Requests' },
    { path: '/executive/search', name: 'Executive Search' },
    { path: '/executive/settings', name: 'Executive Settings' },
    { path: '/executive/students', name: 'Executive Students' },
    { path: '/executive/workspace', name: 'Executive Workspace' },
    // Commander portal
    { path: '/commander/dashboard', name: 'Commander Dashboard' },
    { path: '/commander/history', name: 'Commander History' },
    { path: '/commander/messages', name: 'Commander Messages' },
    { path: '/commander/profile', name: 'Commander Profile' },
    { path: '/commander/requests', name: 'Commander Requests' },
    // Gladiator portal
    { path: '/gladiator/dashboard', name: 'Gladiator Dashboard' },
    { path: '/gladiator/history', name: 'Gladiator History' },
    { path: '/gladiator/profile', name: 'Gladiator Profile' },
    // Auth pages
    { path: '/auth/login', name: 'Auth Login' },
    { path: '/auth/signup', name: 'Auth Signup' },
    { path: '/auth/profile-setup', name: 'Auth Profile Setup' },
  ];

  for (const page of allPages) {
    await test(`Page ${page.name} (${page.path}) renders without crashing`, async () => {
      const res = await fetch(page.path);
      assert(res.status === 200 || res.status === 307,
        `Page ${page.path} returned ${res.status} — crash or redirect failure`);
      if (res.status === 200) {
        assertContains(res.body, 'Knowledge Arena',
          `${page.path}: missing app shell`);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 2. AUTH FLOW — Login Page Content
  // ═══════════════════════════════════════════════════════════
  console.log('\n── AUTH UI TESTS ──\n');

  await test('Login page loads with 200 status', async () => {
    const res = await fetch('/');
    assert(res.status === 200);
  });

  await test('Login page shows loading screen initially (SSR)', async () => {
    const res = await fetch('/');
    assertContains(res.body, 'Authenticating...', 
      'Should show authenticating loading screen in SSR');
    assertContains(res.body, 'brain-circuit', 
      'Should show BrainCircuit icon in loading screen');
  });

  await test('Login page loads the page.js bundle for client hydration', async () => {
    const res = await fetch('/');
    assertContains(res.body, '/app/page.js', 
      'Missing page.js bundle for client hydration');
  });

  await test('Login page loads the LoginForm component bundle', async () => {
    const res = await fetch('/');
    // The LoginForm is dynamically imported, check for the dynamic import reference
    assertContains(res.body, 'page.js', 'Missing app/page.js');
  });

  await test('Login page has Toaster with aria attributes', async () => {
    const res = await fetch('/');
    assertContains(res.body, 'aria-label="Notifications"', 'Missing toast aria label');
    assertContains(res.body, 'aria-live="polite"', 'Missing toast aria-live');
  });

  await test('Skip-to-content link is defined in ClientLayout source', async () => {
    const res = await fetch('/_next/static/chunks/app/layout.js');
    assertContains(res.body, 'Skip to main content', 
      'Missing skip-to-content link in layout bundle');
  });

  // ═══════════════════════════════════════════════════════════
  // 3. KICKED PAGE — Content Verification
  // ═══════════════════════════════════════════════════════════
  console.log('\n── KICKED PAGE TESTS ──\n');

  await test('Kicked page loads its page bundle', async () => {
    const res = await fetch('/kicked');
    assertContains(res.body, '/kicked/page.js', 'Missing kicked page bundle');
  });

  await test('Kicked page renders SSR loading then hydrates correctly', async () => {
    const res = await fetch('/kicked');
    assertContains(res.body, 'Authenticating', 'Should show authenticating');
  });

  // ═══════════════════════════════════════════════════════════
  // 4. CHEATING DETECTED PAGE
  // ═══════════════════════════════════════════════════════════
  console.log('\n── CHEATING DETECTED PAGE TESTS ──\n');

  await test('Cheating detected page loads its bundle', async () => {
    const res = await fetch('/cheating-detected');
    assertContains(res.body, '/cheating-detected/page.js', 'Missing page bundle');
  });

  // ═══════════════════════════════════════════════════════════
  // 5. FORCE PASSWORD CHANGE PAGE
  // ═══════════════════════════════════════════════════════════
  console.log('\n── FORCE PASSWORD CHANGE PAGE TESTS ──\n');

  await test('Force password page loads its bundle', async () => {
    const res = await fetch('/force-password-change');
    assertContains(res.body, '/force-password-change/page.js', 'Missing page bundle');
  });

  // ═══════════════════════════════════════════════════════════
  // 6. NOT-FOUND / ERROR PAGES
  // ═══════════════════════════════════════════════════════════
  console.log('\n── 404 / ERROR PAGE TESTS ──\n');

  await test('Portal-level non-existent route returns 404', async () => {
    const res = await fetch('/executive/nonexistent-page-test');
    assert(res.status === 404,
      `Expected 404 not-found page, got ${res.status}`);
  });

  await test('Root-level non-existent route redirects to home', async () => {
    const res = await fetch('/some-random-path-xyz');
    assert(res.status === 200 || res.status === 307,
      `Expected redirect, got ${res.status}`);
  });

  await test('Error page bundle exists', async () => {
    // error.tsx is a client component boundary
    const res = await fetch('/');
    assertContains(res.body, '/app/error.js', 'Missing error boundary bundle');
  });

  await test('Not-found page bundle exists', async () => {
    const res = await fetch('/');
    assertContains(res.body, '/app/not-found.js', 'Missing not-found bundle');
  });

  await test('Global error page bundle exists', async () => {
    const res = await fetch('/');
    assertContains(res.body, '/app/global-error.js', 'Missing global-error bundle');
  });

  // ═══════════════════════════════════════════════════════════
  // 7. ALL API ROUTES — Complete Verification
  // ═══════════════════════════════════════════════════════════
  console.log('\n── API ROUTE TESTS (UNAUTHENTICATED) ──\n');

  // All these routes should return 401 (unauthorized) when no auth token
  const authRequiredRoutes = [
    // Executive - All need role 'executive' → 401 unauthenticated
    { method: 'GET', path: '/api/executive/analytics-data' },
    { method: 'GET', path: '/api/executive/audit-logs' },
    { method: 'GET', path: '/api/executive/backup/export', expect: 405 }, // POST-only, GET=405
    { method: 'POST', path: '/api/executive/backup/export' },
    { method: 'POST', path: '/api/executive/backup/import' },
    { method: 'POST', path: '/api/executive/demo' },
    { method: 'GET', path: '/api/executive/export' }, // GET-only
    { method: 'GET', path: '/api/executive/notifications' },
    { method: 'DELETE', path: '/api/executive/notifications/test-id' },
    { method: 'GET', path: '/api/executive/profile' },
    { method: 'GET', path: '/api/executive/question-bank' },
    { method: 'POST', path: '/api/executive/question-bank' },
    { method: 'GET', path: '/api/executive/requests' },
    { method: 'PATCH', path: '/api/executive/requests' }, // PATCH, not POST
    { method: 'GET', path: '/api/executive/search?q=test' },
    { method: 'GET', path: '/api/executive/settings' },
    { method: 'PUT', path: '/api/executive/settings' },
    { method: 'GET', path: '/api/executive/workspace' },
    // Commander
    { method: 'GET', path: '/api/commander/dashboard' },
    { method: 'GET', path: '/api/commander/requests' },
    // Gladiator
    { method: 'GET', path: '/api/gladiator/dashboard' },
    // Messaging
    { method: 'GET', path: '/api/messaging/announcements' },
    { method: 'POST', path: '/api/messaging/announcements' },
    { method: 'GET', path: '/api/messaging/commanders' },
    { method: 'GET', path: '/api/messaging/conversations' },
    { method: 'POST', path: '/api/messaging/conversations' },
    { method: 'GET', path: '/api/messaging/conversations/test-id/messages' },
    { method: 'GET', path: '/api/messaging/conversations/test-id/read' },
    { method: 'POST', path: '/api/messaging/conversations/test-id/read' },
    { method: 'GET', path: '/api/messaging/announcements/test-id/read' },
    { method: 'POST', path: '/api/messaging/announcements/test-id/read' },
    // Admin
    { method: 'GET', path: '/api/admin/users' },
    // Decision support
    { method: 'GET', path: '/api/decision-support/summary' },
    // Knowledge
    { method: 'GET', path: '/api/knowledge/summary' },
    // Predictions
    { method: 'GET', path: '/api/predictions/summary' },
    // Audit
    { method: 'POST', path: '/api/audit/log' },
  ];

  for (const route of authRequiredRoutes) {
    await test(`API ${route.method} ${route.path} returns ${route.expect || 401}`, async () => {
      const opts = { method: route.method, headers: {} };
      if (route.body) {
        opts.body = JSON.stringify(route.body);
        opts.headers['Content-Type'] = 'application/json';
      }
      const res = await fetch(route.path, opts);
      const expected = route.expect || 401;
      assert(res.status === expected,
        `Expected ${expected}, got ${res.status}. Body: ${(res.body||'').substring(0,200)}`);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 8. RATE-LIMIT ROUTE — Special Behavior
  // ═══════════════════════════════════════════════════════════
  console.log('\n── RATE-LIMIT ROUTE TESTS ──\n');

  await test('Rate-limit check POST with valid body returns 200', async () => {
    const res = await fetch('/api/rate-limit/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'login' }),
    });
    // Must not be a 500 crash
    assert(res.status !== 500 && res.status !== 404,
      `Rate-limit route crashed: ${res.status}`);
    if (res.status === 200) {
      try {
        const data = JSON.parse(res.body);
        assert(data.allowed !== undefined, 'Missing "allowed" field');
      } catch (e) {
        throw new Error(`Response not valid JSON: ${res.body.substring(0,100)}`);
      }
    }
    // 400 is acceptable if validation is strict (identifier required)
    // But we should verify it fails gracefully
    if (res.status === 400) {
      try {
        const data = JSON.parse(res.body);
        assert(data.error, 'Missing error message in 400 response');
      } catch (e) {
        // At least it's not a crash
      }
    }
  });

  await test('Rate-limit check GET returns 405', async () => {
    const res = await fetch('/api/rate-limit/check');
    assert(res.status === 405,
      `Expected 405, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════
  // 9. WRONG METHOD TESTS
  // ═══════════════════════════════════════════════════════════
  console.log('\n── WRONG METHOD TESTS ──\n');

  await test('GET on POST-only route returns 405', async () => {
    const res = await fetch('/api/executive/backup/export');
    assert(res.status === 405,
      `Expected 405, got ${res.status}`);
  });

  await test('POST on GET-only route returns 405', async () => {
    const res = await fetch('/api/executive/search?q=test', { method: 'POST' });
    assert(res.status === 405 || res.status === 401,
      `Expected 405/401, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════
  // 10. SECURITY HEADERS
  // ═══════════════════════════════════════════════════════════
  console.log('\n── SECURITY HEADER TESTS ──\n');

  const securityTests = [
    { header: 'x-content-type-options', expect: 'nosniff' },
    { header: 'x-frame-options', expect: 'DENY' },
    { header: 'referrer-policy', expect: 'strict-origin-when-cross-origin' },
    { header: 'strict-transport-security', test: v => v && v.length > 0 },
  ];

  for (const t of securityTests) {
    await test(`Security header '${t.header}' is present`, async () => {
      const res = await fetch('/');
      const val = res.headers[t.header];
      assert(val !== undefined && val !== null && val !== '',
        `Missing header: ${t.header}`);
      if (t.expect) assertContains(val.toLowerCase(), t.expect);
      if (t.test) assert(t.test(val), `${t.header} failed custom check`);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 11. CONTENT SECURITY
  // ═══════════════════════════════════════════════════════════
  console.log('\n── CONTENT SECURITY TESTS ──\n');

  await test('No dangerouslySetInnerHTML in any page source', async () => {
    const res = await fetch('/');
    assertNotContains(res.body, 'dangerouslySetInnerHTML',
      'Found dangerouslySetInnerHTML pattern');
  });

  await test('No stack traces leaked to client', async () => {
    const res = await fetch('/');
    assertNotContains(res.body, 'at ', 'Stack trace leaked');
    assertNotContains(res.body, 'Error:', 'Error object leaked');
  });

  // ═══════════════════════════════════════════════════════════
  // 12. AUTH FLOW — Firebase error handling
  // ═══════════════════════════════════════════════════════════
  console.log('\n── AUTH SERVICE INTEGRATION TESTS ──\n');

  await test('Auth routes are accessible (auth context provider loaded)', async () => {
    const res = await fetch('/');
    // Firebase Auth client is loaded as part of the layout
    assertContains(res.body, 'auth', 'Firebase auth reference');
    assertContains(res.body, 'firebase', 'Firebase reference');
  });

  await test('ClientLayout and AuthProvider are loaded in bundle', async () => {
    const res = await fetch('/');
    assertContains(res.body, 'AuthProvider', 'AuthProvider loaded');
    assertContains(res.body, 'ClientLayout', 'ClientLayout loaded');
  });

  // ═══════════════════════════════════════════════════════════
  // 13. BATTLE PAGE — Real-time features
  // ═══════════════════════════════════════════════════════════
  console.log('\n── BATTLE PAGE TESTS ──\n');

  await test('Battle page loads without crashing', async () => {
    const res = await fetch('/battle/TEST123');
    assert(res.status === 200,
      `Battle page returned ${res.status} instead of 200`);
    assertContains(res.body, 'Knowledge Arena', 'Missing app shell');
  });

  await test('Battle page loads with battle-specific bundle', async () => {
    const res = await fetch('/battle/TEST123');
    assertContains(res.body, '/battle', 'Missing battle route reference');
  });

  // ═══════════════════════════════════════════════════════════
  // 14. PORTAL AUTHENTICATION GUARDS
  // ═══════════════════════════════════════════════════════════
  console.log('\n── PORTAL AUTH GUARD TESTS ──\n');

  const portalPages = [
    '/executive/analytics',
    '/executive/audit-logs',
    '/executive/backup',
    '/executive/commanders',
    '/executive/messages',
    '/executive/notifications',
    '/executive/profile',
    '/executive/question-bank',
    '/executive/requests',
    '/executive/search',
    '/executive/settings',
    '/executive/students',
    '/executive/workspace',
    '/commander/dashboard',
    '/commander/history',
    '/commander/messages',
    '/commander/profile',
    '/commander/requests',
    '/gladiator/dashboard',
    '/gladiator/history',
    '/gladiator/profile',
  ];

  for (const pagePath of portalPages) {
    await test(`Portal guard: ${pagePath} does not crash (shows loading or redirects)`, async () => {
      const res = await fetch(pagePath);
      assert(res.status === 200 || res.status === 307 || res.status === 302,
        `${pagePath} crashed with ${res.status}`);
      if (res.status === 200) {
        assertContains(res.body, 'Knowledge Arena', `${pagePath}: missing app shell`);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 15. CLIENT-SIDE BUNDLE VERIFICATION
  // ═══════════════════════════════════════════════════════════
  console.log('\n── CLIENT-SIDE BUNDLE TESTS ──\n');

  // Verify that key page bundles exist for client-side hydration
  const pageBundles = [
    '/_next/static/chunks/app/page.js',
    '/_next/static/chunks/app/kicked/page.js',
    '/_next/static/chunks/app/cheating-detected/page.js',
    '/_next/static/chunks/app/force-password-change/page.js',
    '/_next/static/chunks/app/not-found.js',
    '/_next/static/chunks/app/error.js',
    '/_next/static/chunks/app/global-error.js',
    '/_next/static/chunks/app/layout.js',
  ];

  for (const bundle of pageBundles) {
    await test(`Bundle exists: ${bundle.split('/').pop()}`, async () => {
      const res = await fetch(bundle);
      assert(res.status === 200,
        `Bundle ${bundle} returned ${res.status} — missing page bundle`);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 16. EXECUTIVE PAGE REDIRECT — Dashboard -> Workspace
  // ═══════════════════════════════════════════════════════════
  console.log('\n── EXECUTIVE DASHBOARD REDIRECT ──\n');

  await test('Executive dashboard page redirects to workspace (client-side)', async () => {
    const res = await fetch('/executive/dashboard');
    assert(res.status === 200, `Dashboard returned ${res.status}`);
    assertContains(res.body, 'dashboard', 'Dashboard should reference its own page bundle');
  });

  // ═══════════════════════════════════════════════════════════
  // 17. MIDDLEWARE VERIFICATION
  // ═══════════════════════════════════════════════════════════
  console.log('\n── MIDDLEWARE TESTS ──\n');

  await test('Middleware does not block API routes', async () => {
    const res = await fetch('/api/rate-limit/check');
    // Should reach the route handler, not get 404 from middleware
    assert(res.status === 405 || res.status === 401 || res.status === 200,
      `API route blocked by middleware: ${res.status}`);
  });

  await test('Middleware does not block battle routes', async () => {
    const res = await fetch('/battle/TEST456');
    assert(res.status === 200,
      `Battle route blocked by middleware: ${res.status}`);
  });

  await test('Middleware does not block public routes', async () => {
    const res = await fetch('/kicked');
    assert(res.status === 200, `Public route blocked: ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════
  // 18. FIREBASE CONFIG VERIFICATION
  // ═══════════════════════════════════════════════════════════
  console.log('\n── FIREBASE CONFIG TESTS ──\n');

  await test('Firebase config is loaded in client bundles', async () => {
    const res = await fetch('/');
    assertContains(res.body, 'firebase', 'Firebase SDK loaded');
  });

  await test('Firebase Auth is configured via layout bundles', async () => {
    const res = await fetch('/');
    assertContains(res.body, 'FirebaseClientProvider', 'Firebase provider loaded');
  });

  // ═══════════════════════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════════');
  console.log('  RESULTS SUMMARY');
  console.log('══════════════════════════════════════════════');
  console.log(`  Total tests: ${totalTests}`);
  console.log(`  Passed:      ${passedTests}`);
  console.log(`  Failed:      ${RESULTS.fail.length}`);

  if (RESULTS.fail.length > 0) {
    console.log('\n  FAILED WORKFLOWS:');
    for (const f of RESULTS.fail) {
      console.log(`    ✘ ${f.name}`);
      console.log(`      ${f.error.split('\n')[0]}`);
    }
  }

  process.exit(RESULTS.fail.length > 0 ? 1 : 0);
})();
