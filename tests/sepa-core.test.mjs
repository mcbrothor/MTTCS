import assert from 'node:assert/strict';
import { analyzeSepa } from '../lib/finance/core/sepa.ts';
import { evaluateScannerRecommendation } from '../lib/scanner-recommendation.ts';

function makeUptrendBars(length = 260, slope = 0.5, start = 50) {
  return Array.from({ length }, (_, index) => {
    const close = start + index * slope;
    return {
      date: `2025-02-${String((index % 28) + 1).padStart(2, '0')}`,
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1_000_000,
    };
  });
}

function replaceBar(data, index, patch) {
  return data.map((bar, currentIndex) => (currentIndex === index ? { ...bar, ...patch } : bar));
}

console.log('=== SEPA Core Tests ===\n');

{
  const evidence = analyzeSepa(makeUptrendBars(260, 0.6), {
    benchmarkData: makeUptrendBars(260, 0.2),
    preCalculatedRs: 88,
  });

  assert.equal(evidence.summary.coreTotal, 7);
  assert.equal(evidence.summary.corePassed, 7);
  assert.equal(evidence.summary.coreFailed, 0);
  assert.equal(evidence.status, 'pass');
  assert.equal(evidence.metrics.rsSource, 'UNIVERSE');
  console.log('✅ Test 1: 완전한 업트렌드에서 core 7/7 pass');
}

{
  let data = makeUptrendBars(260, 0.6);
  const lastIndex = data.length - 1;
  data = replaceBar(data, lastIndex, {
    close: data[lastIndex].close * 0.92,
    high: data[lastIndex].close * 0.9292,
    low: data[lastIndex].close * 0.9108,
    open: data[lastIndex].close * 0.92,
  });

  const evidence = analyzeSepa(data, {
    benchmarkData: makeUptrendBars(260, 0.2),
    preCalculatedRs: 86,
    rsSourceHint: 'DB_BATCH',
  });

  assert.equal(evidence.summary.corePassed, 6);
  assert.equal(evidence.summary.coreFailed, 1);
  assert.equal(evidence.status, 'warning');
  assert.equal(evidence.metrics.rsSource, 'DB_BATCH');

  const recommendation = evaluateScannerRecommendation({
    status: 'done',
    sepaStatus: evidence.status,
    sepaFailed: evidence.summary.failed,
    sepaEvidence: evidence,
    vcpGrade: 'forming',
    vcpScore: 68,
    volumeDryUpScore: 72,
    distanceToPivotPct: 2.1,
    rsRating: 86,
  });

  assert.equal(recommendation.recommendationTier, 'Partial');
  assert.equal(recommendation.sepaMissingCount, 1);
  console.log('✅ Test 2: core 6/7은 warning + Partial로 분류');
}

{
  let data = makeUptrendBars(260, 0.6);
  const lastIndex = data.length - 1;
  const deepClose = data[lastIndex].close * 0.70;
  data = replaceBar(data, lastIndex, {
    close: deepClose,
    high: deepClose * 1.01,
    low: deepClose * 0.99,
    open: deepClose,
  });

  const evidence = analyzeSepa(data, {
    benchmarkData: makeUptrendBars(260, 0.2),
    preCalculatedRs: 60,
  });

  assert.ok(evidence.summary.coreFailed >= 2);
  assert.equal(evidence.status, 'fail');
  console.log('✅ Test 3: core 2개 이상 미달이면 fail');
}

console.log('\n=== All SEPA Core Tests Passed ===');
