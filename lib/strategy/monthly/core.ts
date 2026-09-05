import {
  absoluteMomentumSkip,
  calculateClusterBalancedBreadth,
  closeAt,
  drawdownPct,
  movingAverage,
  relativeMomentum,
} from './indicators';
import type {
  BuildMonthlySnapshotInput,
  MonthlyAssetDefinition,
  MonthlyBar,
  MonthlyCandidate,
  MonthlyPortfolioTarget,
  MonthlyRegime,
  MonthlyRegimeDecision,
  MonthlySelection,
  MonthlySignalStatus,
  MonthlyStrategyPolicy,
  MonthlyStrategySnapshot,
} from './types';

export { relativeMomentum } from './indicators';

function dateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function resolveCompletedMonth(
  bars: MonthlyBar[],
  now = new Date(),
  timeZone = 'Asia/Seoul',
): {
  signalAt: string | null;
  effectiveAt: string | null;
  latestObservationAt: string | null;
  status: MonthlySignalStatus;
} {
  const sorted = bars
    .filter((bar) => /^\d{4}-\d{2}-\d{2}$/.test(bar.date) && Number.isFinite(bar.close) && bar.close > 0)
    .sort((left, right) => left.date.localeCompare(right.date));
  const latestObservationAt = sorted.at(-1)?.date ?? null;
  const currentMonth = dateInTimeZone(now, timeZone).slice(0, 7);
  const completed = sorted.filter((bar) => bar.date.slice(0, 7) < currentMonth);
  const signalAt = completed.at(-1)?.date ?? null;
  if (!signalAt) return { signalAt: null, effectiveAt: null, latestObservationAt, status: 'BLOCKED' };
  const effectiveAt = sorted.find((bar) => bar.date > signalAt)?.date ?? null;
  return { signalAt, effectiveAt, latestObservationAt, status: 'FINAL' };
}

function rawRegime(breadth: number, drawdown: number, policy: MonthlyStrategyPolicy): MonthlyRegime {
  const thresholds = policy.regime;
  if (thresholds.broadTrend !== undefined && breadth >= thresholds.broadTrend) return 'BROAD_TREND';
  if (breadth >= thresholds.trend) return 'TREND';
  if (breadth >= thresholds.nonTrend) return 'NON_TREND';
  if (breadth >= thresholds.recovery) return 'RECOVERY';
  if (drawdown <= thresholds.drawdown100) return 'CRASH_100';
  if (drawdown <= thresholds.drawdown75) return 'CRASH_75';
  if (drawdown <= thresholds.drawdown50) return 'CRASH_50';
  return 'CASH';
}

const RISK_RANK: Record<MonthlyRegime, number> = {
  CASH: 0,
  CRASH_50: 0,
  CRASH_75: 0,
  CRASH_100: 0,
  RECOVERY: 1,
  NON_TREND: 2,
  TREND: 3,
  BROAD_TREND: 4,
};

export function classifyRegimeWithHysteresis(input: {
  breadth: number;
  drawdownPct: number;
  previousRegime?: MonthlyRegime | null;
  policy: MonthlyStrategyPolicy;
}): MonthlyRegimeDecision {
  const raw = rawRegime(input.breadth, input.drawdownPct, input.policy);
  const previous = input.previousRegime;
  if (!previous || RISK_RANK[raw] >= RISK_RANK[previous]) {
    return { regime: raw, rawRegime: raw, hysteresisApplied: false };
  }
  const thresholds = input.policy.regime;
  const exitLevel: Partial<Record<MonthlyRegime, number>> = {
    BROAD_TREND: (thresholds.broadTrend ?? Number.POSITIVE_INFINITY) - thresholds.hysteresis,
    TREND: thresholds.trend - thresholds.hysteresis,
    NON_TREND: thresholds.nonTrend - thresholds.hysteresis,
    RECOVERY: thresholds.recovery - thresholds.hysteresis,
  };
  const exit = exitLevel[previous];
  if (exit !== undefined && input.breadth >= exit) {
    return { regime: previous, rawRegime: raw, hysteresisApplied: true };
  }
  return { regime: raw, rawRegime: raw, hysteresisApplied: false };
}

function percentileRanks(rows: Array<{ ticker: string; value: number | null }>) {
  const valid = rows.filter((row): row is { ticker: string; value: number } => row.value !== null && Number.isFinite(row.value));
  const sorted = [...valid].sort((left, right) => right.value - left.value);
  const denominator = Math.max(1, sorted.length - 1);
  return new Map(sorted.map((row, index) => [row.ticker, (1 - index / denominator) * 100]));
}

export function selectMonthlyCandidates(input: {
  universe: readonly MonthlyAssetDefinition[];
  barsByTicker: Record<string, MonthlyBar[]>;
  benchmarkBars: MonthlyBar[];
  asOf: string;
  previousHoldings?: string[];
  entryTopN: number;
  keepTopN: number;
  breadthLookback?: number;
  relativeMomentum3Lookback?: number;
  relativeMomentum6Lookback?: number;
  absoluteMomentum12Lookback?: number;
  absoluteMomentumSkip?: number;
}): MonthlySelection {
  const breadthLookback = input.breadthLookback ?? 120;
  const rs3Lookback = input.relativeMomentum3Lookback ?? 63;
  const rs6Lookback = input.relativeMomentum6Lookback ?? 126;
  const absoluteLookback = input.absoluteMomentum12Lookback ?? 252;
  const absoluteSkip = input.absoluteMomentumSkip ?? 21;
  const metrics = input.universe.map((asset) => {
    const bars = input.barsByTicker[asset.ticker] || [];
    const rs3 = relativeMomentum(bars, input.benchmarkBars, rs3Lookback, input.asOf);
    const rs6 = relativeMomentum(bars, input.benchmarkBars, rs6Lookback, input.asOf);
    const absolute = absoluteMomentumSkip(bars, absoluteLookback, absoluteSkip, input.asOf);
    const average = movingAverage(bars, breadthLookback, input.asOf);
    const close = closeAt(bars, input.asOf);
    return { asset, rs3, rs6, absolute, average, close };
  });
  const rs3Ranks = percentileRanks(metrics.map(({ asset, rs3 }) => ({ ticker: asset.ticker, value: rs3 })));
  const rs6Ranks = percentileRanks(metrics.map(({ asset, rs6 }) => ({ ticker: asset.ticker, value: rs6 })));
  const absoluteRanks = percentileRanks(metrics.map(({ asset, absolute }) => ({ ticker: asset.ticker, value: absolute })));
  const candidates = metrics.map(({ asset, rs3, rs6, absolute, average, close }) => {
    const scoreParts = [rs3Ranks.get(asset.ticker), rs6Ranks.get(asset.ticker), absoluteRanks.get(asset.ticker)]
      .filter((value): value is number => value !== undefined);
    const score = scoreParts.length ? scoreParts.reduce((sum, value) => sum + value, 0) / scoreParts.length : 0;
    const aboveMovingAverage = close !== null && average !== null && close > average;
    return {
      ticker: asset.ticker,
      name: asset.name,
      group: asset.group,
      eligible: aboveMovingAverage && (rs6 ?? Number.NEGATIVE_INFINITY) > 0 && (absolute ?? Number.NEGATIVE_INFINITY) > 0,
      rank: 0,
      score,
      relativeMomentum3: rs3,
      relativeMomentum6: rs6,
      absoluteMomentum12Skip: absolute,
      aboveMovingAverage,
      close,
      movingAverage: average,
    } satisfies MonthlyCandidate;
  });
  const ranked = candidates
    .sort((left, right) => Number(right.eligible) - Number(left.eligible) || right.score - left.score || (right.relativeMomentum6 ?? -Infinity) - (left.relativeMomentum6 ?? -Infinity))
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  const eligible = ranked.filter((candidate) => candidate.eligible);
  const previous = [...new Set(input.previousHoldings || [])];
  const retained = previous.flatMap((ticker) => {
    const candidate = eligible.find((row) => row.ticker === ticker && row.rank <= input.keepTopN);
    return candidate ? [candidate] : [];
  }).slice(0, input.entryTopN);
  const selected = [...retained];
  for (const candidate of eligible) {
    if (selected.length >= input.entryTopN) break;
    if (!selected.some((row) => row.ticker === candidate.ticker)) selected.push(candidate);
  }
  const hold = selected.filter((candidate) => previous.includes(candidate.ticker));
  const buy = selected.filter((candidate) => !previous.includes(candidate.ticker));
  const sell = previous
    .filter((ticker) => !selected.some((candidate) => candidate.ticker === ticker))
    .map((ticker) => ({ ticker, name: input.universe.find((asset) => asset.ticker === ticker)?.name ?? ticker }));
  const watch = eligible.filter((candidate) => !selected.some((row) => row.ticker === candidate.ticker)).slice(0, input.keepTopN);
  return { ranked, selected, buy, hold, sell, watch };
}

function blockedSnapshot(input: BuildMonthlySnapshotInput, timing: ReturnType<typeof resolveCompletedMonth>, available: number, warnings: string[]): MonthlyStrategySnapshot {
  const requested = input.policy.universe.length;
  return {
    market: input.policy.market,
    modelVersion: input.policy.modelVersion,
    modelStatus: input.policy.modelStatus,
    status: 'BLOCKED',
    signalAt: timing.signalAt,
    effectiveAt: timing.effectiveAt,
    latestObservationAt: timing.latestObservationAt,
    executionPolicy: 'NEXT_SESSION_CLOSE',
    returnStartPolicy: 'SESSION_AFTER_FILL',
    quality: { status: 'BLOCKED', requested, available, coverage: requested ? available / requested : 0, asOf: timing.signalAt, warnings },
    breadth: null,
    drawdownPct: null,
    averageRelativeMomentum: null,
    regime: null,
    portfolio: [],
    cashWeight: 1,
    rankings: [],
    actions: { buy: [], hold: [], sell: [], watch: [] },
  };
}

export function buildMonthlySnapshot(input: BuildMonthlySnapshotInput): MonthlyStrategySnapshot {
  const timing = resolveCompletedMonth(input.benchmarkBars, input.now, input.policy.timeZone);
  if (!timing.signalAt) return blockedSnapshot(input, timing, 0, ['완료된 월말 기준일이 없습니다.']);
  const breadthResult = calculateClusterBalancedBreadth({
    universe: input.policy.universe,
    barsByTicker: input.barsByTicker,
    lookback: input.policy.breadthLookback,
    asOf: timing.signalAt,
  });
  const coverage = breadthResult.requested ? breadthResult.available / breadthResult.requested : 0;
  if (breadthResult.breadth === null || coverage < input.policy.minimumCoverage) {
    return blockedSnapshot(input, timing, breadthResult.available, [
      `월간 전략 유니버스 커버리지 부족 (${breadthResult.available}/${breadthResult.requested}).`,
      ...breadthResult.unavailableTickers.map((ticker) => `${ticker}: 월말 정렬 데이터 또는 MA${input.policy.breadthLookback} 부족`),
    ]);
  }
  const benchmarkDrawdown = drawdownPct(input.benchmarkBars, 252, timing.signalAt) ?? 0;
  const selection = selectMonthlyCandidates({
    universe: input.policy.universe,
    barsByTicker: input.barsByTicker,
    benchmarkBars: input.benchmarkBars,
    asOf: timing.signalAt,
    previousHoldings: input.previousHoldings,
    entryTopN: input.policy.entryTopN,
    keepTopN: input.policy.keepTopN,
    breadthLookback: input.policy.breadthLookback,
    relativeMomentum3Lookback: input.policy.relativeMomentum3Lookback,
    relativeMomentum6Lookback: input.policy.relativeMomentum6Lookback,
    absoluteMomentum12Lookback: input.policy.absoluteMomentum12Lookback,
    absoluteMomentumSkip: input.policy.absoluteMomentumSkip,
  });
  const strongest = selection.ranked.filter((candidate) => candidate.eligible).slice(0, input.policy.entryTopN);
  const relativeValues = strongest.map((candidate) => candidate.relativeMomentum6).filter((value): value is number => value !== null);
  const averageRelativeMomentum = relativeValues.length ? relativeValues.reduce((sum, value) => sum + value, 0) / relativeValues.length : null;
  const regimeDecision = classifyRegimeWithHysteresis({
    breadth: breadthResult.breadth,
    drawdownPct: benchmarkDrawdown,
    previousRegime: input.previousRegime,
    policy: input.policy,
  });
  let weight = input.policy.resolveExposure(regimeDecision.regime, averageRelativeMomentum);
  let portfolio: MonthlyPortfolioTarget[] = [];
  let actions = {
    buy: selection.buy.map(({ ticker, name }) => ({ ticker, name })),
    hold: selection.hold.map(({ ticker, name }) => ({ ticker, name })),
    sell: selection.sell,
    watch: selection.watch.map(({ ticker, name }) => ({ ticker, name })),
  };
  const warnings: string[] = [];
  const crashRegime = regimeDecision.regime.startsWith('CRASH_');
  if (crashRegime) {
    const target = input.policy.crashTarget;
    const confirmationPeriod = input.policy.crashReentryMovingAverage ?? 20;
    const benchmarkClose = closeAt(input.benchmarkBars, timing.signalAt);
    const confirmationAverage = movingAverage(input.benchmarkBars, confirmationPeriod, timing.signalAt);
    const reversalConfirmed = benchmarkClose !== null && confirmationAverage !== null && benchmarkClose > confirmationAverage;
    const targetBar = target
      ? (input.barsByTicker[target.ticker] || []).filter((bar) => bar.date <= timing.signalAt!).at(-1)
      : null;
    if (target && reversalConfirmed && targetBar?.date === timing.signalAt && weight > 0) {
      const held = (input.previousHoldings || []).includes(target.ticker);
      portfolio = [{
        ticker: target.ticker,
        name: target.name,
        group: target.group,
        action: held ? 'HOLD' : 'BUY',
        targetWeight: weight,
        score: 0,
        relativeMomentum3: null,
        relativeMomentum6: null,
        absoluteMomentum12Skip: null,
      }];
      actions = {
        buy: held ? [] : [{ ticker: target.ticker, name: target.name }],
        hold: held ? [{ ticker: target.ticker, name: target.name }] : [],
        sell: (input.previousHoldings || []).filter((ticker) => ticker !== target.ticker).map((ticker) => ({
          ticker,
          name: input.policy.universe.find((asset) => asset.ticker === ticker)?.name ?? ticker,
        })),
        watch: strongest.map(({ ticker, name }) => ({ ticker, name })),
      };
    } else {
      weight = 0;
      warnings.push(!reversalConfirmed
        ? `${confirmationPeriod}일선 회복 전이므로 약세장 단계 매수를 대기합니다.`
        : '약세장 광역지수 체결 데이터가 없어 단계 매수를 차단합니다.');
      actions = {
        buy: [],
        hold: [],
        sell: (input.previousHoldings || []).map((ticker) => ({
          ticker,
          name: input.policy.universe.find((asset) => asset.ticker === ticker)?.name ?? ticker,
        })),
        watch: strongest.map(({ ticker, name }) => ({ ticker, name })),
      };
    }
  } else if (weight > 0) {
    const slotWeight = weight / input.policy.entryTopN;
    portfolio = selection.selected.map((candidate) => ({
      ticker: candidate.ticker,
      name: candidate.name,
      group: candidate.group,
      action: selection.hold.some((row) => row.ticker === candidate.ticker) ? 'HOLD' as const : 'BUY' as const,
      targetWeight: slotWeight,
      score: candidate.score,
      relativeMomentum3: candidate.relativeMomentum3,
      relativeMomentum6: candidate.relativeMomentum6,
      absoluteMomentum12Skip: candidate.absoluteMomentum12Skip,
    }));
  } else {
    actions = {
      buy: [],
      hold: [],
      sell: (input.previousHoldings || []).map((ticker) => ({
        ticker,
        name: input.policy.universe.find((asset) => asset.ticker === ticker)?.name ?? ticker,
      })),
      watch: [...selection.selected, ...selection.watch]
        .slice(0, input.policy.keepTopN)
        .map(({ ticker, name }) => ({ ticker, name })),
    };
  }
  const investedWeight = portfolio.reduce((sum, target) => sum + target.targetWeight, 0);
  return {
    market: input.policy.market,
    modelVersion: input.policy.modelVersion,
    modelStatus: input.policy.modelStatus,
    status: timing.status,
    signalAt: timing.signalAt,
    effectiveAt: timing.effectiveAt,
    latestObservationAt: timing.latestObservationAt,
    executionPolicy: 'NEXT_SESSION_CLOSE',
    returnStartPolicy: 'SESSION_AFTER_FILL',
    quality: { status: 'FULL', requested: breadthResult.requested, available: breadthResult.available, coverage, asOf: timing.signalAt, warnings },
    breadth: breadthResult.breadth,
    drawdownPct: benchmarkDrawdown,
    averageRelativeMomentum,
    regime: { ...regimeDecision, weight },
    portfolio,
    cashWeight: Math.max(0, 1 - investedWeight),
    rankings: selection.ranked,
    actions,
  };
}
