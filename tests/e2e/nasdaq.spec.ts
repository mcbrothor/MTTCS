import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/auth';
import { setupAllMocks } from './mocks/handlers';

const meta = {
  asOf: '2026-07-24T23:45:00Z',
  source: 'nasdaq-e2e',
  provider: 'E2E Fixture',
  delay: 'EOD',
  fallbackUsed: false,
  warnings: [],
};

const settings = {
  tacticalProduct: 'QLD',
  baseCurrency: 'KRW',
  manualAccountValue: 100_000_000,
  externalNasdaqValue: 0,
  tqqqOptIn: false,
  riskPaused: false,
  updatedAt: '2026-07-24T23:45:00Z',
};

const products = {
  QQQ: { code: 'QQQ', name: 'Invesco QQQ Trust', leverage: 1, currency: 'USD', yahooTicker: 'QQQ', kisExchange: 'NAS', grossExpenseRatioPct: 0.18, netExpenseRatioPct: 0.18, feeAsOf: '2026-07-24', feeReviewAfter: '2027-01-31', sourceUrl: 'https://example.com/qqq' },
  QLD: { code: 'QLD', name: 'ProShares Ultra QQQ', leverage: 2, currency: 'USD', yahooTicker: 'QLD', kisExchange: 'NAS', grossExpenseRatioPct: 0.98, netExpenseRatioPct: 0.95, feeAsOf: '2026-07-24', feeReviewAfter: '2027-01-31', sourceUrl: 'https://example.com/qld' },
  TQQQ: { code: 'TQQQ', name: 'ProShares UltraPro QQQ', leverage: 3, currency: 'USD', yahooTicker: 'TQQQ', kisExchange: 'NAS', grossExpenseRatioPct: 0.97, netExpenseRatioPct: 0.82, feeAsOf: '2026-07-24', feeReviewAfter: '2026-09-30', sourceUrl: 'https://example.com/tqqq' },
};

function strategyFixture() {
  return {
    modelVersion: 'nasdaq-core-leverage-2026.07-v1',
    modelStatus: 'RESEARCH_ONLY',
    asOf: '2026-07-24',
    decision: 'QLD_READY',
    regime: {
      asOf: '2026-07-24',
      close: 620,
      ma50: 600,
      ma200: 560,
      aboveMa200TwoCloses: true,
      goldenCross: true,
      prior20DayHigh: 618,
      breakout20: true,
      realizedVolatility20Pct: 14,
      volatilityScale: 1,
      monthlyTrend: { signal: 'ON', signalDate: '2026-06-30', effectiveFrom: '2026-07-01', isEffective: true, latestClose: 600, average10MonthClose: 570 },
      fastDeRisk: false,
    },
    execution: { product: 'QLD', asOf: '2026-07-24', close: 145, ma20: 140, ma50: 135, ma200: 120, atr14: 4, atrPct14: 2.75, prior20DayHigh: 144, breakout20: true },
    quality: { status: 'VALID', reasons: [], qqqAdjustedBars: 2520, executionBars: 320, asOf: '2026-07-24' },
    settings: { ...settings, accountEquity: 100_000_000, existingQqqValue: 5_000_000, existingQldValue: 0, existingTqqqValue: 0 },
    allocation: {
      maxCapitalPct: 0.2,
      maxEffectiveExposurePct: 0.3,
      qqqCoreTargetPct: 0.1,
      tacticalCapitalTargetPct: 0.05,
      tacticalEffectiveTargetPct: 0.1,
      totalCapitalTargetPct: 0.15,
      totalEffectiveTargetPct: 0.2,
      existingCapitalValue: 5_000_000,
      existingEffectiveExposureValue: 5_000_000,
      capitalTargetValue: 15_000_000,
      effectiveTargetValue: 20_000_000,
      targetGapValue: 10_000_000,
    },
    capitalBasis: {
      accountValue: 100_000_000,
      portfolioAccountValue: 0,
      source: 'MANUAL',
    },
    executionPlan: {
      buyAmount: 9_999_890,
      sellAmount: 0,
      buySteps: [
        { sequence: 1, action: 'BUY', sleeve: 'CORE', product: 'QQQ', amount: 2_000_000, units: 2, percentOfPlan: 40, condition: '장기 추세 확인 후 1차', status: 'READY' },
        { sequence: 2, action: 'BUY', sleeve: 'CORE', product: 'QQQ', amount: 1_500_000, units: 1, percentOfPlan: 30, condition: '눌림에서 2차', status: 'READY' },
        { sequence: 3, action: 'BUY', sleeve: 'CORE', product: 'QQQ', amount: 1_500_000, units: 1, percentOfPlan: 30, condition: '재돌파에서 3차', status: 'READY' },
        { sequence: 1, action: 'BUY', sleeve: 'TACTICAL', product: 'QLD', amount: 2_499_945, units: 12, percentOfPlan: 50, condition: '게이트 충족 종가 1차', status: 'READY' },
        { sequence: 2, action: 'BUY', sleeve: 'TACTICAL', product: 'QLD', amount: 2_499_945, units: 12, percentOfPlan: 50, condition: '추세 확인 후 2차', status: 'READY' },
      ],
      sellSteps: [],
    },
    position: { product: 'QLD', entryPrice: 145, stopPrice: 137, trailingStopPrice: 137, stopDistancePct: 5.5, riskBudget: 350_000, unconstrainedNotional: 6_300_000, cappedNotional: 5_000_000, units: 34_482, actualNotional: 4_999_890, bindingLimit: 'CAPITAL_CAP' },
    actions: { now: 'QLD 전술 수량과 2ATR 손절을 확인합니다.', avoid: 'TQQQ와 동시에 보유하지 않습니다.', nextCondition: '10개월 추세 또는 200일선 이탈 시 디레버리징합니다.' },
    reasons: ['QLD 추세·변동성 게이트가 충족되었습니다.'],
    products,
    providers: {
      qqqAdjusted: { provider: 'Yahoo Finance', fallbackUsed: false, warnings: [] },
      tacticalExecution: { provider: 'KIS', fallbackUsed: false, warnings: [] },
    },
    productMetadata: Object.values(products).map((product) => ({
      product: product.code,
      leverageMultiple: product.leverage,
      grossExpenseRatioPct: product.grossExpenseRatioPct,
      netExpenseRatioPct: product.netExpenseRatioPct,
      effectiveDate: '2026-07-24',
      reviewAfter: product.feeReviewAfter,
      sourceUrl: product.sourceUrl,
    })),
    portfolioWarnings: [],
    dailyResetWarning: 'QLD와 TQQQ는 하루 수익률 목표로 매일 재설정됩니다.',
    researchBenchmarks: [
      { label: 'Meb Faber 10개월 이동평균', use: '월말 장기 추세 필터', sourceUrl: 'https://example.com/faber' },
      { label: 'Leverage for the Long Run', use: '레버리지 축소', sourceUrl: 'https://example.com/leverage' },
      { label: 'Volatility-Managed Portfolios', use: '변동성 조절', sourceUrl: 'https://example.com/vol' },
    ],
    updatedAt: '2026-07-24T23:45:00Z',
    backtest: {
      status: 'VERIFIED',
      verifiedAt: '2026-07-27T00:00:00Z',
      modelVersion: 'nasdaq-core-leverage-2026.07-v1',
      dataPolicy: 'actual adjusted ETF series',
      transactionCostPct: 0.1,
      assumptions: ['다음 거래일 적용'],
      strategies: [
        { mode: 'QQQ_BUY_HOLD', label: 'QQQ 계속 보유', startDate: '2011-02-09', endDate: '2026-07-24', cagrPct: 16.05, annualVolatilityPct: 22.43, maxDrawdownPct: -53.4, sharpe: 0.78, sortino: 0.73, calmar: 0.3, averageEffectiveExposurePct: 100 },
        { mode: 'TQQQ_BUY_HOLD', label: 'TQQQ 계속 보유', startDate: '2011-02-09', endDate: '2026-07-24', cagrPct: 38.18, annualVolatilityPct: 61.6, maxDrawdownPct: -81.66, sharpe: 0.84, sortino: 0.79, calmar: 0.47, averageEffectiveExposurePct: 300 },
      ],
    },
  };
}

async function setupNasdaqMocks(page: Page) {
  let saved = { ...settings };
  await page.route('**/api/nasdaq/settings*', async (route) => {
    if (route.request().method() === 'PUT') saved = { ...saved, ...route.request().postDataJSON() };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: saved, meta }) });
  });
  await page.route('**/api/nasdaq/strategy?*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: strategyFixture(), meta }) });
  });
  await page.route('**/api/nasdaq/history?*', async (route) => {
    const product = new URL(route.request().url()).searchParams.get('product') || 'QQQ';
    const bars = Array.from({ length: 80 }, (_, index) => {
      const close = 100 + index;
      return { date: new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10), open: close - 1, high: close + 1, low: close - 2, close, volume: 100_000, product, series: 'EXECUTION' };
    });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { product, series: 'EXECUTION', bars, provider: 'E2E', fallbackUsed: false, warnings: [] }, meta }) });
  });
  await page.route('**/api/nasdaq/snapshots*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { items: [] }, meta }) });
  });
}

test.describe('TC-NASDAQ: 나스닥100 전략', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
    await login(page);
    await setupNasdaqMocks(page);
  });

  test('NASDAQ-01: 첫 블록이 의사결정 브리핑이고 자본·유효 노출을 분리한다', async ({ page }) => {
    await page.goto('/nasdaq');
    const briefing = page.getByTestId('nasdaq-decision-briefing');
    const dashboard = page.getByTestId('nasdaq-strategy-dashboard');
    await expect(dashboard.locator(':scope > *').first()).toHaveAttribute('data-testid', 'nasdaq-decision-briefing');
    await expect(briefing).toContainText('QLD 조건 충족');
    await expect(briefing).toContainText('지금 할 일');
    await expect(briefing).toContainText('하지 말 일');
    await expect(briefing).toContainText('다음 전환 조건');
    await expect(briefing).toContainText('목표 자본 비중');
    await expect(briefing).toContainText('목표 유효 노출');
    await expect(page.getByTestId('nasdaq-backtest')).toContainText('-81.66%');
    await expect(page.getByTestId('nasdaq-execution-plan')).toContainText('원금 기준 분할 매수·매도 실행표');
    await expect(page.getByTestId('nasdaq-execution-plan')).toContainText('QQQ');
    await expect(page.getByTestId('nasdaq-entry-guide')).toContainText('언제 진입하나요?');
    await expect(page.getByTestId('nasdaq-entry-guide')).toContainText('READY인 단계만');
    await expect(page.getByRole('link', { name: '나스닥100 메뉴 설명서' })).toHaveAttribute('href', '/guide#nasdaq-strategy');
    await expect(page.getByRole('button', { name: /매수|주문/ })).toHaveCount(0);
  });

  test('NASDAQ-05: 현재 원금을 저장해 실행 계획 계산 기준으로 사용한다', async ({ page }) => {
    await page.goto('/nasdaq');
    const currencyGroup = page.getByRole('group', { name: '입력 금액 단위' });
    await expect(currencyGroup).toBeVisible();
    await expect(currencyGroup.getByRole('radio', { name: 'KRW · 원화' })).toBeChecked();
    await currencyGroup.getByRole('radio', { name: 'USD · 달러' }).check();
    await page.getByLabel('전략 계산 원금 (현재 원금)').fill('150000');
    await page.getByLabel('외부 나스닥 보유 평가액').fill('25000');
    const saveRequest = page.waitForRequest((request) => (
      request.url().includes('/api/nasdaq/settings') && request.method() === 'PUT'
    ));
    await page.getByRole('button', { name: '설정 저장·재계산' }).click();
    expect((await saveRequest).postDataJSON()).toMatchObject({
      baseCurrency: 'USD',
      manualAccountValue: 150_000,
      externalNasdaqValue: 25_000,
    });
  });

  test('NASDAQ-02: TQQQ는 명시적 위험 확인을 요구한다', async ({ page }) => {
    await page.goto('/nasdaq');
    await page.getByLabel('전술 상품').selectOption('TQQQ');
    await expect(page.getByText(/일일 3배 목표의 복리/)).toBeVisible();
  });

  test('NASDAQ-03: 독립 메뉴가 활성화되고 오늘 메뉴는 비활성이다', async ({ page }) => {
    await page.goto('/nasdaq');
    await page.getByRole('button', { name: /투자 전략/ }).click();
    await expect(page.getByRole('link', { name: /나스닥100/ })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('link', { name: '오늘', exact: true })).not.toHaveAttribute('aria-current', 'page');
  });

  test('NASDAQ-04: 모바일 첫 화면에 의사결정과 행동이 보인다', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/nasdaq');
    const briefing = page.getByTestId('nasdaq-decision-briefing');
    await expect(briefing).toContainText('QLD 조건 충족');
    const box = await briefing.boundingBox();
    expect(box?.y).toBeLessThan(100);
    await page.getByRole('button', { name: '메뉴 열기' }).click();
    const drawer = page.getByRole('dialog', { name: '전체 메뉴' });
    await expect(drawer.getByText('투자 전략', { exact: true })).toBeVisible();
    await expect(drawer.getByRole('link', { name: /나스닥100/ })).toHaveAttribute('aria-current', 'page');
  });
});
