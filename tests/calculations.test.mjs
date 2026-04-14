import assert from 'node:assert/strict';
import {
  analyzeSepa,
  calculateATR,
  calculateEntryPrice,
  calculateMinerviniRiskPlan,
  calculatePositionSize,
} from '../lib/finance/calculations.ts';

function makeUptrendBars(length = 260, slope = 0.5, start = 50) {
  return Array.from({ length }, (_, index) => {
    const close = start + index * slope;
    return {
      date: `2025-01-${String((index % 28) + 1).padStart(2, '0')}`,
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1_000_000,
    };
  });
}

function run(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run('calculates 20 day ATR from true ranges', () => {
  const data = makeUptrendBars(30);
  assert.equal(calculateATR(data), 2);
});

run('calculates recent high reference price', () => {
  const data = makeUptrendBars(60);
  assert.equal(calculateEntryPrice(data, 50), 80.5);
});

run('calculates default 1 percent risk position size from stop price', () => {
  const result = calculatePositionSize(50_000, 100, 92);
  assert.equal(result.maxRisk, 500);
  assert.equal(result.stopLossPrice, 92);
  assert.equal(result.riskPerShare, 8);
  assert.equal(result.shares, 62);
});

run('rejects stop prices at or above entry', () => {
  const result = calculatePositionSize(50_000, 100, 101);
  assert.equal(result.shares, 0);
  assert.equal(result.riskPerShare, 0);
});

run('builds Minervini plan from VCP invalidation stop', () => {
  const plan = calculateMinerviniRiskPlan(50_000, 100, 2, 0.01, 94);
  assert.equal(plan.totalShares, 83);
  assert.equal(plan.riskPercent, 0.01);
  assert.equal(plan.stopLossPrice, 94);
  assert.equal(plan.stopSource, 'VCP_INVALIDATION');
  assert.deepEqual(
    [plan.entryTargets.e1.price, plan.entryTargets.e2.price, plan.entryTargets.e3.price],
    [100, 102, 104]
  );
  assert.deepEqual(
    [plan.entryTargets.e1.shares, plan.entryTargets.e2.shares, plan.entryTargets.e3.shares],
    [83, 0, 0]
  );
});

run('caps Minervini stop at 8 percent max loss', () => {
  const plan = calculateMinerviniRiskPlan(50_000, 100, 2, 0.01, 85);
  assert.equal(plan.stopLossPrice, 92);
  assert.equal(plan.stopSource, 'MAX_LOSS_CAP');
  assert.equal(plan.totalShares, 62);
});

run('uses benchmark RS proxy and marks missing fundamentals as info', () => {
  const evidence = analyzeSepa(makeUptrendBars(260, 0.6), {
    benchmarkData: makeUptrendBars(260, 0.2),
  });

  assert.ok(evidence.summary.info >= 1);
  assert.notEqual(evidence.criteria.find((item) => item.id === 'rs_rating')?.status, 'info');
  assert.equal(evidence.criteria.find((item) => item.id === 'fundamentals')?.status, 'info');
});

run('evaluates fundamentals only when all required fields are present', () => {
  // 일부 항목만 있는 경우 → info (참고 정보)
  const partial = analyzeSepa(makeUptrendBars(260, 0.6), {
    benchmarkData: makeUptrendBars(260, 0.2),
    fundamentals: {
      epsGrowthPct: 25,
      revenueGrowthPct: null,
      roePct: 20,
      debtToEquityPct: 30,
      source: 'test',
    },
  });
  assert.equal(partial.criteria.find((item) => item.id === 'fundamentals')?.status, 'info');

  // 전체 항목이 있어도 info로 표시 (기본적 분석은 저장을 차단하지 않음)
  const complete = analyzeSepa(makeUptrendBars(260, 0.6), {
    benchmarkData: makeUptrendBars(260, 0.2),
    fundamentals: {
      epsGrowthPct: 25,
      revenueGrowthPct: 18,
      roePct: 20,
      debtToEquityPct: 30,
      source: 'test',
    },
  });
  assert.equal(complete.criteria.find((item) => item.id === 'fundamentals')?.status, 'info');
  // 개별 항목별 충족 여부가 actual에 이모지로 표시되는지 확인
  const actual = complete.criteria.find((item) => item.id === 'fundamentals')?.actual ?? '';
  assert.ok(actual.includes('✅'), '충족 항목에 ✅ 이모지가 표시되어야 합니다');
});
