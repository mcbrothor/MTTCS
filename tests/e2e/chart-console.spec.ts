import { expect, test } from '@playwright/test';
import { login } from './helpers/auth';
import { setupAllMocks } from './mocks/handlers';

test('CHART-01: 핵심 화면에서 Recharts 초기 크기 경고가 발생하지 않는다', async ({ page }) => {
  const chartWarnings: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('width(-1)') || message.text().includes('height(-1)')) {
      chartWarnings.push(message.text());
    }
  });

  await setupAllMocks(page);
  await login(page);
  await page.goto('/master-filter');
  await expect(page.getByRole('heading', { name: '오늘 시장 신호판' })).toBeVisible();
  await page.goto('/macro');
  await expect(page.getByRole('heading', { name: '큰 흐름 점검' })).toBeVisible();

  expect(chartWarnings).toEqual([]);
});
