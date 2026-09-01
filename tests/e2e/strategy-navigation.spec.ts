import { expect, test } from '@playwright/test';

const strategyRoutes = [
  '/strategies/kospi-52w',
  '/strategies/us-52w',
  '/strategies/kospi-monthly',
  '/strategies/us-monthly-v7',
  '/gold',
  '/nasdaq',
] as const;

for (const href of strategyRoutes) {
  test(`desktop strategy menu navigates to ${href}`, async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/guide');
    await page.getByRole('button', { name: /투자전략 메뉴/ }).click();

    const link = page.locator(`nav a[href="${href}"]`);
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${href.replaceAll('/', '\\/')}$`));
  });
}
