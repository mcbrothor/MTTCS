import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateNasdaqStrategy } from './engine';
import {
  loadNasdaqAdjustedHistory,
  loadNasdaqExecutionHistory,
  loadUsdKrwRate,
  type NasdaqPriceDataset,
} from './data';
import { hashNasdaqStrategyInputs } from './hash';
import { NASDAQ_BACKTEST_VERIFICATION } from './backtest-verification';
import { convertNasdaqPortfolio, loadNasdaqPortfolioState } from './portfolio';
import {
  DEFAULT_NASDAQ_SETTINGS,
  NASDAQ_MODEL_VERSION,
  NASDAQ_POLICY,
  NASDAQ_PRODUCTS,
} from './policy';
import {
  getNasdaqSettings,
  listNasdaqProductMetadata,
} from './repository';
import { mapStoredNasdaqSettings } from './settings';
import {
  buildSplitExecutionSteps,
  capitalSource,
  resolveCalculationCapital,
  type StrategyExecutionStep,
} from '@/lib/strategy-execution';
import type {
  NasdaqCurrency,
  NasdaqProductCode,
  NasdaqStrategyResult,
  NasdaqTacticalProduct,
} from './types';

export interface NasdaqStrategyOverrides {
  tacticalProduct?: NasdaqTacticalProduct;
  baseCurrency?: NasdaqCurrency;
}

export interface NasdaqStrategyResponse extends NasdaqStrategyResult {
  capitalBasis: {
    accountValue: number;
    portfolioAccountValue: number;
    source: 'MANUAL' | 'PORTFOLIO';
  };
  executionPlan: {
    buySteps: StrategyExecutionStep[];
    sellSteps: StrategyExecutionStep[];
    buyAmount: number;
    sellAmount: number;
  };
  products: typeof NASDAQ_PRODUCTS;
  providers: {
    qqqAdjusted: Pick<NasdaqPriceDataset, 'provider' | 'fallbackUsed' | 'warnings'>;
    tacticalExecution: Pick<NasdaqPriceDataset, 'provider' | 'fallbackUsed' | 'warnings'>;
  };
  productMetadata: {
    product: NasdaqProductCode;
    leverageMultiple: number;
    grossExpenseRatioPct: number;
    netExpenseRatioPct: number;
    effectiveDate: string;
    reviewAfter: string;
    sourceUrl: string;
  }[];
  portfolioWarnings: string[];
  dailyResetWarning: string;
  researchBenchmarks: {
    label: string;
    use: string;
    sourceUrl: string;
  }[];
  updatedAt: string | null;
  backtest: typeof NASDAQ_BACKTEST_VERIFICATION;
}

const EMPTY_PORTFOLIO = {
  equityByMarket: { US: 0, KR: 0 },
  holdings: [],
};

function unavailable(
  product: NasdaqProductCode,
  series: 'EXECUTION' | 'ADJUSTED',
  error: unknown,
): NasdaqPriceDataset {
  return {
    product,
    series,
    bars: [],
    provider: 'Unavailable',
    fallbackUsed: true,
    warnings: [error instanceof Error ? error.message : `${product} 가격을 불러오지 못했습니다.`],
  };
}

async function safeExecution(product: NasdaqProductCode) {
  try {
    return await loadNasdaqExecutionHistory(product, {
      range: '2y',
      targetBars: 320,
      minimumBars: 252,
    });
  } catch (error) {
    return unavailable(product, 'EXECUTION', error);
  }
}

async function safeAdjusted(product: NasdaqProductCode) {
  try {
    return await loadNasdaqAdjustedHistory(product, { range: '10y', targetBars: 2_520 });
  } catch (error) {
    return unavailable(product, 'ADJUSTED', error);
  }
}

function fallbackMetadata() {
  return Object.values(NASDAQ_PRODUCTS).map((product) => ({
    product: product.code,
    leverageMultiple: product.leverage,
    grossExpenseRatioPct: product.grossExpenseRatioPct,
    netExpenseRatioPct: product.netExpenseRatioPct,
    effectiveDate: product.feeAsOf,
    reviewAfter: product.feeReviewAfter,
    sourceUrl: product.sourceUrl,
  }));
}

export async function buildNasdaqStrategyForOwner(input: {
  client: SupabaseClient;
  ownerId: string;
  overrides?: NasdaqStrategyOverrides;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const asOf = now.toISOString().slice(0, 10);
  const [
    storedResult,
    metadataResult,
    portfolioResult,
    usdKrw,
    qqqAdjusted,
    qqqExecution,
    qldExecution,
    tqqqExecution,
  ] = await Promise.all([
    getNasdaqSettings({ client: input.client, ownerId: input.ownerId }),
    listNasdaqProductMetadata({ client: input.client }).catch(() => []),
    loadNasdaqPortfolioState({ client: input.client, ownerId: input.ownerId })
      .then((state) => ({ state, warning: null as string | null }))
      .catch((error) => ({
        state: EMPTY_PORTFOLIO,
        warning: error instanceof Error ? error.message : '포트폴리오를 읽지 못했습니다.',
      })),
    loadUsdKrwRate().catch(() => null),
    safeAdjusted('QQQ'),
    safeExecution('QQQ'),
    safeExecution('QLD'),
    safeExecution('TQQQ'),
  ]);
  const stored = mapStoredNasdaqSettings(storedResult);
  const selected = {
    ...DEFAULT_NASDAQ_SETTINGS,
    ...stored,
    ...input.overrides,
  };
  const execution = {
    QQQ: qqqExecution,
    QLD: qldExecution,
    TQQQ: tqqqExecution,
  };
  const pricesUsd: Partial<Record<NasdaqProductCode, number>> = {};
  for (const product of Object.keys(execution) as NasdaqProductCode[]) {
    const close = execution[product].bars.at(-1)?.close;
    if (close && close > 0) pricesUsd[product] = close;
  }
  const converted = convertNasdaqPortfolio({
    state: portfolioResult.state,
    baseCurrency: selected.baseCurrency,
    usdKrw,
    pricesUsd,
  });
  const accountEquity = resolveCalculationCapital(
    converted.accountEquity,
    selected.manualAccountValue,
  );
  const productMetadata = metadataResult.length === 3 ? metadataResult : fallbackMetadata();
  const selectedMetadata = productMetadata.find(
    (row) => row.product === selected.tacticalProduct,
  );
  const settings = {
    baseCurrency: selected.baseCurrency,
    tacticalProduct: selected.tacticalProduct,
    manualAccountValue: selected.manualAccountValue,
    accountEquity,
    externalNasdaqValue: selected.externalNasdaqValue,
    existingQqqValue: converted.productValues.QQQ ?? 0,
    existingQldValue: converted.productValues.QLD ?? 0,
    existingTqqqValue: converted.productValues.TQQQ ?? 0,
    tqqqOptIn: selected.tqqqOptIn,
    riskPaused: selected.riskPaused,
  };
  const tacticalDataset = execution[selected.tacticalProduct];
  const result = evaluateNasdaqStrategy({
    asOf,
    qqqAdjustedBars: qqqAdjusted.bars,
    tacticalExecutionBars: tacticalDataset.bars,
    settings,
    usdKrw,
    feeMetadataFresh: Boolean(selectedMetadata && selectedMetadata.reviewAfter >= asOf),
  });
  const unitPriceInBase = (product: NasdaqProductCode) => {
    const close = pricesUsd[product];
    if (!close || close <= 0) return null;
    if (settings.baseCurrency === 'USD') return close;
    return usdKrw && usdKrw > 0 ? close * usdKrw : null;
  };
  const precision = settings.baseCurrency === 'KRW' ? 0 : 2;
  const coreGap = Math.max(
    (accountEquity * NASDAQ_POLICY.qqqCoreTargetPct) - settings.existingQqqValue,
    0,
  );
  const coreReady = result.quality.status === 'VALID'
    && Boolean(result.regime?.monthlyTrend.signal === 'ON'
      && result.regime.monthlyTrend.isEffective
      && result.regime.aboveMa200TwoCloses)
    && !settings.riskPaused;
  const coreBuySteps = buildSplitExecutionSteps({
    action: 'BUY',
    sleeve: 'CORE',
    product: 'QQQ',
    totalAmount: coreGap,
    weights: [0.4, 0.3, 0.3],
    unitPriceInBase: unitPriceInBase('QQQ'),
    conditions: [
      '1차: 장기 추세 ON·QQQ 200일선 2일 확인 후 코어 목표의 40%',
      '2차: MA20~MA50 눌림에서 추세 훼손이 없으면 30%',
      '3차: 20일 신고가 재돌파 또는 다음 월말 추세 ON 확인 시 30%',
    ],
    ready: coreReady,
    precision,
  });
  const tacticalBuySteps = buildSplitExecutionSteps({
    action: 'BUY',
    sleeve: 'TACTICAL',
    product: settings.tacticalProduct,
    totalAmount: result.position?.actualNotional ?? 0,
    weights: [0.5, 0.5],
    unitPriceInBase: unitPriceInBase(settings.tacticalProduct),
    conditions: [
      `1차: ${settings.tacticalProduct} 진입 게이트 충족 종가에서 전술 계획의 50%`,
      '2차: 20일 돌파 유지 또는 다음 월말 추세 ON 확인 후 잔여 50%',
    ],
    ready: result.decision === 'QLD_READY' || result.decision === 'TQQQ_READY',
    precision,
  });
  const tacticalExisting = settings.existingQldValue + settings.existingTqqqValue;
  const capitalExcess = Math.max(
    result.allocation.existingCapitalValue - result.allocation.capitalTargetValue,
    0,
  );
  const sellAmount = result.decision === 'DELEVERAGE'
    ? Math.max(tacticalExisting, capitalExcess)
    : result.decision === 'TRIM_EXPOSURE'
      ? Math.max(capitalExcess, 0)
      : capitalExcess;
  const sellProduct: NasdaqProductCode = settings.existingTqqqValue > 0
    ? 'TQQQ'
    : settings.existingQldValue > 0
      ? 'QLD'
      : 'QQQ';
  const sellSteps = buildSplitExecutionSteps({
    action: 'SELL',
    sleeve: 'REDUCE',
    product: sellProduct,
    totalAmount: sellAmount,
    weights: [0.5, 0.3, 0.2],
    unitPriceInBase: unitPriceInBase(sellProduct),
    conditions: [
      '1차: 디레버리징·한도 초과 신호 시 축소 필요액의 50%',
      '2차: 선택 상품 2ATR 추적 손절 또는 QQQ 200일선 재이탈 시 30%',
      '3차: 월말 10개월 추세 OFF가 유지되면 잔여 20%',
    ],
    ready: ['DELEVERAGE', 'TRIM_EXPOSURE'].includes(result.decision),
    precision,
  });
  const buySteps = [...coreBuySteps, ...tacticalBuySteps];
  const portfolioWarnings = [
    ...(portfolioResult.warning ? [portfolioResult.warning] : []),
    ...converted.warnings,
  ];
  const inputs: Record<string, unknown> = {
    modelVersion: NASDAQ_MODEL_VERSION,
    asOf,
    settings,
    usdKrw,
    qqqAdjustedAsOf: qqqAdjusted.bars.at(-1)?.date ?? null,
    qqqAdjustedRows: qqqAdjusted.bars.length,
    tacticalExecutionAsOf: tacticalDataset.bars.at(-1)?.date ?? null,
    tacticalExecutionRows: tacticalDataset.bars.length,
    selectedMetadata,
  };
  const response: NasdaqStrategyResponse = {
    ...result,
    capitalBasis: {
      accountValue: accountEquity,
      portfolioAccountValue: converted.accountEquity,
      source: capitalSource(selected.manualAccountValue),
    },
    executionPlan: {
      buySteps,
      sellSteps,
      buyAmount: buySteps.reduce((sum, step) => sum + step.amount, 0),
      sellAmount: sellSteps.reduce((sum, step) => sum + step.amount, 0),
    },
    products: NASDAQ_PRODUCTS,
    providers: {
      qqqAdjusted: {
        provider: qqqAdjusted.provider,
        fallbackUsed: qqqAdjusted.fallbackUsed,
        warnings: qqqAdjusted.warnings,
      },
      tacticalExecution: {
        provider: tacticalDataset.provider,
        fallbackUsed: tacticalDataset.fallbackUsed,
        warnings: tacticalDataset.warnings,
      },
    },
    productMetadata,
    portfolioWarnings,
    dailyResetWarning:
      'QLD와 TQQQ는 하루 수익률의 2배·3배를 목표로 매일 재설정됩니다. 장기 누적 수익은 QQQ의 단순 2배·3배와 크게 달라질 수 있습니다.',
    researchBenchmarks: [
      {
        label: 'Meb Faber 10개월 이동평균',
        use: '월말 장기 추세 필터의 공개 연구 기준',
        sourceUrl: 'https://mebfaber.com/2009/02/19/a-quantitative-approach-to-tactical-asset-allocation-updated/',
      },
      {
        label: 'Leverage for the Long Run',
        use: '추세 이탈 시 레버리지 축소 원칙의 공개 연구 기준',
        sourceUrl: 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2741701',
      },
      {
        label: 'Volatility-Managed Portfolios',
        use: 'RV20에 따른 전술 비중 축소의 공개 연구 기준',
        sourceUrl: 'https://www.nber.org/papers/w22208',
      },
    ],
    updatedAt: stored.updatedAt,
    backtest: NASDAQ_BACKTEST_VERIFICATION,
  };
  return {
    response,
    inputs,
    inputHash: hashNasdaqStrategyInputs(inputs),
  };
}
