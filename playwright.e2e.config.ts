import base from './playwright.config';

// Companion config for the hand-written end-to-end flows in ./e2e.
// The default config only collects ./tests, so run these with:
//   npx playwright test -c playwright.e2e.config.ts --project=chromium
export default {
  ...base,
  testDir: './e2e',
};
