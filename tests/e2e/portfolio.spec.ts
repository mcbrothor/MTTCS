import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { setupAllMocks } from './mocks/handlers';
import { PortfolioPage } from './helpers/page-objects';
import seedTrades from './fixtures/seed-trades.json';

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
    await expect(page.getByRole('heading', { name: '포트폴리오 리스크' })).toBeVisible();
    await expect(page.locator('text=Portfolio Risk')).toBeVisible();

    // Core summary plus risk-budget investment metric
    await expect(page.locator('p').filter({ hasText: /^총 자산$/ }).first()).toBeVisible();
    await expect(page.getByText('투입 금액', { exact: true })).toBeVisible();
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
    await expect(page.getByRole('heading', { name: '포트폴리오 리스크' })).toBeVisible();
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

  test('PORT-08: 데이터 근거와 위험 차단 근거를 함께 표시', async ({ page }) => {
    await page.route('**/api/portfolio/risk*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            ...seedTrades.portfolio_risk,
            activePositions: 11,
            maxPositions: 10,
            openRiskPct: 8.4,
            unknownRiskPositions: 2,
            riskGate: {
              status: 'BLOCK', effectiveRiskPct: 0, allowedRiskAmount: 0, riskBudgetRemaining: 0,
              reasons: [{ code: 'PORTFOLIO_HEAT', severity: 'BLOCK', message: 'Portfolio heat limit exceeded' }],
            },
            actions: [{ severity: 'BLOCK', title: 'Stop new entries', detail: 'Reduce open risk first' }],
          },
          meta: {
            source: 'portfolio-risk', provider: 'Supabase + Yahoo', delay: 'DELAYED_15M',
            asOf: '2026-06-20T01:00:00Z', observedAt: '2026-06-20T00:45:00Z',
            fallbackUsed: true, fallbackReason: 'Toss quote unavailable', warnings: ['가격 2건 확인 필요'], isStale: true,
          },
        }),
      });
    });

    await portfolioPage.goto();

    const trust = page.getByRole('region', { name: '포트폴리오 데이터 신뢰도' });
    await expect(trust).toContainText('Supabase + Yahoo');
    await expect(trust).toContainText('신선도지연');
    await expect(trust).toContainText('대체 데이터사용');

    const gate = page.getByRole('region', { name: '포트폴리오 위험한도 판정' });
    await expect(gate).toContainText('사용 중단');
    await expect(gate).toContainText('Portfolio heat limit exceeded');
    await expect(gate).toContainText('미측정 포지션2개');
    await expect(gate).toContainText(/다음 조치\s*신규 진입을 중단하고 차단 근거를 해소하세요\./);
  });

  test('PORT-09: API 실패에서 원시 오류를 숨기고 마지막 성공과 다음 조치를 표시', async ({ page }) => {
    await page.route('**/api/portfolio/risk*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'API_ERROR', recoverable: false,
          message: 'TypeError: fetch failed ECONNREFUSED 127.0.0.1:5432 at route.ts:77',
          lastSuccessfulAt: '2026-06-19T21:00:00Z',
        }),
      });
    });

    await portfolioPage.goto();

    const failure = page.getByRole('alert', { name: '포트폴리오 리스크를 불러오지 못했습니다' });
    await expect(failure).toContainText('포트폴리오 리스크를 불러오지 못했습니다');
    await expect(failure).toContainText('마지막 성공');
    await expect(failure).toContainText('다음 조치');
    await expect(failure).not.toContainText('ECONNREFUSED');
    await expect(failure).not.toContainText('route.ts');
  });
});
