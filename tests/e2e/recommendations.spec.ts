import { expect, test } from '@playwright/test';
import { login } from './helpers/auth';
import { setupAllMocks } from './mocks/handlers';

test.describe('TC-REC: 추천 성과·원인 분석', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
    await login(page);
  });

  test('REC-01: 공식 추천 이력과 기간별 성과 표시', async ({ page }) => {
    await page.goto('/recommendations');
    await expect(page.getByRole('heading', { name: '추천 성과·원인 분석' })).toBeVisible();
    await expect(page.getByText('2026-05-19 Top10')).toBeVisible();
    await expect(page.getByText('1. NVDA')).toBeVisible();
    await expect(page.getByText('+3.50%')).toBeVisible();
  });

  test('REC-02: 5·20·60일 성과와 표본 수 표시', async ({ page }) => {
    await page.goto('/recommendations');
    await page.getByRole('button', { name: '성과 분석' }).click();
    await expect(page).toHaveURL(/view=metrics/);
    await expect(page.getByRole('heading', { name: 'D5' })).toBeVisible();
    await expect(page.getByText('n=40')).toBeVisible();
    await expect(page.getByText('신호 소스별 성과')).toBeVisible();
  });

  test('REC-03: 표본 부족 원인은 반복 원인이 아닌 가설로 표시', async ({ page }) => {
    await page.goto('/recommendations?view=diagnostics');
    await expect(page.getByText('진입 시점').first()).toBeVisible();
    await expect(page.getByText('가설', { exact: true })).toBeVisible();
    await expect(page.getByText(/n=18/)).toBeVisible();
    await expect(page.getByText(/진입 시점 가설/)).toBeVisible();
  });
});
