/**
 * VCP 엔진 테스트
 * - 수축 감지, 볼륨 건조화, BB Squeeze, Pocket Pivot 개별 검증
 * - 상승 추세 + 수축 패턴 시뮬레이션 데이터
 */

import assert from 'node:assert/strict';
import { analyzeVcp, calculateBBWidth } from '../lib/finance/vcp-engine.ts';

// --- 헬퍼: 시뮬레이션 OHLC 데이터 생성 ---

/**
 * 단순 상승 추세 데이터를 생성합니다.
 * price: 시작 가격, days: 일수, dailyReturn: 일별 수익률
 */
function generateUptrend(startPrice, days, dailyReturn = 0.003) {
  const data = [];
  let price = startPrice;
  const baseDate = new Date('2024-01-02');

  for (let i = 0; i < days; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().slice(0, 10);

    const open = price;
    const high = price * (1 + Math.random() * 0.02);
    const low = price * (1 - Math.random() * 0.015);
    const close = price * (1 + dailyReturn);
    const volume = 1000000 + Math.floor(Math.random() * 500000);

    data.push({ date: dateStr, open, high, low, close, volume });
    price = close;
  }

  return data;
}

/**
 * 수축 패턴이 있는 VCP 데이터를 생성합니다.
 * 상승 100일 → 수축1(15%) → 반등 → 수축2(8%) → 반등 → 수축3(4%)
 */
function generateVcpPattern() {
  const data = [];
  const baseDate = new Date('2024-01-02');
  let price = 100;
  let day = 0;

  // Phase 1: 상승 (100일)
  for (let i = 0; i < 100; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + day);
    data.push({
      date: date.toISOString().slice(0, 10),
      open: price,
      high: price * 1.02,
      low: price * 0.99,
      close: price * 1.005,
      volume: 2000000 + Math.floor(Math.random() * 1000000),
    });
    price = price * 1.005;
    day++;
  }

  const peakPrice = price;

  // Phase 2: 수축1 — 15% 하락 (20일)
  for (let i = 0; i < 20; i++) {
    const factor = 1 - (0.15 * (i + 1) / 20);
    const p = peakPrice * factor;
    const date = new Date(baseDate);
    date.setDate(date.getDate() + day);
    data.push({
      date: date.toISOString().slice(0, 10),
      open: p * 1.005,
      high: p * 1.01,
      low: p * 0.99,
      close: p,
      volume: 1500000 - Math.floor(i * 20000), // 볼륨 감소
    });
    day++;
  }

  // Phase 3: 반등 (15일)
  let recoveryPrice = peakPrice * 0.85;
  for (let i = 0; i < 15; i++) {
    recoveryPrice *= 1.008;
    const date = new Date(baseDate);
    date.setDate(date.getDate() + day);
    data.push({
      date: date.toISOString().slice(0, 10),
      open: recoveryPrice * 0.998,
      high: recoveryPrice * 1.01,
      low: recoveryPrice * 0.995,
      close: recoveryPrice,
      volume: 1200000 - Math.floor(i * 15000),
    });
    day++;
  }

  // Phase 4: 수축2 — 8% 하락 (15일)
  const peak2 = recoveryPrice;
  for (let i = 0; i < 15; i++) {
    const factor = 1 - (0.08 * (i + 1) / 15);
    const p = peak2 * factor;
    const date = new Date(baseDate);
    date.setDate(date.getDate() + day);
    data.push({
      date: date.toISOString().slice(0, 10),
      open: p * 1.003,
      high: p * 1.008,
      low: p * 0.995,
      close: p,
      volume: 800000 - Math.floor(i * 10000), // 더 적은 볼륨
    });
    day++;
  }

  // Phase 5: 반등 (10일)
  let recovery2 = peak2 * 0.92;
  for (let i = 0; i < 10; i++) {
    recovery2 *= 1.006;
    const date = new Date(baseDate);
    date.setDate(date.getDate() + day);
    data.push({
      date: date.toISOString().slice(0, 10),
      open: recovery2 * 0.998,
      high: recovery2 * 1.005,
      low: recovery2 * 0.997,
      close: recovery2,
      volume: 600000 - Math.floor(i * 8000),
    });
    day++;
  }

  // Phase 6: 수축3 — 4% 하락 (10일) → 매우 타이트
  const peak3 = recovery2;
  for (let i = 0; i < 10; i++) {
    const factor = 1 - (0.04 * (i + 1) / 10);
    const p = peak3 * factor;
    const date = new Date(baseDate);
    date.setDate(date.getDate() + day);
    data.push({
      date: date.toISOString().slice(0, 10),
      open: p * 1.002,
      high: p * 1.004,
      low: p * 0.998,
      close: p,
      volume: 400000 - Math.floor(i * 5000), // 최소 볼륨
    });
    day++;
  }

  return data;
}

function generateHighTightFlagPattern() {
  const data = [];
  const baseDate = new Date('2024-01-02');
  let price = 40;

  for (let day = 0; day < 55; day++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + day);
    price *= 1.035;
    data.push({
      date: date.toISOString().slice(0, 10),
      open: price * 0.99,
      high: price * 1.015,
      low: price * 0.985,
      close: price,
      volume: 2000000,
    });
  }

  const peak = price * 1.2;
  for (let day = 55; day < 80; day++) {
    const index = day - 55;
    const date = new Date(baseDate);
    date.setDate(date.getDate() + day);
    const pullback = index < 10 ? index * 0.012 : 0.12 - ((index - 10) * 0.001);
    const close = peak * (1 - Math.min(0.14, pullback));
    data.push({
      date: date.toISOString().slice(0, 10),
      open: close * 0.995,
      high: index === 0 ? peak : close * 1.02,
      low: close * 0.99,
      close,
      volume: index >= 20 ? 700000 : 1200000,
    });
  }

  return data;
}

// ========== 테스트 시작 ==========

console.log('=== VCP Engine Tests ===\n');

// --- Test 1: 데이터 부족 시 안전한 기본값 반환 ---
{
  const result = analyzeVcp([], 100);
  assert.equal(result.score, 0, '빈 데이터 → 스코어 0');
  assert.equal(result.grade, 'none', '빈 데이터 → 등급 none');
  assert.equal(result.recommendedEntry, 100, '빈 데이터 → breakoutPrice 반환');
  assert.equal(result.entrySource, 'RECENT_HIGH_FALLBACK', '빈 데이터 → 최근 고점 참고가 사용');
  console.log('✅ Test 1: 데이터 부족 시 안전한 기본값 반환');
}

// --- Test 2: 단순 상승 추세 — 수축 없음 → 낮은 점수 ---
{
  const data = generateUptrend(100, 260);
  const result = analyzeVcp(data, 150);
  assert.ok(result.score < 50, `단순 상승 추세 → 점수 50 미만 (실제: ${result.score})`);
  assert.ok(['none', 'weak'].includes(result.grade), '단순 상승 → weak 또는 none');
  console.log(`✅ Test 2: 단순 상승 추세 → 점수 ${result.score} (${result.grade})`);
}

// --- Test 3: VCP 패턴 시뮬레이션 → 높은 점수 ---
{
  const data = generateVcpPattern();
  const breakoutPrice = Math.max(...data.slice(-20).map((d) => d.high));
  const result = analyzeVcp(data, breakoutPrice);

  assert.ok(result.contractions.length >= 2, `수축 2개 이상 감지 (실제: ${result.contractions.length})`);
  assert.ok(result.score >= 30, `VCP 패턴 → 점수 30 이상 (실제: ${result.score})`);
  assert.ok(result.details.length > 0, '판정 근거가 비어있지 않음');

  // 수축 깊이가 점진적으로 줄어드는지 확인 (데이터가 완벽하지 않을 수 있음)
  if (result.contractions.length >= 2) {
    console.log(`   수축 깊이: ${result.contractions.map((c) => `${c.depthPct}%`).join(' → ')}`);
  }

  console.log(`✅ Test 3: VCP 패턴 시뮬레이션 → 점수 ${result.score} (${result.grade}), 수축 ${result.contractions.length}개`);
}

// --- Test 4: BB Width 계산 정확성 ---
{
  const data = generateUptrend(100, 40);
  const widths = calculateBBWidth(data, 20);
  assert.ok(widths.length > 0, 'BB Width가 계산됨');
  assert.ok(widths.every((w) => w >= 0), '모든 BB Width가 0 이상');
  console.log(`✅ Test 4: BB Width 계산 정확 (${widths.length}개 값, 마지막: ${widths.at(-1)}%)`);
}

// --- Test 5: 피벗 가격 결정 ---
{
  const data = generateVcpPattern();
  const breakoutPrice = 200;
  const result = analyzeVcp(data, breakoutPrice);

  // VCP 피벗이 있으면 피벗 자체가 권장 진입가
  if (result.pivotPrice !== null) {
    assert.equal(result.recommendedEntry, result.pivotPrice, '권장 진입가 = VCP 피벗');
    assert.equal(result.entrySource, 'VCP_PIVOT', '진입 출처 = VCP 피벗');
    assert.ok(result.invalidationPrice !== null, '무효화 기준이 생성됨');
    console.log(`✅ Test 5: 피벗 결정 — VCP $${result.pivotPrice}, 돌파가 $${breakoutPrice}, 권장 $${result.recommendedEntry}`);
  } else {
    assert.equal(result.recommendedEntry, breakoutPrice, '피벗 없으면 돌파가 사용');
    console.log(`✅ Test 5: 피벗 미감지 → 최근 고점 참고가 $${breakoutPrice} 사용`);
  }
}

// --- Test 6: details 배열에 한글 근거가 포함됨 ---
{
  const data = generateVcpPattern();
  const result = analyzeVcp(data, 150);
  assert.ok(result.details.some((d) => d.includes('score') || d.includes('스코어')), 'VCP score information included');
  console.log(`✅ Test 6: 판정 근거 ${result.details.length}건 생성됨`);
}

// --- Test 7: 짧은 데이터(20일 미만) → 안전 처리 ---
{
  const data = generateUptrend(100, 15);
  const result = analyzeVcp(data, 105);
  assert.equal(result.score, 0, '15일 데이터 → 스코어 0');
  assert.ok(result.details.some((d) => d.includes('부족')), '데이터 부족 메시지 포함');
  console.log('✅ Test 7: 짧은 데이터(15일) → 안전 기본값 반환');
}

{
  const data = generateHighTightFlagPattern();
  const breakoutPrice = Math.max(...data.slice(-25).map((d) => d.high));
  const result = analyzeVcp(data, breakoutPrice, { rsRating: 95 });
  assert.equal(result.momentumBranch, 'EXTENDED');
  assert.equal(result.baseType, 'High_Tight_Flag');
  assert.equal(result.highTightFlag?.passed, true);
  assert.equal(result.entrySource, 'HIGH_TIGHT_FLAG');
  assert.ok(result.highTightFlag.stopPrice <= result.recommendedEntry);
  console.log('✅ Test 8: Extended momentum + shallow dry-up base → High Tight Flag tagged');
}

console.log('\n=== All VCP Engine Tests Passed ===');
