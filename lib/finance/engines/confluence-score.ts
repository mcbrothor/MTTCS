export type ConfluenceTier = 'S' | 'A' | 'B' | 'C';

export interface StrategySignals {
  vcpScore?: number; // 0 ~ 100
  rsRating?: number; // 1 ~ 99
  canslimPassed?: boolean;
  canslimCriteriaCount?: number; // 0 ~ 7
  rvol?: number; // 예: 1.5 = 150%
  surgeGrade?: 'SUPER' | 'STRONG' | 'WATCH' | null;
  reversalConfirmed?: boolean;
  fiftyTwoWeekHighBreakout?: boolean;
  institutionalFlowPositive?: boolean; // KR: 외인/기관 순매수 양수, US: 기관 매집
}

export interface ConfluenceResult {
  score: number; // 0 ~ 100
  tier: ConfluenceTier;
  matchedStrategiesCount: number;
  matchedStrategyNames: string[];
  keyDrivers: string[];
  recommendationAction: 'IMMEDIATE_ACTION' | 'HIGH_WATCH' | 'WATCH' | 'IGNORE';
}

/**
 * 다중 전략 합의 점수 (Confluence Meta-Scorer)
 * 여러 트레이딩 전략(VCP, RS, CANSLIM, RVOL, Surge, Reversal, 수급 등)의 일치도를
 * 정량화하여 복합적 신호의 신뢰도를 판정합니다.
 */
export function calculateConfluenceScore(
  signals: StrategySignals,
  market: 'US' | 'KR' = 'US'
): ConfluenceResult {
  let score = 0;
  const matchedStrategies: string[] = [];
  const drivers: string[] = [];

  // 1. VCP 패턴 형성 및 강도 (최대 20점)
  if (typeof signals.vcpScore === 'number' && signals.vcpScore >= 60) {
    const vcpPoints = Math.min(20, Math.round((signals.vcpScore / 100) * 20));
    score += vcpPoints;
    matchedStrategies.push('VCP');
    drivers.push(`VCP 패턴 형성 (${signals.vcpScore}점)`);
  }

  // 2. Relative Strength (RS Rating) (최대 25점)
  if (typeof signals.rsRating === 'number' && signals.rsRating >= 70) {
    if (signals.rsRating >= 90) {
      score += 25;
      matchedStrategies.push('RS_LEADER');
      drivers.push(`최상위 RS 주도주 (${signals.rsRating}점)`);
    } else if (signals.rsRating >= 80) {
      score += 18;
      matchedStrategies.push('RS_STRONG');
      drivers.push(`강한 RS 모멘텀 (${signals.rsRating}점)`);
    } else {
      score += 10;
      matchedStrategies.push('RS_WATCH');
      drivers.push(`양호한 RS (${signals.rsRating}점)`);
    }
  }

  // 3. CANSLIM 펀더멘털/기관 수급 (최대 20점)
  if (signals.canslimPassed || (signals.canslimCriteriaCount && signals.canslimCriteriaCount >= 5)) {
    score += 20;
    matchedStrategies.push('CANSLIM');
    drivers.push('CANSLIM 펀더멘털 기준 충족');
  } else if (signals.canslimCriteriaCount && signals.canslimCriteriaCount >= 3) {
    score += 10;
    matchedStrategies.push('CANSLIM_PARTIAL');
    drivers.push(`CANSLIM 부분 충족 (${signals.canslimCriteriaCount}/7)`);
  }

  // 4. 거래량 폭증 (RVOL) (최대 15점)
  if (typeof signals.rvol === 'number' && signals.rvol >= 1.3) {
    if (signals.rvol >= 2.0) {
      score += 15;
      matchedStrategies.push('VOLUME_BURST');
      drivers.push(`거래량 폭증 (평균 대비 ${(signals.rvol * 100).toFixed(0)}%)`);
    } else {
      score += 10;
      matchedStrategies.push('VOLUME_SURGE');
      drivers.push(`유의미한 거래량 증가 (${(signals.rvol * 100).toFixed(0)}%)`);
    }
  }

  // 5. 52주 신고가 돌파 (최대 10점)
  if (signals.fiftyTwoWeekHighBreakout) {
    score += 10;
    matchedStrategies.push('52W_HIGH');
    drivers.push('52주 신고가 돌파');
  }

  // 6. 단기 급등(Surge) 또는 추세 전환(Reversal) (최대 10점)
  if (signals.surgeGrade === 'SUPER' || signals.surgeGrade === 'STRONG') {
    score += 10;
    matchedStrategies.push('SURGE');
    drivers.push(`급등 신호 감지 (${signals.surgeGrade})`);
  } else if (signals.reversalConfirmed) {
    score += 10;
    matchedStrategies.push('REVERSAL');
    drivers.push('바닥권 추세 전환 확인');
  }

  // 7. 한국 시장 특화: 기관/외인 수급 가중치 (KR 시장에서 중요도 상향)
  if (signals.institutionalFlowPositive) {
    const flowPoints = market === 'KR' ? 10 : 5;
    score += flowPoints;
    matchedStrategies.push('INSTITUTIONAL_FLOW');
    drivers.push(market === 'KR' ? '외인/기관 양매수 유입' : '기관 수급 유입');
  }

  // 점수 상한 100점 클램핑
  const finalScore = Math.min(100, Math.max(0, score));
  const count = matchedStrategies.length;

  let tier: ConfluenceTier = 'C';
  let recommendationAction: ConfluenceResult['recommendationAction'] = 'IGNORE';

  if (count >= 4 && finalScore >= 70) {
    tier = 'S';
    recommendationAction = 'IMMEDIATE_ACTION';
  } else if (count >= 3 && finalScore >= 40) {
    tier = 'A';
    recommendationAction = 'HIGH_WATCH';
  } else if (count >= 2 && finalScore >= 25) {
    tier = 'B';
    recommendationAction = 'WATCH';
  } else {
    tier = 'C';
    recommendationAction = 'IGNORE';
  }

  return {
    score: finalScore,
    tier,
    matchedStrategiesCount: count,
    matchedStrategyNames: matchedStrategies,
    keyDrivers: drivers,
    recommendationAction,
  };
}
