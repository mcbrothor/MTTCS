import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { setupAllMocks, setupHaltMocks } from './mocks/handlers';

test.describe('TC-MF: 오늘 시장 신호판', () => {
  test.describe('정상 진입 가능 상태', () => {
    test.beforeEach(async ({ page }) => {
      await setupAllMocks(page); // GREEN by default
      await login(page);
    });

    test('MF-01: 투자 가능 결론과 쉬운 용어 표시', async ({ page }) => {
      await page.goto('/master-filter');

      await expect(page.getByRole('heading', { name: '오늘 시장 신호판' })).toBeVisible();
      await expect(page.getByRole('status', { name: '오늘 진입 결정: 투자 가능 · 권장 비중 100%' })).toBeVisible();
      await expect(page.getByText('시장 건강 점수').first()).toBeVisible();
      await expect(page.locator('text=함께 오르는 종목 비율').first()).toBeVisible();
      await expect(page.getByText('20일 평균 하루 변동폭').first()).toBeVisible();
      await expect(page.getByRole('heading', { name: 'ADR 바로 읽기' })).toBeVisible();
      await expect(page.getByText('같은 약어, 다른 지표: Advance/Decline Ratio')).toBeVisible();
      await expect(page.getByText('75% 이하', { exact: true })).toBeVisible();
      await expect(page.getByText('120% 이상', { exact: true })).toBeVisible();
    });
  });

  test.describe('방어 상태', () => {
    test.beforeEach(async ({ page }) => {
      await setupHaltMocks(page); // Sets to RED / HALT
      await login(page);
    });

    test('MF-03: 위험 판정 시 신규 매수 보류 표시', async ({ page }) => {
      await page.goto('/master-filter');

      await expect(page.getByRole('status', { name: '오늘 진입 결정: 신규 매수 보류' })).toBeVisible();
      await expect(page.locator('text=현금 확보').or(page.locator('text=보유 종목 방어'))).toBeVisible();
    });

    test('MF-04: 쉬운 운용 가이드라인 표시', async ({ page }) => {
      await page.goto('/master-filter');
      
      const decisionBox = page.locator('text=현금 비중').or(page.locator('text=신규 매수 금지')).first();
      await expect(decisionBox).toBeVisible();
    });
  });
});
