import assert from 'node:assert/strict';
import { calculatePortfolioRiskSummary, getMaxPositionsForEquity, isScoutPosition } from '../lib/finance/core/portfolio-risk.ts';

assert.equal(getMaxPositionsForEquity(1_000_000), 2);
assert.equal(getMaxPositionsForEquity(10_000_000), 5);
assert.equal(getMaxPositionsForEquity(100_000_000), 10);
assert.equal(getMaxPositionsForEquity(2_000, 'US'), 2);
assert.equal(getMaxPositionsForEquity(20_000, 'US'), 10);

const trades = [
  {
    ticker: 'NVDA',
    direction: 'LONG',
    status: 'ACTIVE',
    entry_price: 100,
    total_shares: 10,
    metrics: { netShares: 10, avgEntryPrice: 100, openRisk: 80 },
  },
  {
    ticker: 'META',
    direction: 'LONG',
    status: 'ACTIVE',
    entry_price: 200,
    total_shares: 5,
    metrics: { netShares: 5, avgEntryPrice: 200, openRisk: 60 },
  },
  {
    ticker: 'AAPL',
    direction: 'LONG',
    status: 'PLANNED',
    entry_price: 150,
    total_shares: 3,
    metrics: { netShares: 0, avgEntryPrice: null, openRisk: 0 },
  },
];

const profiles = [
  { ticker: 'NVDA', exchange: 'NAS', name: 'Nvidia', sector: 'Technology', industry: 'Semiconductors', market: 'US' },
  { ticker: 'META', exchange: 'NAS', name: 'Meta', sector: 'Technology', industry: 'Internet', market: 'US' },
];

const summary = calculatePortfolioRiskSummary(trades, 2_000, profiles);
assert.equal(summary.activePositions, 2);
assert.equal(summary.maxPositions, 2);
assert.equal(summary.investedCapital, 2000);
assert.equal(summary.cash, 0);
assert.equal(summary.totalOpenRisk, 140);
assert.equal(summary.openRiskPct, 7);
assert.equal(summary.positions?.length, 2);
assert.equal(summary.positions?.[0].pyramidCount, 0);
assert.equal(summary.sectorExposure[0].sector, 'Technology');
assert.equal(summary.sectorExposure[0].exposurePct, 100);
assert.ok(summary.warnings.some((warning) => warning.includes('Technology concentration')));
assert.ok(summary.actions?.some((item) => item.title.includes('Technology')));
assert.ok(summary.actions?.some((item) => item.severity === 'BLOCK'));

const markedTrades = trades.map((trade) => trade.status === 'ACTIVE' ? {
  ...trade,
  stoploss_price: trade.ticker === 'NVDA' ? 92 : 188,
  metrics: { ...trade.metrics, currentPrice: trade.ticker === 'NVDA' ? 150 : 180 },
} : trade);
const marked = calculatePortfolioRiskSummary(markedTrades, 2_500, profiles);
assert.equal(marked.costBasis, 2000);
assert.equal(marked.marketValue, 2400);
assert.equal(marked.cash, 100);
assert.equal(marked.sectorExposure[0].exposure, 2400);
assert.equal(marked.unknownRiskPositions, 0);

const scoutTrade = {
  ticker: 'SCOUT', direction: 'LONG', status: 'ACTIVE', entry_price: 10, stoploss_price: 8, total_shares: 10,
  metrics: { netShares: 10, avgEntryPrice: 10, currentPrice: 9.999, openRisk: 20 },
};
const boundaryTrade = {
  ticker: 'BOUNDARY', direction: 'LONG', status: 'ACTIVE', entry_price: 10, stoploss_price: 8, total_shares: 10,
  metrics: { netShares: 10, avgEntryPrice: 10, currentPrice: 10, openRisk: 20 },
};
assert.equal(isScoutPosition(scoutTrade, 'US'), true);
assert.equal(isScoutPosition(boundaryTrade, 'US'), false);
assert.equal(isScoutPosition(scoutTrade, 'KR'), false);
const scoutSummary = calculatePortfolioRiskSummary([...markedTrades, scoutTrade, boundaryTrade], 3_000, profiles, 'US');
assert.equal(scoutSummary.activePositions, 3);
assert.equal(scoutSummary.officialPositions, 3);
assert.equal(scoutSummary.scoutPositions, 1);
assert.equal(scoutSummary.totalActivePositions, 4);
assert.equal(scoutSummary.positions?.find((position) => position.ticker === 'SCOUT')?.isScout, true);
assert.equal(scoutSummary.totalOpenRisk, 180);

console.log('portfolio risk tests passed');
