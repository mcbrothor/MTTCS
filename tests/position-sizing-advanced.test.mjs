import assert from 'node:assert/strict';
import {
  evaluateSectorClusterRisk,
  generateExitRulesPlan,
} from '../lib/finance/core/position-sizing.ts';

// Test 1: 섹터 노출 한도(25%) 이내인 경우 통과
{
  const result = evaluateSectorClusterRisk({
    totalEquity: 100_000_000,
    targetSector: 'Semiconductor',
    proposedShares: 100,
    entryPrice: 100_000, // 10,000,000 (10% 노출)
    stopLossPrice: 92_000, // 800,000 리스크 (0.8% 리스크)
    existingPositions: [
      { ticker: '005930', sector: 'Semiconductor', positionValue: 10_000_000, openRiskAmount: 800_000 },
    ],
  });

  assert.equal(result.allowed, true);
  assert.equal(result.recommendedShares, 100);
  assert.equal(result.projectedSectorExposurePct, 0.2); // 20%
}

// Test 2: 섹터 노출 한도(25%) 초과 시 주수 제한 및 경고
{
  const result = evaluateSectorClusterRisk({
    totalEquity: 100_000_000,
    targetSector: 'Semiconductor',
    proposedShares: 200, // 20,000,000 시도 -> 합계 35,000,000 (35%로 25% 한도 초과)
    entryPrice: 100_000,
    stopLossPrice: 92_000,
    existingPositions: [
      { ticker: '005930', sector: 'Semiconductor', positionValue: 15_000_000, openRiskAmount: 1_000_000 },
    ],
    maxSectorExposureLimitPct: 0.25,
  });

  // 잔여 한도 = 25,000,000 - 15,000,000 = 10,000,000 -> 100주로 축소 추천
  assert.equal(result.recommendedShares, 100);
  assert.ok(result.reason?.includes('섹터 집중도'));
}

// Test 3: 2R/3R 분할 익절 및 트레일링 스탑 가이드라인 플랜 생성 검증
{
  const plan = generateExitRulesPlan(100, 92); // 1R = 8
  assert.equal(plan.riskPerShare, 8);
  assert.equal(plan.target1R, 108);
  assert.equal(plan.target2R, 116);
  assert.equal(plan.target3R, 124);
  assert.equal(plan.target4R, 132);
  assert.equal(plan.milestones.length, 4);
  assert.equal(plan.milestones[1].rMultiple, 2);
  assert.ok(plan.milestones[1].actionDescription.includes('1차 분할 익절'));
}

console.log('position sizing advanced tests passed');
