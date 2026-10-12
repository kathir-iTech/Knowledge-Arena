import { defineConfig } from '@playwright/test';
import { tmpdir } from 'os';
import { join } from 'path';

export default defineConfig({
  testDir: './tests',
  // Write artifacts OUTSIDE the project tree: Next dev's file watcher sees
  // test-results/*.webm churn (one write per recorded frame) and re-invalidates
  // the Turbopack build during the run, which made every dev-server request
  // take 12-30s and broke auth flows that the server actually completed.
  outputDir: join(tmpdir(), 'knowledge-arena-pw-results'),
  timeout: 60000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3456',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
