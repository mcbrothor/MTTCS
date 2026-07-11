import { type Page, expect } from '@playwright/test';

/**
 * MTN Smoke Test Auth Helper
 *
 * Uses REAL credentials from .env.local (notead12 / gksakscjf1!A).
 * Primary strategy: API-based login (faster, more reliable).
 * Fallback: UI-based login.
 */

const SMOKE_USERNAME = process.env.MTN_ADMIN_USERNAME || 'notead12';
const SMOKE_PASSWORD = process.env.MTN_ADMIN_PASSWORD || 'gksakscjf1!A';

/**
 * Login via API first (reliable), then navigate to command center.
 * Falls back to UI login if API approach fails.
 */
export async function smokeLogin(page: Page): Promise<void> {
  // Step 0: Wait for dev server to be responsive (handles hot-reload gaps)
  for (let healthCheck = 0; healthCheck < 10; healthCheck++) {
    try {
      const res = await page.request.get('/api/auth/session', { timeout: 5_000 });
      const session = await res.json().catch(() => null) as { authenticated?: boolean } | null;
      if (session?.authenticated) {
        await page.goto('/');
        return;
      }
      break; // Server is responsive, proceed with login
    } catch {
      // Server not ready — wait and retry
      await page.waitForTimeout(3_000);
    }
  }

  // Retry wrapper — dev server may hot-reload between sequential tests
  for (let topRetry = 0; topRetry < 5; topRetry++) {
    if (topRetry > 0) {
      // Wait longer for dev server to stabilize or compile after a failure
      await page.waitForTimeout(5_000);
    }

    // Strategy 2: API-based login (set cookie directly)
    try {
      const loginResponse = await page.request.post('/api/auth/login', {
        data: { username: SMOKE_USERNAME, password: SMOKE_PASSWORD },
        timeout: 15_000,
      });

      if (loginResponse.ok()) {
        // Explicitly extract Set-Cookie headers and add to browser context
        const headers = loginResponse.headers();
        const setCookie = headers['set-cookie'];
        if (setCookie) {
          const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
          for (const raw of cookies) {
            const nameValue = raw.split(';')[0];
            const eqIdx = nameValue.indexOf('=');
            if (eqIdx > 0) {
              await page.context().addCookies([{
                name: nameValue.substring(0, eqIdx),
                value: nameValue.substring(eqIdx + 1),
                domain: 'localhost',
                path: '/',
              }]);
            }
          }
        }

        await page.goto('/', { waitUntil: 'domcontentloaded' });

        if (!page.url().includes('/login')) {
          return;
        }
      }
    } catch {
      // API login failed — fall back to UI
    }

    // Strategy 3: UI-based login (fallback)
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    const hydrated = await page.waitForFunction(
      () => document.querySelector('[data-testid="login-form"]')?.getAttribute('data-hydrated') === 'true',
      { timeout: 30_000 },
    ).then(() => true).catch(() => false);

    if (!hydrated) continue;

    const usernameInput = page.locator('input[autoComplete="username"], input').first();
    const passwordInput = page.locator('input[autoComplete="current-password"], input[type="password"]').first();

    await usernameInput.fill(SMOKE_USERNAME);
    await passwordInput.fill(SMOKE_PASSWORD);

    const submitButton = page.locator('button[type="submit"], button:has-text("로그인")').first();
    await submitButton.click();

    const redirected = await page.waitForURL(
      (url) => !url.pathname.includes('/login'),
      { timeout: 20_000 },
    ).then(() => true).catch(() => false);

    if (redirected) return;

    // Check for error message on the page
    const errorMsg = await page.locator('text=/실패|올바르지/').first().textContent().catch(() => '');
    if (errorMsg) {
      // Login was rejected — wait and retry from the top
      console.log(`[smokeLogin] UI Login failed with message: ${errorMsg}. Retrying... (${topRetry + 1}/5)`);
      continue;
    }
  }

  throw new Error('smokeLogin: All login strategies failed after 5 retries');
}

/**
 * Login via UI with specific credentials (for negative testing only).
 */
export async function smokeLoginWith(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');

  await page.waitForFunction(
    () => document.querySelector('[data-testid="login-form"]')?.getAttribute('data-hydrated') === 'true',
    { timeout: 30_000 },
  );

  const usernameInput = page.locator('input[autoComplete="username"], input').first();
  const passwordInput = page.locator('input[autoComplete="current-password"], input[type="password"]').first();

  await usernameInput.fill(username);
  await passwordInput.fill(password);

  const submitButton = page.locator('button[type="submit"], button:has-text("로그인")').first();
  await submitButton.click();
}

/**
 * Assert that we are on the login page.
 */
export async function expectLoginPage(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/login/);
}

/**
 * Assert that we are on the command center.
 */
export async function expectDashboard(page: Page): Promise<void> {
  await expect(page).toHaveURL((url) => url.pathname === '/');
  await expect(page.locator('text=Command Center')).toBeVisible({ timeout: 15_000 });
}

/**
 * Wait for page content to load (spinner disappears or content appears).
 */
export async function waitForContentLoad(page: Page, timeout = 30_000): Promise<void> {
  // Wait for any loading spinners to disappear
  const spinner = page.locator('[class*="animate-spin"], text=로드 중, text=로딩');
  await spinner.first().waitFor({ state: 'hidden', timeout }).catch(() => {
    // No spinner found — content may have loaded instantly
  });
}
