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
    annualEpsGrowthEachYear: [30, 18, 20],
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
  assert.equal(
    result.pillarDetails.find((detail) => detail.label === '분기 매출 성장률')?.status,
    'WARNING'
  );
  assert.equal(
    result.pillarDetails.find((detail) => detail.label === '3분기 연속 성장')?.status,
    'WARNING'
  );
  console.log('OK borderline sales and streak weakness now downgrade confidence instead of hard-failing');
}

{
  const result = evaluateCanslim(makeStock({
    currentQtrEpsGrowth: -8,
  }), macro, false);
  assert.equal(result.pass, true);
  assert.equal(result.confidence, 'LOW');
  assert.equal(result.failedPillar, null);
  assert.equal(
    result.pillarDetails.find((detail) => detail.label === '분기 EPS 성장률')?.status,
    'WARNING'
  );
  console.log('OK mild EPS contraction moves to warning instead of immediate fail');
}

{
  const result = evaluateCanslim(makeStock({
    currentQtrEpsGrowth: -22,
  }), macro, false);
  assert.equal(result.pass, false);
  assert.equal(result.failedPillar, 'C_EPS');
  console.log('OK severe EPS collapse still fails the screen');
}

{
  const result = evaluateCanslim(makeStock({
    annualEpsGrowthEachYear: [18, 16, 17],
  }), macro, false);
  assert.equal(result.pass, true);
  assert.equal(result.failedPillar, null);
  assert.equal(
    result.pillarDetails.find((detail) => detail.label === '연평균 EPS 성장')?.status,
    'WARNING'
  );
  console.log('OK solid but non-hypergrowth annual EPS becomes warning instead of fail');
}

{
  const result = evaluateCanslim(makeStock({
    annualEpsGrowthEachYear: [12, 10, 11],
  }), macro, false);
  assert.equal(result.pass, false);
  assert.equal(result.failedPillar, 'A_ANNUAL');
  console.log('OK weak annual EPS growth still fails the screen');
}

{
  const nStatus = evaluateN(makeStock({
    currentPrice: 95,
    price52WeekHigh: 130,
    pivotPoint: null,
    detectedBasePattern: 'VCP',
  }));
  assert.equal(nStatus, 'INVALID');

  const result = evaluateCanslim(makeStock({
    currentPrice: 95,
    price52WeekHigh: 130,
    pivotPoint: null,
    detectedBasePattern: 'VCP',
  }), macro, false);
  assert.equal(result.pass, true);
  assert.equal(result.failedPillar, null);
  assert.equal(
    result.pillarDetails.find((detail) => detail.label === '52주 신고가 근접')?.status,
    'WARNING'
  );
  console.log('OK valid base patterns survive N-too-far as a warning');
}

{
  const result = evaluateCanslim(makeStock({
    currentPrice: 95,
    price52WeekHigh: 130,
    pivotPoint: null,
    detectedBasePattern: null,
  }), macro, false);
  assert.equal(result.pass, false);
  assert.equal(result.failedPillar, 'N_TOO_FAR');
  console.log('OK non-base laggards still fail on N-too-far');
}

console.log('\n=== All CAN SLIM Engine Tests Passed ===');
