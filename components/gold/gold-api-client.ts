import type { DataSourceMeta } from '@/types';
import {
  GOLD_PRODUCT_CODES,
  type GoldApiEnvelope,
  type GoldHistoryResponse,
  type GoldProductCode,
  type GoldSettingsView,
  type GoldSnapshotsResponse,
  type GoldStrategyResponse,
} from '@/lib/gold/api-contract';

type RecordValue = Record<string, unknown>;
type Guard<T> = (value: unknown) => value is T;

export const DEFAULT_GOLD_SETTINGS: GoldSettingsView = {
  coreProduct: '411060',
  tacticalProduct: '132030',
  baseCurrency: 'KRW',
  manualAccountValue: null,
  externalGoldValue: 0,
  physicalGoldValue: 0,
  executionLevels: {},
  riskPaused: false,
  updatedAt: null,
};

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableNumber(value: unknown) {
  return value === null || isFiniteNumber(value);
}

function isNullableString(value: unknown) {
  return value === null || isString(value);
}

function hasNumbers(value: RecordValue, keys: string[]) {
  return keys.every((key) => isFiniteNumber(value[key]));
}

function hasNullableNumbers(value: RecordValue, keys: string[]) {
  return keys.every((key) => isNullableNumber(value[key]));
}

function isProductCode(value: unknown): value is GoldProductCode {
  return isString(value) && GOLD_PRODUCT_CODES.some((code) => code === value);
}

function isExecutionLevels(value: unknown) {
  return isRecord(value)
    && hasNullableNumbers(value, ['support', 'resistance', 'target'])
    && isNullableString(value.updatedAt);
}

function isSettings(value: unknown): value is GoldSettingsView {
  if (!isRecord(value) || !isRecord(value.executionLevels)) return false;
  const validLevels = Object.entries(value.executionLevels).every(
    ([product, levels]) => isProductCode(product) && isExecutionLevels(levels),
  );
  return isProductCode(value.coreProduct)
    && isProductCode(value.tacticalProduct)
    && (value.baseCurrency === 'KRW' || value.baseCurrency === 'USD')
    && isNullableNumber(value.manualAccountValue)
    && hasNumbers(value, ['externalGoldValue', 'physicalGoldValue'])
    && isBoolean(value.riskPaused)
    && isNullableString(value.updatedAt)
    && validLevels;
}

function isQuality(value: unknown) {
  if (!isRecord(value)) return false;
  return ['VALID', 'DEGRADED', 'BLOCKED'].includes(String(value.status))
    && Array.isArray(value.reasons)
    && value.reasons.every(isString)
    && isFiniteNumber(value.priceBars)
    && isNullableString(value.priceAsOf)
    && isBoolean(value.macroComplete)
    && isNullableString(value.wgcPeriod)
    && isNullableNumber(value.wgcAgeDays);
}

function isProductDefinition(value: unknown) {
  if (!isRecord(value)) return false;
  return isProductCode(value.code)
    && isString(value.name)
    && (value.market === 'US' || value.market === 'KR')
    && (value.currency === 'USD' || value.currency === 'KRW')
    && isString(value.yahooTicker)
    && (value.kisExchange === 'AMS' || value.kisExchange === 'KOSPI')
    && ['USD_EXPOSED', 'KRW_UNHEDGED', 'KRW_HEDGED'].includes(String(value.currencyExposure))
    && isString(value.roleHint);
}

function isTechnical(value: unknown) {
  if (!isRecord(value)) return false;
  return hasNullableNumbers(value, [
    'close',
    'ma20',
    'ma50',
    'ma100',
    'ma200',
    'atr14',
    'atrPct',
    'previous20DayHigh',
    'sixMonthEndAverage',
    'latestMonthEndClose',
  ])
    && ['ON', 'OFF', 'UNKNOWN'].includes(String(value.monthEndTrend))
    && isNullableString(value.monthEndSignalEffectiveDate)
    && isBoolean(value.fastBreakout)
    && isNullableString(value.asOf);
}

function isProductAnalysis(value: unknown) {
  if (!isRecord(value)) return false;
  return isProductDefinition(value.product)
    && isTechnical(value.technical)
    && isExecutionLevels(value.executionLevels)
    && isBoolean(value.executionLevelsRequired)
    && isQuality(value.quality)
    && isString(value.provider)
    && isBoolean(value.fallbackUsed);
}

function isDecision(value: unknown) {
  if (!isRecord(value)) return false;
  return ['BLOCKED', 'CORE_REVIEW', 'CORE_ACCUMULATE', 'WAIT', 'TACTICAL_ENTRY', 'PAUSED'].includes(String(value.code))
    && ['label', 'summary', 'coreAction', 'tacticalAction'].every((key) => isString(value[key]));
}

function isAllocation(value: unknown) {
  if (!isRecord(value)) return false;
  return hasNumbers(value, [
    'accountValue',
    'portfolioAccountValue',
    'existingPortfolioGoldValue',
    'externalGoldValue',
    'physicalGoldValue',
    'totalExistingGoldValue',
    'currentExposurePct',
    'coreTargetPct',
    'tacticalTargetPct',
    'totalTargetPct',
    'coreTargetAmount',
    'tacticalTargetAmount',
    'totalTargetAmount',
    'differenceAmount',
    'remainingGoldCapacityAmount',
  ])
    && ['MANUAL', 'PORTFOLIO'].includes(String(value.accountValueSource))
    && ['UNDER', 'ON_TARGET', 'OVER'].includes(String(value.status));
}

function isExecutionPlan(value: unknown) {
  if (!isRecord(value)
    || !Array.isArray(value.buySteps)
    || !Array.isArray(value.sellSteps)
    || !hasNumbers(value, ['buyAmount', 'sellAmount'])
  ) return false;
  return [...value.buySteps, ...value.sellSteps].every((step) => (
    isRecord(step)
    && isFiniteNumber(step.sequence)
    && ['BUY', 'SELL'].includes(String(step.action))
    && ['CORE', 'TACTICAL', 'REDUCE'].includes(String(step.sleeve))
    && isProductCode(step.product)
    && hasNumbers(step, ['amount', 'units', 'percentOfPlan'])
    && isString(step.condition)
    && ['READY', 'WAIT'].includes(String(step.status))
  ));
}

function isMacro(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.components)) return false;
  const componentsValid = value.components.every((component) => {
    if (!isRecord(component)) return false;
    const score = component.score;
    return ['REAL_YIELD', 'BROAD_DOLLAR', 'ETF_FLOW'].includes(String(component.key))
      && isString(component.label)
      && (score === null || score === -1 || score === 0 || score === 1)
      && isNullableNumber(component.value)
      && isNullableNumber(component.change)
      && ['%', 'bp', 'INDEX', 'USD_BILLION', 'TONNES'].includes(String(component.unit))
      && ['%', 'bp', 'TONNES'].includes(String(component.changeUnit))
      && isNullableString(component.asOf)
      && isString(component.interpretation);
  });
  return isNullableNumber(value.score)
    && isBoolean(value.complete)
    && isNullableString(value.frozenAsOf)
    && isFiniteNumber(value.tacticalCapPct)
    && isString(value.reason)
    && componentsValid;
}

function isTacticalPlan(value: unknown) {
  if (!isRecord(value)) return false;
  return isBoolean(value.allowed)
    && hasNullableNumbers(value, ['entryPrice', 'initialStop', 'trailingStop', 'stopDistancePct', 'targetPrice'])
    && hasNumbers(value, ['suggestedAmount', 'suggestedUnits', 'riskBudgetAmount'])
    && ['RISK', 'TACTICAL_CAP', 'TOTAL_GOLD_CAP', 'DATA', 'PAUSED', 'NONE'].includes(String(value.limitingFactor))
    && Array.isArray(value.reasons)
    && value.reasons.every(isString);
}

function isBacktest(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.assumptions) || !Array.isArray(value.strategies)) {
    return false;
  }
  const strategiesValid = value.strategies.every((strategy) => (
    isRecord(strategy)
    && ['BUY_AND_HOLD', 'SIX_MONTH_TREND', 'CORE_TACTICAL'].includes(String(strategy.mode))
    && isString(strategy.label)
    && hasNumbers(strategy, [
      'cagrPct',
      'annualVolatilityPct',
      'maxDrawdownPct',
      'sharpe',
      'averageExposurePct',
    ])
  ));
  return value.status === 'VERIFIED'
    && value.product === 'GLD'
    && isString(value.startDate)
    && isString(value.endDate)
    && isFiniteNumber(value.observations)
    && isFiniteNumber(value.transactionCostPct)
    && isString(value.verifiedAt)
    && value.assumptions.every(isString)
    && strategiesValid;
}

export function isGoldStrategyResponse(value: unknown): value is GoldStrategyResponse {
  if (!isRecord(value)
    || !isRecord(value.policy)
    || !isRecord(value.products)
    || !isRecord(value.corePlan)
    || !isRecord(value.advancedShort)
    || !isRecord(value.referenceScenario)
  ) return false;

  const tranchesValid = Array.isArray(value.corePlan.tranches) && value.corePlan.tranches.every((tranche) => (
    isRecord(tranche)
    && [1, 2, 3].includes(Number(tranche.sequence))
    && isFiniteNumber(tranche.amount)
    && isString(tranche.condition)
    && isBoolean(tranche.ready)
  ));
  const sourcesValid = Array.isArray(value.sources) && value.sources.every((source) => (
    isRecord(source)
    && isString(source.label)
    && isString(source.provider)
    && isNullableString(source.url)
    && isNullableString(source.asOf)
  ));

  return value.modelVersion === 'gold-core-tactical-2026.07-v1'
    && value.releaseStatus === 'RESEARCH_ONLY'
    && isString(value.asOf)
    && value.policy.maxGoldPct === 10
    && value.policy.corePct === 4
    && value.policy.maxTacticalPct === 6
    && value.policy.riskPerTradePct === 0.5
    && value.policy.shortRiskPct === 0.25
    && value.policy.leverageEnabled === false
    && isSettings(value.settings)
    && isDecision(value.decision)
    && isAllocation(value.allocation)
    && isProductAnalysis(value.products.core)
    && isProductAnalysis(value.products.tactical)
    && isMacro(value.macro)
    && isFiniteNumber(value.corePlan.targetAmount)
    && isBoolean(value.corePlan.reviewRequired)
    && Array.isArray(value.corePlan.reviewReasons)
    && value.corePlan.reviewReasons.every(isString)
    && tranchesValid
    && isTacticalPlan(value.tacticalPlan)
    && isExecutionPlan(value.executionPlan)
    && value.advancedShort.visible === true
    && value.advancedShort.executable === false
    && value.advancedShort.riskPct === 0.25
    && isString(value.advancedShort.condition)
    && isString(value.advancedShort.stop)
    && Array.isArray(value.advancedShort.targets)
    && value.advancedShort.targets.every(isString)
    && isBacktest(value.backtest)
    && isQuality(value.quality)
    && value.referenceScenario.instrument === 'XAU/USD'
    && isString(value.referenceScenario.asOf)
    && isString(value.referenceScenario.expiresAt)
    && value.referenceScenario.active === false
    && Array.isArray(value.referenceScenario.support)
    && value.referenceScenario.support.every(isFiniteNumber)
    && Array.isArray(value.referenceScenario.resistance)
    && value.referenceScenario.resistance.every(isFiniteNumber)
    && isFiniteNumber(value.referenceScenario.upsideScenario)
    && isString(value.referenceScenario.note)
    && sourcesValid;
}

export function isGoldHistoryResponse(value: unknown): value is GoldHistoryResponse {
  if (!isRecord(value) || !Array.isArray(value.bars)) return false;
  return isProductDefinition(value.product)
    && value.bars.every((bar) => (
      isRecord(bar)
      && isString(bar.date)
      && hasNumbers(bar, ['open', 'high', 'low', 'close', 'volume'])
    ))
    && isQuality(value.quality)
    && isString(value.provider)
    && isBoolean(value.fallbackUsed);
}

export function isGoldSettingsView(value: unknown): value is GoldSettingsView {
  return isSettings(value);
}

export function isGoldSnapshotsResponse(value: unknown): value is GoldSnapshotsResponse {
  if (!isRecord(value) || !Array.isArray(value.items)) return false;
  return value.items.every((item) => (
    isRecord(item)
    && isString(item.id)
    && isString(item.strategyDate)
    && isProductCode(item.coreProduct)
    && isProductCode(item.tacticalProduct)
    && isDecision(item.decision)
    && isNullableNumber(item.macroScore)
    && hasNumbers(item, ['targetCorePct', 'targetTacticalPct'])
    && ['VALID', 'DEGRADED', 'BLOCKED'].includes(String(item.dataQuality))
    && isString(item.modelVersion)
    && isString(item.inputHash)
    && isString(item.createdAt)
  ));
}

function isDataSourceMeta(value: unknown): value is DataSourceMeta {
  if (!isRecord(value)) return false;
  return isString(value.asOf)
    && isString(value.source)
    && isString(value.provider)
    && ['REALTIME', 'DELAYED_15M', 'EOD', 'UNKNOWN'].includes(String(value.delay))
    && isBoolean(value.fallbackUsed)
    && Array.isArray(value.warnings)
    && value.warnings.every(isString);
}

function errorMessage(payload: unknown, status: number) {
  if (!isRecord(payload)) return `요청에 실패했습니다. (${status})`;
  if (isString(payload.message) && payload.message.trim()) return payload.message;
  return `요청에 실패했습니다. (${status})`;
}

export async function requestGoldApi<T>(
  input: string,
  guard: Guard<T>,
  init?: RequestInit,
): Promise<GoldApiEnvelope<T> | null> {
  const response = await fetch(input, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init?.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(errorMessage(payload, response.status));
  }
  if (!isRecord(payload) || !('data' in payload)) {
    throw new Error('금 전략 API 응답 형식을 확인할 수 없습니다.');
  }
  if (payload.data === null) return null;
  if (!guard(payload.data) || !isDataSourceMeta(payload.meta)) {
    throw new Error('금 전략 API가 유효하지 않은 데이터를 반환했습니다.');
  }
  return { data: payload.data, meta: payload.meta };
}
