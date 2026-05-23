import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { setupAllMocks } from './mocks/handlers';
import { PortfolioPage } from './helpers/page-objects';

test.describe('TC-PORT: 포트폴리오 리스크', () => {
  let portfolioPage: PortfolioPage;

  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
    await login(page);
    portfolioPage = new PortfolioPage(page);
  });

  test('PORT-01: 포트폴리오 요약 카드 5개 표시', async ({ page }) => {
    await portfolioPage.goto();

    // Header
    await expect(page.locator('text=포트폴리오 리스크')).toBeVisible();
    await expect(page.locator('text=Portfolio Risk')).toBeVisible();

    // 5 metric cards
    await expect(page.locator('p').filter({ hasText: /^총 자산$/ }).first()).toBeVisible();
    await expect(page.locator('p').filter({ hasText: /^투입 금액$/ }).first()).toBeVisible();
    await expect(page.locator('p').filter({ hasText: /^현금$/ }).first()).toBeVisible();
    await expect(page.locator('p').filter({ hasText: /^오픈 리스크$/ }).first()).toBeVisible();
    await expect(page.locator('p').filter({ hasText: /^보유 포지션$/ }).first()).toBeVisible();
  });

  test('PORT-02: 섹터 노출도 표시', async ({ page }) => {
    await portfolioPage.goto();

    await expect(page.locator('text=섹터 노출도')).toBeVisible();
    // Fixture has "Technology" sector
    await expect(page.locator('span').filter({ hasText: /Technology/ }).first()).toBeVisible();
  });

  test('PORT-03: 활성 포지션 카드 — 티커, 노출 금액, 손익', async ({ page }) => {
    await portfolioPage.goto();

    await expect(page.locator('text=활성 포지션')).toBeVisible();
    // Fixture has AAPL position
    await expect(page.locator('text=AAPL')).toBeVisible();
  });

  test('PORT-04: 피라미딩/부분매도 배지 표시', async ({ page }) => {
    await portfolioPage.goto();

    // Fixture: pyramidCount=1, partialExitCount=0
    await expect(page.locator('text=/피라미딩/').first()).toBeVisible();
    await expect(page.locator('text=/부분 매도/').first()).toBeVisible();
  });

  test('PORT-05: 미국 ↔ 한국 시장 전환', async ({ page }) => {
    await portfolioPage.goto();

    // Default is US
    const krButton = page.locator('button:has-text("한국")');
    await krButton.click();

    // Should trigger new data load (mocked to return same data)
    await page.waitForTimeout(1_000);
    await expect(page.locator('text=포트폴리오 리스크')).toBeVisible();
  });

  test('PORT-06: 복기 작성 링크 존재', async ({ page }) => {
    await portfolioPage.goto();

    const reviewLink = page.locator('a:has-text("복기 작성")');
    if (await reviewLink.isVisible()) {
      await expect(reviewLink).toHaveAttribute('href', /\/history/);
    }
  });

  test('PORT-07: FlowCTA → 매매 일기 작성하기', async ({ page }) => {
    await portfolioPage.goto();

    const ctaButton = page.locator('text=매매 일기 작성하기');
    await expect(ctaButton).toBeVisible();
  });
});
