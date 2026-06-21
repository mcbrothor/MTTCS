import { expect, test } from '@playwright/test';
import { login } from './helpers/auth';
import { setupAllMocks } from './mocks/handlers';

test('GUIDE-01: 현재 플로우와 캐시·드릴다운 운용 기준을 안내한다', async ({ page }) => {
  await setupAllMocks(page);
  await login(page);
  await page.goto('/guide');

  await expect(page.getByText('00 오늘', { exact: true })).toBeVisible();
  await expect(page.getByText('02-C · 스캐너 메뉴와 결과 운용')).toBeVisible();
  await expect(page.getByText('캐시 우선 표시', { exact: true })).toBeVisible();
  await expect(page.getByText('단일 종목 재계산', { exact: true })).toBeVisible();
});
