import { type Page } from '@playwright/test';
import marketData from '../fixtures/market-data.json';
import seedTrades from '../fixtures/seed-trades.json';
import scannerResults from '../fixtures/scanner-results.json';
import contestResponse from '../fixtures/contest-response.json';

/**
 * MTN E2E API Route Interceptor
 *
 * Since MTN uses Next.js API routes (same origin), we intercept fetch requests
 * at the Playwright network layer instead of MSW. This is simpler and more reliable
 * for same-origin API routes.
 *
 * Each function sets up route handlers that return deterministic fixture data.
 */

/**
 * Setup all API mocks for a standard RISK_ON test scenario.
 * Call this in test.beforeEach() for most tests.
 */
export async function setupAllMocks(page: Page): Promise<void> {
  await setupAuthMock(page);
  await setupMacroMocks(page);
  await setupMasterFilterMock(page);
  await setupTradesMock(page);
  await setupPortfolioMock(page);
  await setupScannerMock(page);
  await setupContestMock(page);
  await setupWatchlistMock(page);
  await setupMarketDataMock(page);
}

// ─── Auth ───

export async function setupAuthMock(page: Page): Promise<void> {
  void page;
  // Do NOT intercept auth API routes by default, so cookies can be set/cleared by the real server
  // and page navigation correctly detects active session cookie.
  // We let the real Next.js server handle it since .env.test is injected with valid credentials.
}

// ─── Macro ───

export async function setupMacroMocks(page: Page): Promise<void> {
  await page.route('**/api/macro', async (route) => {
    if (route.request().url().includes('history')) return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(marketData.macro_data),
    });
  });

  await page.route('**/api/macro/history*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(marketData.macro_history),
    });
  });
}

// ─── Master Filter ───

export async function setupMasterFilterMock(page: Page): Promise<void> {
  await page.route('**/api/master-filter*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(marketData.master_filter),
    });
  });
}

// ─── Trades ───

export async function setupTradesMock(page: Page): Promise<void> {
  await page.route('**/api/trades', async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: seedTrades.trades,
          meta: { source: 'e2e-mock', timestamp: new Date().toISOString() },
        }),
      });
    } else if (method === 'POST') {
      const body = route.request().postDataJSON();
      const newTrade = {
        id: `trade-new-${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'PLANNED',
        ...body,
      };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: newTrade }),
      });
    } else {
      await route.fallback();
    }
  });

  // Trade executions
  await page.route('**/api/trade-executions*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: seedTrades.executions }),
    });
  });
}

// ─── Portfolio ───

export async function setupPortfolioMock(page: Page): Promise<void> {
  await page.route('**/api/portfolio/risk*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: seedTrades.portfolio_risk,
        meta: { source: 'e2e-mock', timestamp: new Date().toISOString() },
      }),
    });
  });
}

// ─── Scanner ───

export async function setupScannerMock(page: Page): Promise<void> {
  await page.route('**/api/scanner*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: scannerResults,
        meta: {
          source: 'e2e-mock',
          universe: 'SP500',
          scannedAt: new Date().toISOString(),
          total: scannerResults.length,
        },
      }),
    });
  });
}

// ─── Contest ───

export async function setupContestMock(page: Page): Promise<void> {
  await page.route('**/api/contest*', async (route) => {
    const method = route.request().method();
    if (method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            session: {
              id: contestResponse.session_id,
              status: 'COMPLETED',
              market: 'US',
              universe: 'growth',
              llm_provider: 'gemini',
            },
            rankings: contestResponse.rankings,
          },
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { sessions: [] } }),
      });
    }
  });
}

// ─── Watchlist ───

export async function setupWatchlistMock(page: Page): Promise<void> {
  await page.route('**/api/watchlist*', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: seedTrades.watchlist }),
      });
    } else if (method === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: { id: `wl-new-${Date.now()}`, ...route.request().postDataJSON() } }),
      });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
  });
}

// ─── Market Data (price-history, security-lookup) ───

export async function setupMarketDataMock(page: Page): Promise<void> {
  await page.route('**/api/market-data*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          ticker: 'NVDA',
          exchange: 'NAS',
          sepaEvidence: scannerResults[0].sepaEvidence,
          vcpAnalysis: {
            grade: 'A',
            score: 88,
            baseType: 'VCP',
            pivotPrice: 121,
            recommendedEntry: 122,
            invalidationPrice: 111,
            breakoutVolumeStatus: 'confirmed',
            contractions: [{}, {}, {}],
            volumeDryUpScore: 74,
            pocketPivotScore: 66,
          },
          riskPlan: {
            totalEquity: 50000,
            riskPercent: 0.01,
            maxRisk: 500,
            atr: 4.2,
            entryPrice: 122,
            stopLossPrice: 111,
            totalShares: 45,
            entryTargets: {
              e1: { label: 'E1', price: 122, shares: 25 },
              e2: { label: 'E2', price: 125, shares: 15 },
              e3: { label: 'E3', price: 128, shares: 5 },
            },
            trailingStops: {
              initial: 111,
              afterEntry2: 116,
              afterEntry3: 120,
            },
          },
        },
      }),
    });
  });

  await page.route('**/api/price-history*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { candles: [], ticker: 'NVDA' } }),
    });
  });

  await page.route('**/api/security-lookup*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { ticker: 'NVDA', exchange: 'NAS', name: 'NVIDIA Corp', sector: 'Semiconductors', industry: 'AI Chips', market: 'US' },
        ],
      }),
    });
  });
}

// ─── Error Scenario Mocks ───

/**
 * Override specific API routes to return errors for negative testing.
 */
export async function setupErrorMocks(page: Page): Promise<void> {
  await page.route('**/api/macro', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Internal server error: macro data unavailable' }),
    });
  });
}

/**
 * Setup HALT scenario (RED market, RISK_OFF).
 */
export async function setupHaltMocks(page: Page): Promise<void> {
  await setupAllMocks(page);

  // Override master filter to RED
  await page.route('**/api/master-filter*', async (route) => {
    const redMasterFilter = {
      ...marketData.master_filter,
      state: 'RED',
      insightLog: '진입 가능 신호가 위험 구간입니다. 새 매수보다 현금 확보와 보유 종목 방어가 먼저입니다.',
      metrics: {
        ...marketData.master_filter.metrics,
        score: 28,
        p3Score: 28,
        trend: {
          ...marketData.master_filter.metrics.trend,
          status: 'FAIL',
          value: '498 / 525',
          score: 4,
          description: 'SPY가 주요 이동평균선 아래에 있습니다.',
        },
        breadth: {
          ...marketData.master_filter.metrics.breadth,
          status: 'FAIL',
          value: 28,
          score: 5,
          description: '함께 오르는 종목 비율이 낮습니다.',
        },
        distribution: {
          ...marketData.master_filter.metrics.distribution,
          status: 'FAIL',
          value: 7,
          score: 4,
          description: '큰손 매도 흔적이 많이 쌓였습니다.',
        },
      },
    };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(redMasterFilter),
    });
  });

  // Override macro to RISK_OFF
  await page.route('**/api/macro', async (route) => {
    if (route.request().url().includes('history')) return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        score: 32,
        regime: 'RISK_OFF',
        spyAbove50ma: false,
        hygIefDiff: -0.65,
        vixLevel: 28.5,
        asOf: new Date().toISOString(),
        breakdown: [],
        data: marketData.macro_data.data,
      }),
    });
  });
}
