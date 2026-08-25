import assert from 'node:assert/strict';
import { calculateConfluenceScore } from '../lib/finance/engines/confluence-score.ts';

// Test 1: S-Tier - 4개 이상 전략 일치 (VCP + RS 95 + CANSLIM + RVOL 2.5x + 52주 신고가)
{
  const result = calculateConfluenceScore({
    vcpScore: 85,
    rsRating: 95,
    canslimPassed: true,
    rvol: 2.5,
    fiftyTwoWeekHighBreakout: true,
    institutionalFlowPositive: true,
  }, 'US');

  assert.equal(result.tier, 'S');
  assert.equal(result.recommendationAction, 'IMMEDIATE_ACTION');
  assert.ok(result.score >= 80);
  assert.ok(result.matchedStrategiesCount >= 4);
}

// Test 2: A-Tier - 3개 전략 일치 (RS 85 + VCP + RVOL)
{
  const result = calculateConfluenceScore({
    vcpScore: 70,
    rsRating: 85,
    rvol: 1.5,
  }, 'US');

  assert.equal(result.tier, 'A');
  assert.equal(result.recommendationAction, 'HIGH_WATCH');
  assert.equal(result.matchedStrategiesCount, 3);
}

// Test 3: KR 시장 기관/외인 수급 가중치 차등 적용 검증
{
  const krResult = calculateConfluenceScore({
    vcpScore: 70,
    institutionalFlowPositive: true,
  }, 'KR');

  const usResult = calculateConfluenceScore({
    vcpScore: 70,
    institutionalFlowPositive: true,
  }, 'US');

  assert.ok(krResult.score > usResult.score, 'KR 시장에서 수급 가중치가 더 높아야 함');
}

// Test 4: 미달 신호 (C-Tier)
{
  const result = calculateConfluenceScore({
    rsRating: 50,
    rvol: 0.8,
  });

  assert.equal(result.tier, 'C');
  assert.equal(result.recommendationAction, 'IGNORE');
  assert.equal(result.matchedStrategiesCount, 0);
}

console.log('confluence score tests passed');
