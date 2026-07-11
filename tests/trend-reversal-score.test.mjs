import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const { analyzeTrendReversal } = jiti('../lib/finance/engines/trend-reversal-score.ts');

function bar(index, close, volume = 800000, spread = 0.018) {
  return {
    date: `2026${String(Math.floor(index / 22) + 1).padStart(2, '0')}${String((index % 22) + 1).padStart(2, '0')}`,
    open: close * (1 - spread / 2),
    high: close * (1 + spread),
    low: close * (1 - spread),
    close,
    volume,
  };
}

function makeBenchmarkData(length) {
  return Array.from({ length }, (_, index) => bar(index, 100 + index * 0.02, 5000000, 0.006));
}

function makeConfirmedReversalData() {
  const data = [];
  for (let index = 0; index < 85; index += 1) {
    data.push(bar(index, 104 - index * 0.6, 1400000));
  }

  const basePrices = [
    53.0, 53.4, 53.1, 53.8, 53.5, 54.0, 53.7, 54.2, 53.9, 54.4,
    54.1, 54.6, 54.2, 54.8, 54.5, 55.0, 54.7, 55.2, 54.9, 55.3,
    55.0, 55.4, 55.1, 55.5, 55.2, 55.6, 55.3, 55.7, 55.4, 55.8,
    55.5, 55.9, 55.6, 55.8, 55.5, 55.9, 55.6, 55.8, 55.7, 56.0,
    55.8, 56.1, 55.9, 56.2, 56.0, 56.1, 55.9, 56.0, 56.1, 56.0,
  ];
  basePrices.forEach((price, offset) => {
    data.push(bar(85 + offset, price, offset < 15 ? 900000 : 480000, 0.01));
  });

  data.push({
    date: '20260701',
    open: 56.1,
    high: 58.2,
    low: 55.9,
    close: 57.8,
    volume: 1500000,
  });
  return data;
}

function makeWeakDowntrendData() {
  return Array.from({ length: 120 }, (_, index) => {
    const close = 90 - index * 0.28 + Math.sin(index / 4) * 0.5;
    return bar(index, close, 900000 + (index % 5) * 60000);
  });
}

test('전환 엔진은 바닥 베이스 후 거래량 돌파를 확인된 전환으로 분류한다', () => {
  const data = makeConfirmedReversalData();
  const result = analyzeTrendReversal(data, { market: 'US', benchmarkData: makeBenchmarkData(data.length) });

  assert.ok(result);
  assert.equal(result.stage, 'CONFIRMED');
  assert.ok(result.reversalScore >= 80);
  assert.ok(result.breakdown.baseQuality >= 70);
  assert.ok(result.distanceToPivotPct !== null && result.distanceToPivotPct >= 0);
  assert.ok(result.rvol20 !== null && result.rvol20 >= 1.3);
  assert.ok(result.evidence.some((line) => line.includes('베이스')));
});

test('전환 엔진은 하락 지속 종목을 전환 후보로 과대평가하지 않는다', () => {
  const data = makeWeakDowntrendData();
  const result = analyzeTrendReversal(data, { market: 'US', benchmarkData: makeBenchmarkData(data.length) });

  assert.ok(result);
  assert.equal(result.stage, 'REJECT');
  assert.ok(result.reversalScore < 45);
});

test('전환 엔진은 벤치마크 데이터가 없어도 분석 결과와 경고를 반환한다', () => {
  const result = analyzeTrendReversal(makeConfirmedReversalData(), { market: 'US' });

  assert.ok(result);
  assert.ok(result.warnings.some((warning) => warning.includes('벤치마크')));
  assert.ok(result.reversalScore > 0);
});
