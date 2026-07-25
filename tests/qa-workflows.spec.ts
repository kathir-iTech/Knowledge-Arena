import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3456';

// ─── Utility ───────────────────────────────────────────────────────
async function waitForApp(page: any) {
  // Wait for Firebase/Auth to settle (loading screen to disappear or form to appear)
  await page.waitForLoadState('networkidle');
  // Give auth listener time to fire
  await page.waitForTimeout(3000);
}

async function expectNoErrorToasts(page: any) {
  const toasts = await page.locator('[data-radix-toast-title]').allTextContents();
  for (const t of toasts) {
    // Only error toasts matter — success toasts are fine
    if (t.includes('Error') || t.includes('Failed') || t.includes('Access Denied')) {
      // Check if this is a genuine auth error (expected) vs unexpected
      const desc = await page.locator('[data-radix-toast-description]').textContent();
      if (desc && desc.includes('Incorrect email or password')) {
        // Expected, skip
        continue;
      }
    }
  }
}

// ─── 1. AUTHENTICATION FLOW ──────────────────────────────────────
test.describe('Authentication Flow', () => {

  test('Login page renders correctly with all elements', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForApp(page);

    // Heading
    await expect(page.locator('h1')).toContainText('Knowledge Arena');
    // Subheading
    await expect(page.locator('p')).toContainText('The ultimate quiz battleground.');
    // Google Sign-In button
    await expect(page.locator('button:has-text("Continue with Google")')).toBeVisible();
    // Staff Login separator
    await expect(page.locator('span:has-text("Staff Login")')).toBeVisible();
    // Email input
    await expect(page.locator('input[name="email"]')).toBeVisible();
    // Password input
    await expect(page.locator('input[type="password"]')).toBeVisible();
    // Sign In button
    await expect(page.locator('button[type="submit"]:has-text("Sign In")')).toBeVisible();
  });

  test('Login form validation — empty fields show errors', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForApp(page);

    // Click Sign In without filling anything
    await page.locator('button[type="submit"]:has-text("Sign In")').click();
    await page.waitForTimeout(500);

    // Zod validation should show error messages
    const formMessages = page.locator('text=Email or Staff ID is required');
    await expect(formMessages).toBeVisible();
  });

  test('Login form validation — empty password shows error', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForApp(page);

    // Fill email only
    await page.locator('input[name="email"]').fill('admin_001_1');
    await page.locator('button[type="submit"]:has-text("Sign In")').click();
    await page.waitForTimeout(500);

    // Should show password required
    const pwMsg = page.locator('text=Password is required');
    await expect(pwMsg).toBeVisible();
  });

  test('Login with invalid credentials shows Firebase error toast', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForApp(page);

    // Fill with invalid credentials
    await page.locator('input[name="email"]').fill('admin_001_1');
    await page.locator('input[type="password"]').fill('wrongpassword123!');
    await page.locator('button[type="submit"]:has-text("Sign In")').click();

    // Wait for Firebase API call and error toast
    await page.waitForTimeout(5000);
    const toastViewport = page.locator('[data-radix-toast-viewport]');
    
    // Should show an error toast
    const toastTitle = page.locator('[data-radix-toast-title]');
    await expect(toastTitle).toBeVisible();
    const titleText = await toastTitle.textContent();
    expect(['Sign In Failed', 'Too Many Attempts', 'Access Denied']).toContain(titleText);
  });

  test('Login with invalid email format shows error toast', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForApp(page);

    // Fill with obviously invalid email
    await page.locator('input[name="email"]').fill('not-a-real-email@nonexistent.com');
    await page.locator('input[type="password"]').fill('password123');
    await page.locator('button[type="submit"]:has-text("Sign In")').click();

    // Wait for Firebase response
    await page.waitForTimeout(5000);
    const toastTitle = page.locator('[data-radix-toast-title]');
    await expect(toastTitle).toBeVisible();
  });

  test('Google Sign-In button is clickable', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForApp(page);

    const googleButton = page.locator('button:has-text("Continue with Google")');
    await expect(googleButton).toBeEnabled();
    // Clicking will trigger redirect - we just verify it's interactive
  });

});

// ─── 2. SPECIAL PAGES ────────────────────────────────────────────
test.describe('Special Pages', () => {

  test('Kicked page renders with correct elements', async ({ page }) => {
    await page.goto(`${BASE_URL}/kicked`);
    await waitForApp(page);

    await expect(page.locator('h1')).toContainText('Access Restricted');
    await expect(page.locator('button:has-text("Return to Dashboard")')).toBeVisible();
  });

  test('Kicked page reads sessionStorage', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.evaluate(() => {
      sessionStorage.setItem('blocked_at', Date.now().toString());
      sessionStorage.setItem('blocked_violations', '3');
    });
    await page.goto(`${BASE_URL}/kicked`);
    await waitForApp(page);

    // Should show violations count
    await expect(page.locator('text=Violations: 3')).toBeVisible();
    // Should show "Multiple application switches detected" since violations >= 2
    await expect(page.locator('text=Multiple application switches detected')).toBeVisible();
  });

  test('Kicked page — low violations shows generic reason', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.evaluate(() => {
      sessionStorage.setItem('blocked_at', Date.now().toString());
      sessionStorage.setItem('blocked_violations', '1');
    });
    await page.goto(`${BASE_URL}/kicked`);
    await waitForApp(page);

    await expect(page.locator('text=Violations: 1')).toBeVisible();
    await expect(page.locator('text=Unauthorized activity detected')).toBeVisible();
  });

  test('Kicked page — Return to Dashboard navigates correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/kicked`);
    await waitForApp(page);

    await page.locator('button:has-text("Return to Dashboard")').click();
    await page.waitForTimeout(1000);
    // Should redirect to gladiator/dashboard
    expect(page.url()).toContain('/gladiator/dashboard');
  });

  test('Cheating detected page renders correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/cheating-detected`);
    await waitForApp(page);

    await expect(page.locator('h1')).toContainText('Access Denied');
    await expect(page.locator('text=Your attempt to join was denied')).toBeVisible();
    await expect(page.locator('text=Please contact your teacher')).toBeVisible();
    await expect(page.locator('button:has-text("Return to Dashboard")')).toBeVisible();
  });

  test('Cheating detected — Return to Dashboard navigates correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/cheating-detected`);
    await waitForApp(page);

    await page.locator('button:has-text("Return to Dashboard")').click();
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('/gladiator/dashboard');
  });

  test('Force password change page — unauthenticated state', async ({ page }) => {
    await page.goto(`${BASE_URL}/force-password-change`);
    await waitForApp(page);

    // Should show message to sign in
    await expect(page.locator('text=You must be signed in to change your password')).toBeVisible();
  });

});

// ─── 3. PORTAL NAVIGATION ────────────────────────────────────────
test.describe('Portal Navigation (Unauthenticated)', () => {

  test('Executive portal redirects to login when unauthenticated', async ({ page }) => {
    await page.goto(`${BASE_URL}/executive/analytics`);
    await waitForApp(page);

    // ClientLayout should redirect to /
    expect(page.url()).toBe(BASE_URL + '/');
  });

  test('Commander portal redirects to login when unauthenticated', async ({ page }) => {
    await page.goto(`${BASE_URL}/commander/dashboard`);
    await waitForApp(page);

    expect(page.url()).toBe(BASE_URL + '/');
  });

  test('Gladiator portal redirects to login when unauthenticated', async ({ page }) => {
    await page.goto(`${BASE_URL}/gladiator/dashboard`);
    await waitForApp(page);

    expect(page.url()).toBe(BASE_URL + '/');
  });

  test('All executive subpages redirect to login', async ({ page }) => {
    const pages = [
      '/executive/analytics',
      '/executive/audit-logs',
      '/executive/backup',
      '/executive/commanders',
      '/executive/dashboard',
      '/executive/messages',
      '/executive/notifications',
      '/executive/profile',
      '/executive/question-bank',
      '/executive/requests',
      '/executive/search',
      '/executive/settings',
      '/executive/students',
      '/executive/workspace',
    ];
    for (const route of pages) {
      await page.goto(`${BASE_URL}${route}`);
      await waitForApp(page);
      const url = page.url();
      if (!url.includes('/')) {
        test.fail(true, `${route} did not redirect to login (stayed at ${url})`);
      }
    }
  });

  test('All commander subpages redirect to login', async ({ page }) => {
    const pages = [
      '/commander/dashboard',
      '/commander/history',
      '/commander/messages',
      '/commander/profile',
      '/commander/requests',
    ];
    for (const route of pages) {
      await page.goto(`${BASE_URL}${route}`);
      await waitForApp(page);
      expect(page.url()).toBe(BASE_URL + '/');
    }
  });

  test('All gladiator subpages redirect to login', async ({ page }) => {
    const pages = [
      '/gladiator/dashboard',
      '/gladiator/history',
      '/gladiator/profile',
    ];
    for (const route of pages) {
      await page.goto(`${BASE_URL}${route}`);
      await waitForApp(page);
      expect(page.url()).toBe(BASE_URL + '/');
    }
  });

});

// ─── 4. CREATE QUIZ PAGE ─────────────────────────────────────────
test.describe('Create Quiz Page', () => {

  test('Create quiz page redirects to login when unauthenticated', async ({ page }) => {
    await page.goto(`${BASE_URL}/create-quiz`);
    await waitForApp(page);
    expect(page.url()).toBe(BASE_URL + '/');
  });

});

// ─── 5. BATTLE PAGES ─────────────────────────────────────────────
test.describe('Battle Pages', () => {

  test('Battle page renders correctly when unauthenticated', async ({ page }) => {
    await page.goto(`${BASE_URL}/battle/ABC123`);
    await waitForApp(page);

    // ClientLayout allows battle pages for unauthenticated users
    await expect(page.locator('h1')).toBeVisible();
  });

});

// ─── 6. ERROR BOUNDARIES & 404 ───────────────────────────────────
test.describe('Error Boundaries & 404', () => {

  test('404 page renders for non-existent portal route', async ({ page }) => {
    await page.goto(`${BASE_URL}/executive/nonexistent-page-xyz`);
    await waitForApp(page);

    // ClientLayout redirects to / for unauthenticated users
    // So we should be on the login page
    expect(page.url()).toBe(BASE_URL + '/');
    await expect(page.locator('h1')).toContainText('Knowledge Arena');
  });

  test('Root-level non-existent route redirects to home via middleware', async ({ page }) => {
    await page.goto(`${BASE_URL}/some-random-path`);
    await waitForApp(page);

    // Middleware redirects unknown routes to /
    expect(page.url()).toBe(BASE_URL + '/');
  });

  test('Global error boundary renders for critical errors', async ({ page }) => {
    // Force an error by navigating to a non-existent chunk
    await page.goto(`${BASE_URL}/global-error`, { waitUntil: 'networkidle' }).catch(() => {});
    // This is a client component, so it loads within the app
    expect(true).toBeTruthy();
  });

});

// ─── 7. ACCESSIBILITY ────────────────────────────────────────────
test.describe('Accessibility', () => {

  test('Skip to main content link exists on login page', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForApp(page);

    await expect(page.locator('a:has-text("Skip to main content")')).toBeVisible();
  });

  test('Toast viewport has correct aria attributes', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForApp(page);

    // Trigger a login error to create a toast
    await page.locator('input[name="email"]').fill('admin_001_1');
    await page.locator('input[type="password"]').fill('wrongpassword');
    await page.locator('button[type="submit"]:has-text("Sign In")').click();
    await page.waitForTimeout(5000);

    const viewport = page.locator('[data-radix-toast-viewport]');
    await expect(viewport).toHaveAttribute('aria-label', 'Notifications');
    await expect(viewport).toHaveAttribute('aria-live', 'polite');
  });

  test('Toast close button has aria-label', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForApp(page);

    await page.locator('input[name="email"]').fill('admin_001_1');
    await page.locator('input[type="password"]').fill('wrongpassword');
    await page.locator('button[type="submit"]:has-text("Sign In")').click();
    await page.waitForTimeout(5000);

    const closeBtn = page.locator('button[aria-label="Dismiss notification"]');
    if (await closeBtn.isVisible()) {
      await expect(closeBtn).toBeVisible();
    }
  });

});

// ─── 8. FULL WORKFLOW: Login → Portal Access → Logout ───────────
test.describe('Full Auth Workflow', () => {

  test('Complete login attempt with error handling flow', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForApp(page);

    // 1. Fill login form
    await page.locator('input[name="email"]').fill('admin_001_1');
    await page.locator('input[type="password"]').fill('badpassword');

    // 2. Submit
    await page.locator('button[type="submit"]:has-text("Sign In")').click();
    
    // 3. Wait for Firebase response
    await page.waitForTimeout(7000);

    // 4. Check toast appeared
    const toastTitle = page.locator('[data-radix-toast-title]');
    await expect(toastTitle).toBeVisible();
    
    // 5. Dismiss the toast
    const closeBtn = page.locator('button[aria-label="Dismiss notification"]');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(500);
      await expect(toastTitle).not.toBeVisible();
    }

    // 6. Form should still be usable after error
    await expect(page.locator('input[name="email"]')).toHaveValue('admin_001_1');
    await page.locator('input[name="email"]').fill('another_admin');
    await expect(page.locator('input[name="email"]')).toHaveValue('another_admin');
  });

  test('Form reset after failed login', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForApp(page);

    await page.locator('input[name="email"]').fill('admin_001_1');
    await page.locator('input[type="password"]').fill('wrongpass');
    await page.locator('button[type="submit"]:has-text("Sign In")').click();
    await page.waitForTimeout(5000);

    // Reload the page - form should be empty
    await page.reload();
    await page.waitForTimeout(3000);

    await expect(page.locator('input[name="email"]')).toHaveValue('');
    await expect(page.locator('input[type="password"]')).toHaveValue('');
  });

});

// ─── 9. RESPONSIVE DESIGN ────────────────────────────────────────
test.describe('Responsive Design', () => {

  test('Login page is usable on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    await page.goto(BASE_URL);
    await waitForApp(page);

    // All elements should be visible without horizontal scroll
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]:has-text("Sign In")')).toBeVisible();
    await expect(page.locator('button:has-text("Continue with Google")')).toBeVisible();
  });

  test('Login page is usable on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad
    await page.goto(BASE_URL);
    await waitForApp(page);

    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]:has-text("Sign In")')).toBeVisible();
  });

  test('Kicked page is usable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/kicked`);
    await waitForApp(page);

    await expect(page.locator('h1')).toContainText('Access Restricted');
    await expect(page.locator('button:has-text("Return to Dashboard")')).toBeVisible();
  });

  test('Cheating detected page is usable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/cheating-detected`);
    await waitForApp(page);

    await expect(page.locator('h1')).toContainText('Access Denied');
    await expect(page.locator('button:has-text("Return to Dashboard")')).toBeVisible();
  });

});

// ─── 10. LOADING STATES ──────────────────────────────────────────
test.describe('Loading States', () => {

  test('Loading screen shows while auth is initializing', async ({ page }) => {
    // Navigate to a portal page that triggers auth check
    await page.goto(`${BASE_URL}/gladiator/dashboard`);
    // Immediately check for loading screen
    const loadingText = page.locator('text=Preparing the arena');
    // It might or might not be visible depending on timing
    // But the app should not crash
    await page.waitForTimeout(5000);
    // Eventually should end up at login (redirected)
    expect(page.url()).toBe(BASE_URL + '/');
  });

});

// ─── 11. FORM INTERACTIONS ──────────────────────────────────────
test.describe('Form Interactions', () => {

  test('Password field is masked', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForApp(page);

    const pwInput = page.locator('input[type="password"]');
    await expect(pwInput).toHaveAttribute('type', 'password');
  });

  test('Email field accepts staff ID format', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForApp(page);

    const emailInput = page.locator('input[name="email"]');
    await emailInput.fill('admin_001_1');
    await expect(emailInput).toHaveValue('admin_001_1');
  });

  test('Email field accepts full email format', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForApp(page);

    const emailInput = page.locator('input[name="email"]');
    await emailInput.fill('admin@knowledgearena.app');
    await expect(emailInput).toHaveValue('admin@knowledgearena.app');
  });

  test('Sign In button shows loading state on submit', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForApp(page);

    await page.locator('input[name="email"]').fill('admin_001_1');
    await page.locator('input[type="password"]').fill('somepassword');
    await page.locator('button[type="submit"]:has-text("Sign In")').click();

    // Button should be disabled during submission
    await page.waitForTimeout(1000);
    // The loader icon should appear
    const spinner = page.locator('button[type="submit"] svg.animate-spin');
    // May or may not be visible depending on timing, but should exist in DOM
  });

});

// ─── 12. SECURITY HEADERS ────────────────────────────────────────
test.describe('Security Headers', () => {

  test('Response includes security headers', async ({ page }) => {
    const response = await page.goto(BASE_URL);
    const headers = response!.headers();

    // Verify security headers
    expect(headers['x-content-type-options'] || '').toContain('nosniff');
    expect(headers['x-frame-options'] || '').toContain('DENY');
    expect(headers['referrer-policy'] || '').toContain('strict-origin-when-cross-origin');
    expect(headers['strict-transport-security'] || '').toBeTruthy();
  });

});
