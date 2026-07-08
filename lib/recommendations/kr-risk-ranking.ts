import type {
  DailyCategoryTop10Pick,
  DailyScreenerCategory,
  DailyMarketTop10Pick,
  DailyScreenerCandidate,
  DailyScreenerSource,
} from '@/lib/daily-screeners';
import type { KrInvestorFlowFeatures } from './kr-investor-flow';

export interface KrRecentRecommendation {
  ticker: string;
  runDate: string;
  signalPrice: number | null;
}

export interface KrRankedCandidate {
  pick: DailyCategoryTop10Pick | DailyMarketTop10Pick;
  aggregateScore: number;
  sourceScore: number;
  flowScore: number;
  sources: DailyScreenerSource[];
  riskFlags: string[];
  flow: KrInvestorFlowFeatures | null;
}

const numberOrNull = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;

function flowAdjustment(flow: KrInvestorFlowFeatures | null, momentumOnly: boolean) {
  if (!flow || flow.quality === 'MISSING') return { score: 0, flags: ['flow_missing'] };
  if (flow.quality === 'STALE') return { score: 0, flags: ['flow_stale'] };
  const foreign = flow.foreignNetBuyAmountMkrw5d;
  const institution = flow.institutionNetBuyAmountMkrw5d;
  const ratio = flow.combinedNetBuyRatio5d ?? 0;
  let score = 0;
  if (foreign > 0 && institution > 0 && ratio >= 1) score = 12;
  else if (foreign > 0 && institution > 0 && ratio >= 0.3) score = 8;
  else if ((foreign > 0 || institution > 0) && ratio >= 0.3) score = 4;
  if (ratio <= -0.3) score = -6;
  if (foreign < 0 && institution < 0 && ratio <= -1) score = -12;
  if (momentumOnly && foreign < 0 && institution < 0) score -= 8;
  return { score, flags: [] as string[] };
}

function latestRecent(rows: KrRecentRecommendation[]) {
  return [...rows].sort((a, b) => b.runDate.localeCompare(a.runDate))[0];
}

function marketStateValue(value: unknown) {
  if (typeof value === 'string') return value.toUpperCase();
  if (value && typeof value === 'object' && typeof (value as { state?: unknown }).state === 'string') {
    return String((value as { state: string }).state).toUpperCase();
  }
  return 'YELLOW';
}

export function selectKrRiskAdjustedTop10(input: {
  candidates: DailyScreenerCandidate[];
  category?: DailyScreenerCategory;
  recentRecommendations?: KrRecentRecommendation[];
  marketState?: unknown;
  flowFeatures?: Map<string, KrInvestorFlowFeatures> | Record<string, KrInvestorFlowFeatures>;
  useFlow?: boolean;
}): KrRankedCandidate[] {
  const recent = input.recentRecommendations || [];
  const recentDates = [...new Set(recent.map((row) => row.runDate))].sort().reverse();
  const grouped = new Map<string, DailyScreenerCandidate[]>();
  for (const candidate of input.candidates) {
    if (candidate.universe !== 'KOSPI200' && candidate.universe !== 'KOSDAQ150') continue;
    if (input.category && candidate.universe !== input.category) continue;
    grouped.set(`${candidate.universe}:${candidate.ticker}`, [...(grouped.get(`${candidate.universe}:${candidate.ticker}`) || []), candidate]);
  }

  const ranked: KrRankedCandidate[] = [];
  for (const [, signals] of grouped) {
    const sources = [...new Set(signals.map((signal) => signal.source))].sort() as DailyScreenerSource[];
    const preferred = [...signals].sort((a, b) => b.score - a.score || a.source.localeCompare(b.source))[0];
    const ticker = preferred.ticker;
    const sourceScore = Math.max(...signals.map((signal) => 100 - 5 * Math.max(0, (signal.rank || 1) - 1)))
      + Math.min(12, Math.max(0, sources.length - 1) * 4);
    const momentumOnly = sources.length === 1 && sources[0] === 'momentum';
    let aggregateScore = sourceScore - (momentumOnly ? 15 : 0);
    const riskFlags: string[] = momentumOnly ? ['momentum_only'] : [];

    const roc = Math.max(...signals.map((signal) => numberOrNull(signal.metrics.roc) ?? Number.NEGATIVE_INFINITY));
    if (roc >= 15) continue;
    if (roc >= 8) {
      aggregateScore -= 15;
      riskFlags.push('roc_overheated');
    }

    const return5d = signals
      .map((signal) => numberOrNull(signal.metrics.return_5d_pct))
      .find((value): value is number => value !== null);
    if (return5d !== undefined && return5d <= -5) continue;
    if (return5d !== undefined && return5d <= -2) {
      aggregateScore -= 10;
      riskFlags.push('return_5d_weak');
    }

    const dollarVolume20d = Math.max(...signals.map((signal) => numberOrNull(signal.metrics.dollar_volume_20d) ?? 0));
    const liquidityFloor = preferred.universe === 'KOSDAQ150' ? 2_000_000_000 : 5_000_000_000;
    if (dollarVolume20d > 0 && dollarVolume20d < liquidityFloor) continue;
    if (dollarVolume20d === 0) riskFlags.push('liquidity_missing');

    const tickerRecent = recent.filter((row) => row.ticker === ticker);
    aggregateScore -= tickerRecent.length * 5;
    if (tickerRecent.length > 0) riskFlags.push('recent_repeat');
    const previous = latestRecent(tickerRecent);
    if (previous?.signalPrice && preferred.price && preferred.price / previous.signalPrice - 1 <= -0.03) continue;
    if (recentDates.length >= 3 && recentDates.slice(0, 3).every((date) => tickerRecent.some((row) => row.runDate === date))) continue;

    const flow = input.flowFeatures instanceof Map
      ? input.flowFeatures.get(ticker) || null
      : input.flowFeatures?.[ticker] || null;
    const flowResult = input.useFlow ? flowAdjustment(flow, momentumOnly) : { score: 0, flags: [] as string[] };
    aggregateScore += flowResult.score;
    riskFlags.push(...flowResult.flags);

    ranked.push({
      pick: {
        rank: 0,
        category: preferred.universe,
        market: 'KR',
        ticker,
        name: preferred.name,
        universe: preferred.universe,
        score: Math.round(aggregateScore * 100) / 100,
        grade: preferred.grade,
        source: sources.length > 1 ? 'mixed' : sources[0],
        reason: `${sources.join('+')} 신호 ${sources.length}개, 위험조정 ${Math.round(aggregateScore * 10) / 10}점`,
        confidence: Math.max(0.35, Math.min(0.94, Math.round((0.42 + aggregateScore / 200) * 100) / 100)),
        risk: riskFlags.length ? riskFlags.join(', ') : null,
      },
      aggregateScore,
      sourceScore,
      flowScore: flowResult.score,
      sources,
      riskFlags,
      flow,
    });
  }

  ranked.sort((a, b) => b.aggregateScore - a.aggregateScore
    || b.sources.length - a.sources.length
    || a.pick.ticker.localeCompare(b.pick.ticker));

  const state = marketStateValue(input.marketState);
  const momentumLimit = state === 'GREEN' ? 2 : state === 'RED' ? 0 : 1;
  const selected: KrRankedCandidate[] = [];
  const soleSourceCounts = new Map<string, number>();
  let momentumCount = 0;
  let kosdaqCount = 0;
  for (const candidate of ranked) {
    const soleSource = candidate.sources.length === 1 ? candidate.sources[0] : null;
    if (soleSource === 'momentum' && momentumCount >= momentumLimit) continue;
    if (!input.category && candidate.pick.universe === 'KOSDAQ150' && kosdaqCount >= 4) continue;
    if (soleSource && (soleSourceCounts.get(soleSource) || 0) >= 3) continue;
    selected.push(candidate);
    if (soleSource === 'momentum') momentumCount += 1;
    if (candidate.pick.universe === 'KOSDAQ150') kosdaqCount += 1;
    if (soleSource) soleSourceCounts.set(soleSource, (soleSourceCounts.get(soleSource) || 0) + 1);
    if (selected.length === 10) break;
  }
  if (selected.length < 10 && ranked.length >= 10) {
    const selectedKeys = new Set(selected.map((candidate) => `${candidate.pick.universe}:${candidate.pick.ticker}`));
    for (const candidate of ranked) {
      const key = `${candidate.pick.universe}:${candidate.pick.ticker}`;
      if (selectedKeys.has(key)) continue;
      selected.push({
        ...candidate,
        riskFlags: [...candidate.riskFlags, 'soft_constraint_relaxed'],
        pick: {
          ...candidate.pick,
          risk: [...candidate.riskFlags, 'soft_constraint_relaxed'].join(', '),
        },
      });
      selectedKeys.add(key);
      if (selected.length === 10) break;
    }
  }
  if (selected.length !== 10) throw new Error(`KR risk ranking requires 10 eligible picks; received ${selected.length}.`);
  return selected.map((candidate, index) => ({
    ...candidate,
    pick: { ...candidate.pick, rank: index + 1 },
  }));
}
