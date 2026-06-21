import { type Page, expect } from '@playwright/test';

/**
 * MTN E2E Auth Helper
 *
 * Provides login/logout utilities and authenticated page factories.
 * Uses the credentials from .env.test (testadmin / TestPassword123!)
 */

const TEST_USERNAME = 'testadmin';
const TEST_PASSWORD = 'TestPassword123!';

/**
 * Perform login via the /login page UI.
 * After successful login, waits for redirect to the command center.
 */
export async function login(page: Page): Promise<void> {
  const sessionResponse = await page.request.get('/api/auth/session');
  const session = await sessionResponse.json().catch(() => null) as { authenticated?: boolean } | null;
  if (session?.authenticated) {
    await page.goto('/');
    return;
  }

  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');

  // Fill credentials
  const usernameInput = page.locator('input[autoComplete="username"], input').first();
  const passwordInput = page.locator('input[autoComplete="current-password"], input[type="password"]').first();

  await usernameInput.fill(TEST_USERNAME);
  await passwordInput.fill(TEST_PASSWORD);
  await expect(usernameInput).toHaveValue(TEST_USERNAME);
  await expect(passwordInput).toHaveValue(TEST_PASSWORD);

  // Submit
  const submitButton = page.locator('button[type="submit"], button:has-text("로그인"), button:has-text("Login")').first();
  await submitButton.click();

  // Wait for redirect away from /login
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 });
}

/**
 * Perform login with specific credentials (for negative testing).
 */
export async function loginWith(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');

  const usernameInput = page.locator('input[autoComplete="username"], input').first();
  const passwordInput = page.locator('input[autoComplete="current-password"], input[type="password"]').first();

  await usernameInput.fill(username);
  await passwordInput.fill(password);

  const submitButton = page.locator('button[type="submit"], button:has-text("로그인"), button:has-text("Login")').first();
  await submitButton.click();
}

/**
 * Assert that the page is on the login page (used for auth guard tests).
 */
export async function expectLoginPage(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/login/);
}

/**
 * Assert that the page is on the command center (dashboard).
 */
export async function expectDashboard(page: Page): Promise<void> {
  await expect(page).toHaveURL((url) => url.pathname === '/');
  await expect(page.locator('text=Command Center')).toBeVisible({ timeout: 10_000 });
}
