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
    await expect(page.getByText('2026-05-19 나스닥 Top10')).toBeVisible();
    await expect(page.getByText('1. NVDA')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '현재 수익' })).toBeVisible();
    await expect(page.getByText('+4.20%').first()).toBeVisible();
    await expect(page.getByText('+3.50%')).toBeVisible();
  });

  test('REC-09: 최근 2주 추천 빈도 상위 5종목 표시', async ({ page }) => {
    await page.goto('/recommendations');
    const summary = page.getByRole('region', { name: '최근 2주 추천 빈도 Top 5' });

    await expect(summary).toBeVisible();
    await expect(summary.getByText('2026-06-08 ~ 2026-06-21 공식 추천 기준')).toBeVisible();
    await expect(summary.getByRole('row')).toHaveCount(6);
    await expect(summary.getByRole('row').nth(1)).toContainText('NVDA');
    await expect(summary.getByRole('row').nth(1)).toContainText('5회');
  });

  test('REC-07: 첫 진입 시가와 최신 평가가격 표시', async ({ page }) => {
    await page.goto('/recommendations');
    const row = page.getByRole('row').filter({ hasText: '1. NVDA' });

    await expect(page.getByRole('columnheader', { name: '진입 시가' }).first()).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '현재가' }).first()).toBeVisible();
    await expect(row.getByText('$120.00')).toBeVisible();
    await expect(row.getByText('2026-05-20')).toBeVisible();
    await expect(row.getByText('$125.04')).toBeVisible();
    await expect(row.getByText('2026-06-19')).toBeVisible();
  });

  test('REC-08: 카테고리와 분석 탭은 직접 이동 가능한 링크 제공', async ({ page }) => {
    await page.goto('/recommendations?category=NASDAQ100&date=2026-05-19');
    const main = page.getByRole('main');

    await expect(main.getByRole('link', { name: '코스피' })).toHaveAttribute('href', '/recommendations?category=KOSPI200&date=2026-05-19');
    await expect(main.getByRole('link', { name: '성과 분석' })).toHaveAttribute('href', '/recommendations?category=NASDAQ100&date=2026-05-19&view=metrics');
    await expect(main.getByRole('link', { name: '원인 분석' })).toHaveAttribute('href', '/recommendations?category=NASDAQ100&date=2026-05-19&view=diagnostics');
    await expect(main.getByRole('link', { name: '추천 이력' })).toHaveAttribute('aria-current', 'page');

    await main.getByRole('link', { name: '코스피' }).click();
    await expect(page).toHaveURL('/recommendations?category=KOSPI200&date=2026-05-19');
    await expect(page.getByRole('main').getByRole('link', { name: '코스피' })).toHaveAttribute('aria-current', 'page');
  });

  test('REC-05: 미성숙 기간은 완료 거래일 수를 표시', async ({ page }) => {
    await page.goto('/recommendations');
    await expect(page.getByText('대기 4/5')).toBeVisible();
    await expect(page.getByText('대기 4/20')).toBeVisible();
    await expect(page.getByText('대기 4/60')).toBeVisible();
  });

  test('REC-06: 성과 지표 헤더에 계산 기준 툴팁 표시', async ({ page }) => {
    await page.goto('/recommendations');
    const table = page.getByRole('table').filter({
      has: page.getByRole('button', { name: 'MFE / MAE 계산 기준' }),
    });

    await table.getByRole('button', { name: '초과수익 계산 기준' }).hover();
    await expect(page.locator('[role="tooltip"]:visible').getByText('종목 수익률 - 동일 기간 벤치마크 수익률')).toBeVisible();

    await table.getByRole('button', { name: 'MFE / MAE 계산 기준' }).hover();
    await expect(page.locator('[role="tooltip"]:visible').getByText('MFE는 진입 후 가장 높았던 수익률, MAE는 가장 낮았던 수익률입니다.')).toBeVisible();
  });

  test('REC-04: 추천일을 선택하면 해당 날짜 이력만 조회', async ({ page }) => {
    await page.goto('/recommendations');
    const requestPromise = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname === '/api/recommendations'
        && url.searchParams.get('from') === '2026-05-19'
        && url.searchParams.get('to') === '2026-05-19';
    });

    await page.getByLabel('추천일 선택').fill('2026-05-19');
    await page.getByRole('button', { name: '조회' }).click();
    await requestPromise;

    await expect(page).toHaveURL(/date=2026-05-19/);
    await expect(page.getByText('2026-05-19 나스닥 Top10')).toBeVisible();
    await page.getByRole('link', { name: '전체 보기' }).click();
    await expect(page).not.toHaveURL(/date=/);
  });

  test('REC-02: 5·20·60일 성과와 표본 수 표시', async ({ page }) => {
    await page.goto('/recommendations');
    await page.getByRole('link', { name: '성과 분석' }).click();
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
