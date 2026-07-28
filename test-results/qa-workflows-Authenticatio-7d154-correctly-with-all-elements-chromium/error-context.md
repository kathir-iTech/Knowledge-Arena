# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: qa-workflows.spec.ts >> Authentication Flow >> Login page renders correctly with all elements
- Location: tests\qa-workflows.spec.ts:31:7

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3456/
Call log:
  - navigating to "http://localhost:3456/", waiting until "load"

```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | const BASE_URL = 'http://localhost:3456';
  4   | 
  5   | // ─── Utility ───────────────────────────────────────────────────────
  6   | async function waitForApp(page: any) {
  7   |   // Wait for Firebase/Auth to settle (loading screen to disappear or form to appear)
  8   |   await page.waitForLoadState('networkidle');
  9   |   // Give auth listener time to fire
  10  |   await page.waitForTimeout(3000);
  11  | }
  12  | 
  13  | async function expectNoErrorToasts(page: any) {
  14  |   const toasts = await page.locator('[data-radix-toast-title]').allTextContents();
  15  |   for (const t of toasts) {
  16  |     // Only error toasts matter — success toasts are fine
  17  |     if (t.includes('Error') || t.includes('Failed') || t.includes('Access Denied')) {
  18  |       // Check if this is a genuine auth error (expected) vs unexpected
  19  |       const desc = await page.locator('[data-radix-toast-description]').textContent();
  20  |       if (desc && desc.includes('Incorrect email or password')) {
  21  |         // Expected, skip
  22  |         continue;
  23  |       }
  24  |     }
  25  |   }
  26  | }
  27  | 
  28  | // ─── 1. AUTHENTICATION FLOW ──────────────────────────────────────
  29  | test.describe('Authentication Flow', () => {
  30  | 
  31  |   test('Login page renders correctly with all elements', async ({ page }) => {
> 32  |     await page.goto(BASE_URL);
      |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3456/
  33  |     await waitForApp(page);
  34  | 
  35  |     // Heading
  36  |     await expect(page.locator('h1')).toContainText('Knowledge Arena');
  37  |     // Subheading
  38  |     await expect(page.locator('p')).toContainText('The ultimate quiz battleground.');
  39  |     // Google Sign-In button
  40  |     await expect(page.locator('button:has-text("Continue with Google")')).toBeVisible();
  41  |     // Staff Login separator
  42  |     await expect(page.locator('span:has-text("Staff Login")')).toBeVisible();
  43  |     // Email input
  44  |     await expect(page.locator('input[name="email"]')).toBeVisible();
  45  |     // Password input
  46  |     await expect(page.locator('input[type="password"]')).toBeVisible();
  47  |     // Sign In button
  48  |     await expect(page.locator('button[type="submit"]:has-text("Sign In")')).toBeVisible();
  49  |   });
  50  | 
  51  |   test('Login form validation — empty fields show errors', async ({ page }) => {
  52  |     await page.goto(BASE_URL);
  53  |     await waitForApp(page);
  54  | 
  55  |     // Click Sign In without filling anything
  56  |     await page.locator('button[type="submit"]:has-text("Sign In")').click();
  57  |     await page.waitForTimeout(500);
  58  | 
  59  |     // Zod validation should show error messages
  60  |     const formMessages = page.locator('text=Email or Staff ID is required');
  61  |     await expect(formMessages).toBeVisible();
  62  |   });
  63  | 
  64  |   test('Login form validation — empty password shows error', async ({ page }) => {
  65  |     await page.goto(BASE_URL);
  66  |     await waitForApp(page);
  67  | 
  68  |     // Fill email only
  69  |     await page.locator('input[name="email"]').fill('admin_001_1');
  70  |     await page.locator('button[type="submit"]:has-text("Sign In")').click();
  71  |     await page.waitForTimeout(500);
  72  | 
  73  |     // Should show password required
  74  |     const pwMsg = page.locator('text=Password is required');
  75  |     await expect(pwMsg).toBeVisible();
  76  |   });
  77  | 
  78  |   test('Login with invalid credentials shows Firebase error toast', async ({ page }) => {
  79  |     await page.goto(BASE_URL);
  80  |     await waitForApp(page);
  81  | 
  82  |     // Fill with invalid credentials
  83  |     await page.locator('input[name="email"]').fill('admin_001_1');
  84  |     await page.locator('input[type="password"]').fill('wrongpassword123!');
  85  |     await page.locator('button[type="submit"]:has-text("Sign In")').click();
  86  | 
  87  |     // Wait for Firebase API call and error toast
  88  |     await page.waitForTimeout(5000);
  89  |     const toastViewport = page.locator('[data-radix-toast-viewport]');
  90  |     
  91  |     // Should show an error toast
  92  |     const toastTitle = page.locator('[data-radix-toast-title]');
  93  |     await expect(toastTitle).toBeVisible();
  94  |     const titleText = await toastTitle.textContent();
  95  |     expect(['Sign In Failed', 'Too Many Attempts', 'Access Denied']).toContain(titleText);
  96  |   });
  97  | 
  98  |   test('Login with invalid email format shows error toast', async ({ page }) => {
  99  |     await page.goto(BASE_URL);
  100 |     await waitForApp(page);
  101 | 
  102 |     // Fill with obviously invalid email
  103 |     await page.locator('input[name="email"]').fill('not-a-real-email@nonexistent.com');
  104 |     await page.locator('input[type="password"]').fill('password123');
  105 |     await page.locator('button[type="submit"]:has-text("Sign In")').click();
  106 | 
  107 |     // Wait for Firebase response
  108 |     await page.waitForTimeout(5000);
  109 |     const toastTitle = page.locator('[data-radix-toast-title]');
  110 |     await expect(toastTitle).toBeVisible();
  111 |   });
  112 | 
  113 |   test('Google Sign-In button is clickable', async ({ page }) => {
  114 |     await page.goto(BASE_URL);
  115 |     await waitForApp(page);
  116 | 
  117 |     const googleButton = page.locator('button:has-text("Continue with Google")');
  118 |     await expect(googleButton).toBeEnabled();
  119 |     // Clicking will trigger redirect - we just verify it's interactive
  120 |   });
  121 | 
  122 | });
  123 | 
  124 | // ─── 2. SPECIAL PAGES ────────────────────────────────────────────
  125 | test.describe('Special Pages', () => {
  126 | 
  127 |   test('Kicked page renders with correct elements', async ({ page }) => {
  128 |     await page.goto(`${BASE_URL}/kicked`);
  129 |     await waitForApp(page);
  130 | 
  131 |     await expect(page.locator('h1')).toContainText('Access Restricted');
  132 |     await expect(page.locator('button:has-text("Return to Dashboard")')).toBeVisible();
```