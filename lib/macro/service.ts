import type { OHLCData } from '../../types/index.ts';
import type { FredObservation } from '../data/fred.ts';
import { get5yBreakeven, getDgs10, getDgs2, getHyOas } from '../data/fred.ts';
import { evaluateFreshness } from '../data/freshness.ts';
import {
  getYahooDailyPrice,
  getYahooQuotes,
  type YahooQuote,
} from '../finance/providers/yahoo-api.ts';
import {
  computeMacroScore,
  type MacroComputeResult,
  type MacroRegime,
  type MacroScoreBreakdown,
} from './compute.ts';

export const MACRO_MODEL_VERSION = 'macro-2026.07-v3';

export type MacroMarket = 'US' | 'KR';
export type MacroQualityStatus = 'VALID' | 'DEGRADED' | 'BLOCKED';
export type MacroComponentState = 'AVAILABLE' | 'FALLBACK' | 'STALE' | 'MISSING';

type MacroComponentKey =
  | 'credit'
  | 'volatility'
  | 'dollarRate'
  | 'yieldCurve'
  | 'econSensitivity'
  | 'breadth'
  | 'kospi'
  | 'kosdaq'
  | 'krw'
  | 'globalVolatility';

export interface MacroQuote extends YahooQuote {
  source?: string;
  trendReferenceAvailable?: boolean;
}

export interface MacroComponentQuality {
  key: MacroComponentKey;
  label: string;
  weight: number;
  state: MacroComponentState;
  observedAt: string | null;
  source: string | null;
}

export interface MacroQuality {
  status: MacroQualityStatus;
  coverage: {
    availableWeight: number;
    totalWeight: 100;
    ratio: number;
    availableComponents: number;
    totalComponents: number;
  };
  components: MacroComponentQuality[];
  missingComponents: string[];
  staleComponents: string[];
  fallbackComponents: string[];
  warnings: string[];
  fallbackUsed: boolean;
  normalized: boolean;
}

interface KisIndexQuoteLike {
  symbol: string;
  regularMarketPrice: number;
  regularMarketChangePercent: number;
}

export interface MacroDataDependencies {
  getYahooQuotes(symbols: string[]): Promise<YahooQuote[]>;
  getYahooDailyPrice(symbol: string): Promise<OHLCData[]>;
  getHyOas(): Promise<FredObservation[]>;
  get5yBreakeven(): Promise<FredObservation[]>;
  getDgs10(): Promise<FredObservation[]>;
  getDgs2(): Promise<FredObservation[]>;
  getKisIndexQuotes(): Promise<Record<string, KisIndexQuoteLike>>;
}

interface MacroServiceOptions {
  dependencies?: Partial<MacroDataDependencies>;
  now?: Date;
}

interface MacroOverlayAssessment {
  result: MacroComputeResult;
  rawScore: number;
  observedAt: string | null;
  quality: MacroQuality;
}

export interface MacroAssessment extends MacroOverlayAssessment {
  market: MacroMarket;
  data: Record<string, MacroQuote>;
  fetchedAt: string;
  modelVersion: string;
  globalOverlay: MacroOverlayAssessment | null;
}

export interface MacroApiResponse {
  data: Record<string, MacroQuote>;
  score: number;
  rawScore: number;
  regime: MacroRegime;
  breakdown: MacroScoreBreakdown[];
  spyAbove50ma: boolean;
  hygIefDiff: number;
  vixLevel: number;
  asOf: string;
  updatedAt: string;
  observedAt: string | null;
  fetchedAt: string;
  market: MacroMarket;
  decisionStatus: MacroQualityStatus;
  quality: MacroQuality;
  modelVersion: string;
  globalOverlay: {
    score: number;
    rawScore: number;
    regime: MacroRegime;
    decisionStatus: MacroQualityStatus;
    quality: MacroQuality;
    observedAt: string | null;
    modelVersion: string;
  } | null;
}

const MACRO_SYMBOLS = [
  'UVXY', '^VIX', 'UUP', 'KRE',
  'SHY', 'TLT', 'HYG', 'IEF',
  'QQQ', 'SPY', '^KS200', 'DIA', 'IWM', 'RSP',
  'GLD', 'CPER', 'USO', 'UNG', 'BTC-USD',
  '^GSPC', '^IXIC', '^KS11', '^KQ11', 'KRW=X',
  '^TNX', '^IRX', 'IEI',
] as const;

const HISTORY_SYMBOLS = ['HYG', 'IEF', 'CPER', 'GLD', 'IWM', 'RSP', 'SPY'] as const;
const EOD_FRESHNESS_SECONDS = 96 * 60 * 60;
const MIN_USABLE_WEIGHT = 70;

const DEFAULT_DEPENDENCIES: MacroDataDependencies = {
  getYahooQuotes,
  getYahooDailyPrice,
  getHyOas,
  get5yBreakeven,
  getDgs10,
  getDgs2,
  getKisIndexQuotes: async () => {
    const kisApi = await import('../finance/providers/kis-api.ts');
    return kisApi.getKisIndexQuotes();
  },
};

function observationAt(date: string | null | undefined) {
  if (!date) return null;
  if (date.includes('T')) {
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T23:59:59.000Z` : null;
}

function latestObservation(rows: { date: string }[] | undefined) {
  return observationAt(rows?.at(-1)?.date);
}

function oldestObservation(values: Array<string | null | undefined>) {
  const valid = values.filter((value): value is string => Boolean(value)).sort();
  return valid[0] ?? null;
}

function hasQuote(quote: MacroQuote | null | undefined) {
  return Boolean(
    quote
    && Number.isFinite(quote.regularMarketPrice)
    && Number.isFinite(quote.regularMarketChangePercent)
    && Number.isFinite(quote.fiftyDayAverage),
  );
}

function seriesIsFresh(rows: { date: string }[], now: Date) {
  const observedAt = latestObservation(rows);
  return Boolean(
    observedAt
    && !evaluateFreshness(observedAt, EOD_FRESHNESS_SECONDS, now).isStale,
  );
}

function freshSeries<T extends { date: string }>(rows: T[], now: Date) {
  return rows.length > 0 && seriesIsFresh(rows, now) ? rows : [];
}

function component(input: Omit<MacroComponentQuality, 'state'> & {
  available?: boolean;
  fallback?: boolean;
  stale?: boolean;
}): MacroComponentQuality {
  const state: MacroComponentState = input.available
    ? 'AVAILABLE'
    : input.fallback
      ? 'FALLBACK'
      : input.stale
        ? 'STALE'
        : 'MISSING';
  return {
    key: input.key,
    label: input.label,
    weight: input.weight,
    state,
    observedAt: input.observedAt,
    source: input.source,
  };
}

function buildQuality(components: MacroComponentQuality[]): MacroQuality {
  const usable = components.filter((item) => item.state === 'AVAILABLE' || item.state === 'FALLBACK');
  const availableWeight = usable.reduce((sum, item) => sum + item.weight, 0);
  const fallbackComponents = components.filter((item) => item.state === 'FALLBACK').map((item) => item.label);
  const staleComponents = components.filter((item) => item.state === 'STALE').map((item) => item.label);
  const missingComponents = components.filter((item) => item.state === 'MISSING').map((item) => item.label);
  const status: MacroQualityStatus = availableWeight < MIN_USABLE_WEIGHT
    ? 'BLOCKED'
    : components.every((item) => item.state === 'AVAILABLE')
      ? 'VALID'
      : 'DEGRADED';
  const warnings = [
    ...(missingComponents.length ? [`누락된 매크로 구성요소: ${missingComponents.join(', ')}`] : []),
    ...(staleComponents.length ? [`신선도 한도를 초과한 구성요소: ${staleComponents.join(', ')}`] : []),
    ...(fallbackComponents.length ? [`대체 입력을 사용한 구성요소: ${fallbackComponents.join(', ')}`] : []),
    ...(status === 'DEGRADED' && availableWeight < 100
      ? [`가용 가중치 ${availableWeight}/100 기준으로 점수를 정규화했습니다.`]
      : []),
  ];
  return {
    status,
    coverage: {
      availableWeight,
      totalWeight: 100,
      ratio: availableWeight / 100,
      availableComponents: usable.length,
      totalComponents: components.length,
    },
    components,
    missingComponents,
    staleComponents,
    fallbackComponents,
    warnings,
    fallbackUsed: fallbackComponents.length > 0 || staleComponents.length > 0 || missingComponents.length > 0,
    normalized: status === 'DEGRADED' && availableWeight < 100,
  };
}

function regimeForScore(score: number): MacroRegime {
  if (score >= 70) return 'RISK_ON';
  if (score < 45) return 'RISK_OFF';
  return 'NEUTRAL';
}

function safeScore(rawAvailableScore: number, quality: MacroQuality) {
  if (quality.status === 'BLOCKED') return 50;
  const availableWeight = quality.coverage.availableWeight;
  if (availableWeight <= 0) return 50;
  return Math.max(0, Math.min(100, Math.round((rawAvailableScore / availableWeight) * 100)));
}

function qualityObservedAt(quality: MacroQuality) {
  return oldestObservation(
    quality.components
      .filter((item) => item.state === 'AVAILABLE' || item.state === 'FALLBACK')
      .map((item) => item.observedAt),
  );
}

function assessUs(
  quotes: Record<string, MacroQuote>,
  histories: Record<string, OHLCData[]>,
  fredData: {
    hyOas: FredObservation[];
    breakeven5y: FredObservation[];
    dgs10: FredObservation[];
    dgs2: FredObservation[];
  },
  fetchedAt: string,
  staleSeries: Set<string>,
): MacroOverlayAssessment {
  const rawResult = computeMacroScore(quotes, histories, fredData);
  const historyObservedAt = (left: string, right: string) => oldestObservation([
    latestObservation(histories[left]),
    latestObservation(histories[right]),
  ]);
  const quote = (symbol: string) => quotes[symbol] ?? quotes[symbol.replace('^', '')];

  const creditDirect = fredData.hyOas.length > 0;
  const creditHistory = histories.HYG?.length >= 20 && histories.IEF?.length >= 20;
  const creditQuote = hasQuote(quote('HYG')) && hasQuote(quote('IEF'));
  const econHistory = histories.CPER?.length >= 20 && histories.GLD?.length >= 20;
  const econQuote = hasQuote(quote('CPER')) && hasQuote(quote('GLD'));
  const breadthHistory = histories.IWM?.length >= 6 && histories.SPY?.length >= 6;
  const breadthQuote = hasQuote(quote('IWM')) && hasQuote(quote('SPY')) && hasQuote(quote('RSP'));
  const dollarDirect = hasQuote(quote('UUP')) && hasQuote(quote('TLT'));
  const dollarFallback = !dollarDirect && hasQuote(quote('UUP'));
  const curveDirect = fredData.dgs10.length > 0 && fredData.dgs2.length > 0;

  const components = [
    component({
      key: 'credit', label: '크레딧 스프레드', weight: 25,
      available: creditDirect,
      fallback: !creditDirect && (creditHistory || creditQuote),
      stale: staleSeries.has('hyOas') && !creditHistory && !creditQuote,
      observedAt: creditDirect
        ? latestObservation(fredData.hyOas)
        : creditHistory ? historyObservedAt('HYG', 'IEF') : creditQuote ? fetchedAt : null,
      source: creditDirect ? 'FRED' : creditHistory ? 'Yahoo history' : creditQuote ? 'Yahoo quote' : null,
    }),
    component({
      key: 'volatility', label: '변동성', weight: 20,
      available: hasQuote(quote('^VIX')) || hasQuote(quote('UVXY')),
      observedAt: hasQuote(quote('^VIX')) || hasQuote(quote('UVXY')) ? fetchedAt : null,
      source: hasQuote(quote('^VIX')) ? 'Yahoo VIX' : hasQuote(quote('UVXY')) ? 'Yahoo UVXY' : null,
    }),
    component({
      key: 'dollarRate', label: '달러/금리', weight: 20,
      available: dollarDirect,
      fallback: dollarFallback,
      observedAt: dollarDirect || dollarFallback ? fetchedAt : null,
      source: dollarDirect ? 'Yahoo UUP+TLT' : dollarFallback ? 'Yahoo UUP' : null,
    }),
    component({
      key: 'yieldCurve', label: '수익률 곡선', weight: 15,
      available: curveDirect,
      stale: (staleSeries.has('dgs10') || staleSeries.has('dgs2')) && !curveDirect,
      observedAt: curveDirect
        ? oldestObservation([latestObservation(fredData.dgs10), latestObservation(fredData.dgs2)])
        : null,
      source: curveDirect ? 'FRED DGS10+DGS2' : null,
    }),
    component({
      key: 'econSensitivity', label: '경기 민감도', weight: 10,
      available: econHistory,
      fallback: !econHistory && econQuote,
      stale: (staleSeries.has('CPER') || staleSeries.has('GLD')) && !econQuote,
      observedAt: econHistory ? historyObservedAt('CPER', 'GLD') : econQuote ? fetchedAt : null,
      source: econHistory ? 'Yahoo history' : econQuote ? 'Yahoo quote' : null,
    }),
    component({
      key: 'breadth', label: '시장 폭', weight: 10,
      available: breadthHistory,
      fallback: !breadthHistory && breadthQuote,
      stale: (staleSeries.has('IWM') || staleSeries.has('SPY')) && !breadthQuote,
      observedAt: breadthHistory ? historyObservedAt('IWM', 'SPY') : breadthQuote ? fetchedAt : null,
      source: breadthHistory ? 'Yahoo history' : breadthQuote ? 'Yahoo quote' : null,
    }),
  ];
  const quality = buildQuality(components);
  const scoreByComponent: Record<MacroComponentKey, number> = {
    credit: rawResult.componentScores.creditScore,
    volatility: rawResult.componentScores.volatilityScore,
    dollarRate: rawResult.componentScores.dollarRateScore,
    yieldCurve: rawResult.componentScores.yieldCurveScore,
    econSensitivity: rawResult.componentScores.econSensitivityScore,
    breadth: rawResult.componentScores.breadthScore,
    kospi: 0,
    kosdaq: 0,
    krw: 0,
    globalVolatility: 0,
  };
  const rawAvailableScore = components.reduce((sum, item) => (
    item.state === 'AVAILABLE' || item.state === 'FALLBACK'
      ? sum + scoreByComponent[item.key]
      : sum
  ), 0);
  const macroScore = safeScore(rawAvailableScore, quality);
  const result: MacroComputeResult = {
    ...rawResult,
    macroScore,
    regime: quality.status === 'BLOCKED' ? 'NEUTRAL' : regimeForScore(macroScore),
  };
  return {
    result,
    rawScore: rawAvailableScore,
    observedAt: qualityObservedAt(quality),
    quality,
  };
}

function computeKoreaMacroScore(data: Record<string, MacroQuote>) {
  const kospi = data['^KS11'];
  const kosdaq = data['^KQ11'];
  const krw = data['KRW=X'];
  const vix = data['^VIX'];
  const scores = {
    kospi: kospi && kospi.regularMarketPrice >= kospi.fiftyDayAverage ? 35 : 0,
    kosdaq: kosdaq && kosdaq.regularMarketPrice >= kosdaq.fiftyDayAverage ? 25 : 0,
    krw: krw && krw.regularMarketPrice <= krw.fiftyDayAverage ? 20 : krw ? 7 : 0,
    globalVolatility: vix && vix.regularMarketPrice < 20 ? 20 : vix && vix.regularMarketPrice < 25 ? 10 : 0,
  };
  const breakdown: MacroScoreBreakdown[] = [
    { label: 'KOSPI 추세', weight: 35, score: scores.kospi, description: 'KOSPI 50일선 기준', rawValue: kospi ? `${kospi.regularMarketPrice}` : '데이터 없음', threshold: '지수 > 50MA' },
    { label: 'KOSDAQ 추세', weight: 25, score: scores.kosdaq, description: 'KOSDAQ 50일선 기준', rawValue: kosdaq ? `${kosdaq.regularMarketPrice}` : '데이터 없음', threshold: '지수 > 50MA' },
    { label: '원/달러 안정성', weight: 20, score: scores.krw, description: '원화 약세 압력 확인', rawValue: krw ? `${krw.regularMarketPrice}` : '데이터 없음', threshold: 'USD/KRW ≤ 50MA' },
    { label: '글로벌 변동성', weight: 20, score: scores.globalVolatility, description: '한국 증시에 영향을 주는 글로벌 위험', rawValue: vix ? `${vix.regularMarketPrice}` : '데이터 없음', threshold: 'VIX < 20' },
  ];
  return { scores, breakdown };
}

function assessKorea(
  quotes: Record<string, MacroQuote>,
  usAssessment: MacroOverlayAssessment,
  fetchedAt: string,
): MacroOverlayAssessment {
  const korea = computeKoreaMacroScore(quotes);
  const quote = (symbol: string) => quotes[symbol];
  const indexComponent = (key: 'kospi' | 'kosdaq', label: string, symbol: '^KS11' | '^KQ11', weight: number) => {
    const value = quote(symbol);
    const isKis = value?.source === 'KIS';
    const hasTrendReference = value?.trendReferenceAvailable !== false;
    return component({
      key, label, weight,
      available: hasQuote(value) && hasTrendReference && isKis,
      fallback: hasQuote(value) && hasTrendReference && !isKis,
      observedAt: hasQuote(value) && hasTrendReference ? fetchedAt : null,
      source: hasQuote(value) ? value?.source || 'Yahoo' : null,
    });
  };
  const components = [
    indexComponent('kospi', 'KOSPI 추세', '^KS11', 35),
    indexComponent('kosdaq', 'KOSDAQ 추세', '^KQ11', 25),
    component({
      key: 'krw', label: '원/달러 안정성', weight: 20,
      available: hasQuote(quote('KRW=X')),
      observedAt: hasQuote(quote('KRW=X')) ? fetchedAt : null,
      source: hasQuote(quote('KRW=X')) ? quote('KRW=X')?.source || 'Yahoo' : null,
    }),
    component({
      key: 'globalVolatility', label: '글로벌 변동성', weight: 20,
      available: hasQuote(quote('^VIX')),
      observedAt: hasQuote(quote('^VIX')) ? fetchedAt : null,
      source: hasQuote(quote('^VIX')) ? quote('^VIX')?.source || 'Yahoo' : null,
    }),
  ];
  const quality = buildQuality(components);
  const rawAvailableScore = components.reduce((sum, item) => (
    item.state === 'AVAILABLE' || item.state === 'FALLBACK'
      ? sum + korea.scores[item.key as keyof typeof korea.scores]
      : sum
  ), 0);
  const macroScore = safeScore(rawAvailableScore, quality);
  return {
    result: {
      ...usAssessment.result,
      macroScore,
      regime: quality.status === 'BLOCKED' ? 'NEUTRAL' : regimeForScore(macroScore),
      breakdown: korea.breakdown,
    },
    rawScore: rawAvailableScore,
    observedAt: qualityObservedAt(quality),
    quality,
  };
}

export async function fetchMacroAssessment(
  market: MacroMarket,
  options: MacroServiceOptions = {},
): Promise<MacroAssessment> {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...options.dependencies };
  const now = options.now ?? new Date();
  const fetchedAt = now.toISOString();
  const [quotes, hyOasRaw, breakeven5yRaw, dgs10Raw, dgs2Raw, historyEntries, kisIndexQuotes] = await Promise.all([
    dependencies.getYahooQuotes([...MACRO_SYMBOLS]).catch(() => []),
    dependencies.getHyOas().catch(() => []),
    dependencies.get5yBreakeven().catch(() => []),
    dependencies.getDgs10().catch(() => []),
    dependencies.getDgs2().catch(() => []),
    Promise.all(HISTORY_SYMBOLS.map(async (symbol) => [
      symbol,
      await dependencies.getYahooDailyPrice(symbol).catch(() => []),
    ] as const)),
    market === 'KR' ? dependencies.getKisIndexQuotes().catch(() => ({})) : Promise.resolve({}),
  ]);

  const data = quotes.reduce((acc, quote) => {
    acc[quote.symbol] = { ...quote, source: 'Yahoo', trendReferenceAvailable: true };
    return acc;
  }, {} as Record<string, MacroQuote>);
  if (data['USDKRW=X'] && !data['KRW=X']) data['KRW=X'] = data['USDKRW=X'];
  if (data['KRW=X'] && !data['USDKRW=X']) data['USDKRW=X'] = data['KRW=X'];

  for (const [symbol, kisQuote] of Object.entries(kisIndexQuotes)) {
    if (data[symbol]) {
      data[symbol].regularMarketPrice = kisQuote.regularMarketPrice;
      data[symbol].regularMarketChangePercent = kisQuote.regularMarketChangePercent;
      data[symbol].source = 'KIS';
    } else {
      data[symbol] = {
        symbol,
        regularMarketPrice: kisQuote.regularMarketPrice,
        regularMarketChangePercent: kisQuote.regularMarketChangePercent,
        fiftyDayAverage: kisQuote.regularMarketPrice,
        source: 'KIS',
        trendReferenceAvailable: false,
      };
    }
  }

  const staleSeries = new Set<string>();
  const histories = historyEntries.reduce((acc, [symbol, rows]) => {
    const fresh = freshSeries(rows, now);
    if (rows.length > 0 && fresh.length === 0) staleSeries.add(symbol);
    acc[symbol] = fresh;
    return acc;
  }, {} as Record<string, OHLCData[]>);
  const retainFreshFred = (key: string, rows: FredObservation[]) => {
    const fresh = freshSeries(rows, now);
    if (rows.length > 0 && fresh.length === 0) staleSeries.add(key);
    return fresh;
  };
  const fredData = {
    hyOas: retainFreshFred('hyOas', hyOasRaw),
    breakeven5y: retainFreshFred('breakeven5y', breakeven5yRaw),
    dgs10: retainFreshFred('dgs10', dgs10Raw),
    dgs2: retainFreshFred('dgs2', dgs2Raw),
  };

  const usAssessment = assessUs(data, histories, fredData, fetchedAt, staleSeries);
  const selected = market === 'KR'
    ? assessKorea(data, usAssessment, fetchedAt)
    : usAssessment;
  return {
    market,
    data,
    fetchedAt,
    modelVersion: MACRO_MODEL_VERSION,
    ...selected,
    globalOverlay: market === 'KR' ? usAssessment : null,
  };
}

function responseAsOf(assessment: MacroAssessment) {
  return assessment.observedAt ?? assessment.fetchedAt;
}

export function buildMacroApiResponse(assessment: MacroAssessment): MacroApiResponse {
  const { result } = assessment;
  return {
    data: assessment.data,
    score: result.macroScore,
    rawScore: assessment.rawScore,
    regime: result.regime,
    breakdown: result.breakdown,
    spyAbove50ma: result.spyAbove50ma,
    hygIefDiff: result.hygIefDiff,
    vixLevel: result.vixLevel,
    asOf: responseAsOf(assessment),
    updatedAt: responseAsOf(assessment),
    observedAt: assessment.observedAt,
    fetchedAt: assessment.fetchedAt,
    market: assessment.market,
    decisionStatus: assessment.quality.status,
    quality: assessment.quality,
    modelVersion: assessment.modelVersion,
    globalOverlay: assessment.globalOverlay ? {
      score: assessment.globalOverlay.result.macroScore,
      rawScore: assessment.globalOverlay.rawScore,
      regime: assessment.globalOverlay.result.regime,
      decisionStatus: assessment.globalOverlay.quality.status,
      quality: assessment.globalOverlay.quality,
      observedAt: assessment.globalOverlay.observedAt,
      modelVersion: assessment.modelVersion,
    } : null,
  };
}

export function macroAssessmentHttpStatus(assessment: Pick<MacroAssessment, 'quality'>): 200 | 503 {
  return assessment.quality.status === 'BLOCKED' ? 503 : 200;
}

export function buildMacroSnapshotRow(assessment: MacroAssessment, calcDate: string) {
  if (assessment.quality.status === 'BLOCKED') {
    throw new Error('BLOCKED macro assessment cannot be persisted as a market snapshot.');
  }
  const { result } = assessment;
  return {
    calc_date: calcDate,
    macro_score: result.macroScore,
    regime: result.regime,
    spy_above_50ma: result.spyAbove50ma,
    hyg_ief_diff: result.hygIefDiff,
    vix_level: result.vixLevel,
    trend_score: result.componentScores.trendScore,
    credit_score: result.componentScores.creditScore,
    volatility_score: result.componentScores.volatilityScore,
    dollar_rate_score: result.componentScores.dollarRateScore,
    econ_sensitivity_score: result.componentScores.econSensitivityScore,
    breadth_score: result.componentScores.breadthScore,
    raw_json: {
      market: assessment.market,
      breakdown: result.breakdown,
      componentScores: result.componentScores,
      rawScore: assessment.rawScore,
      modelVersion: assessment.modelVersion,
      observedAt: assessment.observedAt,
      fetchedAt: assessment.fetchedAt,
      quality: assessment.quality,
      globalOverlay: assessment.globalOverlay ? {
        score: assessment.globalOverlay.result.macroScore,
        rawScore: assessment.globalOverlay.rawScore,
        regime: assessment.globalOverlay.result.regime,
        observedAt: assessment.globalOverlay.observedAt,
        quality: assessment.globalOverlay.quality,
      } : null,
    },
  };
}
