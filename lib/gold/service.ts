import type { SupabaseClient } from '@supabase/supabase-js';
import type { OHLCData } from '@/types';
import {
  calculateMacroScoreFromSeries,
  calculateTechnicalIndicators,
  assessGoldDataQuality,
  evaluateGoldStrategy,
} from './engine';
import type {
  GoldDataQuality,
  GoldMacroScore,
  GoldPriceBar,
  GoldTechnicalIndicators,
} from './types';
import {
  GOLD_MODEL_VERSION,
  GOLD_POLICY,
} from './policy';
import {
  GOLD_PRODUCT_DEFINITIONS,
  type GoldBaseCurrency,
  type GoldDataQualityStatus,
  type GoldDecisionView,
  type GoldExecutionLevels,
  type GoldMacroComponentView,
  type GoldProductAnalysisView,
  type GoldProductCode,
  type GoldQualityView,
  type GoldStrategyResponse,
  type GoldTechnicalView,
} from './api-contract';
import {
  loadGoldMacroSeries,
  loadGoldProductHistory,
  loadUsdKrwRate,
  type GoldPriceDataset,
} from './data';
import {
  getGoldStrategySettings,
  getLatestGoldMacroObservation,
  listGoldStrategySnapshots,
  type GoldMacroObservationRecord,
} from './repository';
import {
  DEFAULT_GOLD_SETTINGS,
  GOLD_REFERENCE_SCENARIO,
  mapStoredGoldSettings,
} from './settings';
import {
  convertGoldPortfolio,
  loadGoldPortfolioState,
  type GoldPortfolioState,
} from './portfolio';
import { hashGoldStrategyInputs } from './hash';
import {
  buildSplitExecutionSteps,
  capitalSource,
  resolveCalculationCapital,
} from '@/lib/strategy-execution';
import { GOLD_BACKTEST_VERIFICATION } from './backtest-verification';

export interface GoldStrategyOverrides {
  coreProduct?: GoldProductCode;
  tacticalProduct?: GoldProductCode;
  baseCurrency?: GoldBaseCurrency;
}

export interface GoldStrategyBuild {
  response: GoldStrategyResponse;
  inputs: Record<string, unknown>;
  inputHash: string;
  lastSuccessfulAt: string | null;
}

const EMPTY_PORTFOLIO: GoldPortfolioState = {
  equityByMarket: { US: 0, KR: 0 },
  holdings: [],
};

function unique<T>(values: readonly T[]) {
  return Array.from(new Set(values));
}

function safeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveOrNull(value: unknown) {
  const number = safeNumber(value);
  return number !== null && number > 0 ? number : null;
}

function fixed(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function asProductBars(product: GoldProductCode, bars: OHLCData[]): GoldPriceBar[] {
  return bars.map((bar) => ({ ...bar, product }));
}

function unavailableDataset(product: GoldProductCode, error: unknown): GoldPriceDataset {
  return {
    product: GOLD_PRODUCT_DEFINITIONS[product],
    bars: [],
    provider: 'Unavailable',
    fallbackUsed: true,
    warnings: [
      error instanceof Error
        ? error.message
        : `${product} 가격 공급자를 사용할 수 없습니다.`,
    ],
    attempts: [],
  };
}

async function safeLoadProduct(product: GoldProductCode) {
  try {
    return await loadGoldProductHistory(product, {
      range: '2y',
      targetBars: 260,
      minimumBars: GOLD_POLICY.minimumPriceBars,
    });
  } catch (error) {
    return unavailableDataset(product, error);
  }
}

function wgcAgeDays(asOf: string, observation: GoldMacroObservationRecord | null) {
  if (!observation) return null;
  const match = observation.observationMonth.match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  const monthEnd = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0));
  const evaluation = new Date(`${asOf}T00:00:00Z`);
  return Math.floor((evaluation.getTime() - monthEnd.getTime()) / 86_400_000);
}

function monthlyChanges(
  points: readonly { date: string; value: number }[],
  through: string,
  mode: 'DELTA_BP' | 'RETURN_PCT',
) {
  const byMonth = new Map<string, { date: string; value: number }>();
  const evaluationMonth = through.slice(0, 7);
  for (const point of points) {
    if (
      point.date > through
      || point.date.slice(0, 7) >= evaluationMonth
      || !Number.isFinite(point.value)
    ) continue;
    const month = point.date.slice(0, 7);
    const current = byMonth.get(month);
    if (!current || point.date > current.date) byMonth.set(month, point);
  }
  const values = Array.from(byMonth.values())
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-3);
  if (values.length < 3) return [];
  return values.slice(1).map((point, index) => {
    const previous = values[index];
    if (mode === 'DELTA_BP') return (point.value - previous.value) * 100;
    return previous.value > 0 ? ((point.value / previous.value) - 1) * 100 : Number.NaN;
  });
}

function parseExecutionLevels(
  rawSettings: ReturnType<typeof mapStoredGoldSettings>,
  product: GoldProductCode,
): GoldExecutionLevels {
  const raw = rawSettings.executionLevels[product];
  return {
    support: positiveOrNull(raw?.support),
    resistance: positiveOrNull(raw?.resistance),
    target: positiveOrNull(raw?.target),
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : null,
  };
}

function technicalView(technical: GoldTechnicalIndicators | null): GoldTechnicalView {
  if (!technical) {
    return {
      close: null,
      ma20: null,
      ma50: null,
      ma100: null,
      ma200: null,
      atr14: null,
      atrPct: null,
      previous20DayHigh: null,
      sixMonthEndAverage: null,
      latestMonthEndClose: null,
      monthEndTrend: 'UNKNOWN',
      monthEndSignalEffectiveDate: null,
      fastBreakout: false,
      asOf: null,
    };
  }
  return {
    close: technical.close,
    ma20: technical.ma20,
    ma50: technical.ma50,
    ma100: technical.ma100,
    ma200: technical.ma200,
    atr14: technical.atr14,
    atrPct: technical.atrPct14,
    previous20DayHigh: technical.prior20DayHigh,
    sixMonthEndAverage: technical.monthlyTrend.average6MonthEndClose,
    latestMonthEndClose: technical.monthlyTrend.latestMonthEndClose,
    monthEndTrend:
      technical.monthlyTrend.signal === 'UNAVAILABLE'
        ? 'UNKNOWN'
        : technical.monthlyTrend.signal,
    monthEndSignalEffectiveDate: technical.monthlyTrend.effectiveFrom,
    fastBreakout: technical.breakout20,
    asOf: technical.asOf,
  };
}

function qualityStatus(quality: GoldDataQuality): GoldDataQualityStatus {
  if (quality.status === 'OK') return 'VALID';
  return quality.status;
}

function qualityView(args: {
  quality: GoldDataQuality;
  bars: readonly GoldPriceBar[];
  macro: GoldMacroScore;
  observation: GoldMacroObservationRecord | null;
  asOf: string;
  extraReasons?: string[];
}): GoldQualityView {
  const age = wgcAgeDays(args.asOf, args.observation);
  return {
    status: qualityStatus(args.quality),
    reasons: unique([...args.quality.reasons, ...(args.extraReasons || [])]),
    priceBars: args.bars.length,
    priceAsOf: args.bars.at(-1)?.date || null,
    macroComplete: args.quality.macroComplete && args.macro.complete,
    wgcPeriod: args.observation?.observationMonth.slice(0, 7) || null,
    wgcAgeDays: age,
  };
}

function previousAnalysis(
  previous: GoldStrategyResponse | null,
  product: GoldProductCode,
) {
  if (!previous) return null;
  if (previous.products.core.product.code === product) return previous.products.core;
  if (previous.products.tactical.product.code === product) return previous.products.tactical;
  return null;
}

function productAnalysis(args: {
  product: GoldProductCode;
  dataset: GoldPriceDataset;
  technical: GoldTechnicalIndicators | null;
  quality: GoldQualityView;
  levels: GoldExecutionLevels;
  previous: GoldStrategyResponse | null;
}): GoldProductAnalysisView {
  const fallback = args.dataset.bars.length === 0
    ? previousAnalysis(args.previous, args.product)
    : null;
  return {
    product: GOLD_PRODUCT_DEFINITIONS[args.product],
    technical: fallback?.technical || technicalView(args.technical),
    executionLevels: args.levels,
    executionLevelsRequired:
      args.levels.support === null
      && args.levels.resistance === null
      && args.levels.target === null,
    quality: args.quality,
    provider: fallback ? 'Last successful snapshot' : args.dataset.provider,
    fallbackUsed: args.dataset.fallbackUsed || Boolean(fallback),
  };
}

function macroComponents(
  macro: GoldMacroScore,
  macroSeries: Awaited<ReturnType<typeof loadGoldMacroSeries>>,
  observation: GoldMacroObservationRecord | null,
): GoldMacroComponentView[] {
  const realLatest = macroSeries.realYield.at(-1)?.value ?? null;
  const dollarLatest = macroSeries.broadDollar.at(-1)?.value ?? null;
  return [
    {
      key: 'REAL_YIELD',
      label: '미국 10년 실질금리',
      score: macro.components.realYield,
      value: realLatest,
      change: macro.inputs.realYield20DayChangeBp,
      unit: '%',
      changeUnit: 'bp',
      asOf: macro.inputs.realYieldAsOf || null,
      interpretation:
        macro.components.realYield === null
          ? '입력 누락'
          : `20거래일 변화 ${macro.inputs.realYield20DayChangeBp?.toFixed(1)}bp`,
    },
    {
      key: 'BROAD_DOLLAR',
      label: '광의 달러지수',
      score: macro.components.broadDollar,
      value: dollarLatest,
      change: macro.inputs.broadDollar20DayChangePct,
      unit: 'INDEX',
      changeUnit: '%',
      asOf: macro.inputs.broadDollarAsOf || null,
      interpretation:
        macro.components.broadDollar === null
          ? '입력 누락'
          : `20거래일 변화 ${macro.inputs.broadDollar20DayChangePct?.toFixed(2)}%`,
    },
    {
      key: 'ETF_FLOW',
      label: '글로벌 금 ETF 월간 흐름',
      score: macro.components.goldEtfFlow,
      value: observation ? observation.etfNetFlowUsd / 1_000_000_000 : null,
      change: observation?.holdingsChangeTonnes ?? null,
      unit: 'USD_BILLION',
      changeUnit: 'TONNES',
      asOf: observation?.observationMonth.slice(0, 7) || null,
      interpretation:
        macro.components.goldEtfFlow === null
          ? '승인 입력 누락 또는 지연'
          : `${observation?.etfFlowDirection || 'UNKNOWN'} · 보유량 ${observation?.holdingsChangeTonnes ?? '--'}t`,
    },
  ];
}

function decisionView(args: {
  engineDecision: ReturnType<typeof evaluateGoldStrategy>['decision'];
  overallQuality: GoldQualityView;
  reasons: readonly string[];
}): GoldDecisionView {
  if (args.overallQuality.status === 'BLOCKED') {
    return {
      code: 'BLOCKED',
      label: '데이터 확인 필요',
      summary: args.overallQuality.reasons.join(' ') || '상품 가격을 검증할 수 없습니다.',
      coreAction: '상품 OHLC 검증 전 신규 매수 대기',
      tacticalAction: '차단',
    };
  }
  const summary = args.reasons.slice(-2).join(' ') || '규칙 기반 신호를 계산했습니다.';
  switch (args.engineDecision) {
    case 'RISK_PAUSED':
      return {
        code: 'PAUSED',
        label: '위험 투입 일시중지',
        summary,
        coreAction: '기존 보유 유지·설정 재검토',
        tacticalAction: '신규 진입 차단',
      };
    case 'CORE_REVIEW':
      return {
        code: 'CORE_REVIEW',
        label: '코어 비중 검토 필요',
        summary,
        coreAction: '자동 매도 없이 구조적 수요 재검토',
        tacticalAction: '대기',
      };
    case 'TREND_ENTRY':
    case 'FAST_REENTRY':
      return {
        code: 'TACTICAL_ENTRY',
        label: args.engineDecision === 'FAST_REENTRY' ? '전술 절반 진입 조건 충족' : '추세 진입 조건 충족',
        summary,
        coreAction: '4% 코어 한도 유지',
        tacticalAction: args.engineDecision === 'FAST_REENTRY' ? '전술 최대 3%' : '매크로 한도 내 진입',
      };
    case 'CORE_ONLY':
      return {
        code: 'CORE_ACCUMULATE',
        label: '코어 분할 매수·전술 대기',
        summary,
        coreAction: '4% 목표를 3회 분할',
        tacticalAction: '0%',
      };
    case 'WAIT':
      return {
        code: 'WAIT',
        label: '기존 코어 유지·전술 대기',
        summary,
        coreAction: '4% 한도 유지',
        tacticalAction: '신규 진입 없음',
      };
    default:
      return {
        code: 'BLOCKED',
        label: '전략 계산 차단',
        summary,
        coreAction: '대기',
        tacticalAction: '차단',
      };
  }
}

function worstQuality(
  core: GoldQualityView,
  tactical: GoldQualityView,
  portfolioWarnings: string[],
): GoldQualityView {
  const status: GoldDataQualityStatus =
    core.status === 'BLOCKED' || tactical.status === 'BLOCKED'
      ? 'BLOCKED'
      : core.status === 'DEGRADED' || tactical.status === 'DEGRADED'
        ? 'DEGRADED'
        : 'VALID';
  const priceDates = [core.priceAsOf, tactical.priceAsOf]
    .filter((value): value is string => Boolean(value))
    .sort();
  return {
    status,
    reasons: unique([...core.reasons, ...tactical.reasons, ...portfolioWarnings]),
    priceBars: Math.min(core.priceBars, tactical.priceBars),
    priceAsOf: priceDates[0] || null,
    macroComplete: core.macroComplete && tactical.macroComplete,
    wgcPeriod: tactical.wgcPeriod || core.wgcPeriod,
    wgcAgeDays: tactical.wgcAgeDays ?? core.wgcAgeDays,
  };
}

function storedPreviousResponse(value: unknown): GoldStrategyResponse | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<GoldStrategyResponse>;
  return candidate.modelVersion === GOLD_MODEL_VERSION
    && candidate.products
    && candidate.decision
    ? candidate as GoldStrategyResponse
    : null;
}

export async function buildGoldStrategyForOwner(args: {
  client: SupabaseClient;
  ownerId: string;
  overrides?: GoldStrategyOverrides;
  now?: Date;
}): Promise<GoldStrategyBuild> {
  const now = args.now || new Date();
  const asOfDate = now.toISOString().slice(0, 10);

  const [
    settingsResult,
    macroObservationResult,
    macroSeries,
    portfolioResult,
    usdKrwRate,
    previousRows,
  ] = await Promise.all([
    getGoldStrategySettings({ client: args.client, ownerId: args.ownerId }),
    getLatestGoldMacroObservation({ client: args.client, ownerId: args.ownerId }),
    loadGoldMacroSeries(),
    loadGoldPortfolioState({ client: args.client, ownerId: args.ownerId })
      .then((state) => ({ state, warning: null as string | null }))
      .catch((error) => ({
        state: EMPTY_PORTFOLIO,
        warning: error instanceof Error ? error.message : '포트폴리오 데이터를 읽지 못했습니다.',
      })),
    loadUsdKrwRate().catch(() => null),
    listGoldStrategySnapshots({
      client: args.client,
      ownerId: args.ownerId,
      limit: 1,
    }).catch(() => []),
  ]);

  const storedSettings = mapStoredGoldSettings(settingsResult);
  const settings = {
    ...DEFAULT_GOLD_SETTINGS,
    ...storedSettings,
    ...args.overrides,
  };
  const previousRecord = previousRows[0] || null;
  const previous = storedPreviousResponse(previousRecord?.result);

  const requestedProducts = unique<GoldProductCode>([
    settings.coreProduct,
    settings.tacticalProduct,
    ...portfolioResult.state.holdings.map((holding) => holding.product),
  ]);
  const loaded = await Promise.all(
    requestedProducts.map(async (product) => [product, await safeLoadProduct(product)] as const),
  );
  const datasets = new Map(loaded);

  const priceMap: Partial<Record<GoldProductCode, number>> = {};
  for (const product of requestedProducts) {
    const live = datasets.get(product)?.bars.at(-1)?.close;
    const cached = previousAnalysis(previous, product)?.technical.close;
    const price = positiveOrNull(live) ?? positiveOrNull(cached);
    if (price !== null) priceMap[product] = price;
  }

  const portfolio = convertGoldPortfolio({
    state: portfolioResult.state,
    baseCurrency: settings.baseCurrency,
    usdKrwRate,
    prices: priceMap,
  });
  const portfolioWarnings = [
    ...(portfolioResult.warning ? [portfolioResult.warning] : []),
    ...portfolio.warnings,
  ];
  const accountValue = resolveCalculationCapital(
    portfolio.accountValue,
    settings.manualAccountValue,
  );
  const externalGoldValue = settings.externalGoldValue;
  const physicalGoldValue = settings.physicalGoldValue;
  const totalExistingGoldValue =
    portfolio.existingGoldValue + externalGoldValue + physicalGoldValue;
  const existingCoreValue =
    (portfolio.productValues[settings.coreProduct] || 0)
    + externalGoldValue
    + physicalGoldValue;
  const existingTacticalValue =
    settings.tacticalProduct === settings.coreProduct
      ? 0
      : portfolio.productValues[settings.tacticalProduct] || 0;

  const observationMonth = macroObservationResult?.observationMonth.slice(0, 7) || null;
  const macro = calculateMacroScoreFromSeries({
    asOf: asOfDate,
    realYield: macroSeries.realYield,
    broadDollar: macroSeries.broadDollar,
    goldEtfNetFlow: macroObservationResult?.etfNetFlowUsd ?? null,
    etfReferenceMonth: observationMonth,
  });
  const cutoff = macro.weeklyCutoff || asOfDate;
  const centralBankWeakening =
    !macroObservationResult
    || macroObservationResult.centralBankDemandStatus === 'UNKNOWN'
      ? null
      : macroObservationResult.centralBankDemandStatus === 'WEAKENING';
  const coreReviewInput = {
    realYieldMonthlyChangesBp: monthlyChanges(macroSeries.realYield, cutoff, 'DELTA_BP'),
    broadDollarMonthlyChangesPct: monthlyChanges(macroSeries.broadDollar, cutoff, 'RETURN_PCT'),
    etfDemandWeakening:
      macroObservationResult ? macroObservationResult.etfFlowDirection === 'OUTFLOW' : null,
    centralBankDemandWeakening: centralBankWeakening,
  };

  const coreDataset =
    datasets.get(settings.coreProduct)
    || unavailableDataset(settings.coreProduct, '코어 상품 데이터 누락');
  const tacticalDataset =
    datasets.get(settings.tacticalProduct)
    || unavailableDataset(settings.tacticalProduct, '전술 상품 데이터 누락');
  const coreBars = asProductBars(settings.coreProduct, coreDataset.bars);
  const tacticalBars = asProductBars(settings.tacticalProduct, tacticalDataset.bars);

  const fxRateToBase =
    GOLD_PRODUCT_DEFINITIONS[settings.tacticalProduct].currency === settings.baseCurrency
      ? 1
      : settings.baseCurrency === 'KRW'
        ? usdKrwRate
        : usdKrwRate
          ? 1 / usdKrwRate
          : null;
  const engine = evaluateGoldStrategy({
    product: settings.tacticalProduct,
    bars: tacticalBars,
    macro,
    asOf: asOfDate,
    accountEquity: accountValue,
    baseCurrency: settings.baseCurrency,
    fxRateToBase,
    existingGoldValue: portfolio.existingGoldValue + externalGoldValue,
    existingCoreValue,
    existingTacticalValue,
    externalPhysicalGoldValue: physicalGoldValue,
    riskPaused: settings.riskPaused,
    coreReview: coreReviewInput,
  });

  const coreQualityRaw = assessGoldDataQuality({
    product: settings.coreProduct,
    bars: coreBars,
    macro,
    asOf: asOfDate,
  });
  const coreTechnical = coreQualityRaw.priceComplete
    ? calculateTechnicalIndicators(coreBars)
    : null;
  const coreQuality = qualityView({
    quality: coreQualityRaw,
    bars: coreBars,
    macro,
    observation: macroObservationResult,
    asOf: asOfDate,
    extraReasons: coreDataset.warnings,
  });
  const tacticalQuality = qualityView({
    quality: engine.quality,
    bars: tacticalBars,
    macro,
    observation: macroObservationResult,
    asOf: asOfDate,
    extraReasons: tacticalDataset.warnings,
  });
  const overallQuality = worstQuality(coreQuality, tacticalQuality, portfolioWarnings);

  const coreLevels = parseExecutionLevels(settings, settings.coreProduct);
  const tacticalLevels = parseExecutionLevels(settings, settings.tacticalProduct);
  const coreAnalysis = productAnalysis({
    product: settings.coreProduct,
    dataset: coreDataset,
    technical: coreTechnical,
    quality: coreQuality,
    levels: coreLevels,
    previous,
  });
  const tacticalAnalysis = productAnalysis({
    product: settings.tacticalProduct,
    dataset: tacticalDataset,
    technical: engine.technical,
    quality: tacticalQuality,
    levels: tacticalLevels,
    previous,
  });
  const decision = decisionView({
    engineDecision: engine.decision,
    overallQuality,
    reasons: engine.reasons,
  });

  const targetCorePct = engine.allocation.coreTargetPct * 100;
  const targetTacticalPct = engine.allocation.tacticalTargetPct * 100;
  const targetTotalPct = engine.allocation.totalTargetPct * 100;
  const totalTargetAmount = engine.allocation.totalTargetValue;
  const differenceAmount = totalTargetAmount - totalExistingGoldValue;
  const tolerance = Math.max(accountValue * 0.001, 1);
  const coreRemaining = Math.max(engine.allocation.coreTargetValue - existingCoreValue, 0);
  const trancheAmount = fixed(coreRemaining / GOLD_POLICY.coreTranches);
  const coreReady = coreQuality.status !== 'BLOCKED' && !settings.riskPaused;
  const position = engine.position;
  const tacticalAllowed =
    (engine.decision === 'TREND_ENTRY' || engine.decision === 'FAST_REENTRY')
    && overallQuality.status === 'VALID'
    && !settings.riskPaused;
  const coreTranches = [
    {
      sequence: 1 as const,
      amount: trancheAmount,
      condition: coreLevels.support
        ? `${coreLevels.support} 부근에서 1차 분할`
        : '현재 가격대 1차 분할 · 상품별 지지 입력 필요',
      ready: coreReady && coreRemaining > 0,
    },
    {
      sequence: 2 as const,
      amount: trancheAmount,
      condition: '추가 하락 시 2차 분할 · 상품별 2차 지지 확인',
      ready: coreReady && coreRemaining > 0,
    },
    {
      sequence: 3 as const,
      amount: fixed(Math.max(coreRemaining - (trancheAmount * 2), 0)),
      condition: coreLevels.resistance
        ? `${coreLevels.resistance} 종가 돌파 또는 추가 지지 확인 중 먼저 충족`
        : '상품별 지지·저항 입력 후 3차 분할',
      ready: coreReady && coreRemaining > 0,
    },
  ];
  const productUnitPriceInBase = (product: GoldProductCode, close: number | null) => {
    if (close === null || close <= 0) return null;
    const productCurrency = GOLD_PRODUCT_DEFINITIONS[product].currency;
    if (productCurrency === settings.baseCurrency) return close;
    if (!usdKrwRate || usdKrwRate <= 0) return null;
    return settings.baseCurrency === 'KRW' ? close * usdKrwRate : close / usdKrwRate;
  };
  const precision = settings.baseCurrency === 'KRW' ? 0 : 2;
  const coreBuySteps = coreTranches
    .filter((tranche) => tranche.amount > 0)
    .map((tranche) => ({
      sequence: tranche.sequence,
      action: 'BUY' as const,
      sleeve: 'CORE' as const,
      product: settings.coreProduct,
      amount: tranche.amount,
      units: (() => {
        const unitPrice = productUnitPriceInBase(
          settings.coreProduct,
          coreAnalysis.technical.close,
        );
        return unitPrice ? Math.floor(tranche.amount / unitPrice) : 0;
      })(),
      percentOfPlan: coreRemaining > 0
        ? fixed((tranche.amount / coreRemaining) * 100)
        : 0,
      condition: tranche.condition,
      status: tranche.ready ? 'READY' as const : 'WAIT' as const,
    }));
  const tacticalBuySteps = buildSplitExecutionSteps({
    action: 'BUY',
    sleeve: 'TACTICAL',
    product: settings.tacticalProduct,
    totalAmount: position?.actualNotional ?? 0,
    weights: [0.5, 0.5],
    unitPriceInBase: productUnitPriceInBase(
      settings.tacticalProduct,
      tacticalAnalysis.technical.close,
    ),
    conditions: [
      `1차: ${settings.tacticalProduct} 진입 조건 충족 종가에서 전술 계획의 50%`,
      '2차: 월말 6개월 추세 ON 확인 후 잔여 50%',
    ],
    ready: tacticalAllowed,
    precision,
  }).map((step) => ({ ...step, product: settings.tacticalProduct }));
  const sellAmount = Math.max(totalExistingGoldValue - totalTargetAmount, 0);
  const sellProduct = existingTacticalValue > 0
    ? settings.tacticalProduct
    : settings.coreProduct;
  const sellAnalysis = sellProduct === settings.tacticalProduct
    ? tacticalAnalysis
    : coreAnalysis;
  const sellSteps = buildSplitExecutionSteps({
    action: 'SELL',
    sleeve: 'REDUCE',
    product: sellProduct,
    totalAmount: sellAmount,
    weights: [0.5, 0.3, 0.2],
    unitPriceInBase: productUnitPriceInBase(
      sellProduct,
      sellAnalysis.technical.close,
    ),
    conditions: [
      '1차: 목표 비중 초과분의 50%를 다음 거래 가능 시점에 축소',
      '2차: 2ATR 추적 손절 또는 추가 약세 확인 시 30% 축소',
      '3차: 월말 추세 OFF가 유지되면 잔여 20% 축소',
    ],
    ready: overallQuality.status !== 'BLOCKED',
    precision,
  }).map((step) => ({ ...step, product: sellProduct }));
  const buySteps = [...coreBuySteps, ...tacticalBuySteps];

  const response: GoldStrategyResponse = {
    modelVersion: GOLD_MODEL_VERSION,
    releaseStatus: 'RESEARCH_ONLY',
    asOf: now.toISOString(),
    policy: {
      maxGoldPct: 10,
      corePct: 4,
      maxTacticalPct: 6,
      riskPerTradePct: 0.5,
      shortRiskPct: 0.25,
      leverageEnabled: false,
    },
    settings: {
      ...settings,
      updatedAt: storedSettings.updatedAt,
    },
    decision,
    allocation: {
      accountValue,
      portfolioAccountValue: portfolio.accountValue,
      accountValueSource: capitalSource(settings.manualAccountValue),
      existingPortfolioGoldValue: portfolio.existingGoldValue,
      externalGoldValue,
      physicalGoldValue,
      totalExistingGoldValue,
      currentExposurePct:
        accountValue > 0
          ? fixed((totalExistingGoldValue / accountValue) * 100)
          : 0,
      coreTargetPct: targetCorePct,
      tacticalTargetPct: targetTacticalPct,
      totalTargetPct: targetTotalPct,
      coreTargetAmount: engine.allocation.coreTargetValue,
      tacticalTargetAmount: engine.allocation.tacticalTargetValue,
      totalTargetAmount,
      differenceAmount,
      remainingGoldCapacityAmount: Math.max(
        (accountValue * GOLD_POLICY.maxGoldPct) - totalExistingGoldValue,
        0,
      ),
      status:
        Math.abs(differenceAmount) <= tolerance
          ? 'ON_TARGET'
          : differenceAmount > 0
            ? 'UNDER'
            : 'OVER',
    },
    products: {
      core: coreAnalysis,
      tactical: tacticalAnalysis,
    },
    macro: {
      score: macro.score,
      complete: macro.complete && tacticalQuality.macroComplete,
      frozenAsOf: macro.weeklyCutoff,
      components: macroComponents(macro, macroSeries, macroObservationResult),
      tacticalCapPct: macro.complete ? macro.tacticalLimitPct * 100 : 0,
      reason:
        macro.complete && tacticalQuality.macroComplete
          ? `완전한 매크로 점수 ${macro.score! >= 0 ? '+' : ''}${macro.score}`
          : '입력 누락 또는 지연으로 전술 비중을 0%로 차단했습니다.',
    },
    corePlan: {
      targetAmount: engine.allocation.coreTargetValue,
      reviewRequired: engine.coreReview.shouldReview,
      reviewReasons: [...engine.coreReview.reasons],
      tranches: coreTranches,
    },
    tacticalPlan: {
      allowed: tacticalAllowed,
      entryPrice: position?.entryPrice ?? tacticalLevels.resistance,
      initialStop: position?.stopPrice ?? null,
      trailingStop: position?.trailingStopPrice ?? null,
      stopDistancePct: position ? position.stopDistancePct * 100 : null,
      targetPrice: tacticalLevels.target,
      suggestedAmount: position?.actualNotional ?? 0,
      suggestedUnits: position?.units ?? 0,
      riskBudgetAmount: position?.riskBudget ?? accountValue * GOLD_POLICY.defaultRiskPct,
      limitingFactor:
        settings.riskPaused
          ? 'PAUSED'
          : overallQuality.status !== 'VALID'
            ? 'DATA'
            : position?.bindingLimit || 'NONE',
      reasons: [...engine.reasons],
    },
    executionPlan: {
      buySteps,
      sellSteps,
      buyAmount: fixed(buySteps.reduce((sum, step) => sum + step.amount, 0)),
      sellAmount: fixed(sellSteps.reduce((sum, step) => sum + step.amount, 0)),
    },
    advancedShort: {
      visible: true,
      executable: false,
      riskPct: 0.25,
      condition: tacticalLevels.support
        ? `${settings.tacticalProduct} 일봉이 ${tacticalLevels.support} 아래 마감하고 매크로 점수가 -1 이하일 때의 연구 시나리오`
        : '상품별 지지 레벨 입력 후 하향 종가 이탈을 검토하는 연구 시나리오',
      stop: tacticalLevels.resistance
        ? `${tacticalLevels.resistance} 또는 진입가 위 2ATR`
        : '진입가 위 2ATR · 상품별 저항 입력 필요',
      targets: tacticalLevels.target
        ? [`${tacticalLevels.target}`, '추가 목표는 운영자 검토']
        : ['상품별 목표 입력 필요'],
    },
    backtest: GOLD_BACKTEST_VERIFICATION,
    quality: overallQuality,
    referenceScenario: GOLD_REFERENCE_SCENARIO,
    sources: [
      {
        label: `${settings.coreProduct} 자체 OHLC`,
        provider: coreAnalysis.provider,
        url: null,
        asOf: coreAnalysis.technical.asOf,
      },
      {
        label: `${settings.tacticalProduct} 자체 OHLC`,
        provider: tacticalAnalysis.provider,
        url: null,
        asOf: tacticalAnalysis.technical.asOf,
      },
      {
        label: '미국 10년 실질금리 DFII10',
        provider: 'FRED',
        url: 'https://fred.stlouisfed.org/series/DFII10',
        asOf: macro.inputs.realYieldAsOf || null,
      },
      {
        label: '광의 달러지수 DTWEXBGS',
        provider: 'FRED',
        url: 'https://fred.stlouisfed.org/series/DTWEXBGS',
        asOf: macro.inputs.broadDollarAsOf || null,
      },
      {
        label: '글로벌 금 ETF 월간 승인 집계',
        provider: 'World Gold Council · operator approved',
        url: macroObservationResult?.sourceUrl || null,
        asOf: observationMonth,
      },
    ],
  };

  const inputs: Record<string, unknown> = {
    modelVersion: GOLD_MODEL_VERSION,
    evaluatedAsOfDate: asOfDate,
    settings: response.settings,
    portfolio: {
      state: portfolioResult.state,
      converted: portfolio,
      usdKrwRate,
    },
    prices: Object.fromEntries(
      [settings.coreProduct, settings.tacticalProduct].map((product) => [
        product,
        {
          provider: datasets.get(product)?.provider,
          bars: asProductBars(product, datasets.get(product)?.bars || []),
        },
      ]),
    ),
    macro: {
      score: macro,
      observation: macroObservationResult,
    },
  };

  return {
    response,
    inputs,
    inputHash: hashGoldStrategyInputs(inputs),
    lastSuccessfulAt: previousRecord?.observedAt || null,
  };
}
