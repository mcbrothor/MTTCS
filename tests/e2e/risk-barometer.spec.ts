import { expect, test } from '@playwright/test';
import { login } from './helpers/auth';
import { setupAllMocks } from './mocks/handlers';

test.describe('미국 AI/FOMO 과열 바로미터', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
    await login(page);
  });

  test('시장 분석 탭, meter, 10개 근거와 출처를 표시한다', async ({ page }) => {
    await page.goto('/market-barometer');

    await expect(page.getByRole('heading', { name: '미국 AI/FOMO 리스크 바로미터' })).toBeVisible();
    await expect(page.getByRole('link', { name: '과열 바로미터' })).toBeVisible();
    const meter = page.getByRole('meter', { name: '미국 AI/FOMO 위험 점수' });
    await expect(meter).toHaveAttribute('aria-valuenow', '4');
    await expect(meter).toHaveAttribute('aria-valuemax', '10');
    await expect(page.getByText('RESEARCH_ONLY · SHADOW')).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('row')).toHaveCount(11);
    await expect(page.getByRole('link', { name: /E2E official source/ }).first()).toBeVisible();
  });

  test('현재 점수의 산식과 품질·위험 구간 기준을 설명한다', async ({ page }) => {
    await page.goto('/market-barometer');

    await expect(page.getByRole('heading', { name: '점수 산출 방식' })).toBeVisible();
    await expect(page.getByText('4 ÷ 10 × 10 = 4.0')).toBeVisible();
    await expect(page.getByText('위험 신호 4개')).toBeVisible();
    await expect(page.getByText('정상 6개')).toBeVisible();
    await expect(page.getByText('미확인 0개')).toBeVisible();
    await expect(page.getByText('3점 미만')).toBeVisible();
    await expect(page.getByText('3점 이상 7점 미만')).toBeVisible();
    await expect(page.getByText('7점 이상')).toBeVisible();
  });

  test('30일 추이를 축·구간·최신값이 있는 차트로 표시한다', async ({ page }) => {
    await page.goto('/market-barometer');

    await expect(page.getByRole('img', { name: '최근 30일 AI/FOMO 위험 점수 추이' })).toBeVisible();
    await expect(page.getByText('최신 4.0')).toBeVisible();
    await expect(page.getByText('3개 관측')).toBeVisible();
    await expect(page.getByText('낮음 0–3 미만')).toBeVisible();
    await expect(page.getByText('주의 3–7 미만')).toBeVisible();
    await expect(page.getByText('위험 7–10')).toBeVisible();
  });

  test('마스터필터 요약 카드에서 상세 화면으로 이동한다', async ({ page }) => {
    await page.goto('/master-filter');
    const card = page.getByRole('link', { name: '미국 AI/FOMO 과열 바로미터 상세로 이동' });
    await expect(card).toContainText('4/10');
    await card.click();
    await expect(page).toHaveURL(/\/market-barometer$/);
  });

  for (const scenario of [
    { quality: 'DEGRADED', score: 5, coverage: 8, expected: '8/10개 지표로 10점 만점 환산했습니다.' },
    { quality: 'BLOCKED', score: null, coverage: 7, expected: '7/10개만 확인되어 총점을 차단했습니다.' },
  ] as const) {
    test(`${scenario.quality} 품질 안내를 안전하게 표시한다`, async ({ page }) => {
      await page.route('**/api/risk-barometer?market=US', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              score: scenario.score,
              rawScore: 4,
              band: scenario.score === null ? 'UNAVAILABLE' : 'CAUTION',
              quality: scenario.quality,
              coverage: { valid: scenario.coverage, total: 10 },
              asOf: '2026-07-28T23:59:59.000Z',
              modelVersion: 'ai-fomo-us-2026.07-v1',
              modelStatus: 'RESEARCH_ONLY',
              indicators: [],
            },
          }),
        });
      });
      await page.goto('/market-barometer');
      await expect(page.getByText(scenario.expected, { exact: false })).toBeVisible();
    });
  }

  test('375px에서 지표를 카드로 전환하고 가로 넘침이 없다', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/market-barometer');
    await expect(page.getByRole('heading', { name: '미국 AI/FOMO 리스크 바로미터' })).toBeVisible();
    await expect(page.locator('article').filter({ hasText: 'S&P 500 집중도' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
