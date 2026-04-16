import assert from 'node:assert/strict';
import { calculatePortfolioRiskSummary, getMaxPositionsForEquity } from '../lib/finance/portfolio-risk.ts';

assert.equal(getMaxPositionsForEquity(1_000_000), 2);
assert.equal(getMaxPositionsForEquity(10_000_000), 5);
assert.equal(getMaxPositionsForEquity(100_000_000), 10);

const trades = [
  {
    ticker: 'NVDA',
    status: 'ACTIVE',
    entry_price: 100,
    total_shares: 10,
    metrics: { netShares: 10, avgEntryPrice: 100, openRisk: 80 },
  },
  {
    ticker: 'META',
    status: 'ACTIVE',
    entry_price: 200,
    total_shares: 5,
    metrics: { netShares: 5, avgEntryPrice: 200, openRisk: 60 },
  },
  {
    ticker: 'AAPL',
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
assert.equal(summary.sectorExposure[0].sector, 'Technology');
assert.equal(summary.sectorExposure[0].exposurePct, 100);
assert.ok(summary.warnings.some((warning) => warning.includes('Technology concentration')));

console.log('portfolio risk tests passed');
