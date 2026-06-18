import assert from 'node:assert/strict';
import { calculatePortfolioWhatIf } from '../lib/finance/core/portfolio-what-if.ts';
import { calculatePerformanceAttribution } from '../lib/finance/core/performance-attribution.ts';

const summary = { totalEquity: 10000, investedCapital: 4000, marketValue: 5000, cash: 5000, cashPct: 50, activePositions: 1, maxPositions: 5, totalOpenRisk: 200, openRiskPct: 2, portfolioHeatPct: 2, sectorExposure: [{ sector: 'Technology', exposure: 3000, exposurePct: 30, count: 1 }], warnings: [], unknownRiskPositions: 0, riskGate: { status: 'PASS' } };
const whatIf = calculatePortfolioWhatIf(summary, { ticker: 'NVDA', shares: 10, entryPrice: 100, stopPrice: 90, sector: 'Technology' });
assert.equal(whatIf.projected.openRisk, 300);
assert.equal(whatIf.projected.sectorExposurePct, 40);
assert.equal(whatIf.gateChange.to, 'BLOCK');

const perf = calculatePerformanceAttribution([
  { status: 'COMPLETED', result_amount: 100, risk_strategy: 'MINERVINI_VCP' },
  { status: 'COMPLETED', result_amount: -40, risk_strategy: 'MINERVINI_VCP' },
], 1000);
assert.equal(perf.totalPnl, 60);
assert.equal(perf.twr, 6);
assert.equal(perf.hitRate, 50);
assert.equal(perf.attribution[0].value, 60);
console.log('professional risk tests passed');
