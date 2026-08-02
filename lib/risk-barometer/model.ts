import type {
  RiskBarometerBand,
  RiskBarometerIndicator,
  RiskBarometerIndicatorKey,
  RiskBarometerMethod,
  RiskBarometerResponse,
} from '@/types';

export const RISK_BAROMETER_MODEL_VERSION = 'ai-fomo-us-2026.07-v1' as const;
export const RISK_BAROMETER_MODEL_STATUS = 'RESEARCH_ONLY' as const;
export const RISK_BAROMETER_TOTAL = 10 as const;

export interface RiskBarometerDefinition {
  key: RiskBarometerIndicatorKey;
  label: string;
  unit: string;
  threshold: string;
  method: RiskBarometerMethod;
  provider: string;
  sourceUrl: string;
  freshnessHours: number;
}

export const RISK_BAROMETER_DEFINITIONS: readonly RiskBarometerDefinition[] = [
  {
    key: 'sp500_concentration',
    label: 'S&P 500 집중도',
    unit: '%',
    threshold: '상위 10개 시가총액 비중 ≥ 27%',
    method: 'PROXY',
    provider: 'StockAnalysis + Yahoo Finance',
    sourceUrl: 'https://www.spglobal.com/spdji/en/indices/equity/sp-500/',
    freshnessHours: 36,
  },
  {
    key: 'household_equity_exposure',
    label: '가계 주식 노출',
    unit: '%',
    threshold: '가계 순자산 대비 주식 비중 ≥ 30%',
    method: 'DIRECT',
    provider: 'FRED / Federal Reserve Z.1',
    sourceUrl: 'https://fred.stlouisfed.org/series/BOGZ1FL153064476Q',
    freshnessHours: 120 * 24,
  },
  {
    key: 'margin_debt',
    label: '마진 부채',
    unit: 'USD',
    threshold: '고객 마진계좌 차입 잔액 ≥ $1T',
    method: 'MANUAL',
    provider: 'FINRA',
    sourceUrl: 'https://www.finra.org/rules-guidance/key-topics/margin-accounts/margin-statistics',
    freshnessHours: 45 * 24,
  },
  {
    key: 'market_participation',
    label: '시장 참여도',
    unit: '%p',
    threshold: 'SPY 20일 상승 중 200일선 상회율 10%p 이상 하락',
    method: 'PROXY',
    provider: 'MTN RS batch + Yahoo Finance',
    sourceUrl: 'https://finance.yahoo.com/quote/SPY/history/',
    freshnessHours: 36,
  },
  {
    key: 'valuation_driven_returns',
    label: '밸류에이션 주도 수익',
    unit: '%',
    threshold: 'AI 리더 12개월 양(+) 수익 중 밸류에이션 기여 ≥ 50%',
    method: 'PROXY',
    provider: 'SEC EDGAR + Yahoo Finance',
    sourceUrl: 'https://www.sec.gov/search-filings/edgar-application-programming-interfaces',
    freshnessHours: 110 * 24,
  },
  {
    key: 'hyperscaler_fcf',
    label: '하이퍼스케일러 FCF',
    unit: 'USD',
    threshold: '4개사 합산 TTM FCF가 전년 대비 감소',
    method: 'PROXY',
    provider: 'SEC EDGAR Company Facts',
    sourceUrl: 'https://www.sec.gov/search-filings/edgar-application-programming-interfaces',
    freshnessHours: 110 * 24,
  },
  {
    key: 'hyperscaler_leverage',
    label: '하이퍼스케일러 레버리지',
    unit: 'multiple / %',
    threshold: '이자보상배율 < 10배 또는 순부채/시총 > 10%',
    method: 'PROXY',
    provider: 'SEC EDGAR + Yahoo Finance',
    sourceUrl: 'https://www.sec.gov/search-filings/edgar-application-programming-interfaces',
    freshnessHours: 110 * 24,
  },
  {
    key: 'corporate_cross_holdings',
    label: '기업간 주식보유',
    unit: '%',
    threshold: '기업 보유 주식자산 / 전체 주식자산 ≥ 10%',
    method: 'DIRECT',
    provider: 'FRED / Federal Reserve Z.1',
    sourceUrl: 'https://fred.stlouisfed.org/',
    freshnessHours: 120 * 24,
  },
  {
    key: 'capital_market_frenzy',
    label: '자본시장 과열',
    unit: '%',
    threshold: '최근 12개월 IPO 조달액 / 미국 주식 시총 > 0.75%',
    method: 'MANUAL',
    provider: 'SIFMA',
    sourceUrl: 'https://www.sifma.org/research/statistics/us-equity-and-related-securities-statistics',
    freshnessHours: 45 * 24,
  },
  {
    key: 'equity_risk_premium',
    label: '주식 위험 프리미엄',
    unit: '%',
    threshold: '1 / Forward P/E − 미국 10년물 금리 < 0%',
    method: 'MANUAL',
    provider: 'Approved Forward P/E + FRED DGS10',
    sourceUrl: 'https://fred.stlouisfed.org/series/DGS10',
    freshnessHours: 7 * 24,
  },
] as const;

export interface RiskIndicatorInput {
  key: RiskBarometerIndicatorKey;
  value: number | null;
  displayValue?: string;
  triggered: boolean | null;
  observedAt: string | null;
  detail?: string;
  method?: RiskBarometerMethod;
  provider?: string;
  sourceUrl?: string;
  freshnessHours?: number;
}

export interface RiskThresholdContext {
  spyReturn20d?: number | null;
  priorValue?: number | null;
  interestCoverage?: number | null;
  netDebtToMarketCapPct?: number | null;
}

export function evaluateRiskThreshold(
  key: RiskBarometerIndicatorKey,
  value: number,
  context: RiskThresholdContext = {},
) {
  if (key === 'sp500_concentration') return value >= 27;
  if (key === 'household_equity_exposure') return value >= 30;
  if (key === 'margin_debt') return value >= 1_000_000_000_000;
  if (key === 'market_participation') {
    return typeof context.spyReturn20d === 'number'
      ? context.spyReturn20d > 0 && value <= -10
      : null;
  }
  if (key === 'valuation_driven_returns') return value >= 50;
  if (key === 'hyperscaler_fcf') {
    return typeof context.priorValue === 'number' ? value < context.priorValue : null;
  }
  if (key === 'hyperscaler_leverage') {
    const interestRisk = typeof context.interestCoverage === 'number'
      ? context.interestCoverage < 10
      : false;
    const debtRisk = typeof context.netDebtToMarketCapPct === 'number'
      ? context.netDebtToMarketCapPct > 10
      : false;
    return context.interestCoverage === undefined && context.netDebtToMarketCapPct === undefined
      ? null
      : interestRisk || debtRisk;
  }
  if (key === 'corporate_cross_holdings') return value >= 10;
  if (key === 'capital_market_frenzy') return value > 0.75;
  if (key === 'equity_risk_premium') return value < 0;
  return null;
}

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function ageHours(observedAt: string | null, asOf: string) {
  if (!observedAt) return null;
  const observed = new Date(observedAt).getTime();
  const current = new Date(asOf).getTime();
  if (!Number.isFinite(observed) || !Number.isFinite(current)) return null;
  return Math.max(0, round((current - observed) / 3_600_000, 1));
}

export function bandForScore(score: number | null): RiskBarometerBand {
  if (score === null) return 'UNAVAILABLE';
  if (score < 3) return 'LOW';
  if (score < 7) return 'CAUTION';
  return 'HIGH';
}

export function scoreToGaugeAngle(score: number | null) {
  const normalized = score === null ? 0 : Math.max(0, Math.min(10, score));
  return -90 + normalized * 18;
}

export function computeRiskBarometer(
  inputs: RiskIndicatorInput[],
  options: { asOf?: string } = {},
): RiskBarometerResponse {
  const asOf = options.asOf || new Date().toISOString();
  const byKey = new Map(inputs.map((input) => [input.key, input]));

  const indicators = RISK_BAROMETER_DEFINITIONS.map((definition): RiskBarometerIndicator => {
    const input = byKey.get(definition.key);
    const limitHours = input?.freshnessHours ?? definition.freshnessHours;
    const currentAgeHours = ageHours(input?.observedAt ?? null, asOf);
    const stale = currentAgeHours === null || currentAgeHours > limitHours;
    const status = !input || input.triggered === null || input.value === null || stale
      ? 'UNKNOWN'
      : input.triggered
        ? 'TRIGGERED'
        : 'SAFE';

    return {
      key: definition.key,
      label: definition.label,
      value: input?.value ?? null,
      displayValue: input?.displayValue ?? '확인 불가',
      unit: definition.unit,
      threshold: definition.threshold,
      status,
      contribution: status === 'TRIGGERED' ? 1 : 0,
      method: input?.method ?? definition.method,
      provider: input?.provider ?? definition.provider,
      sourceUrl: input?.sourceUrl ?? definition.sourceUrl,
      observedAt: input?.observedAt ?? null,
      freshness: {
        limitHours,
        ageHours: currentAgeHours,
        stale,
      },
      detail: input?.detail ?? (stale ? '신선도 한도를 초과했거나 관측값이 없습니다.' : ''),
    };
  });

  const validIndicators = indicators.filter((indicator) => indicator.status !== 'UNKNOWN');
  const rawScore = validIndicators.reduce((sum, indicator) => sum + indicator.contribution, 0);
  const coverage = validIndicators.length;
  const quality = coverage === RISK_BAROMETER_TOTAL
    ? 'VALID'
    : coverage >= 8
      ? 'DEGRADED'
      : 'BLOCKED';
  const score = quality === 'BLOCKED'
    ? null
    : quality === 'VALID'
      ? rawScore
      : round((rawScore / coverage) * RISK_BAROMETER_TOTAL, 1);

  return {
    score,
    rawScore,
    band: bandForScore(score),
    quality,
    coverage: { valid: coverage, total: RISK_BAROMETER_TOTAL },
    asOf,
    modelVersion: RISK_BAROMETER_MODEL_VERSION,
    modelStatus: RISK_BAROMETER_MODEL_STATUS,
    indicators,
  };
}

export function emptyRiskBarometer(asOf = new Date().toISOString()) {
  return computeRiskBarometer([], { asOf });
}
