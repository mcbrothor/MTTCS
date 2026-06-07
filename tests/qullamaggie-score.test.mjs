import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeQullamaggieSetup } from '../lib/finance/engines/qullamaggie-score.ts';

function bar(index, close, volume = 800000) {
  return {
    date: `2026${String(Math.floor(index / 22) + 1).padStart(2, '0')}${String((index % 22) + 1).padStart(2, '0')}`,
    open: close * 0.99,
    high: close * 1.02,
    low: close * 0.98,
    close,
    volume,
  };
}

function makeBreakoutData() {
  const data = [];
  for (let i = 0; i < 50; i++) {
    data.push(bar(i, 28 + i * 0.42, 900000));
  }
  const basePrices = [
    49.2, 48.4, 47.8, 48.6, 49.1,
    48.9, 49.4, 48.7, 49.6, 49.2,
    49.8, 49.4, 50.1, 49.7, 50.0,
    49.9, 50.2, 50.0, 50.3, 50.1,
  ];
  basePrices.forEach((price, idx) => data.push(bar(50 + idx, price, idx < 10 ? 700000 : 420000)));
  data.push({
    date: '20260401',
    open: 50.2,
    high: 52,
    low: 49.8,
    close: 51.4,
    volume: 1100000,
  });
  return data;
}

function makeSuperEpData() {
  const data = [];
  for (let i = 0; i < 130; i++) {
    const close = 19.5 + (i % 12) * 0.08;
    data.push(bar(i, close, 1200000));
  }
  data.push({
    date: '20260710',
    open: 23.2,
    high: 25.1,
    low: 22.7,
    close: 24.7,
    volume: 5200000,
  });
  return data;
}

function makeParabolicData() {
  const data = [];
  for (let i = 0; i < 55; i++) data.push(bar(i, 10 + i * 0.04, 2000000));
  for (let i = 0; i < 10; i++) data.push(bar(55 + i, 13 + i * 1.3, 3500000));
  return data;
}

test('Qullamaggie 엔진은 선행 상승 후 좁은 베이스의 돌파 후보를 포착한다', () => {
  const result = analyzeQullamaggieSetup(makeBreakoutData(), { market: 'US', exchange: 'US' });

  assert.ok(result);
  assert.ok(result.setupFlags.includes('BREAKOUT'));
  assert.equal(result.primarySetup, 'BREAKOUT');
  assert.ok(result.qScore >= 55);
  assert.ok(result.pivotPrice > 50);
  assert.ok(result.stopPct > 0);
});

test('Qullamaggie 엔진은 갭과 대량 거래가 피벗을 넘는 경우 Super Breakout으로 분류한다', () => {
  const result = analyzeQullamaggieSetup(makeSuperEpData(), { market: 'US', exchange: 'US' });

  assert.ok(result);
  assert.equal(result.primarySetup, 'SUPER_BREAKOUT');
  assert.ok(result.setupFlags.includes('EP'));
  assert.ok(result.gapPct >= 10);
  assert.ok(result.rvol20 >= 3);
  assert.ok(result.warnings.some((warning) => warning.includes('catalyst')));
});

test('Qullamaggie 엔진은 단기 과열 구간을 신규 매수 후보가 아닌 경고로 낮춘다', () => {
  const result = analyzeQullamaggieSetup(makeParabolicData(), { market: 'US', exchange: 'US' });

  assert.ok(result);
  assert.ok(result.setupFlags.includes('PARABOLIC_WARNING'));
  assert.ok(result.qScore <= 49);
});
