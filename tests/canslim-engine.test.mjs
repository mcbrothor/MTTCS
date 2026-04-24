import assert from 'node:assert/strict';
import { evaluateCanslim, evaluateN } from '../lib/finance/engines/canslim-engine.ts';

console.log('=== CAN SLIM Engine Tests ===\n');

function makeStock(overrides = {}) {
  return {
    symbol: 'TEST',
    market: 'US',
    marketCap: 100_000_000_000,
    currentQtrEpsGrowth: 32,
    priorQtrEpsGrowth: 28,
    epsGrowthLast3Qtrs: [32, 24, 27],
    currentQtrSalesGrowth: 17.5,
    annualEpsGrowthEachYear: [30, 33, 29],
    hadNegativeEpsInLast3Yr: false,
    roe: 22,
    currentPrice: 118,
    price52WeekHigh: 130,
    pivotPoint: 114,
    weeksBuildingBase: 8,
    detectedBasePattern: 'VCP',
    dailyVolume: 1_500_000,
    avgVolume50: 1_000_000,
    floatShares: 45_000_000,
    sharesBuyback: false,
    rsRating: 92,
    mansfieldRsFlag: true,
    institutionalSponsorshipTrend: 'INCREASING',
    institutionalOwnershipPct: 55,
    numInstitutionalHolders: 12,
    ...overrides,
  };
}

const macro = {
  actionLevel: 'FULL',
  is_uptrend_50: true,
  is_uptrend_200: true,
  distributionDayCount: 2,
  followThroughDay: true,
  lastFTDDate: '2026-04-20',
};

{
  const result = evaluateCanslim(makeStock(), macro, false);
  assert.equal(result.pass, true);
  assert.equal(result.confidence, 'MEDIUM');
  assert.equal(result.failedPillar, null);
  assert.ok(result.warnings.some((warning) => warning.includes('3개 분기')));
  assert.equal(
    result.pillarDetails.find((detail) => detail.label === '분기 매출 성장률')?.status,
    'WARNING'
  );
  console.log('OK softer C checks keep strong current leaders from hard-failing on borderline sales and streak data');
}

{
  const nStatus = evaluateN(makeStock({
    currentPrice: 105,
    price52WeekHigh: 130,
    pivotPoint: null,
    detectedBasePattern: 'VCP',
  }));
  assert.notEqual(nStatus, 'INVALID');
  console.log('OK valid base patterns receive a wider N distance allowance');
}

{
  const result = evaluateCanslim(makeStock({
    currentQtrSalesGrowth: 11,
  }), macro, false);
  assert.equal(result.pass, false);
  assert.equal(result.failedPillar, 'C_SALES');
  console.log('OK clearly weak sales still fail the CAN SLIM screen');
}

console.log('\n=== All CAN SLIM Engine Tests Passed ===');
