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
  await setupRecommendationsMock(page);
}

export async function setupRecommendationsMock(page: Page): Promise<void> {
  await page.route(/\/api\/recommendations(?:\/|\?|$)/, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    let data: Record<string, unknown>;
    if (pathname.endsWith('/metrics')) {
      data = {
        horizons: [
          { horizon: 'D5', sampleSize: 40, positiveHitRate: 62.5, benchmarkWinRate: 57.5, averageReturnPct: 2.4, medianReturnPct: 1.8, averageExcessReturnPct: 0.9, averageMfePct: 5.2, averageMaePct: -2.1 },
          { horizon: 'D20', sampleSize: 32, positiveHitRate: 56.25, benchmarkWinRate: 53.13, averageReturnPct: 4.1, medianReturnPct: 2.7, averageExcessReturnPct: 1.2, averageMfePct: 9.4, averageMaePct: -4.3 },
          { horizon: 'D60', sampleSize: 8, positiveHitRate: 50, benchmarkWinRate: 37.5, averageReturnPct: 3.2, medianReturnPct: 1.1, averageExcessReturnPct: -0.8, averageMfePct: 14.2, averageMaePct: -7.8 },
        ],
        segments: [{ horizon: 'D20', source: '통합', sampleSize: 32, positiveHitRate: 56.25, benchmarkWinRate: 53.13, averageExcessReturnPct: 1.2 }],
        cohorts: [],
        dataAsOf: '2026-06-19',
      };
    } else if (pathname.endsWith('/diagnostics')) {
      data = {
        causeSummary: [{ causeCode: 'ENTRY_TIMING', count: 1, critical: 0, confirmed: 0 }],
        findings: [{
          id: 'finding-1', cause_code: 'ENTRY_TIMING', finding_status: 'HYPOTHESIS', severity: 'WARNING', horizon: 'D20',
          summary_ko: '추천 직후 갭 상승 구간에서 평균 MAE가 확대되어 진입 시점 가설을 점검해야 합니다.',
          sample_size: 18, confidence: 0.64, evidence: { averageGapPct: 3.8, averageMaePct: -5.1 }, analyzed_at: '2026-06-20T00:00:00Z',
        }],
      };
    } else {
      const performance = (horizon: string, returnPct: number) => ({
        horizon, status: 'MATURED', session_count: Number(horizon.slice(1)), entry_date: '2026-05-20', entry_price: 120,
        evaluation_date: '2026-06-19', return_pct: returnPct, benchmark_return_pct: 2, excess_return_pct: returnPct - 2,
        mfe_pct: 8.4, mae_pct: -3.1, quality_status: 'FULL',
      });
      const pendingPerformance = (horizon: string) => ({
        horizon, status: 'PENDING', session_count: 4, entry_date: '2026-05-20', entry_price: 120,
        evaluation_date: null, return_pct: null, benchmark_return_pct: null, excess_return_pct: null,
        mfe_pct: null, mae_pct: null, quality_status: 'FULL',
      });
      data = { publications: [{
        id: 'pub-1', run_date: '2026-05-19', generated_at: '2026-05-19T22:00:00Z', first_tradable_date: '2026-05-20',
        engine_version: 'e2e-v1', llm_provider: 'codex-cli', llm_model: 'codex', telegram_status: 'SENT',
        recommendation_picks: [
          { id: 'pick-1', rank: 1, ticker: 'NVDA', name: 'NVIDIA', universe: 'NASDAQ100', source: '통합', score: 92, confidence: 86, reason: 'AI 인프라 주도력', risk: '단기 과열', sector: 'Technology', recommendation_performance: [performance('LIVE', 4.2), performance('D5', 3.5), performance('D20', 6.2)] },
          { id: 'pick-2', rank: 2, ticker: 'AMAT', name: 'Applied Materials', universe: 'NASDAQ100', source: '통합', score: 90, confidence: 84, reason: '장비 투자 모멘텀', risk: '수출 규제', sector: 'Technology', recommendation_performance: [performance('LIVE', 4.8), pendingPerformance('D5'), pendingPerformance('D20'), pendingPerformance('D60')] },
        ],
      }], nextCursor: null };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  });
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
  await page.route('**/api/macro*', async (route) => {
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
  await page.route('**/api/trades*', async (route) => {
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
  await page.route(/\/api\/scanner(?:\/|\?|$)/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (pathname === '/api/scanner/universe') {
      const universe = url.searchParams.get('universe') || 'NASDAQ100';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          universe,
          label: 'NASDAQ 100',
          asOf: '2026-06-20T00:00:00.000Z',
          source: 'e2e-fixture',
          delayNote: null,
          warnings: [],
          items: scannerResults.map((row, index) => ({
            rank: index + 1,
            ticker: row.ticker,
            exchange: row.exchange,
            name: row.name,
            marketCap: 3_000_000_000_000 - index * 100_000_000_000,
            currency: 'USD',
            currentPrice: 120 - index * 5,
            priceAsOf: '2026-06-19',
            priceSource: 'e2e-fixture',
          })),
        }),
      });
      return;
    }

    if (pathname === '/api/scanner/batch' && request.method() === 'POST') {
      const body = request.postDataJSON() as { items?: { ticker: string }[] };
      const requested = new Set((body.items || []).map((item) => item.ticker));
      const results = scannerResults
        .filter((row) => requested.has(row.ticker))
        .map((row, index) => {
          if (row.status === 'error') {
            return { ticker: row.ticker, success: false, error: 'e2e fixture data unavailable', providerAttempts: [] };
          }

          const isStrong = row.ticker === 'NVDA';
          const isForming = row.ticker === 'META';
          const grade = isStrong ? 'strong' : isForming ? 'forming' : 'weak';
          const score = isStrong ? 88 : isForming ? 62 : 35;
          const entryPrice = 121 - index * 5;
          return {
            ticker: row.ticker,
            success: true,
            data: {
              ticker: row.ticker,
              exchange: row.exchange,
              providerUsed: 'e2e-fixture',
              priceData: [
                { date: '2026-06-18', open: entryPrice - 2, high: entryPrice, low: entryPrice - 3, close: entryPrice - 1, volume: 900_000 },
                { date: '2026-06-19', open: entryPrice - 1, high: entryPrice + 2, low: entryPrice - 2, close: entryPrice, volume: 1_400_000 },
              ],
              sepaEvidence: row.sepaEvidence,
              vcpAnalysis: {
                grade,
                score,
                contractions: isStrong ? [
                  { peakDate: '2026-05-01', troughDate: '2026-05-08', peakPrice: 125, troughPrice: 112.5, depthPct: 10, avgVolume: 1_200_000 },
                  { peakDate: '2026-05-12', troughDate: '2026-05-18', peakPrice: 123, troughPrice: 114.39, depthPct: 7, avgVolume: 800_000 },
                ] : [],
                contractionScore: isStrong ? 85 : isForming ? 55 : 20,
                volumeDryUpScore: row.volumeDryUpScore,
                bbSqueezeScore: isStrong ? 80 : isForming ? 55 : 20,
                pocketPivotScore: row.pocketPivotScore,
                pivotPrice: row.ticker === 'SNOW' ? null : entryPrice - 1,
                pivotDate: row.ticker === 'SNOW' ? null : '2026-06-17',
                pivotAgeDays: row.ticker === 'SNOW' ? null : 2,
                pivotKind: row.ticker === 'SNOW' ? null : 'VCP_PIVOT',
                referenceHighPrice: entryPrice - 1,
                referenceHighDate: '2026-06-17',
                invalidationPrice: entryPrice - 10,
                breakoutPrice: entryPrice - 1,
                recommendedEntry: entryPrice,
                entrySource: row.ticker === 'SNOW' ? 'RECENT_HIGH_FALLBACK' : 'VCP_PIVOT',
                breakoutVolumeRatio: isStrong ? 1.8 : null,
                breakoutVolumeStatus: isStrong ? 'confirmed' : isForming ? 'pending' : 'weak',
                pocketPivots: [],
                bbWidth: 4.2,
                bbWidthPercentile: 20,
                baseLength: 42,
                baseType: 'Standard_VCP',
                momentumBranch: 'STANDARD',
                eightWeekReturnPct: isStrong ? 24 : 12,
                distanceFromMa50Pct: isStrong ? 8 : 10,
                low52WeekAdvancePct: 50,
                highTightFlag: null,
                details: ['E2E deterministic scanner fixture'],
              },
              riskPlan: {
                totalEquity: 50_000,
                maxRisk: 500,
                riskPercent: 0.01,
                atr: 4.2,
                entryPrice,
                stopLossPrice: entryPrice - 10,
                riskPerShare: 10,
                totalShares: 50,
                entryTargets: {
                  e1: { label: 'E1', price: entryPrice, shares: 25 },
                  e2: { label: 'E2', price: entryPrice + 3, shares: 15 },
                  e3: { label: 'E3', price: entryPrice + 6, shares: 10 },
                },
                trailingStops: { initial: entryPrice - 10, afterEntry2: entryPrice - 5, afterEntry3: entryPrice - 1 },
                stopQuality: 'VALID',
                riskGate: { status: 'PASS', effectiveRiskPct: 0.01, allowedRiskAmount: 500, riskBudgetRemaining: 1_500, reasons: [] },
              },
              fundamentals: null,
              changePercent: 2,
              adrPct: 3,
              dataQuality: { bars: 260, hasEnoughForAtr: true, hasEnoughForLongMa: true, missingFundamentals: [] },
              warnings: [],
            },
          };
        });

      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results }) });
      return;
    }

    if (pathname === '/api/scanner/metrics') {
      const tickers = (url.searchParams.get('tickers') || '').split(',').filter(Boolean);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          market: 'US',
          macroTrend: {
            index_code: 'SPY', market: 'US', calc_date: '2026-06-19', index_price: 600,
            ma_50: 580, ma_200: 540, is_uptrend_50: true, is_uptrend_200: true, action_level: 'FULL',
          },
          metrics: tickers.map((ticker) => ({ ticker, metric: null, sector: 'Technology' })),
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ message: `Unhandled E2E scanner route: ${pathname}` }),
    });
  });
}

// ─── Contest ───

export async function setupContestMock(page: Page): Promise<void> {
  type MockSession = Record<string, unknown> & { candidates: Record<string, unknown>[] };
  let currentSession: MockSession | null = null;
  const meta = {
    source: 'e2e-mock',
    provider: 'Playwright',
    delay: 'REALTIME',
    asOf: new Date().toISOString(),
    fallbackUsed: false,
    warnings: [],
  };

  await page.route(/\/api\/contest(?:\/|\?|$)/, async (route) => {
    const method = route.request().method();
    const pathname = new URL(route.request().url()).pathname;

    if (method === 'POST' && pathname === '/api/contest/sessions') {
      const body = route.request().postDataJSON() as { market?: string; universe?: string; candidates?: Record<string, unknown>[] };
      const now = new Date().toISOString();
      const candidates = (body.candidates || []).map((candidate, index) => ({
        id: `cand-${String(candidate.ticker || index).toLowerCase()}`,
        session_id: contestResponse.session_id,
        ticker: candidate.ticker,
        exchange: candidate.exchange || 'NAS',
        name: candidate.name || candidate.ticker,
        user_rank: index + 1,
        llm_rank: null,
        llm_comment: null,
        llm_scores: null,
        llm_analysis: null,
        actual_invested: false,
        linked_trade_id: null,
        entry_reference_price: candidate.price || null,
        snapshot: candidate,
        created_at: now,
        updated_at: now,
        reviews: [],
      }));
      currentSession = {
        id: contestResponse.session_id,
        created_at: now,
        updated_at: now,
        market: body.market || 'US',
        universe: body.universe || 'NASDAQ100',
        selected_at: now,
        prompt_payload: body.candidates || [],
        llm_prompt: 'e2e contest prompt',
        llm_raw_response: null,
        llm_provider: null,
        status: 'OPEN',
        candidates,
      };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: currentSession, meta }),
      });
      return;
    }

    if (method === 'POST' && pathname.endsWith('/analyze') && currentSession) {
      const rankingsByTicker = new Map(contestResponse.rankings.map((ranking) => [ranking.ticker, ranking]));
      currentSession = {
        ...currentSession,
        status: 'REVIEW_READY',
        llm_provider: 'mtn-rule-engine (e2e)',
        llm_raw_response: JSON.stringify(contestResponse),
        candidates: currentSession.candidates.map((candidate) => {
          const ranking = rankingsByTicker.get(String(candidate.ticker));
          if (!ranking) return candidate;
          return {
            ...candidate,
            llm_rank: ranking.rank,
            llm_comment: ranking.comment,
            llm_scores: ranking.analysis,
            llm_analysis: {
              ...ranking.analysis,
              overall: ranking.overall,
              key_strength: ranking.key_strength,
              key_risk: ranking.key_risk,
              recommendation: ranking.recommendation,
              confidence: ranking.confidence,
              raw: ranking,
            },
          };
        }),
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { candidates_updated: currentSession.candidates.length } }),
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/contest/sessions') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: currentSession ? [currentSession] : [], meta }),
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: currentSession, meta }) });
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
    const ticker = new URL(route.request().url()).searchParams.get('ticker') || 'NVDA';
    const isSepaFail = ticker === 'FAIL';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          ticker,
          exchange: 'NAS',
          providerUsed: 'e2e-fixture',
          priceData: [],
          sepaEvidence: isSepaFail ? {
            ...scannerResults[0].sepaEvidence,
            status: 'fail',
            summary: { passed: 4, failed: 5, info: 0, total: 9, corePassed: 3, coreFailed: 4, coreTotal: 7 },
          } : scannerResults[0].sepaEvidence,
          vcpAnalysis: {
            grade: 'strong',
            score: 88,
            contractions: [
              {
                peakDate: '2026-04-01',
                troughDate: '2026-04-10',
                peakPrice: 125,
                troughPrice: 112.5,
                depthPct: 10,
                avgVolume: 1_200_000,
              },
              {
                peakDate: '2026-04-18',
                troughDate: '2026-04-25',
                peakPrice: 123,
                troughPrice: 114.39,
                depthPct: 7,
                avgVolume: 850_000,
              },
              {
                peakDate: '2026-05-05',
                troughDate: '2026-05-12',
                peakPrice: 121,
                troughPrice: 114.95,
                depthPct: 5,
                avgVolume: 620_000,
              },
            ],
            contractionScore: 85,
            volumeDryUpScore: 74,
            bbSqueezeScore: 80,
            pocketPivotScore: 66,
            pivotPrice: 121,
            pivotDate: '2026-05-20',
            pivotAgeDays: 5,
            pivotKind: 'VCP_PIVOT',
            referenceHighPrice: 120,
            referenceHighDate: '2026-05-19',
            breakoutPrice: 121,
            recommendedEntry: 122,
            entrySource: 'VCP_PIVOT',
            invalidationPrice: 111,
            breakoutVolumeRatio: 1.8,
            breakoutVolumeStatus: 'confirmed',
            pocketPivots: [
              { date: '2026-05-14', close: 119.5, volume: 1_450_000 },
            ],
            bbWidth: 4.2,
            bbWidthPercentile: 15,
            baseLength: 42,
            baseType: 'Standard_VCP',
            momentumBranch: 'STANDARD',
            eightWeekReturnPct: 24,
            distanceFromMa50Pct: 8,
            low52WeekAdvancePct: 55,
            highTightFlag: null,
            details: [
              '수축 깊이가 10% → 7% → 5%로 감소했습니다.',
              '거래량 감소와 피벗 돌파 거래량이 확인되었습니다.',
            ],
          },
          riskPlan: {
            totalEquity: 50000,
            riskPercent: 0.01,
            maxRisk: 500,
            atr: 4.2,
            entryPrice: 122,
            stopLossPrice: 111,
            riskPerShare: 11,
            totalShares: 45,
            requestedStrategy: 'AUTO',
            strategy: 'MINERVINI_VCP',
            riskModel: 'PATTERN_INVALIDATION',
            stopSource: 'VCP_INVALIDATION',
            stopQuality: 'VALID',
            targetPrice: 144,
            rewardRiskRatio: 2,
            invalidationPrice: 111,
            riskGate: {
              status: 'PASS',
              effectiveRiskPct: 0.01,
              allowedRiskAmount: 500,
              riskBudgetRemaining: 1500,
              reasons: [],
            },
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
          fundamentals: null,
          changePercent: 2.1,
          adrPct: 3.2,
          dataQuality: {
            bars: 260,
            hasEnoughForAtr: true,
            hasEnoughForLongMa: true,
            missingFundamentals: [],
          },
          warnings: [],
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

  await page.route(/\/api\/security-lookup(?:\/|\?|$)/, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/security-lookup/batch') {
      const body = route.request().postDataJSON() as { items?: { ticker: string }[] };
      const nameMap = Object.fromEntries((body.items || []).map(({ ticker }) => [ticker, `${ticker} E2E Corp`]));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ nameMap }),
      });
      return;
    }
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

  await page.route('**/api/scanner/metrics*', async (route) => {
    const url = new URL(route.request().url());
    const tickers = (url.searchParams.get('tickers') || '').split(',').filter(Boolean);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        market: 'US',
        macroTrend: {
          index_code: 'SPY', market: 'US', calc_date: '2026-06-19', index_price: 498,
          ma_50: 525, ma_200: 510, is_uptrend_50: false, is_uptrend_200: false, action_level: 'HALT',
        },
        metrics: tickers.map((ticker) => ({ ticker, metric: null, sector: 'Technology' })),
      }),
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
