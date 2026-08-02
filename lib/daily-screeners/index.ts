import type {
  CanslimScannerResult,
  MarketAnalysisResponse,
  ScannerConstituent,
  ScannerUniverse,
  StockMetric,
} from '@/types';
import { createInternalRequest } from '@/lib/auth/session';

export type DailyScreenerSource = 'minervini' | 'canslim' | 'leader' | 'momentum' | 'qullamaggie' | 'reversal';
export type DailyScreenerMarket = 'US' | 'KR';
export type DailyScreenerCategory = ScannerUniverse;

export const DAILY_SCREENER_SOURCES: DailyScreenerSource[] = [
  'minervini',
  'canslim',
  'leader',
  'momentum',
  'qullamaggie',
  'reversal',
];

export const DAILY_SCREENER_UNIVERSES: ScannerUniverse[] = [
  'NASDAQ100',
  'SP500',
  'KOSPI200',
  'KOSDAQ150',
];

export const DAILY_SCREENER_CATEGORIES: DailyScreenerCategory[] = DAILY_SCREENER_UNIVERSES;

export const DAILY_SCREENER_CATEGORY_MARKET = {
  NASDAQ100: 'US',
  SP500: 'US',
  KOSPI200: 'KR',
  KOSDAQ150: 'KR',
} satisfies Record<DailyScreenerCategory, DailyScreenerMarket>;

export interface DailyScreenerCandidate {
  source: DailyScreenerSource;
  universe: ScannerUniverse;
  ticker: string;
  exchange: string;
  name: string | null;
  score: number;
  grade: string;
  rank?: number;
  price: number | null;
  priceAsOf: string | null;
  reason: string;
  metrics: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface DailyTop5Pick {
  rank: number;
  ticker: string;
  source: DailyScreenerSource | 'mixed';
  reason: string;
  confidence: number;
  risk?: string | null;
  actionState?: 'ACTIVE' | 'WATCHLIST';
  actionReason?: string | null;
  targetWeight?: number;
  cashWeight?: number;
  chartGate?: {
    disposition: 'ACTIONABLE' | 'WATCHLIST' | 'EXCLUDED' | 'UNVERIFIED';
    verdict: 'BUY' | 'WATCH' | 'AVOID' | 'UNVERIFIED';
    setupGrade: 'A' | 'B' | 'C' | 'D' | null;
    readiness: string | null;
    eligible: boolean;
    fundamentalVerification: 'VERIFIED' | 'PARTIAL' | 'MISSING' | 'UNVERIFIED';
    score: number;
    summary: string;
  };
}

export interface DailyTop5Result {
  top5: DailyTop5Pick[];
  reportMarkdown: string;
  rawResponse: string;
}

export interface DailyMarketTop10Pick extends DailyTop5Pick {
  market: DailyScreenerMarket;
  name: string | null;
  universe: ScannerUniverse;
  score: number;
  grade: string;
}

export interface DailyMarketTop10Result {
  markets: Record<DailyScreenerMarket, DailyMarketTop10Pick[]>;
  reportMarkdown: string;
  rawResponse: string;
}

export interface DailyCategoryTop10Pick extends DailyMarketTop10Pick {
  category: DailyScreenerCategory;
}

export interface DailyCategoryTop10Result {
  categories: Record<DailyScreenerCategory, DailyCategoryTop10Pick[]>;
  reportMarkdown: string;
  rawResponse: string;
}

export interface DailyScanResult {
  runDate: string;
  candidates: DailyScreenerCandidate[];
  topBySource: Record<DailyScreenerSource, DailyScreenerCandidate[]>;
  topBySourceMarket: Record<DailyScreenerSource, Record<DailyScreenerMarket, DailyScreenerCandidate[]>>;
  topBySourceCategory: Record<DailyScreenerSource, Record<DailyScreenerCategory, DailyScreenerCandidate[]>>;
  errors: { source: DailyScreenerSource; universe: ScannerUniverse; message: string }[];
  maxPerUniverse: number | null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function sourceLabel(source: DailyScreenerSource | 'mixed') {
  if (source === 'canslim') return "O'Neil CANSLIM";
  if (source === 'leader') return '주도주 Leader';
  if (source === 'momentum') return '모멘텀';
  if (source === 'qullamaggie') return '쿨라매기';
  if (source === 'reversal') return '전환 초입';
  if (source === 'mixed') return '통합';
  return 'Minervini SEPA/VCP';
}

function marketLabel(market: DailyScreenerMarket) {
  return market === 'KR' ? '한국' : '미국';
}

export function categoryLabel(category: DailyScreenerCategory) {
  if (category === 'NASDAQ100') return '나스닥';
  if (category === 'SP500') return 'S&P500';
  if (category === 'KOSPI200') return '코스피';
  return '코스닥';
}

export function marketForDailyCategory(category: DailyScreenerCategory): DailyScreenerMarket {
  return DAILY_SCREENER_CATEGORY_MARKET[category];
}

export function categoryForDailyCandidate(candidate: Pick<DailyScreenerCandidate, 'universe'>): DailyScreenerCategory {
  return candidate.universe;
}

export function marketForDailyCandidate(candidate: Pick<DailyScreenerCandidate, 'universe' | 'exchange'>): DailyScreenerMarket {
  if (candidate.universe === 'KOSPI200' || candidate.universe === 'KOSDAQ150') return 'KR';
  if (candidate.exchange === 'KOSPI' || candidate.exchange === 'KOSDAQ') return 'KR';
  return 'US';
}

function md(value: unknown) {
  return String(value ?? '-').replace(/([_*`[\]])/g, '\\$1');
}

function formatNumber(value: unknown, digits = 1) {
  const n = numberOrNull(value);
  if (n === null) return '-';
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}

function formatPercent(value: unknown) {
  const n = numberOrNull(value);
  if (n === null) return '-';
  return `${Math.round(n * 100)}%`;
}

function compactSentence(value: string, maxLength: number) {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function cleanSecurityName(name: string | null | undefined, ticker: string) {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase() === ticker.trim().toUpperCase() ? null : trimmed;
}

function displaySecurityName(name: string | null | undefined, ticker: string) {
  return cleanSecurityName(name, ticker) ?? ticker;
}

function bestSecurityName(candidates: DailyScreenerCandidate[], ticker: string) {
  return candidates
    .map((candidate) => cleanSecurityName(candidate.name, ticker))
    .find((name): name is string => Boolean(name))
    ?? ticker;
}

function exchangeFor(item: ScannerConstituent, universe: ScannerUniverse) {
  if (item.exchange) return item.exchange;
  if (universe === 'KOSPI200') return 'KOSPI';
  if (universe === 'KOSDAQ150') return 'KOSDAQ';
  return 'US';
}

function chunks<T>(items: T[], size: number) {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) rows.push(items.slice(index, index + size));
  return rows;
}

async function runWithLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `route returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function scoreFromMinervini(data: MarketAnalysisResponse, metric: StockMetric | null) {
  const rs = metric?.rs_rating ?? data.sepaEvidence.metrics.rsRating ?? 50;
  const vcp = data.vcpAnalysis.score ?? 0;
  const sepaPassed = data.sepaEvidence.summary.passed ?? 0;
  const sepaFailed = data.sepaEvidence.summary.failed ?? 0;
  const sepaTotal = Math.max(1, sepaPassed + sepaFailed);
  const sepaScore = (sepaPassed / sepaTotal) * 100;
  const latestClose = data.priceData.at(-1)?.close ?? null;
  const entry = data.vcpAnalysis.entrySource === 'RECENT_HIGH_FALLBACK' ? null : data.vcpAnalysis.recommendedEntry;
  const pivotDistance = latestClose && entry ? Math.abs(((latestClose - entry) / entry) * 100) : 99;
  const pivotScore = pivotDistance <= 3 ? 100 : pivotDistance <= 8 ? 75 : pivotDistance <= 15 ? 45 : 10;
  const volumeScore = Math.max(
    numberOrNull(data.vcpAnalysis.volumeDryUpScore) ?? 0,
    numberOrNull(data.vcpAnalysis.pocketPivotScore) ?? 0,
    data.vcpAnalysis.breakoutVolumeStatus === 'confirmed' ? 90 : 0,
  );
  return round(clamp(vcp * 0.32 + rs * 0.28 + sepaScore * 0.22 + pivotScore * 0.1 + volumeScore * 0.08));
}

function minerviniGrade(score: number, data: MarketAnalysisResponse) {
  if (score >= 82 && data.sepaEvidence.status === 'pass') return 'Recommended';
  if (score >= 68) return 'Action';
  if (score >= 52) return 'IB Review';
  return 'Review';
}

function normalizeMinerviniCandidate(
  universe: ScannerUniverse,
  item: ScannerConstituent,
  data: MarketAnalysisResponse,
  metric: StockMetric | null,
): DailyScreenerCandidate {
  const latestBar = data.priceData.at(-1);
  const price = item.currentPrice ?? latestBar?.close ?? null;
  const entry = data.vcpAnalysis.entrySource === 'RECENT_HIGH_FALLBACK' ? null : data.vcpAnalysis.recommendedEntry;
  const distanceToPivotPct = price && entry ? round(((price - entry) / entry) * 100) : null;
  const score = scoreFromMinervini(data, metric);
  const rs = metric?.rs_rating ?? data.sepaEvidence.metrics.rsRating ?? null;
  const metrics = {
    rs_rating: rs,
    vcp_score: data.vcpAnalysis.score ?? null,
    vcp_grade: data.vcpAnalysis.grade ?? null,
    sepa_status: data.sepaEvidence.status,
    sepa_passed: data.sepaEvidence.summary.passed,
    sepa_failed: data.sepaEvidence.summary.failed,
    pivot_price: data.vcpAnalysis.pivotPrice ?? null,
    distance_to_pivot_pct: distanceToPivotPct,
    breakout_volume_status: data.vcpAnalysis.breakoutVolumeStatus ?? null,
  };

  return {
    source: 'minervini',
    universe,
    ticker: item.ticker.toUpperCase(),
    exchange: exchangeFor(item, universe),
    name: displaySecurityName(item.name, item.ticker),
    score,
    grade: minerviniGrade(score, data),
    price,
    priceAsOf: latestBar?.date ?? item.priceAsOf ?? null,
    reason: `SEPA ${data.sepaEvidence.status}, VCP ${formatNumber(data.vcpAnalysis.score, 0)}, RS ${formatNumber(rs, 0)}`,
    metrics,
    raw: { metrics, providerUsed: data.providerUsed, warnings: data.warnings ?? [] },
  };
}

function confidenceScore(value: CanslimScannerResult['canslimResult']['confidence']) {
  if (value === 'HIGH') return 14;
  if (value === 'MEDIUM') return 8;
  return 2;
}

function normalizeCanslimCandidate(universe: ScannerUniverse, result: CanslimScannerResult): DailyScreenerCandidate {
  const tierScore = result.dualTier === 'TIER_1' ? 45 : result.dualTier === 'WATCHLIST' ? 32 : result.dualTier === 'SHORT_TERM' ? 28 : 8;
  const rsScore = ((result.rsRating ?? 50) / 100) * 22;
  const vcpScore = ((result.vcpScore ?? 0) / 100) * 16;
  const passScore = result.canslimResult.pass ? 12 : 0;
  const score = round(clamp(tierScore + rsScore + vcpScore + passScore + confidenceScore(result.canslimResult.confidence)));
  const passed = result.canslimResult.pillarDetails.filter((item) => item.status === 'PASS').length;
  const metrics = {
    dual_tier: result.dualTier,
    confidence: result.canslimResult.confidence,
    pass: result.canslimResult.pass,
    pillar_passed: passed,
    rs_rating: result.rsRating,
    vcp_score: result.vcpScore,
    pivot_price: result.basePattern?.pivotPoint ?? null,
  };

  return {
    source: 'canslim',
    universe,
    ticker: result.ticker.toUpperCase(),
    exchange: result.exchange,
    name: displaySecurityName(result.name, result.ticker),
    score,
    grade: result.dualTier,
    price: result.currentPrice,
    priceAsOf: result.analyzedAt,
    reason: `CANSLIM ${result.dualTier}, ${passed}/7 PASS, confidence ${result.canslimResult.confidence}`,
    metrics,
    raw: { metrics, warnings: result.dataWarnings ?? [], canslim: result.canslimResult },
  };
}

function normalizeLeaderCandidate(universe: ScannerUniverse, item: ScannerConstituent, data: Record<string, unknown>): DailyScreenerCandidate {
  let score = round(clamp(numberOrNull(data.leaderScore) ?? 0));
  const grade = String(data.leaderGrade ?? 'LAGGARD');
  // 추세 반전 감지: 최근 5일 수익률이 -5% 미만이면 점수 50% 감산
  // 한국 시장에서 과거 모멘텀 잔상으로 하락 종목이 반복 추천되는 문제 방지
  const recentReturn = numberOrNull(data.return5dPct);
  if (recentReturn !== null && recentReturn < -5) {
    score = round(score * 0.5);
  }
  const metrics = {
    leader_score: score,
    leader_grade: grade,
    rs_rating: numberOrNull(data.rsRating),
    regression_r2: numberOrNull(data.regressionR2),
    dollar_volume_20d: numberOrNull(data.dollarVolume20d),
    return_5d_pct: recentReturn,
    trend_intensity_index: numberOrNull(data.trendIntensityIndex),
    benchmark_relative_score: numberOrNull(data.benchmarkRelativeScore),
  };

  return {
    source: 'leader',
    universe,
    ticker: item.ticker.toUpperCase(),
    exchange: exchangeFor(item, universe),
    name: displaySecurityName(item.name, item.ticker),
    score,
    grade,
    price: numberOrNull(data.currentPrice) ?? item.currentPrice ?? null,
    priceAsOf: new Date().toISOString(),
    reason: `${grade} leader, score ${formatNumber(score, 0)}, RS ${formatNumber(metrics.rs_rating, 0)}`,
    metrics,
    raw: { ...data },
  };
}

function normalizeMomentumCandidate(universe: ScannerUniverse, item: ScannerConstituent, data: Record<string, unknown>): DailyScreenerCandidate {
  const grade = String(data.grade ?? 'NONE');
  const gradeBase = grade === 'EXPLOSIVE' ? 70 : grade === 'BREAKOUT' ? 55 : grade === 'WARM' ? 35 : 0;
  const rvol = numberOrNull(data.rvol) ?? 0;
  const roc = numberOrNull(data.roc) ?? 0;
  const isKr = universe === 'KOSPI200' || universe === 'KOSDAQ150';
  // KR momentum: 당일 ROC가 높을수록 고점 추격 리스크 증가 → 페널티 적용
  const krOverheatPenalty = isKr && roc > 5 ? Math.min(25, (roc - 5) * 3) : 0;
  const baseScore = gradeBase + Math.min(18, rvol * 4) + Math.min(12, Math.max(0, roc) * 1.2);
  const score = round(clamp(baseScore - krOverheatPenalty));
  const metrics = {
    grade,
    rvol,
    roc,
    raw_rvol: numberOrNull(data.rawRvol),
    estimated_volume: numberOrNull(data.estimatedVolume),
    is_intraday: Boolean(data.isIntraday),
  };

  return {
    source: 'momentum',
    universe,
    ticker: item.ticker.toUpperCase(),
    exchange: exchangeFor(item, universe),
    name: displaySecurityName(item.name, item.ticker),
    score,
    grade,
    price: numberOrNull(data.currentPrice) ?? item.currentPrice ?? null,
    priceAsOf: new Date().toISOString(),
    reason: `${grade}, RVOL ${formatNumber(rvol)}x, ROC ${formatNumber(roc)}%`,
    metrics,
    raw: { ...data },
  };
}

function normalizeQullamaggieCandidate(universe: ScannerUniverse, item: ScannerConstituent, data: Record<string, unknown>): DailyScreenerCandidate {
  const score = round(clamp(numberOrNull(data.qScore) ?? 0));
  const grade = String(data.grade ?? 'REJECT');
  const setup = String(data.primarySetup ?? 'NONE');
  const metrics = {
    q_score: score,
    grade,
    setup,
    return_3m_pct: numberOrNull(data.return3mPct),
    distance_to_pivot_pct: numberOrNull(data.distanceToPivotPct),
    rvol20: numberOrNull(data.rvol20),
    dollar_volume_20d: numberOrNull(data.dollarVolume20d),
    stop_pct: numberOrNull(data.stopPct),
    pivot_price: numberOrNull(data.pivotPrice),
  };

  return {
    source: 'qullamaggie',
    universe,
    ticker: item.ticker.toUpperCase(),
    exchange: exchangeFor(item, universe),
    name: displaySecurityName(item.name, item.ticker),
    score,
    grade,
    price: numberOrNull(data.currentPrice) ?? item.currentPrice ?? null,
    priceAsOf: new Date().toISOString(),
    reason: `${setup}, Q ${formatNumber(score, 0)}, pivot ${formatNumber(metrics.distance_to_pivot_pct)}%`,
    metrics,
    raw: { ...data },
  };
}

function normalizeReversalCandidate(universe: ScannerUniverse, item: ScannerConstituent, data: Record<string, unknown>): DailyScreenerCandidate {
  const score = round(clamp(numberOrNull(data.reversalScore) ?? 0));
  const stage = String(data.stage ?? 'REJECT');
  const grade = String(data.grade ?? 'REJECT');
  const metrics = {
    reversal_score: score,
    stage,
    grade,
    base_days: numberOrNull(data.baseDays),
    base_range_pct: numberOrNull(data.baseRangePct),
    drawdown_from_prior_high_pct: numberOrNull(data.drawdownFromPriorHighPct),
    benchmark_relative_20d_pct: numberOrNull(data.benchmarkRelative20dPct),
    benchmark_relative_60d_pct: numberOrNull(data.benchmarkRelative60dPct),
    volume_dry_up_ratio: numberOrNull(data.volumeDryUpRatio),
    up_down_volume_ratio: numberOrNull(data.upDownVolumeRatio),
    distance_to_pivot_pct: numberOrNull(data.distanceToPivotPct),
    rvol20: numberOrNull(data.rvol20),
    stop_pct: numberOrNull(data.stopPct),
    pivot_price: numberOrNull(data.pivotPrice),
  };

  return {
    source: 'reversal',
    universe,
    ticker: item.ticker.toUpperCase(),
    exchange: exchangeFor(item, universe),
    name: displaySecurityName(item.name, item.ticker),
    score,
    grade: stage,
    price: numberOrNull(data.currentPrice) ?? item.currentPrice ?? null,
    priceAsOf: new Date().toISOString(),
    reason: `${stage}, 전환 ${formatNumber(score, 0)}, pivot ${formatNumber(metrics.distance_to_pivot_pct)}%`,
    metrics,
    raw: { ...data },
  };
}

async function scanMinerviniUniverse(universe: ScannerUniverse, items: ScannerConstituent[]) {
  const [{ POST: runMinerviniBatch }, metricsModule] = await Promise.all([
    import('../../app/api/scanner/batch/route'),
    import('../finance/market/stock-metrics'),
  ]);
  const metricMap = await metricsModule
    .fetchLatestStockMetrics(items.map((item) => item.ticker), metricsModule.marketForUniverse(universe))
    .catch(() => new Map<string, StockMetric>());
  const candidates: DailyScreenerCandidate[] = [];

  for (const chunk of chunks(items, 20)) {
    const response = await runMinerviniBatch(await createInternalRequest('http://localhost/api/scanner/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        items: chunk.map((item) => ({
          ticker: item.ticker,
          exchange: exchangeFor(item, universe),
          currentPrice: item.currentPrice,
          priceAsOf: item.priceAsOf,
          priceSource: item.priceSource,
        })),
        totalEquity: 50000,
        riskPercent: 1,
      }),
    }));
    const payload = await responseJson<{ results: { ticker: string; success: boolean; data?: MarketAnalysisResponse }[] }>(response);
    for (const row of payload.results) {
      if (!row.success || !row.data) continue;
      const item = chunk.find((candidate) => candidate.ticker.toUpperCase() === row.ticker.toUpperCase());
      if (!item) continue;
      candidates.push(normalizeMinerviniCandidate(universe, item, row.data, metricMap.get(row.ticker.toUpperCase()) ?? null));
    }
  }
  return candidates;
}

async function scanCanslimUniverse(universe: ScannerUniverse, items: ScannerConstituent[]) {
  const { GET: runCanslimSingle } = await import('../../app/api/scanner/canslim/route');
  return runWithLimit(items, universe.startsWith('KOS') ? 2 : 3, async (item) => {
    const params = new URLSearchParams({ ticker: item.ticker, exchange: exchangeFor(item, universe) });
    const response = await runCanslimSingle(await createInternalRequest(`http://localhost/api/scanner/canslim?${params.toString()}`));
    const payload = await responseJson<{ result: CanslimScannerResult }>(response);
    const name = cleanSecurityName(payload.result.name, item.ticker)
      ?? cleanSecurityName(item.name, item.ticker)
      ?? item.ticker;
    return normalizeCanslimCandidate(universe, { ...payload.result, name });
  });
}

async function scanBatchUniverse(source: Extract<DailyScreenerSource, 'leader' | 'momentum' | 'qullamaggie' | 'reversal'>, universe: ScannerUniverse, items: ScannerConstituent[]) {
  const routeModule = source === 'leader'
    ? await import('../../app/api/scanner/leader/route')
    : source === 'momentum'
      ? await import('../../app/api/scanner/momentum/route')
      : source === 'reversal'
        ? await import('../../app/api/scanner/reversal/route')
        : await import('../../app/api/scanner/qullamaggie/route');
  const route = routeModule.POST as (request: Request) => Promise<Response>;
  const candidates: DailyScreenerCandidate[] = [];

  for (const chunk of chunks(items, 20)) {
    const response = await route(await createInternalRequest(`http://localhost/api/scanner/${source}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        items: chunk.map((item) => ({
          ticker: item.ticker,
          exchange: exchangeFor(item, universe),
          sectorRank: (item as ScannerConstituent & { sectorRank?: number | null }).sectorRank ?? null,
        })),
        benchmarkTicker: universe === 'NASDAQ100' ? 'QQQ' : universe === 'SP500' ? 'SPY' : universe === 'KOSDAQ150' ? '^KQ150' : '^KS200',
      }),
    }));
    const payload = await responseJson<{ results: { ticker: string; success: boolean; data?: Record<string, unknown> }[] }>(response);
    for (const row of payload.results) {
      if (!row.success || !row.data) continue;
      const item = chunk.find((candidate) => candidate.ticker.toUpperCase() === row.ticker.toUpperCase());
      if (!item) continue;
      if (source === 'leader') candidates.push(normalizeLeaderCandidate(universe, item, row.data));
      if (source === 'momentum') candidates.push(normalizeMomentumCandidate(universe, item, row.data));
      if (source === 'qullamaggie') candidates.push(normalizeQullamaggieCandidate(universe, item, row.data));
      if (source === 'reversal') candidates.push(normalizeReversalCandidate(universe, item, row.data));
    }
  }
  return candidates;
}

export async function scanDailyScreeners(input: {
  runDate: string;
  sources?: DailyScreenerSource[];
  universes?: ScannerUniverse[];
  maxPerUniverse?: number | null;
}): Promise<DailyScanResult> {
  const sources = input.sources?.length ? input.sources : DAILY_SCREENER_SOURCES;
  const universes = input.universes?.length ? input.universes : DAILY_SCREENER_UNIVERSES;
  const maxPerUniverse = typeof input.maxPerUniverse === 'number' && input.maxPerUniverse > 0
    ? Math.floor(input.maxPerUniverse)
    : null;
  const allCandidates: DailyScreenerCandidate[] = [];
  const errors: DailyScanResult['errors'] = [];
  const { getScannerUniverse } = await import('../finance/market/scanner-universes');

  const universeRows = new Map<ScannerUniverse, ScannerConstituent[]>();
  for (const universe of universes) {
    const meta = await getScannerUniverse(universe);
    universeRows.set(universe, maxPerUniverse ? meta.items.slice(0, maxPerUniverse) : meta.items);
  }

  for (const source of sources) {
    for (const universe of universes) {
      const items = universeRows.get(universe) ?? [];
      try {
        if (source === 'minervini') allCandidates.push(...await scanMinerviniUniverse(universe, items));
        else if (source === 'canslim') allCandidates.push(...await scanCanslimUniverse(universe, items));
        else allCandidates.push(...await scanBatchUniverse(source, universe, items));
      } catch (error) {
        errors.push({ source, universe, message: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  const topBySource = groupTopCandidatesBySource(allCandidates, 10);
  const topBySourceMarket = groupTopCandidatesBySourceMarket(allCandidates, 10);
  const topBySourceCategory = groupTopCandidatesBySourceCategory(allCandidates, 10);
  return { runDate: input.runDate, candidates: allCandidates, topBySource, topBySourceMarket, topBySourceCategory, errors, maxPerUniverse };
}

export function dedupeCandidatesBySourceTicker(candidates: DailyScreenerCandidate[]) {
  const best = new Map<string, DailyScreenerCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.source}:${candidate.universe}:${candidate.ticker}`;
    const current = best.get(key);
    if (!current || candidate.score > current.score) best.set(key, candidate);
  }
  return Array.from(best.values());
}

export function groupTopCandidatesBySource(candidates: DailyScreenerCandidate[], limit = 10) {
  const result: Record<DailyScreenerSource, DailyScreenerCandidate[]> = {
    minervini: [],
    canslim: [],
    leader: [],
    momentum: [],
    qullamaggie: [],
    reversal: [],
  };
  const deduped = dedupeCandidatesBySourceTicker(candidates);
  for (const source of DAILY_SCREENER_SOURCES) {
    result[source] = deduped
      .filter((candidate) => candidate.source === source)
      .sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker))
      .slice(0, limit)
      .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  }
  return result;
}

export function groupTopCandidatesBySourceMarket(candidates: DailyScreenerCandidate[], limit = 10) {
  const result = DAILY_SCREENER_SOURCES.reduce((acc, source) => {
    acc[source] = { US: [], KR: [] };
    return acc;
  }, {} as Record<DailyScreenerSource, Record<DailyScreenerMarket, DailyScreenerCandidate[]>>);
  const deduped = dedupeCandidatesBySourceTicker(candidates);

  for (const source of DAILY_SCREENER_SOURCES) {
    for (const market of ['US', 'KR'] as DailyScreenerMarket[]) {
      result[source][market] = deduped
        .filter((candidate) => candidate.source === source && marketForDailyCandidate(candidate) === market)
        .sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker))
        .slice(0, limit)
        .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
    }
  }

  return result;
}

export function flattenTopCandidates(topBySource: Record<DailyScreenerSource, DailyScreenerCandidate[]>) {
  return DAILY_SCREENER_SOURCES.flatMap((source) => topBySource[source] ?? []);
}

export function flattenTopCandidatesBySourceMarket(topBySourceMarket: Record<DailyScreenerSource, Record<DailyScreenerMarket, DailyScreenerCandidate[]>>) {
  return DAILY_SCREENER_SOURCES.flatMap((source) => [
    ...(topBySourceMarket[source]?.US ?? []),
    ...(topBySourceMarket[source]?.KR ?? []),
  ]);
}

export function groupTopCandidatesBySourceCategory(candidates: DailyScreenerCandidate[], limit = 10) {
  const result = DAILY_SCREENER_SOURCES.reduce((acc, source) => {
    acc[source] = { NASDAQ100: [], SP500: [], KOSPI200: [], KOSDAQ150: [] };
    return acc;
  }, {} as Record<DailyScreenerSource, Record<DailyScreenerCategory, DailyScreenerCandidate[]>>);
  const deduped = dedupeCandidatesBySourceTicker(candidates);

  for (const source of DAILY_SCREENER_SOURCES) {
    for (const category of DAILY_SCREENER_CATEGORIES) {
      result[source][category] = deduped
        .filter((candidate) => candidate.source === source && categoryForDailyCandidate(candidate) === category)
        .sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker))
        .slice(0, limit)
        .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
    }
  }

  return result;
}

export function flattenTopCandidatesBySourceCategory(topBySourceCategory: Record<DailyScreenerSource, Record<DailyScreenerCategory, DailyScreenerCandidate[]>>) {
  return DAILY_SCREENER_SOURCES.flatMap((source) => DAILY_SCREENER_CATEGORIES.flatMap((category) => topBySourceCategory[source]?.[category] ?? []));
}

export function ruleBasedDailyTop5(candidates: DailyScreenerCandidate[]): DailyTop5Result {
  const grouped = new Map<string, { best: DailyScreenerCandidate; sources: Set<DailyScreenerSource>; aggregate: number }>();
  for (const candidate of candidates) {
    const key = candidate.ticker;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { best: candidate, sources: new Set([candidate.source]), aggregate: candidate.score });
      continue;
    }
    current.sources.add(candidate.source);
    current.aggregate = Math.max(current.aggregate, candidate.score) + Math.min(12, current.sources.size * 3);
    if (candidate.score > current.best.score) current.best = candidate;
  }

  const top5 = Array.from(grouped.values())
    .sort((a, b) => b.aggregate - a.aggregate || b.best.score - a.best.score)
    .slice(0, 5)
    .map((item, index) => ({
      rank: index + 1,
      ticker: item.best.ticker,
      source: item.sources.size > 1 ? ('mixed' as const) : item.best.source,
      reason: `${item.best.reason}; ${item.sources.size}개 스크리너에서 포착`,
      confidence: round(Math.min(0.92, 0.48 + item.aggregate / 220), 2),
      risk: item.best.metrics.stop_pct ? `손절폭 ${formatNumber(item.best.metrics.stop_pct)}%` : null,
    }));

  return {
    top5,
    reportMarkdown: '',
    rawResponse: JSON.stringify({ provider: 'rules', top5 }, null, 2),
  };
}

function aggregateDailyCandidates(candidates: DailyScreenerCandidate[]) {
  const grouped = new Map<string, { best: DailyScreenerCandidate; sources: Set<DailyScreenerSource>; aggregate: number }>();
  for (const candidate of candidates) {
    const market = marketForDailyCandidate(candidate);
    const key = `${market}:${candidate.ticker}`;
    // KR momentum 소스: 급등 고점 추격 후 되돌림 리스크가 높아 aggregate 가중치 60% 감산
    // 성과 분석 결과 KR momentum 적중률 14.3%, 평균수익 -7.24%로 치명적 부진
    const effectiveScore = market === 'KR' && candidate.source === 'momentum'
      ? Math.round(candidate.score * 0.4)
      : candidate.score;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { best: candidate, sources: new Set([candidate.source]), aggregate: effectiveScore });
      continue;
    }
    current.sources.add(candidate.source);
    current.aggregate = Math.max(current.aggregate, effectiveScore) + Math.min(16, current.sources.size * 4);
    if (effectiveScore > (market === 'KR' && current.best.source === 'momentum'
      ? Math.round(current.best.score * 0.4)
      : current.best.score)) {
      current.best = candidate;
    }
  }
  return grouped;
}

function aggregateDailyCandidatesByCategory(candidates: DailyScreenerCandidate[]) {
  const grouped = new Map<string, { best: DailyScreenerCandidate; sources: Set<DailyScreenerSource>; aggregate: number }>();
  for (const candidate of candidates) {
    const category = categoryForDailyCandidate(candidate);
    const market = marketForDailyCategory(category);
    const key = `${category}:${candidate.ticker}`;
    const effectiveScore = market === 'KR' && candidate.source === 'momentum'
      ? Math.round(candidate.score * 0.4)
      : candidate.score;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { best: candidate, sources: new Set([candidate.source]), aggregate: effectiveScore });
      continue;
    }
    current.sources.add(candidate.source);
    current.aggregate = Math.max(current.aggregate, effectiveScore) + Math.min(16, current.sources.size * 4);
    if (effectiveScore > (market === 'KR' && current.best.source === 'momentum'
      ? Math.round(current.best.score * 0.4)
      : current.best.score)) {
      current.best = candidate;
    }
  }
  return grouped;
}

function metricLabel(metrics: Record<string, unknown>, key: string, label: string, digits = 1) {
  const value = numberOrNull(metrics[key]);
  if (value === null) return null;
  return `${label} ${formatNumber(value, digits)}`;
}

function ruleBasedReason(
  item: { best: DailyScreenerCandidate; sources: Set<DailyScreenerSource>; aggregate: number },
  market: DailyScreenerMarket,
) {
  const sourceBits = Array.from(item.sources).map(sourceLabel).join('+');
  const metrics = [
    metricLabel(item.best.metrics, 'rs_rating', 'RS', 0),
    metricLabel(item.best.metrics, 'rvol', 'RVOL', 1),
    metricLabel(item.best.metrics, 'roc', 'ROC', 1),
    metricLabel(item.best.metrics, 'return_5d_pct', '5일 수익률', 1),
  ].filter(Boolean);
  const marketContext = market === 'KR'
    ? '한국 후보군 안에서 수급·테마 순환과 단기 과열을 함께 보는 우선순위 후보입니다.'
    : '미국 후보군 안에서 추세 지속성, 섹터 주도권, 유동성을 함께 보는 우선순위 후보입니다.';
  const metricText = metrics.length ? ` 보조 지표는 ${metrics.join(', ')}로 확인됩니다.` : '';

  return compactSentence(
    `${sourceBits} 신호 ${item.sources.size}개가 겹치고 ${item.best.grade} 등급, MTN ${formatNumber(item.best.score, 0)}점으로 같은 시장 후보군 내 상대 우위가 있습니다. ${item.best.reason}${metricText} ${marketContext}`,
    720,
  );
}

function ruleBasedRisk(
  item: { best: DailyScreenerCandidate; sources: Set<DailyScreenerSource>; aggregate: number },
  market: DailyScreenerMarket,
) {
  const stop = metricLabel(item.best.metrics, 'stop_pct', '손절폭', 1);
  const roc = numberOrNull(item.best.metrics.roc);
  const return5d = numberOrNull(item.best.metrics.return_5d_pct);
  const riskBits = [
    stop,
    roc !== null && roc >= 8 ? `ROC ${formatNumber(roc, 1)}로 단기 과열 확인` : null,
    return5d !== null && return5d <= -2 ? `최근 5일 흐름 약화(${formatNumber(return5d, 1)}%)` : null,
    item.sources.size === 1 ? '단일 스크리너 신호라 확인 강도가 낮음' : null,
  ].filter(Boolean);
  const marketRisk = market === 'KR'
    ? '외국인·기관 수급 이탈, 테마 거래대금 축소, 지수 급락이 겹치면 우선순위를 낮춰야 합니다.'
    : '금리·달러·VIX 상승이나 섹터 로테이션 이탈이 나오면 추세 실패 리스크를 다시 봐야 합니다.';

  return compactSentence(
    `${riskBits.length ? `${riskBits.join(', ')}. ` : ''}${marketRisk}`,
    420,
  );
}

export function ruleBasedDailyMarketTop10(candidates: DailyScreenerCandidate[]): DailyMarketTop10Result {
  const grouped = aggregateDailyCandidates(candidates);
  const markets = { US: [], KR: [] } as Record<DailyScreenerMarket, DailyMarketTop10Pick[]>;

  for (const market of ['US', 'KR'] as DailyScreenerMarket[]) {
    markets[market] = Array.from(grouped.values())
      .filter((item) => marketForDailyCandidate(item.best) === market)
      .sort((a, b) => b.aggregate - a.aggregate || b.best.score - a.best.score || a.best.ticker.localeCompare(b.best.ticker))
      .slice(0, 10)
      .map((item, index) => ({
        rank: index + 1,
        market,
        ticker: item.best.ticker,
        name: item.best.name,
        universe: item.best.universe,
        score: item.best.score,
        grade: item.best.grade,
        source: item.sources.size > 1 ? ('mixed' as const) : item.best.source,
        reason: ruleBasedReason(item, market),
        confidence: round(Math.min(0.94, 0.46 + item.aggregate / 210), 2),
        risk: ruleBasedRisk(item, market),
      }));
  }

  if (markets.US.length !== 10 || markets.KR.length !== 10) {
    throw new Error(`Rule-based market Top10 requires 10 picks per market; US=${markets.US.length}, KR=${markets.KR.length}.`);
  }

  return {
    markets,
    reportMarkdown: '',
    rawResponse: JSON.stringify({ provider: 'rules', markets }, null, 2),
  };
}

export function ruleBasedDailyCategoryTop10(candidates: DailyScreenerCandidate[]): DailyCategoryTop10Result {
  const grouped = aggregateDailyCandidatesByCategory(candidates);
  const categories = { NASDAQ100: [], SP500: [], KOSPI200: [], KOSDAQ150: [] } as Record<DailyScreenerCategory, DailyCategoryTop10Pick[]>;

  for (const category of DAILY_SCREENER_CATEGORIES) {
    const market = marketForDailyCategory(category);
    categories[category] = Array.from(grouped.values())
      .filter((item) => categoryForDailyCandidate(item.best) === category)
      .sort((a, b) => b.aggregate - a.aggregate || b.best.score - a.best.score || a.best.ticker.localeCompare(b.best.ticker))
      .slice(0, 10)
      .map((item, index) => ({
        rank: index + 1,
        category,
        market,
        ticker: item.best.ticker,
        name: item.best.name,
        universe: item.best.universe,
        score: item.best.score,
        grade: item.best.grade,
        source: item.sources.size > 1 ? ('mixed' as const) : item.best.source,
        reason: ruleBasedReason(item, market),
        confidence: round(Math.min(0.94, 0.46 + item.aggregate / 210), 2),
        risk: ruleBasedRisk(item, market),
      }));
  }

  const counts = DAILY_SCREENER_CATEGORIES.map((category) => `${category}=${categories[category].length}`).join(', ');
  if (DAILY_SCREENER_CATEGORIES.some((category) => categories[category].length !== 10)) {
    throw new Error(`Rule-based category Top10 requires 10 picks per category; ${counts}.`);
  }

  return {
    categories,
    reportMarkdown: '',
    rawResponse: JSON.stringify({ provider: 'rules', categories }, null, 2),
  };
}

export function buildDailyTop5Prompt(input: { runDate: string; candidates: DailyScreenerCandidate[] }) {
  const candidateRows = input.candidates.map((candidate) => {
    const metricBits = Object.entries(candidate.metrics)
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .slice(0, 5)
      .map(([key, value]) => `${key}=${String(value).slice(0, 24)}`)
      .join(';');
    return [
      candidate.ticker,
      candidate.source,
      candidate.universe,
      candidate.score,
      candidate.grade,
      candidate.reason.replace(/\s+/g, ' ').slice(0, 120),
      metricBits,
    ].join('\t');
  });

  return [
    'MTN Daily Screener 통합 후보를 분석해 오늘의 추천 Top5를 고르세요.',
    '한국어로 판단하되, 출력은 JSON만 반환하세요. Markdown fence와 설명 문장을 금지합니다.',
    '중요: 입력 후보에 없는 ticker를 만들지 마세요. top5는 정확히 5개이며 ticker 중복은 금지입니다.',
    '투자 조언이 아니라 MTN 스크리너 후보 우선순위 판별입니다. 리스크를 반드시 포함하세요.',
    '여러 스크리너에 중복 포착되거나 score가 높은 후보를 우선하되, source와 universe 분산도 고려하세요.',
    '',
    '필수 JSON shape: {"top5":[{"rank":1,"ticker":"EXAMPLE","source":"mixed","reason":"핵심 선정 사유","confidence":0.82,"risk":"핵심 리스크"}]}',
    '',
    `run_date: ${input.runDate}`,
    'columns: ticker, source, universe, score, grade, reason, metrics',
    candidateRows.join('\n'),
  ].join('\n');
}

export function buildDailyMarketTop10Prompt(input: {
  runDate: string;
  candidates: DailyScreenerCandidate[];
  marketContext?: Partial<Record<DailyScreenerMarket, unknown>>;
}) {
  const candidateRows = input.candidates.map((candidate) => {
    const metricBits = Object.entries(candidate.metrics)
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .slice(0, 3)
      .map(([key, value]) => `${key}=${String(value).slice(0, 18)}`)
      .join(';');
    return [
      marketForDailyCandidate(candidate),
      candidate.ticker,
      candidate.name || candidate.ticker,
      candidate.source,
      candidate.universe,
      candidate.score,
      candidate.grade,
      candidate.reason.replace(/\s+/g, ' ').slice(0, 80),
      metricBits,
    ].join('\t');
  });

  return [
    'MTN Daily Screener 후보를 분석해 시장별 최종 추천 Top10을 고르세요.',
    '한국어로 판단하되, 출력은 JSON만 반환하세요. Markdown fence와 설명 문장을 금지합니다.',
    '중요: 입력 후보에 없는 ticker를 만들지 마세요. 각 시장별 top10은 정확히 10개이며 ticker 중복은 금지입니다.',
    '입력 후보는 스크리너별 Top10 후보 풀입니다. MTN 점수만 재정렬하지 말고, 외부 LLM이 보유하거나 접근 가능한 공개 시장 정보, 최근 뉴스 흐름, 업종/테마 사이클, 실적·밸류에이션 맥락, 유동성/수급 판단을 활용해 후보 간 상대 우위를 고도화하세요.',
    '최신 뉴스, 실시간 가격, 재무 수치, 업종 이벤트를 알고 있거나 확인 가능한 경우 적극 반영하세요. 다만 입력 데이터와 외부 맥락이 충돌하면 그 충돌을 리스크나 confidence에 반영하고, 불확실한 정보는 단정하지 말고 "확인 필요"로 표시하세요.',
    '평가 프레임: 1) 다중 스크리너 교차 포착, 2) 리스크 조정 모멘텀과 추세 지속성, 3) 피벗/진입 위치와 실패 리스크, 4) 거래대금·변동성·과열도, 5) 최신 뉴스/실적/가이던스/섹터 로테이션의 순풍 또는 역풍, 6) 시장별 특성(미국 성장/반도체/AI/대형주, 한국 수급/테마 쏠림/유동성), 7) 단일 섹터·단일 스크리너 집중 완화, 8) 상승 여력 대비 손실 비대칭성.',
    '한국 시장 특화 주의사항: 1) momentum/RVOL 급등 종목은 고점 추격 후 되돌림 리스크가 매우 높으므로 신중하게 평가하세요. 2) 최근 3일 이상 하락 추세인 종목의 반복 추천을 피하세요. 3) 외국인/기관 수급 방향이 가격과 괴리될 수 있으니 주의하세요. 4) KOSDAQ 소형주는 테마 순환 주기가 짧아 진입 타이밍이 더 중요합니다. ETF·ETN·스팩·우선주는 후보 풀에서 이미 제외됐습니다.',
    '각 종목 reason은 2문장 안팎으로 쓰세요. 첫 문장은 MTN 내부 근거(스크리너 교차 포착, 등급, RS/RVOL/ROC/피벗/거래대금 등)를, 두 번째 문장은 외부 LLM 판단 맥락(업종 사이클, 뉴스·실적·수급·밸류에이션·시장 레짐)을 담아 오늘 같은 시장 후보군 안에서 왜 더 우선인지 설명하세요.',
    '각 종목 risk도 1~2문장으로 쓰세요. 단순한 "변동성" 표현을 피하고, 어떤 조건이 발생하면 탈락·하향해야 하는지 가격/수급/뉴스/실적/매크로 트리거를 구체적으로 적으세요.',
    '투자 조언이 아니라 MTN 스크리너 후보 우선순위 판별입니다.',
    '',
    '필수 JSON shape: {"markets":{"US":[{"rank":1,"ticker":"EXAMPLE","source":"mixed","reason":"핵심 선정 사유","confidence":0.82,"risk":"핵심 리스크"}],"KR":[{"rank":1,"ticker":"005930","source":"mixed","reason":"핵심 선정 사유","confidence":0.82,"risk":"핵심 리스크"}]},"report_markdown":""}',
    '',
    `run_date: ${input.runDate}`,
    `market_context: ${JSON.stringify(input.marketContext || {})}`,
    'columns: market, ticker, name, source, universe, score, grade, reason, metrics',
    candidateRows.join('\n'),
  ].join('\n');
}

export function buildDailyCategoryTop10Prompt(input: {
  runDate: string;
  candidates: DailyScreenerCandidate[];
  marketContext?: Partial<Record<DailyScreenerMarket | DailyScreenerCategory, unknown>>;
}) {
  const candidateRows = input.candidates.map((candidate) => {
    const category = categoryForDailyCandidate(candidate);
    const metricBits = Object.entries(candidate.metrics)
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .slice(0, 3)
      .map(([key, value]) => `${key}=${String(value).slice(0, 18)}`)
      .join(';');
    return [
      category,
      marketForDailyCategory(category),
      candidate.ticker,
      candidate.name || candidate.ticker,
      candidate.source,
      candidate.universe,
      candidate.score,
      candidate.grade,
      candidate.reason.replace(/\s+/g, ' ').slice(0, 80),
      metricBits,
    ].join('\t');
  });

  return [
    'MTN Daily Screener 후보를 분석해 카테고리별 최종 추천 Top10을 고르세요.',
    '카테고리는 NASDAQ100, SP500, KOSPI200, KOSDAQ150 네 가지입니다. 각 카테고리는 정확히 10개를 반환해야 합니다.',
    '한국어로 판단하되, 출력은 JSON만 반환하세요. Markdown fence와 설명 문장을 금지합니다.',
    '중요: 입력 후보에 없는 ticker를 만들지 마세요. 같은 카테고리 안의 ticker 중복은 금지입니다. 같은 ticker가 NASDAQ100과 SP500에 모두 있으면 각 카테고리에서 별도로 평가할 수 있습니다.',
    '입력 후보는 스크리너별·카테고리별 Top10 후보 풀입니다. MTN 점수만 재정렬하지 말고, 외부 LLM이 보유하거나 접근 가능한 공개 시장 정보, 최근 뉴스 흐름, 업종/테마 사이클, 실적·밸류에이션 맥락, 유동성/수급 판단을 활용해 후보 간 상대 우위를 고도화하세요.',
    '최신 뉴스, 실시간 가격, 재무 수치, 업종 이벤트를 알고 있거나 확인 가능한 경우 적극 반영하세요. 다만 입력 데이터와 외부 맥락이 충돌하면 그 충돌을 리스크나 confidence에 반영하고, 불확실한 정보는 단정하지 말고 "확인 필요"로 표시하세요.',
    '평가 프레임: 1) 다중 스크리너 교차 포착, 2) 리스크 조정 모멘텀과 추세 지속성, 3) 피벗/진입 위치와 실패 리스크, 4) 거래대금·변동성·과열도, 5) 최신 뉴스/실적/가이던스/섹터 로테이션의 순풍 또는 역풍, 6) 카테고리별 특성(나스닥 성장/AI, S&P500 대형 우량주, 코스피 수급/대형주, 코스닥 테마/유동성), 7) 단일 섹터·단일 스크리너 집중 완화, 8) 상승 여력 대비 손실 비대칭성.',
    '한국 카테고리 특화 주의사항: 1) momentum/RVOL 급등 종목은 고점 추격 후 되돌림 리스크가 매우 높으므로 신중하게 평가하세요. 2) 최근 3일 이상 하락 추세인 종목의 반복 추천을 피하세요. 3) 외국인/기관 수급 방향이 가격과 괴리될 수 있으니 주의하세요. 4) 코스닥은 테마 순환 주기가 짧아 진입 타이밍이 더 중요합니다. ETF·ETN·스팩·우선주는 후보 풀에서 이미 제외됐습니다.',
    '각 종목 reason은 2문장 안팎으로 쓰세요. 첫 문장은 MTN 내부 근거(스크리너 교차 포착, 등급, RS/RVOL/ROC/피벗/거래대금 등)를, 두 번째 문장은 외부 LLM 판단 맥락(업종 사이클, 뉴스·실적·수급·밸류에이션·시장 레짐)을 담아 오늘 같은 카테고리 후보군 안에서 왜 더 우선인지 설명하세요.',
    '각 종목 risk도 1~2문장으로 쓰세요. 단순한 "변동성" 표현을 피하고, 어떤 조건이 발생하면 탈락·하향해야 하는지 가격/수급/뉴스/실적/매크로 트리거를 구체적으로 적으세요.',
    '투자 조언이 아니라 MTN 스크리너 후보 우선순위 판별입니다.',
    '',
    '필수 JSON shape: {"categories":{"NASDAQ100":[{"rank":1,"ticker":"EXAMPLE","source":"mixed","reason":"핵심 선정 사유","confidence":0.82,"risk":"핵심 리스크"}],"SP500":[{"rank":1,"ticker":"EXAMPLE","source":"mixed","reason":"핵심 선정 사유","confidence":0.82,"risk":"핵심 리스크"}],"KOSPI200":[{"rank":1,"ticker":"005930","source":"mixed","reason":"핵심 선정 사유","confidence":0.82,"risk":"핵심 리스크"}],"KOSDAQ150":[{"rank":1,"ticker":"091990","source":"mixed","reason":"핵심 선정 사유","confidence":0.82,"risk":"핵심 리스크"}]},"report_markdown":""}',
    '',
    `run_date: ${input.runDate}`,
    `market_context: ${JSON.stringify(input.marketContext || {})}`,
    'columns: category, market, ticker, name, source, universe, score, grade, reason, metrics',
    candidateRows.join('\n'),
  ].join('\n');
}

function findBalancedJson(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed;
  const start = trimmed.indexOf('{');
  if (start === -1) return trimmed;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return trimmed.slice(start, index + 1);
    }
  }
  return trimmed;
}

function findBalancedArrayAfterKey(text: string, key: string) {
  const keyIndex = text.indexOf(`"${key}"`);
  if (keyIndex === -1) return null;
  const arrayStart = text.indexOf('[', keyIndex);
  if (arrayStart === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = arrayStart; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) return text.slice(arrayStart, index + 1);
    }
  }
  return null;
}

function parseJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return JSON.parse(findBalancedJson(fenced[1]));

  if (trimmed.startsWith('```')) {
    const withoutOpeningFence = trimmed.replace(/^```(?:json)?\s*/i, '');
    const withoutClosingFence = withoutOpeningFence.replace(/\s*```\s*$/i, '');
    return JSON.parse(findBalancedJson(withoutClosingFence));
  }

  return JSON.parse(findBalancedJson(trimmed));
}

export function parseDailyTop5Response(raw: string, candidates: DailyScreenerCandidate[]): DailyTop5Result {
  let parsed: unknown;
  try {
    parsed = parseJson(raw);
  } catch (error) {
    const top5Json = findBalancedArrayAfterKey(raw, 'top5');
    if (!top5Json) throw error;
    parsed = { top5: JSON.parse(top5Json) };
  }
  const root = Array.isArray(parsed) ? { top5: parsed } : parsed as Record<string, unknown>;
  const rows = Array.isArray(root.top5) ? root.top5 : [];
  const candidateByTicker = new Map(candidates.map((candidate) => [candidate.ticker.toUpperCase(), candidate]));
  const seen = new Set<string>();
  const top5: DailyTop5Pick[] = rows.map((row, index) => {
    if (!row || typeof row !== 'object') throw new Error('Top5 row must be an object.');
    const record = row as Record<string, unknown>;
    const ticker = String(record.ticker || '').trim().toUpperCase();
    if (!candidateByTicker.has(ticker)) throw new Error(`Unexpected ticker in daily Top5: ${ticker}`);
    if (seen.has(ticker)) throw new Error(`Duplicate ticker in daily Top5: ${ticker}`);
    seen.add(ticker);
    const source = String(record.source || candidateByTicker.get(ticker)?.source || 'mixed') as DailyTop5Pick['source'];
    const confidence = Number(record.confidence ?? 0.5);
    return {
      rank: Number(record.rank) || index + 1,
      ticker,
      source: DAILY_SCREENER_SOURCES.includes(source as DailyScreenerSource) ? source : 'mixed',
      reason: String(record.reason || candidateByTicker.get(ticker)?.reason || '').slice(0, 800),
      confidence: round(clamp(Number.isFinite(confidence) ? confidence : 0.5, 0, 1), 2),
      risk: record.risk === undefined || record.risk === null ? null : String(record.risk).slice(0, 500),
    };
  });

  if (top5.length !== 5) throw new Error(`Daily Top5 response must include exactly 5 picks; received ${top5.length}.`);
  top5.sort((a, b) => a.rank - b.rank);
  top5.forEach((item, index) => { item.rank = index + 1; });

  return {
    top5,
    reportMarkdown: typeof root.report_markdown === 'string' ? root.report_markdown : '',
    rawResponse: raw,
  };
}

export function parseDailyMarketTop10Response(raw: string, candidates: DailyScreenerCandidate[]): DailyMarketTop10Result {
  let parsed: unknown;
  try {
    parsed = parseJson(raw);
  } catch (error) {
    const usJson = findBalancedArrayAfterKey(raw, 'US');
    const krJson = findBalancedArrayAfterKey(raw, 'KR');
    if (!usJson || !krJson) throw error;
    parsed = { markets: { US: JSON.parse(usJson), KR: JSON.parse(krJson) } };
  }

  const root = parsed as Record<string, unknown>;
  const marketRoot = root.markets && typeof root.markets === 'object'
    ? root.markets as Record<string, unknown>
    : root;
  const candidateByMarketTicker = new Map<string, DailyScreenerCandidate>();
  const candidatesByMarketTicker = new Map<string, DailyScreenerCandidate[]>();
  for (const candidate of candidates) {
    const key = `${marketForDailyCandidate(candidate)}:${candidate.ticker.toUpperCase()}`;
    const current = candidateByMarketTicker.get(key);
    if (!current || candidate.score > current.score) candidateByMarketTicker.set(key, candidate);
    candidatesByMarketTicker.set(key, [...(candidatesByMarketTicker.get(key) || []), candidate]);
  }

  const markets = { US: [], KR: [] } as Record<DailyScreenerMarket, DailyMarketTop10Pick[]>;
  for (const market of ['US', 'KR'] as DailyScreenerMarket[]) {
    const rows = Array.isArray(marketRoot[market]) ? marketRoot[market] as unknown[] : [];
    const seen = new Set<string>();
    markets[market] = rows.map((row, index) => {
      if (!row || typeof row !== 'object') throw new Error(`${market} Top10 row must be an object.`);
      const record = row as Record<string, unknown>;
      const ticker = String(record.ticker || '').trim().toUpperCase();
      const candidate = candidateByMarketTicker.get(`${market}:${ticker}`);
      if (!candidate) throw new Error(`Unexpected ticker in ${market} daily Top10: ${ticker}`);
      if (seen.has(ticker)) throw new Error(`Duplicate ticker in ${market} daily Top10: ${ticker}`);
      seen.add(ticker);
      const source = String(record.source || candidate.source || 'mixed') as DailyTop5Pick['source'];
      const confidence = Number(record.confidence ?? 0.5);
      return {
        rank: Number(record.rank) || index + 1,
        market,
        ticker,
        name: bestSecurityName(candidatesByMarketTicker.get(`${market}:${ticker}`) || [candidate], ticker),
        universe: candidate.universe,
        score: candidate.score,
        grade: candidate.grade,
        source: DAILY_SCREENER_SOURCES.includes(source as DailyScreenerSource) ? source : 'mixed',
        reason: String(record.reason || candidate.reason || '').slice(0, 900),
        confidence: round(clamp(Number.isFinite(confidence) ? confidence : 0.5, 0, 1), 2),
        risk: record.risk === undefined || record.risk === null ? null : String(record.risk).slice(0, 600),
      };
    });

    if (markets[market].length !== 10) {
      throw new Error(`${market} daily Top10 response must include exactly 10 picks; received ${markets[market].length}.`);
    }
    markets[market].sort((a, b) => a.rank - b.rank);
    markets[market].forEach((item, index) => { item.rank = index + 1; });
  }

  return {
    markets,
    reportMarkdown: typeof root.report_markdown === 'string' ? root.report_markdown : '',
    rawResponse: raw,
  };
}

export function parseDailyCategoryTop10Response(raw: string, candidates: DailyScreenerCandidate[]): DailyCategoryTop10Result {
  let parsed: unknown;
  try {
    parsed = parseJson(raw);
  } catch (error) {
    const categoryRows = Object.fromEntries(DAILY_SCREENER_CATEGORIES.map((category) => {
      const json = findBalancedArrayAfterKey(raw, category);
      return [category, json ? JSON.parse(json) : null];
    })) as Record<DailyScreenerCategory, unknown>;
    if (DAILY_SCREENER_CATEGORIES.some((category) => !Array.isArray(categoryRows[category]))) throw error;
    parsed = { categories: categoryRows };
  }

  const root = parsed as Record<string, unknown>;
  const categoryRoot = root.categories && typeof root.categories === 'object'
    ? root.categories as Record<string, unknown>
    : root;
  const candidateByCategoryTicker = new Map<string, DailyScreenerCandidate>();
  const candidatesByCategoryTicker = new Map<string, DailyScreenerCandidate[]>();
  for (const candidate of candidates) {
    const key = `${categoryForDailyCandidate(candidate)}:${candidate.ticker.toUpperCase()}`;
    const current = candidateByCategoryTicker.get(key);
    if (!current || candidate.score > current.score) candidateByCategoryTicker.set(key, candidate);
    candidatesByCategoryTicker.set(key, [...(candidatesByCategoryTicker.get(key) || []), candidate]);
  }

  const categories = { NASDAQ100: [], SP500: [], KOSPI200: [], KOSDAQ150: [] } as Record<DailyScreenerCategory, DailyCategoryTop10Pick[]>;
  for (const category of DAILY_SCREENER_CATEGORIES) {
    const rows = Array.isArray(categoryRoot[category]) ? categoryRoot[category] as unknown[] : [];
    const market = marketForDailyCategory(category);
    const seen = new Set<string>();
    categories[category] = rows.map((row, index) => {
      if (!row || typeof row !== 'object') throw new Error(`${category} Top10 row must be an object.`);
      const record = row as Record<string, unknown>;
      const ticker = String(record.ticker || '').trim().toUpperCase();
      const candidate = candidateByCategoryTicker.get(`${category}:${ticker}`);
      if (!candidate) throw new Error(`Unexpected ticker in ${category} daily Top10: ${ticker}`);
      if (seen.has(ticker)) throw new Error(`Duplicate ticker in ${category} daily Top10: ${ticker}`);
      seen.add(ticker);
      const source = String(record.source || candidate.source || 'mixed') as DailyTop5Pick['source'];
      const confidence = Number(record.confidence ?? 0.5);
      return {
        rank: Number(record.rank) || index + 1,
        category,
        market,
        ticker,
        name: bestSecurityName(candidatesByCategoryTicker.get(`${category}:${ticker}`) || [candidate], ticker),
        universe: candidate.universe,
        score: candidate.score,
        grade: candidate.grade,
        source: DAILY_SCREENER_SOURCES.includes(source as DailyScreenerSource) ? source : 'mixed',
        reason: String(record.reason || candidate.reason || '').slice(0, 900),
        confidence: round(clamp(Number.isFinite(confidence) ? confidence : 0.5, 0, 1), 2),
        risk: record.risk === undefined || record.risk === null ? null : String(record.risk).slice(0, 600),
      };
    });

    if (categories[category].length !== 10) {
      throw new Error(`${category} daily Top10 response must include exactly 10 picks; received ${categories[category].length}.`);
    }
    categories[category].sort((a, b) => a.rank - b.rank);
    categories[category].forEach((item, index) => { item.rank = index + 1; });
  }

  return {
    categories,
    reportMarkdown: typeof root.report_markdown === 'string' ? root.report_markdown : '',
    rawResponse: raw,
  };
}

export function formatDailyScreenerTelegramMessage(input: {
  runDate: string;
  source: DailyScreenerSource;
  market?: DailyScreenerMarket;
  candidates: DailyScreenerCandidate[];
}) {
  const rows = input.candidates.slice(0, 10);
  const body = rows.map((candidate, index) => [
    `${index + 1}. *${md(candidate.ticker)}* — ${md(candidate.name || candidate.ticker)}`,
    `   ${md(candidate.grade)} · score ${formatNumber(candidate.score, 0)} · ${md(candidate.universe)}`,
    `   ${md(candidate.reason).slice(0, 220)}`,
  ].join('\n'));

  return [
    `*MTN Daily ${md(sourceLabel(input.source))} ${input.market ? `${md(marketLabel(input.market))} ` : ''}Top10*`,
    `Date: *${md(input.runDate)}*`,
    `Candidates: *${rows.length}*`,
    '',
    rows.length ? body.join('\n') : '전송할 후보가 없습니다.',
  ].join('\n');
}

export function formatDailyMarketTop10TelegramMessage(input: {
  runDate: string;
  market: DailyScreenerMarket;
  top10: DailyMarketTop10Pick[];
  provider: string;
}) {
  const rows = input.top10.slice(0, 10);
  const body = rows.map((pick) => [
    `${pick.rank}. *${md(pick.ticker)}* — ${md(pick.name || pick.ticker)}`,
    `   ${md(sourceLabel(pick.source))} | 신뢰도 ${formatPercent(pick.confidence)} | MTN ${formatNumber(pick.score, 0)} | ${md(pick.universe)}`,
    `   근거: ${md(compactSentence(pick.reason, 620))}`,
    pick.risk ? `   리스크: ${md(compactSentence(pick.risk, 360))}` : null,
  ].filter(Boolean).join('\n')).join('\n\n');

  return [
    `*MTN Daily ${md(marketLabel(input.market))} 추천 Top10*`,
    `기준일: *${md(input.runDate)}* | 엔진: \`${md(input.provider)}\``,
    `후보: 스크리너별 Top10 통합 → LLM 최종 ${rows.length}개`,
    '',
    rows.length ? body : '전송할 후보가 없습니다.',
  ].join('\n');
}

function recommendationActionReasonLabel(reason?: string | null) {
  if (!reason) return null;
  return ({
    MARKET_STATE_RED: '시장 RED',
    MARKET_STATE_GRAY: '시장상태 판정 보류',
    MARKET_STATE_MISSING: '시장상태 누락',
    CATEGORY_STATE_REQUIRED: '전용 지수 상태 미확인',
    INVALID_CATEGORY_STATE: '전용 지수 상태 오류',
    CHART_GATE_NOT_ACTIONABLE: '차트 진입조건 미충족',
    CATEGORY_ACTIVE_CAP: '카테고리 활성 한도',
    RECENT_ACTIVE_REPEAT: '최근 ACTIVE 추천 쿨다운',
    POLICY_WATCHLIST_BACKFILL: '안전필터 보충 후보',
    REQUESTED_POLICY_UNAVAILABLE: '요청 정책 산출 실패',
  } as Record<string, string>)[reason] || reason;
}

export function formatDailyCategoryTop10TelegramMessage(input: {
  runDate: string;
  category: DailyScreenerCategory;
  top10: DailyCategoryTop10Pick[];
  provider: string;
}) {
  const rows = input.top10.slice(0, 10);
  const actionAware = rows.some((pick) => pick.actionState === 'ACTIVE' || pick.actionState === 'WATCHLIST');
  const activeCount = rows.filter((pick) => pick.actionState === 'ACTIVE').length;
  const reportedCashWeight = rows.find((pick) => Number.isFinite(pick.cashWeight))?.cashWeight;
  const allocationSummary = actionAware
    ? `실행: *${activeCount}/${rows.length}*${Number.isFinite(reportedCashWeight) ? ` | 현금: *${formatPercent(reportedCashWeight!)}*` : ''}`
    : null;
  const body = rows.map((pick) => [
    `${pick.rank}. *${md(pick.ticker)}* — ${md(pick.name || pick.ticker)}`,
    `   ${md(sourceLabel(pick.source))} | 신뢰도 ${formatPercent(pick.confidence)} | MTN ${formatNumber(pick.score, 0)} | ${md(pick.universe)}`,
    pick.actionState ? `   실행 상태: *${md(pick.actionState)}*${pick.actionState === 'ACTIVE' && Number.isFinite(pick.targetWeight) ? ` | 목표 비중 ${formatPercent(pick.targetWeight!)}` : ''}` : null,
    pick.actionState === 'WATCHLIST' && recommendationActionReasonLabel(pick.actionReason)
      ? `   대기 사유: ${md(recommendationActionReasonLabel(pick.actionReason)!)}`
      : null,
    `   근거: ${md(compactSentence(pick.reason, 620))}`,
    pick.chartGate ? `   통합 게이트: ${md(pick.chartGate.summary)}` : null,
    pick.risk ? `   리스크: ${md(compactSentence(pick.risk, 360))}` : null,
  ].filter(Boolean).join('\n')).join('\n\n');

  return [
    `*MTN Daily ${md(categoryLabel(input.category))} 추천 Top10*`,
    `기준일: *${md(input.runDate)}* | 엔진: \`${md(input.provider)}\``,
    `후보: 스크리너별 카테고리 Top10 통합 → LLM 최종 ${rows.length}개`,
    allocationSummary,
    '',
    rows.length ? body : '전송할 후보가 없습니다.',
  ].filter((line) => line !== null).join('\n');
}

export function formatDailyTop5TelegramMessage(input: {
  runDate: string;
  top5: DailyTop5Pick[];
  provider: string;
  reportMarkdown?: string;
}) {
  const fallbackBody = input.top5.map((pick) => [
    `${pick.rank}. *${md(pick.ticker)}* · ${md(sourceLabel(pick.source))} · confidence ${formatNumber(pick.confidence, 2)}`,
    `   ${md(pick.reason)}`,
    pick.risk ? `   Risk: ${md(pick.risk)}` : null,
  ].filter(Boolean).join('\n')).join('\n');

  return [
    '*MTN Daily LLM 추천 Top5*',
    `Date: *${md(input.runDate)}*`,
    `Engine: \`${md(input.provider)}\``,
    '',
    input.reportMarkdown?.trim() || fallbackBody,
  ].join('\n');
}

export function parseDailyScreenerSourceList(value: string | null): DailyScreenerSource[] | null {
  if (!value || value.toUpperCase() === 'ALL') return DAILY_SCREENER_SOURCES;
  const rows = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (rows.length === 0) return DAILY_SCREENER_SOURCES;
  if (rows.every((item): item is DailyScreenerSource => DAILY_SCREENER_SOURCES.includes(item as DailyScreenerSource))) return rows;
  return null;
}

export function parseDailyScreenerUniverseList(value: string | null): ScannerUniverse[] | null {
  if (!value || value.toUpperCase() === 'ALL') return DAILY_SCREENER_UNIVERSES;
  const rows = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (rows.length === 0) return DAILY_SCREENER_UNIVERSES;
  if (rows.every((item): item is ScannerUniverse => DAILY_SCREENER_UNIVERSES.includes(item as ScannerUniverse))) return rows;
  return null;
}

export function kstDateString(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
