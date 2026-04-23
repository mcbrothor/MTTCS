import type { Trade } from '../types/index.ts';

export interface ReviewTagStat {
  tag: string;
  count: number;
  avgR: number;
  avgPnL: number;
  winRate: number;
}

export interface ExitReasonStat {
  reason: string;
  count: number;
  avgR: number;
  winRate: number;
  sharePct: number;
}

export interface ReviewStatsSummary {
  completedCount: number;
  exitReasons: ExitReasonStat[];
  mistakeTags: ReviewTagStat[];
  setupTags: ReviewTagStat[];
}

function getTradeR(trade: Pick<Trade, 'metrics'>) {
  return typeof trade.metrics?.rMultiple === 'number' ? trade.metrics.rMultiple : 0;
}

function getTradePnL(trade: Pick<Trade, 'metrics' | 'result_amount'>) {
  const realizedPnL = trade.metrics?.realizedPnL ?? trade.result_amount;
  return typeof realizedPnL === 'number' ? realizedPnL : 0;
}

function sortByCountThenLabel<T extends { count: number }>(items: T[], getLabel: (item: T) => string) {
  return [...items].sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return getLabel(left).localeCompare(getLabel(right));
  });
}

function buildTagStats(completedTrades: Trade[], type: 'mistake' | 'setup') {
  const aggregates = new Map<string, { count: number; wins: number; totalR: number; totalPnL: number }>();

  completedTrades.forEach((trade) => {
    const tags = type === 'mistake' ? trade.mistake_tags : trade.setup_tags;
    const uniqueTags = [...new Set((tags || []).filter(Boolean))];

    uniqueTags.forEach((tag) => {
      const current = aggregates.get(tag) || { count: 0, wins: 0, totalR: 0, totalPnL: 0 };
      const nextR = getTradeR(trade);
      const nextPnL = getTradePnL(trade);

      current.count += 1;
      current.totalR += nextR;
      current.totalPnL += nextPnL;
      if (nextR > 0) current.wins += 1;

      aggregates.set(tag, current);
    });
  });

  return sortByCountThenLabel(
    Array.from(aggregates.entries()).map(([tag, data]) => ({
      tag,
      count: data.count,
      avgR: data.count > 0 ? data.totalR / data.count : 0,
      avgPnL: data.count > 0 ? data.totalPnL / data.count : 0,
      winRate: data.count > 0 ? (data.wins / data.count) * 100 : 0,
    })),
    (item) => item.tag
  );
}

export function buildReviewStatsSummary(trades: Trade[]): ReviewStatsSummary {
  const completedTrades = trades.filter((trade) => trade.status === 'COMPLETED');
  const completedCount = completedTrades.length;

  const exitReasonAggregates = completedTrades.reduce((acc, trade) => {
    const reason = trade.exit_reason || 'Unlabeled';
    const current = acc.get(reason) || { count: 0, wins: 0, totalR: 0 };
    const nextR = getTradeR(trade);

    current.count += 1;
    current.totalR += nextR;
    if (nextR > 0) current.wins += 1;

    acc.set(reason, current);
    return acc;
  }, new Map<string, { count: number; wins: number; totalR: number }>());

  const exitReasons = sortByCountThenLabel(
    Array.from(exitReasonAggregates.entries()).map(([reason, data]) => ({
      reason,
      count: data.count,
      avgR: data.count > 0 ? data.totalR / data.count : 0,
      winRate: data.count > 0 ? (data.wins / data.count) * 100 : 0,
      sharePct: completedCount > 0 ? (data.count / completedCount) * 100 : 0,
    })),
    (item) => item.reason
  );

  return {
    completedCount,
    exitReasons,
    mistakeTags: buildTagStats(completedTrades, 'mistake'),
    setupTags: buildTagStats(completedTrades, 'setup'),
  };
}

export function filterTradesByMistakeTag(trades: Trade[], tag: string | null) {
  if (!tag) return trades;
  return trades.filter((trade) => (trade.mistake_tags || []).includes(tag));
}
