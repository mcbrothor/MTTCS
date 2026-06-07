import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculate12Minus1Momentum,
  calculateLinearRegressionR2,
  calculateTII,
  analyzeLeaderScore,
  applyLeaderUniverseMetrics,
} from '../lib/finance/engines/leader-score.ts';
import { applyLeaderUniverseMetrics as applyPureLeaderUniverseMetrics } from '../lib/finance/engines/leader-ranking.ts';

// ── 테스트용 유틸 ────────────────────────────────────────────────────────
function createTrendData(startPrice, trendPctPerBar, length, noiseRange = 0) {
  const data = [];
  let price = startPrice;
  const now = new Date();
  
  for (let i = 0; i < length; i++) {
    price = price * (1 + trendPctPerBar);
    if (noiseRange > 0) {
      const noise = (Math.random() - 0.5) * noiseRange;
      price = price * (1 + noise);
    }
    const dateStr = new Date(now.getTime() - (length - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    data.push({
      date: dateStr,
      open: price * 0.99,
      high: price * 1.01,
      low: price * 0.98,
      close: price,
      volume: 1000000 + Math.round(Math.random() * 500000),
    });
  }
  return data;
}

// ── 테스트 1: 12-Minus-1 모멘텀 산출 ───────────────────────────────────────────
test('12-Minus-1 모멘텀 연산 검증', () => {
  // 1% 복리로 260일 동안 우상향 시뮬레이션
  const data = createTrendData(100, 0.01, 260);
  const result = calculate12Minus1Momentum(data);
  
  assert.ok(result !== null);
  assert.ok(result > 0);
  
  // 1개월 전과 1년 전 가격 간의 공식이 잘 성립했는지 확인
  const expectedOneMonthAgo = data[data.length - 22].close;
  const expectedOneYearAgo = data[data.length - 253].close;
  const manual12m1 = ((expectedOneMonthAgo - expectedOneYearAgo) / expectedOneYearAgo) * 100;
  
  assert.equal(Math.round(result), Math.round(manual12m1));
});

// ── 테스트 2: Linear Regression R^2 선형 적합도 검증 ─────────────────────────
test('선형 회귀 R² 및 기울기 연산 검증', () => {
  // 노이즈가 전혀 없는 순수 복리 가격 데이터 (R²가 1에 극도로 수렴해야 함)
  const perfectData = createTrendData(100, 0.005, 90, 0);
  const perfectResult = calculateLinearRegressionR2(perfectData, 90);
  
  assert.ok(perfectResult.r2 >= 0.99); // R²는 1에 거의 근접
  assert.ok(perfectResult.slope > 0);  // 기울기는 확실한 양수
  
  // 가격이 우하향하는 데이터
  const downtrendData = createTrendData(100, -0.005, 90, 0);
  const downtrendResult = calculateLinearRegressionR2(downtrendData, 90);
  
  assert.ok(downtrendResult.r2 >= 0.99);
  assert.ok(downtrendResult.slope < 0); // 기울기 음수
  
  // 노이즈가 극도로 심한 톱니바퀴 가격 데이터 (R²가 매우 낮게 나옴)
  const noisyData = [];
  const now = new Date();
  for (let i = 0; i < 90; i++) {
    const price = 100 + (i % 2 === 0 ? 50 : -50); // 급등락 반복
    noisyData.push({
      date: new Date(now.getTime() - (90 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      open: price, high: price, low: price, close: price, volume: 1000,
    });
  }
  const noisyResult = calculateLinearRegressionR2(noisyData, 90);
  assert.ok(noisyResult.r2 < 0.1); // 선형성 붕괴
});

// ── 테스트 3: Trend Intensity Index (TII) 연산 검증 ───────────────────────
test('TII 지수 연산 검증', () => {
  // 지속 우상향 200일 이상 하여 이평선 정배열과 이평 위에 노는 가격 조건 충족 데이터
  const strongTrend = createTrendData(100, 0.01, 220);
  const tii = calculateTII(strongTrend);
  
  // 모든 이평선 조건이 완벽 정배열 및 주가 위에 있으므로 TII가 높은 점수여야 함
  assert.ok(tii >= 90);
});

// ── 테스트 4: 현대적 주도주 스코어 분석 및 유니버스 실시간 랭킹 검증 ─────────────────
test('가상 SK하이닉스(메가캡 쏠림) vs 가상 잡주 랭킹 분석 및 디그레이드 검증', () => {
  // A. SK하이닉스형 모델: 대형 거래대금, 매끄럽고 일관된 우상향, 정배열
  const hnyData = createTrendData(100000, 0.003, 260, 0.001); // 부드러운 우상향
  // 거래대금 인위적 조정 (하루 1500만 주 × 10만 원 = 1.5조 원 상당)
  hnyData.forEach(d => {
    d.volume = 15000000;
  });
  
  const hnyRawResult = analyzeLeaderScore({
    data: hnyData,
    sectorRank: 1, // 최고 강세 반도체 섹터
  });

  // B. 가상 잡주 모델: 최근 3일간 연속 상한가 급등했으나, 이전엔 하락세였고 평소 거래대금이 미미한 톱니형 잡주
  const noisyData = createTrendData(5000, -0.005, 257, 0.01); // 257일간 우하향
  // 마지막 3일 상한가 쏠림
  const last3 = [
    { date: '2026-05-25', open: 1000, high: 1300, low: 1000, close: 1300, volume: 50000 },
    { date: '2026-05-26', open: 1300, high: 1690, low: 1300, close: 1690, volume: 60000 },
    { date: '2026-05-27', open: 1690, high: 2197, low: 1690, close: 2197, volume: 80000 },
  ];
  const junkData = [...noisyData, ...last3];
  
  const junkRawResult = analyzeLeaderScore({
    data: junkData,
    sectorRank: 8, // 약세 테마 섹터
  });

  // 유니버스 가상 병합 및 실시간 Metrics 랭킹 보정
  const results = [
    {
      ticker: '000660', // 하이닉스
      leaderScore: hnyRawResult.leaderScore,
      leaderGrade: hnyRawResult.leaderGrade,
      breakdown: hnyRawResult.breakdown,
      dollarVolume20d: hnyRawResult.dollarVolume20d,
      liquidityVelocity: hnyRawResult.liquidityVelocity,
      regressionR2: hnyRawResult.regressionR2,
      regressionSlope: hnyRawResult.regressionSlope,
      trendIntensityIndex: hnyRawResult.trendIntensityIndex,
      weightedMomentumScore: hnyRawResult.weightedMomentumScore,
      benchmarkRelativeScore: hnyRawResult.benchmarkRelativeScore,
      distanceFromHigh52WeekPct: hnyRawResult.distanceFromHigh52WeekPct,
      sectorRank: 1,
    },
    {
      ticker: '999999', // 테마잡주
      leaderScore: junkRawResult.leaderScore,
      leaderGrade: junkRawResult.leaderGrade,
      breakdown: junkRawResult.breakdown,
      dollarVolume20d: junkRawResult.dollarVolume20d,
      liquidityVelocity: junkRawResult.liquidityVelocity,
      regressionR2: junkRawResult.regressionR2,
      regressionSlope: junkRawResult.regressionSlope,
      trendIntensityIndex: junkRawResult.trendIntensityIndex,
      weightedMomentumScore: junkRawResult.weightedMomentumScore,
      benchmarkRelativeScore: junkRawResult.benchmarkRelativeScore,
      distanceFromHigh52WeekPct: junkRawResult.distanceFromHigh52WeekPct,
      sectorRank: 8,
    }
  ];

  const ranked = applyLeaderUniverseMetrics(results, 10);
  
  const hnyRanked = ranked.find(r => r.ticker === '000660');
  const junkRanked = ranked.find(r => r.ticker === '999999');

  // 검증:
  // 1. 하이닉스가 잡주 대비 월등히 큰 거래대금을 가졌으므로 dollarVolumeShare가 만점(99점 이상) 수준이어야 함
  assert.ok(hnyRanked.dollarVolumeShare > junkRanked.dollarVolumeShare);
  
  // 2. 하이닉스가 주가 선형성 R²가 매우 튼튼하게(R² >= 0.8) 우상향하였으므로 momentumConsistency 점수가 잡주 대비 높아야 함
  assert.ok(hnyRanked.breakdown.momentumConsistency > junkRanked.breakdown.momentumConsistency);

  // 3. 최종적으로 하이닉스는 고득점으로 ALPHA/EMERGING에 주도주로 잡히며, 잡주는 등급이 크게 밀려 소외되어야 함
  assert.ok(hnyRanked.leaderScore > junkRanked.leaderScore);
  assert.ok(hnyRanked.leaderGrade === 'ALPHA' || hnyRanked.leaderGrade === 'EMERGING');
});

test('Leader 랭킹은 배치 단위가 아니라 전체 유니버스 기준으로 재계산된다', () => {
  const makeItem = (ticker, weightedMomentumScore, dollarVolume20d) => ({
    ticker,
    leaderScore: 50,
    leaderGrade: 'STEADY',
    breakdown: {
      rsLeadership: 50,
      momentumConsistency: 60,
      liquidityCrowding: 50,
      trendIntensity: 60,
      sectorAlpha: 50,
    },
    dollarVolume20d,
    liquidityVelocity: 1,
    regressionR2: 0.7,
    regressionSlope: 0.001,
    trendIntensityIndex: 70,
    weightedMomentumScore,
    benchmarkRelativeScore: weightedMomentumScore,
    distanceFromHigh52WeekPct: 8,
    sectorRank: null,
  });

  const batchA = [
    makeItem('A1', 100, 100),
    makeItem('A2', 90, 90),
  ];
  const batchB = [
    makeItem('B1', 80, 80),
    makeItem('B2', 70, 70),
  ];

  const localA = applyPureLeaderUniverseMetrics(batchA);
  const localB = applyPureLeaderUniverseMetrics(batchB);
  const global = applyPureLeaderUniverseMetrics([...batchA, ...batchB]);

  assert.equal(localA.find((item) => item.ticker === 'A1').rsRating, 99);
  assert.equal(localB.find((item) => item.ticker === 'B1').rsRating, 99);
  assert.equal(global.find((item) => item.ticker === 'B1').rsRating, 34);
  assert.ok(global.find((item) => item.ticker === 'A2').leaderScore > global.find((item) => item.ticker === 'B1').leaderScore);
});
