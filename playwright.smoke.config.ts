import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import fs from 'fs';

/**
 * MTN Smoke Test — Playwright Configuration
 *
 * Unlike the standard e2e config, this configuration:
 *  - Calls REAL APIs (no MSW mocking)
 *  - Uses .env.local credentials (production-like)
 *  - Connects to existing dev server (reuseExistingServer: true)
 *  - Longer timeouts for real network calls
 */

const smokePort = Number(process.env.SMOKE_PORT || 3000);
const smokeBaseUrl = process.env.SMOKE_BASE_URL || `http://localhost:${smokePort}`;

// Load .env.local for real credentials
try {
  const envPath = path.join(__dirname, '.env.local');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    for (const line of envConfig.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const firstEqual = trimmed.indexOf('=');
      if (firstEqual > 0) {
        const key = trimmed.substring(0, firstEqual).trim();
        const value = trimmed.substring(firstEqual + 1).trim();
        // Force override — smoke tests MUST use .env.local credentials
        process.env[key] = value.replace(/(^["']|["']$)/g, '');
      }
    }
  }
} catch (e) {
  console.error('Failed to load .env.local for smoke tests', e);
}

export default defineConfig({
  testDir: path.join(__dirname, 'tests', 'e2e', 'smoke'),
  testMatch: '**/*.spec.ts',

  /* Real API calls need more time */
  timeout: 90_000,
  expect: { timeout: 15_000 },

  /* Sequential — real API calls should not race */
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,

  reporter: [['html', { open: 'on-failure', outputFolder: 'playwright-report-smoke' }]],

  use: {
    baseURL: smokeBaseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },

  projects: [
    {
      name: 'smoke-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Reuse existing dev server — no auto-start */
  webServer: {
    command: `npm run dev -- -p ${smokePort}`,
    url: smokeBaseUrl,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      NODE_ENV: 'development',
    },
  },
});
