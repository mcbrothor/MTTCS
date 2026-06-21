import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const e2ePort = Number(process.env.E2E_PORT || 3000);
const e2eBaseUrl = process.env.E2E_BASE_URL || `http://localhost:${e2ePort}`;
const e2eWebServerCommand = process.env.E2E_WEB_SERVER_COMMAND || `npm run dev -- -p ${e2ePort}`;

// Load environment variables from .env.test manually to avoid dependency issues
try {
  const envPath = path.join(__dirname, '.env.test');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    for (const line of envConfig.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const firstEqual = trimmed.indexOf('=');
      if (firstEqual > 0) {
        const key = trimmed.substring(0, firstEqual).trim();
        const value = trimmed.substring(firstEqual + 1).trim();
        process.env[key] = value.replace(/(^["']|["']$)/g, '');
      }
    }
  }
} catch (e) {
  console.error('Failed to load .env.test', e);
}

/**
 * MTN E2E Test — Playwright Configuration
 *
 * Strategy:
 *  - Chromium-only (fast CI, sufficient coverage for a single-user admin tool)
 *  - Dev server auto-started via `next dev`
 *  - All external APIs mocked via MSW / Playwright route interception
 *  - Screenshots captured on failure for debugging
 */
export default defineConfig({
  testDir: path.join(__dirname, 'tests', 'e2e'),
  testMatch: '**/*.spec.ts',
  globalSetup: path.join(__dirname, 'tests', 'e2e', 'global-setup.ts'),

  /* Maximum time one test can run */
  timeout: 60_000,
  expect: { timeout: 10_000 },

  /* Run tests sequentially in CI for stability, parallel locally */
  fullyParallel: !process.env.CI,
  workers: Number(process.env.E2E_WORKERS || (process.env.CI ? 1 : 2)),

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Reporter */
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['html', { open: 'on-failure' }]],

  /* Shared settings for all projects */
  use: {
    baseURL: e2eBaseUrl,
    storageState: path.join(__dirname, 'playwright', '.auth', 'user.json'),
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    /* Disable animations for deterministic tests */
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  /* Single project: Chromium Desktop */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Auto-start current source; production mode is verified separately after build. */
  webServer: {
    command: e2eWebServerCommand,
    url: e2eBaseUrl,
    reuseExistingServer: process.env.E2E_REUSE_EXISTING_SERVER === 'true',
    timeout: 120_000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NEXT_DIST_DIR: '.next-e2e',
      MTN_TEST_ENVIRONMENT: 'true',
      MTN_BASE_URL: e2eBaseUrl,
    },
  },
});
