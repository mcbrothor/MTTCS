import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/auth';
import { setupAllMocks } from './mocks/handlers';

const meta = {
  asOf: '2026-07-24T20:00:00Z',
  source: 'gold-e2e',
  provider: 'E2E Fixture',
  delay: 'EOD',
  fallbackUsed: false,
  warnings: [],
};

const settings = {
  coreProduct: '411060',
  tacticalProduct: '132030',
  baseCurrency: 'KRW',
  manualAccountValue: 100_000_000,
  externalGoldValue: 500_000,
  physicalGoldValue: 300_000,
  executionLevels: {
    '132030': {
      support: 18_500,
      resistance: 19_200,
      target: 20_500,
      updatedAt: '2026-07-24T20:00:00Z',
    },
  },
  riskPaused: false,
  updatedAt: '2026-07-24T20:00:00Z',
} as const;

interface FixtureQuality {
  status: 'VALID' | 'DEGRADED' | 'BLOCKED';
  reasons: string[];
  priceBars: number;
  priceAsOf: string;
  macroComplete: boolean;
  wgcPeriod: string;
  wgcAgeDays: number;
}

const validQuality: FixtureQuality = {
  status: 'VALID',
  reasons: [],
  priceBars: 252,
  priceAsOf: '2026-07-24',
  macroComplete: true,
  wgcPeriod: '2026-06',
  wgcAgeDays: 24,
} as const;

const products = {
  GLD: {
    code: 'GLD',
    name: 'SPDR Gold Shares',
    market: 'US',
    currency: 'USD',
    yahooTicker: 'GLD',
    kisExchange: 'AMS',
    currencyExposure: 'USD_EXPOSED',
    roleHint: '달러 환노출 코어·전술 상품',
  },
  '411060': {
    code: '411060',
    name: 'ACE KRX금현물',
    market: 'KR',
    currency: 'KRW',
    yahooTicker: '411060.KS',
    kisExchange: 'KOSPI',
    currencyExposure: 'KRW_UNHEDGED',
    roleHint: '원화 계좌 코어 상품',
  },
  '132030': {
    code: '132030',
    name: 'KODEX 골드선물(H)',
    market: 'KR',
    currency: 'KRW',
    yahooTicker: '132030.KS',
    kisExchange: 'KOSPI',
    currencyExposure: 'KRW_HEDGED',
    roleHint: '환헤지 전술 상품',
  },
} as const;

function analysis(product: keyof typeof products, close: number) {
  return {
    product: products[product],
    technical: {
      close,
      ma20: close * 1.01,
      ma50: close * 1.03,
      ma100: close * 1.05,
      ma200: close * 1.04,
      atr14: close * 0.018,
      atrPct: 1.8,
      previous20DayHigh: close * 1.04,
      sixMonthEndAverage: close * 1.02,
      latestMonthEndClose: close,
      monthEndTrend: 'OFF',
      monthEndSignalEffectiveDate: '2026-08-03',
      fastBreakout: false,
      asOf: '2026-07-24',
    },
    executionLevels: product === '132030'
      ? settings.executionLevels['132030']
      : { support: null, resistance: null, target: null, updatedAt: null },
    executionLevelsRequired: product !== '132030',
    quality: validQuality,
    provider: 'E2E Fixture',
    fallbackUsed: false,
  };
}

function strategyFixture(quality = validQuality) {
  return {
    modelVersion: 'gold-core-tactical-2026.07-v1',
    releaseStatus: 'RESEARCH_ONLY',
    asOf: '2026-07-24T20:00:00Z',
    policy: {
      maxGoldPct: 10,
      corePct: 4,
      maxTacticalPct: 6,
      riskPerTradePct: 0.5,
      shortRiskPct: 0.25,
      leverageEnabled: false,
    },
    settings,
    decision: {
      code: 'WAIT',
      label: '코어 분할 매수 · 전술 대기',
      summary: '장기 코어는 유지하되 단기 추세 전환이 확인되지 않았습니다.',
      coreAction: '코어 4%를 3회 분할합니다.',
      tacticalAction: '월말 추세와 매크로 개선을 기다립니다.',
    },
    allocation: {
      accountValue: 100_000_000,
      portfolioAccountValue: 80_000_000,
      accountValueSource: 'MANUAL',
      existingPortfolioGoldValue: 1_500_000,
      externalGoldValue: 500_000,
      physicalGoldValue: 300_000,
      totalExistingGoldValue: 2_300_000,
      currentExposurePct: 2.3,
      coreTargetPct: 4,
      tacticalTargetPct: 0,
      totalTargetPct: 4,
      coreTargetAmount: 4_000_000,
      tacticalTargetAmount: 0,
      totalTargetAmount: 4_000_000,
      differenceAmount: 1_700_000,
      remainingGoldCapacityAmount: 7_700_000,
      status: 'UNDER',
    },
    products: {
      core: analysis('411060', 20_300),
      tactical: analysis('132030', 18_900),
    },
    macro: {
      score: -2,
      complete: true,
      frozenAsOf: '2026-07-24',
      components: [
        {
          key: 'REAL_YIELD',
          label: '미국 10년 실질금리',
          score: -1,
          value: 2.43,
          change: 24,
          unit: '%',
          changeUnit: 'bp',
          asOf: '2026-07-23',
          interpretation: '실질금리 상승은 금에 부정적입니다.',
        },
        {
          key: 'BROAD_DOLLAR',
          label: '광의 달러지수',
          score: 0,
          value: 120.53,
          change: -0.43,
          unit: 'INDEX',
          changeUnit: '%',
          asOf: '2026-07-23',
          interpretation: '20일 변화가 중립 범위입니다.',
        },
        {
          key: 'ETF_FLOW',
          label: '글로벌 금 ETF 흐름',
          score: -1,
          value: -8.9,
          change: -74,
          unit: 'USD_BILLION',
          changeUnit: 'TONNES',
          asOf: '2026-06-30',
          interpretation: '최근 월간 순유출입니다.',
        },
      ],
      tacticalCapPct: 0,
      reason: '완전한 점수 -2로 전술 비중은 0%입니다.',
    },
    corePlan: {
      targetAmount: 4_000_000,
      reviewRequired: false,
      reviewReasons: [],
      tranches: [
        { sequence: 1, amount: 1_333_334, condition: '현재 가격대에서 1차', ready: true },
        { sequence: 2, amount: 1_333_333, condition: '상품별 지지선에서 2차', ready: false },
        { sequence: 3, amount: 1_333_333, condition: '돌파 또는 하단 지지에서 3차', ready: false },
      ],
    },
    tacticalPlan: {
      allowed: false,
      entryPrice: 19_200,
      initialStop: 18_520,
      trailingStop: 18_520,
      stopDistancePct: 3.54,
      targetPrice: 20_500,
      suggestedAmount: 0,
      suggestedUnits: 0,
      riskBudgetAmount: 500_000,
      limitingFactor: 'DATA',
      reasons: ['월말 추세 OFF', '매크로 점수 -2'],
    },
    executionPlan: {
      buyAmount: 1_700_000,
      sellAmount: 0,
      buySteps: [
        { sequence: 1, action: 'BUY', sleeve: 'CORE', product: '411060', amount: 566_667, units: 27, percentOfPlan: 33.33, condition: '현재 가격대 1차 분할', status: 'READY' },
        { sequence: 2, action: 'BUY', sleeve: 'CORE', product: '411060', amount: 566_667, units: 27, percentOfPlan: 33.33, condition: '추가 하락 시 2차 분할', status: 'READY' },
        { sequence: 3, action: 'BUY', sleeve: 'CORE', product: '411060', amount: 566_666, units: 27, percentOfPlan: 33.34, condition: '지지·저항 확인 후 3차', status: 'WAIT' },
      ],
      sellSteps: [],
    },
    advancedShort: {
      visible: true,
      executable: false,
      riskPct: 0.25,
      condition: '상품 자체 지지선 하향 마감',
      stop: '진입가 위 2ATR',
      targets: ['1차 지지', '2차 지지'],
    },
    backtest: {
      status: 'VERIFIED',
      product: 'GLD',
      startDate: '2016-07-25',
      endDate: '2026-07-24',
      observations: 2514,
      transactionCostPct: 0.1,
      verifiedAt: '2026-07-26T00:00:00Z',
      assumptions: [
        '포지션 변경 비용 0.10%',
        '세금·추가 슬리피지·현금 이자 제외',
        '월말 신호는 다음 거래일 종가 이후 적용',
      ],
      strategies: [
        {
          mode: 'BUY_AND_HOLD',
          label: '계속 보유',
          cagrPct: 11.47,
          annualVolatilityPct: 16.12,
          maxDrawdownPct: -26.4,
          sharpe: 0.757,
          averageExposurePct: 100,
        },
        {
          mode: 'SIX_MONTH_TREND',
          label: '6개월 추세',
          cagrPct: 10.67,
          annualVolatilityPct: 14.19,
          maxDrawdownPct: -25.92,
          sharpe: 0.787,
          averageExposurePct: 66.51,
        },
        {
          mode: 'CORE_TACTICAL',
          label: '코어 40% + 전술 60%',
          cagrPct: 11.07,
          annualVolatilityPct: 14.51,
          maxDrawdownPct: -22.37,
          sharpe: 0.798,
          averageExposurePct: 79.9,
        },
      ],
    },
    quality,
    referenceScenario: {
      instrument: 'XAU/USD',
      asOf: '2026-07-24',
      expiresAt: '2026-07-30T23:59:59Z',
      active: false,
      support: [3950, 4000],
      resistance: [4165, 4185],
      upsideScenario: 4500,
      note: '만료된 운영자 참고 시나리오입니다.',
    },
    sources: [
      {
        label: '상품 가격',
        provider: 'E2E Fixture',
        url: 'https://example.com/gold',
        asOf: '2026-07-24',
      },
    ],
  };
}

function historyFixture(product: '411060' | '132030') {
  const start = product === '411060' ? 20_000 : 18_500;
  const bars = Array.from({ length: 45 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 4, 1 + index)).toISOString().slice(0, 10);
    const close = start + index * 10;
    return {
      date,
      open: close - 20,
      high: close + 50,
      low: close - 60,
      close,
      volume: 100_000 + index,
    };
  });
  return {
    product: products[product],
    bars,
    quality: validQuality,
    provider: 'E2E Fixture',
    fallbackUsed: false,
  };
}

async function setupGoldMocks(page: Page, options: {
  empty?: boolean;
  error?: boolean;
  delayMs?: number;
  quality?: typeof validQuality | {
    status: 'DEGRADED';
    reasons: string[];
    priceBars: number;
    priceAsOf: string;
    macroComplete: boolean;
    wgcPeriod: string;
    wgcAgeDays: number;
  };
} = {}) {
  let savedSettings = { ...settings };

  await page.route('**/api/gold/settings*', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      savedSettings = {
        ...savedSettings,
        ...body,
        updatedAt: '2026-07-25T00:00:00Z',
      };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: savedSettings, meta }),
    });
  });

  await page.route('**/api/gold/strategy?*', async (route) => {
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    if (options.error) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: '금 전략 공급자 오류', code: 'NO_DATA', recoverable: false }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: options.empty ? null : strategyFixture(options.quality),
        meta: options.quality?.status === 'DEGRADED'
          ? { ...meta, isStale: true, staleReason: options.quality.reasons.join(' ') }
          : meta,
      }),
    });
  });

  await page.route('**/api/gold/history?*', async (route) => {
    const product = new URL(route.request().url()).searchParams.get('product');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: historyFixture(product === '411060' ? '411060' : '132030'),
        meta,
      }),
    });
  });

  await page.route('**/api/gold/snapshots*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          items: [{
            id: 'gold-snapshot-1',
            strategyDate: '2026-07-24',
            coreProduct: '411060',
            tacticalProduct: '132030',
            decision: strategyFixture().decision,
            macroScore: -2,
            targetCorePct: 4,
            targetTacticalPct: 0,
            dataQuality: 'VALID',
            modelVersion: 'gold-core-tactical-2026.07-v1',
            inputHash: 'e2e-input-hash',
            createdAt: '2026-07-24T23:30:00Z',
          }],
        },
        meta,
      }),
    });
  });
}

test.describe('TC-GOLD: 금 투자 전략', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
    await login(page);
  });

  test('GOLD-01: 정상 전략과 비활성 연구 신호를 표시한다', async ({ page }) => {
    await setupGoldMocks(page);
    await page.goto('/gold');

    const dashboard = page.getByTestId('gold-strategy-dashboard');
    const briefing = page.getByTestId('gold-decision-briefing');
    await expect(dashboard.locator(':scope > *').first()).toHaveAttribute(
      'data-testid',
      'gold-decision-briefing',
    );
    await expect(briefing.getByText('지금 할 일', { exact: true })).toBeVisible();
    await expect(briefing.getByText('하지 말 일', { exact: true })).toBeVisible();
    await expect(briefing.getByText('다음 전환 조건', { exact: true })).toBeVisible();
    await expect(briefing).toContainText('목표까지 ₩1,700,000 부족');

    await expect(page.getByRole('heading', { name: '금 투자 전략' })).toBeVisible();
    await expect(briefing.getByText('RESEARCH_ONLY', { exact: true })).toBeVisible();
    await expect(briefing.getByText('오늘의 의사결정 브리핑', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '코어 분할 매수 · 전술 대기' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '매크로 점수' })).toBeVisible();
    await expect(page.getByText('전술 진입 대기', { exact: true })).toBeVisible();
    await expect(page.getByTestId('gold-backtest')).toContainText('코어 40% + 전술 60%');
    await expect(page.getByTestId('gold-backtest')).toContainText('-22.37%');
    await expect(page.getByTestId('gold-reference-scenario')).toContainText('활성 신호 아님');
    await expect(page.getByTestId('gold-execution-plan')).toContainText('원금 기준 분할 매수·매도 실행표');
    await expect(page.getByTestId('gold-execution-plan')).toContainText('₩566,667');
    await expect(page.getByTestId('gold-entry-guide')).toContainText('언제 진입하나요?');
    await expect(page.getByTestId('gold-entry-guide')).toContainText('READY인 단계만');
    await expect(page.getByRole('link', { name: '금 메뉴 설명서' })).toHaveAttribute('href', '/guide#gold-strategy');
  });

  test('GOLD-02: 현재 원금과 외부 금 평가액을 저장하고 재계산한다', async ({ page }) => {
    await setupGoldMocks(page);
    await page.goto('/gold');
    await expect(page.getByLabel('외부 금융 금 평가액')).toBeVisible();

    const currencyGroup = page.getByRole('group', { name: '입력 금액 단위' });
    await expect(currencyGroup).toBeVisible();
    await expect(currencyGroup.getByRole('radio', { name: 'KRW · 원화' })).toBeChecked();
    await currencyGroup.getByRole('radio', { name: 'USD · 달러' }).check();

    await page.getByLabel('전략 계산 원금 (현재 원금)').fill('150000');
    await page.getByLabel('외부 금융 금 평가액').fill('1500');
    const saveRequest = page.waitForRequest((request) => (
      request.url().includes('/api/gold/settings') && request.method() === 'PUT'
    ));
    await page.getByRole('button', { name: '설정 저장' }).click();
    const request = await saveRequest;

    expect(request.postDataJSON()).toMatchObject({
      baseCurrency: 'USD',
      externalGoldValue: 1_500,
      manualAccountValue: 150_000,
      coreProduct: '411060',
      tacticalProduct: '132030',
    });
    await expect(page.getByText('설정을 저장하고 전략을 다시 계산했습니다.')).toBeVisible();
  });

  test('GOLD-03: 비어 있는 전략 응답을 안내한다', async ({ page }) => {
    await setupGoldMocks(page, { empty: true });
    await page.goto('/gold');

    await expect(page.getByText('아직 계산된 금 전략이 없습니다')).toBeVisible();
  });

  test('GOLD-04: 공급자 오류와 재시도 동작을 표시한다', async ({ page }) => {
    await setupGoldMocks(page, { error: true });
    await page.goto('/gold');

    await expect(page.getByText('금 투자 전략을 불러오지 못했습니다')).toBeVisible();
    await expect(page.getByText('금 전략 공급자 오류')).toBeVisible();
    await expect(page.getByRole('button', { name: '다시 불러오기' })).toBeVisible();
  });

  test('GOLD-05: 오래된 데이터는 전술 차단 경고를 표시한다', async ({ page }) => {
    await setupGoldMocks(page, {
      quality: {
        status: 'DEGRADED',
        reasons: ['WGC 월간 흐름이 45일을 초과했습니다.'],
        priceBars: 252,
        priceAsOf: '2026-07-24',
        macroComplete: false,
        wgcPeriod: '2026-05',
        wgcAgeDays: 55,
      },
    });
    await page.goto('/gold');

    await expect(page.getByTestId('gold-stale-warning')).toContainText('DEGRADED');
    await expect(page.getByTestId('gold-stale-warning')).toContainText('신규 전술 진입 차단');
  });

  test('GOLD-06: 초기 로딩 상태를 표시한다', async ({ page }) => {
    await setupGoldMocks(page, { delayMs: 1_000 });
    await page.goto('/gold');

    await expect(page.getByText('금 전략 데이터를 불러오는 중입니다')).toBeVisible();
    await expect(page.getByText('오늘의 의사결정 브리핑', { exact: true })).toBeVisible({ timeout: 5_000 });
  });

  test('GOLD-07: 데스크톱 독립 메뉴가 활성화되고 오늘 메뉴는 비활성이다', async ({ page }) => {
    await setupGoldMocks(page);
    await page.goto('/gold');

    await page.getByRole('button', { name: /투자 전략/ }).click();
    const goldLink = page.getByRole('link', { name: /금 투자/ });
    await expect(goldLink).toBeVisible();
    await expect(goldLink).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('link', { name: '오늘', exact: true })).not.toHaveAttribute('aria-current', 'page');
  });

  test('GOLD-08: 모바일 전체 메뉴의 투자 전략 섹션에서 금 메뉴가 활성화된다', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setupGoldMocks(page);
    await page.goto('/gold');
    await page.getByRole('button', { name: '메뉴 열기' }).click();

    const drawer = page.getByRole('dialog', { name: '전체 메뉴' });
    await expect(drawer.getByText('투자 전략', { exact: true })).toBeVisible();
    await expect(drawer.getByRole('link', { name: /금 투자/ })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('link', { name: '오늘', exact: true })).not.toHaveAttribute('aria-current', 'page');
  });
});
