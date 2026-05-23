import assert from 'node:assert/strict';
import { calculateAvgVolume } from '../lib/finance/core/moving-average.ts';

function makeDay(close, volume) {
  return { date: '2026-01-01', open: close, high: close, low: close, close, volume };
}

// --- 정상 케이스 ---
{
  const data = Array.from({ length: 20 }, () => makeDay(100, 1_000_000)); // $100 × 1M = $100M/day
  const result = calculateAvgVolume(data);
  assert.equal(result.dataQuality, 'OK');
  assert.equal(result.avgDollarVolume, 100_000_000);
  assert.equal(result.passesFilter, true);
}

// --- 아웃라이어 1개 포함 케이스 (GEV-like: 하루만 이상값) ---
{
  const data = Array.from({ length: 20 }, () => makeDay(120, 1_000_000)); // 정상: $120M/day
  // 마지막 날만 비정상 (2.259B shares — Yahoo 데이터 오류 시뮬레이션)
  data[19] = makeDay(120, 2_259_000_000); // $120 × 2.259B = $271B → 아웃라이어
  const result = calculateAvgVolume(data);
  assert.equal(result.dataQuality, 'OUTLIER_FILTERED', 'outlier day should be filtered');
  // 정상 19일 평균: $120M
  assert.equal(result.avgDollarVolume, 120_000_000, 'outlier excluded from average');
  assert.equal(result.passesFilter, true);
}

// --- 모든 날이 아웃라이어 (데이터 소스 전체 오류) ---
{
  const data = Array.from({ length: 20 }, () => makeDay(120, 2_000_000_000));
  const result = calculateAvgVolume(data);
  // 20개 모두 필터 → filtered.length = 0 < period/2 = 10
  assert.equal(result.dataQuality, 'INSUFFICIENT_DATA');
  assert.equal(result.avgDollarVolume, 0);
  assert.equal(result.passesFilter, false);
}

// --- 데이터 부족 케이스 ---
{
  const data = Array.from({ length: 5 }, () => makeDay(100, 500_000));
  const result = calculateAvgVolume(data);
  assert.equal(result.dataQuality, 'INSUFFICIENT_DATA');
  assert.equal(result.passesFilter, false);
}

// --- 낮은 거래대금 (필터는 통과하지만 $10M 미만) ---
{
  const data = Array.from({ length: 20 }, () => makeDay(10, 50_000)); // $500K/day
  const result = calculateAvgVolume(data);
  assert.equal(result.dataQuality, 'OK');
  assert.equal(result.passesFilter, false);
}

console.log('moving-average ADV outlier filter tests passed');
