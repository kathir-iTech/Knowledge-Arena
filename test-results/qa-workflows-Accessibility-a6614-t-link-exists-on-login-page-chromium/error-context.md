# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: qa-workflows.spec.ts >> Accessibility >> Skip to main content link exists on login page
- Location: tests\qa-workflows.spec.ts:341:7

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3456/
Call log:
  - navigating to "http://localhost:3456/", waiting until "load"

```

# Test source

```ts
  242 |       '/executive/workspace',
  243 |     ];
  244 |     for (const route of pages) {
  245 |       await page.goto(`${BASE_URL}${route}`);
  246 |       await waitForApp(page);
  247 |       const url = page.url();
  248 |       if (!url.includes('/')) {
  249 |         test.fail(true, `${route} did not redirect to login (stayed at ${url})`);
  250 |       }
  251 |     }
  252 |   });
  253 | 
  254 |   test('All commander subpages redirect to login', async ({ page }) => {
  255 |     const pages = [
  256 |       '/commander/dashboard',
  257 |       '/commander/history',
  258 |       '/commander/messages',
  259 |       '/commander/profile',
  260 |       '/commander/requests',
  261 |     ];
  262 |     for (const route of pages) {
  263 |       await page.goto(`${BASE_URL}${route}`);
  264 |       await waitForApp(page);
  265 |       expect(page.url()).toBe(BASE_URL + '/');
  266 |     }
  267 |   });
  268 | 
  269 |   test('All gladiator subpages redirect to login', async ({ page }) => {
  270 |     const pages = [
  271 |       '/gladiator/dashboard',
  272 |       '/gladiator/history',
  273 |       '/gladiator/profile',
  274 |     ];
  275 |     for (const route of pages) {
  276 |       await page.goto(`${BASE_URL}${route}`);
  277 |       await waitForApp(page);
  278 |       expect(page.url()).toBe(BASE_URL + '/');
  279 |     }
  280 |   });
  281 | 
  282 | });
  283 | 
  284 | // ─── 4. CREATE QUIZ PAGE ─────────────────────────────────────────
  285 | test.describe('Create Quiz Page', () => {
  286 | 
  287 |   test('Create quiz page redirects to login when unauthenticated', async ({ page }) => {
  288 |     await page.goto(`${BASE_URL}/create-quiz`);
  289 |     await waitForApp(page);
  290 |     expect(page.url()).toBe(BASE_URL + '/');
  291 |   });
  292 | 
  293 | });
  294 | 
  295 | // ─── 5. BATTLE PAGES ─────────────────────────────────────────────
  296 | test.describe('Battle Pages', () => {
  297 | 
  298 |   test('Battle page renders correctly when unauthenticated', async ({ page }) => {
  299 |     await page.goto(`${BASE_URL}/battle/ABC123`);
  300 |     await waitForApp(page);
  301 | 
  302 |     // ClientLayout allows battle pages for unauthenticated users
  303 |     await expect(page.locator('h1')).toBeVisible();
  304 |   });
  305 | 
  306 | });
  307 | 
  308 | // ─── 6. ERROR BOUNDARIES & 404 ───────────────────────────────────
  309 | test.describe('Error Boundaries & 404', () => {
  310 | 
  311 |   test('404 page renders for non-existent portal route', async ({ page }) => {
  312 |     await page.goto(`${BASE_URL}/executive/nonexistent-page-xyz`);
  313 |     await waitForApp(page);
  314 | 
  315 |     // ClientLayout redirects to / for unauthenticated users
  316 |     // So we should be on the login page
  317 |     expect(page.url()).toBe(BASE_URL + '/');
  318 |     await expect(page.locator('h1')).toContainText('Knowledge Arena');
  319 |   });
  320 | 
  321 |   test('Root-level non-existent route redirects to home via middleware', async ({ page }) => {
  322 |     await page.goto(`${BASE_URL}/some-random-path`);
  323 |     await waitForApp(page);
  324 | 
  325 |     // Middleware redirects unknown routes to /
  326 |     expect(page.url()).toBe(BASE_URL + '/');
  327 |   });
  328 | 
  329 |   test('Global error boundary renders for critical errors', async ({ page }) => {
  330 |     // Force an error by navigating to a non-existent chunk
  331 |     await page.goto(`${BASE_URL}/global-error`, { waitUntil: 'networkidle' }).catch(() => {});
  332 |     // This is a client component, so it loads within the app
  333 |     expect(true).toBeTruthy();
  334 |   });
  335 | 
  336 | });
  337 | 
  338 | // ─── 7. ACCESSIBILITY ────────────────────────────────────────────
  339 | test.describe('Accessibility', () => {
  340 | 
  341 |   test('Skip to main content link exists on login page', async ({ page }) => {
> 342 |     await page.goto(BASE_URL);
      |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3456/
  343 |     await waitForApp(page);
  344 | 
  345 |     await expect(page.locator('a:has-text("Skip to main content")')).toBeVisible();
  346 |   });
  347 | 
  348 |   test('Toast viewport has correct aria attributes', async ({ page }) => {
  349 |     await page.goto(BASE_URL);
  350 |     await waitForApp(page);
  351 | 
  352 |     // Trigger a login error to create a toast
  353 |     await page.locator('input[name="email"]').fill('admin_001_1');
  354 |     await page.locator('input[type="password"]').fill('wrongpassword');
  355 |     await page.locator('button[type="submit"]:has-text("Sign In")').click();
  356 |     await page.waitForTimeout(5000);
  357 | 
  358 |     const viewport = page.locator('[data-radix-toast-viewport]');
  359 |     await expect(viewport).toHaveAttribute('aria-label', 'Notifications');
  360 |     await expect(viewport).toHaveAttribute('aria-live', 'polite');
  361 |   });
  362 | 
  363 |   test('Toast close button has aria-label', async ({ page }) => {
  364 |     await page.goto(BASE_URL);
  365 |     await waitForApp(page);
  366 | 
  367 |     await page.locator('input[name="email"]').fill('admin_001_1');
  368 |     await page.locator('input[type="password"]').fill('wrongpassword');
  369 |     await page.locator('button[type="submit"]:has-text("Sign In")').click();
  370 |     await page.waitForTimeout(5000);
  371 | 
  372 |     const closeBtn = page.locator('button[aria-label="Dismiss notification"]');
  373 |     if (await closeBtn.isVisible()) {
  374 |       await expect(closeBtn).toBeVisible();
  375 |     }
  376 |   });
  377 | 
  378 | });
  379 | 
  380 | // ─── 8. FULL WORKFLOW: Login → Portal Access → Logout ───────────
  381 | test.describe('Full Auth Workflow', () => {
  382 | 
  383 |   test('Complete login attempt with error handling flow', async ({ page }) => {
  384 |     await page.goto(BASE_URL);
  385 |     await waitForApp(page);
  386 | 
  387 |     // 1. Fill login form
  388 |     await page.locator('input[name="email"]').fill('admin_001_1');
  389 |     await page.locator('input[type="password"]').fill('badpassword');
  390 | 
  391 |     // 2. Submit
  392 |     await page.locator('button[type="submit"]:has-text("Sign In")').click();
  393 |     
  394 |     // 3. Wait for Firebase response
  395 |     await page.waitForTimeout(7000);
  396 | 
  397 |     // 4. Check toast appeared
  398 |     const toastTitle = page.locator('[data-radix-toast-title]');
  399 |     await expect(toastTitle).toBeVisible();
  400 |     
  401 |     // 5. Dismiss the toast
  402 |     const closeBtn = page.locator('button[aria-label="Dismiss notification"]');
  403 |     if (await closeBtn.isVisible()) {
  404 |       await closeBtn.click();
  405 |       await page.waitForTimeout(500);
  406 |       await expect(toastTitle).not.toBeVisible();
  407 |     }
  408 | 
  409 |     // 6. Form should still be usable after error
  410 |     await expect(page.locator('input[name="email"]')).toHaveValue('admin_001_1');
  411 |     await page.locator('input[name="email"]').fill('another_admin');
  412 |     await expect(page.locator('input[name="email"]')).toHaveValue('another_admin');
  413 |   });
  414 | 
  415 |   test('Form reset after failed login', async ({ page }) => {
  416 |     await page.goto(BASE_URL);
  417 |     await waitForApp(page);
  418 | 
  419 |     await page.locator('input[name="email"]').fill('admin_001_1');
  420 |     await page.locator('input[type="password"]').fill('wrongpass');
  421 |     await page.locator('button[type="submit"]:has-text("Sign In")').click();
  422 |     await page.waitForTimeout(5000);
  423 | 
  424 |     // Reload the page - form should be empty
  425 |     await page.reload();
  426 |     await page.waitForTimeout(3000);
  427 | 
  428 |     await expect(page.locator('input[name="email"]')).toHaveValue('');
  429 |     await expect(page.locator('input[type="password"]')).toHaveValue('');
  430 |   });
  431 | 
  432 | });
  433 | 
  434 | // ─── 9. RESPONSIVE DESIGN ────────────────────────────────────────
  435 | test.describe('Responsive Design', () => {
  436 | 
  437 |   test('Login page is usable on mobile viewport', async ({ page }) => {
  438 |     await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
  439 |     await page.goto(BASE_URL);
  440 |     await waitForApp(page);
  441 | 
  442 |     // All elements should be visible without horizontal scroll
```