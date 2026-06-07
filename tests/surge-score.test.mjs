import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeSurge,
  calculateROC,
  calculateRVOL,
  determineSurgeGrade,
} from '../lib/finance/engines/surge-score.ts';

function makeBars({ baseClose = 100, previousClose = 100, currentClose = 106, normalVolume = 1000, currentVolume = 3500 }) {
  const bars = [];
  for (let i = 0; i < 20; i++) {
    bars.push({
      date: `2026-05-${String(i + 1).padStart(2, '0')}`,
      open: baseClose,
      high: baseClose + 1,
      low: baseClose - 1,
      close: baseClose,
      volume: normalVolume,
    });
  }
  bars.push({
    date: '2026-05-21',
    open: previousClose,
    high: previousClose + 1,
    low: previousClose - 1,
    close: previousClose,
    volume: normalVolume,
  });
  bars.push({
    date: '2026-05-22',
    open: currentClose,
    high: currentClose + 1,
    low: currentClose - 1,
    close: currentClose,
    volume: currentVolume,
  });
  return bars;
}

test('Surge 엔진은 당일 제외 평균 거래량으로 RVOL을 계산한다', () => {
  const bars = makeBars({ normalVolume: 1000, currentVolume: 3000 });
  const { rvol, avgVol, currentVol } = calculateRVOL(bars, 20);

  assert.equal(avgVol, 1000);
  assert.equal(currentVol, 3000);
  assert.equal(rvol, 3);
});

test('Surge 등급 경계값은 RVOL과 ROC를 동시에 만족해야 한다', () => {
  assert.equal(determineSurgeGrade(3, 5), 'EXPLOSIVE');
  assert.equal(determineSurgeGrade(2, 3), 'BREAKOUT');
  assert.equal(determineSurgeGrade(1.5, 1), 'WARM');
  assert.equal(determineSurgeGrade(3, -2), 'NONE');
});

test('analyzeSurge는 ROC와 RVOL을 결합해 최종 급등 등급을 반환한다', () => {
  const bars = makeBars({ previousClose: 100, currentClose: 106, normalVolume: 1000, currentVolume: 3500 });
  const result = analyzeSurge(bars);

  assert.equal(calculateROC(bars), 6);
  assert.ok(result);
  assert.equal(result.grade, 'EXPLOSIVE');
  assert.equal(result.rvol, 3.5);
  assert.equal(result.roc, 6);
});
