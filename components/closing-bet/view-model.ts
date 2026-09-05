import type { ClosingCandidate, ClosingMarket, ClosingMode, ClosingSnapshot } from '../../lib/closing-bet/types';

const EXPLANATIONS: Record<string, string> = {
  LATE_STRENGTH_HELD: '장 후반 가격 강도 유지',
  MEASURED_TURNOVER_QUALIFIED: '실측 거래대금 기준 충족',
  UPTREND_BREAKOUT_HELD: '상승 추세와 돌파 가격 유지',
  FOREIGN_INSTITUTION_BUYING: '외국인·기관 동반 순매수',
  PRICE_MISSING: '현재가를 확인할 수 없습니다.',
  MEASURED_TURNOVER_MISSING: '실측 거래대금이 없습니다.',
  TURNOVER_BELOW_500EOK: '거래대금 500억원 기준 미달',
  DAILY_HISTORY_INSUFFICIENT: '추세를 평가할 일봉 기록이 부족합니다.',
  ATR_MISSING: '평균 가격 변동폭을 확인할 수 없습니다.',
  FULL_SESSION_VWAP_MISSING: '장 시작 이후 거래량 가중 평균가격이 불완전합니다.',
  MINUTES_STALE_OR_MISSING: '분봉 데이터가 오래되었거나 부족합니다.',
  RANGE_POSITION_MISSING: '당일 고가·저가 대비 가격 위치를 확인할 수 없습니다.',
  WEAK_CLOSE_POSITION: '당일 고가 대비 가격 유지력이 부족합니다.',
  BELOW_VWAP: '거래량 가중 평균가격 아래로 하락',
  TREND_NOT_ALIGNED: '이동평균선 상승 정배열 미충족',
  BREAKOUT_NOT_HELD: '돌파 가격을 유지하지 못함',
  RVOL_BELOW_1_5: '동시간 상대 거래량 1.5배 미달',
  LATE_RELATIVE_STRENGTH_WEAK: '장 후반 시장 대비 상대 강도 부족',
  OVEREXTENDED_FROM_VWAP: '평균 거래가격 대비 과도한 상승',
  KNOWN_EVENT_RISK: '확인된 공시·이벤트 위험',
  QUOTE_STALE_OR_UNVERIFIED: '호가·현재가의 최신성을 확인할 수 없습니다.',
  SECURITY_STATUS_UNKNOWN: '거래정지 등 종목 상태를 확인할 수 없습니다.',
  ORDER_BOOK_MISSING_OR_CROSSED: '유효한 매수·매도 호가를 확인할 수 없습니다.',
  SPREAD_TOO_WIDE: '매수·매도 호가 차이가 큽니다.',
  ORDER_BOOK_DEPTH_MISSING: '매수·매도 호가 잔량이 부족하거나 미확인입니다.',
  ENTRY_ATR_EXCEEDED: '현재 매도호가가 허용 진입 범위를 초과합니다.',
  REPLAY_NOT_ACTIONABLE: '과거 재현 후보로 현재 매수 추천에 해당하지 않습니다.',
  HISTORICAL_ORDER_BOOK_AND_STATUS_UNVERIFIED: '당시 호가와 거래 가능 상태는 확인되지 않았습니다.',
  SAME_TIME_RVOL_MISSING_NO_SCORE: '동시간 상대 거래량 미확인으로 해당 점수를 부여하지 않았습니다.',
  FLOW_UNAVAILABLE_AT_CUTOFF_NO_SCORE: '기준 시각에 확인 가능한 수급이 없어 해당 점수를 부여하지 않았습니다.',
  CATALYST_UNVERIFIED_NO_SCORE: '확인된 재료가 없어 해당 점수를 부여하지 않았습니다.',
  EXPECTED_PRICE_ABOVE_ENTRY_MAX: '예상체결가가 진입 상한을 초과합니다.',
  MARKET_COVERAGE_BELOW_95_PERCENT: '시장 데이터 수집률이 95%에 미달하여 추천을 보류합니다.',
  MARKET_REGIME_UNKNOWN: '시장 상태 미확인으로 추천을 보류합니다.',
  MARKET_REGIME_RED: '시장 위험 상태로 추천을 보류합니다.',
  LIVE_RECOMMENDATION_EXPIRED: '신규 진입이 가능한 유효시간이 종료되었습니다.',
  REPLAY_REVIEW_ONLY: '과거 재현 결과는 검토용입니다.',
  CURRENT_MEMBERSHIP_MAY_DIFFER_FROM_HISTORICAL: '현재 시총 상위 종목 목록은 과거 당시 목록과 다를 수 있습니다.',
  SECTOR_CONCENTRATION_LIMIT: '같은 업종 집중 제한 적용',
  CONDITIONAL_SIMULATION_NOT_ACTUAL_FILL: '조건 충족을 가정한 모의 성과이며 실제 체결 결과가 아닙니다.',
  AUCTION_FILL_AND_QUEUE_NOT_VERIFIED: '동시호가 배정과 실제 체결 여부는 검증하지 않았습니다.',
  CANDIDATE_SNAPSHOT_MISMATCH: '평가 대상과 저장된 추천이 일치하지 않습니다.',
  INVALID_NEXT_TRADE_DATE: '다음 거래일 정보가 유효하지 않습니다.',
  KRX_CLOSE_OR_NEXT_OPEN_MISSING: '당일 종가 또는 익일 시가가 없습니다.',
  ENTRY_PLAN_INVALID: '유효한 진입 조건이 없습니다.',
  CANDIDATE_EXCLUDED: '제외 조건에 해당하여 진입하지 않음',
  CLOSE_OUTSIDE_ENTRY_RANGE: '종가가 진입 범위를 벗어나 진입하지 않음',
  REVIEW_CANDIDATE_HYPOTHETICAL_ENTRY: '검토 후보가 진입했다고 가정한 계산입니다.',
  GAP_STOP_AT_OBSERVED_OPEN: '손절선을 하회한 시가로 청산 가정',
  GAP_TARGET_AT_OBSERVED_OPEN: '목표가를 상회한 시가로 청산 가정',
  TIME_STOP_FIRST_OPEN_AT_OR_AFTER_0930: '익일 09:30 이후 첫 분봉 시가로 시간 청산',
  STOP_FIRST_SAME_BAR_AMBIGUITY: '같은 분봉에서 손절·목표 동시 도달 시 손절 우선',
  STRUCTURAL_STOP: '무효화 가격 도달로 손절',
  SAME_BAR_BOTH_LEVELS_STOP_FIRST: '같은 분봉에서 손절·목표가에 모두 닿아 손절을 먼저 적용했습니다.',
  INTRABAR_EXTREMES_ORDER_UNKNOWN: '분봉 안에서 고가·저가의 도달 순서는 확인할 수 없습니다.',
  TARGET: '목표가 도달로 청산',
  EXIT_WINDOW_INCOMPLETE: '청산 시점까지의 분봉 데이터가 부족합니다.',
};

export function closingExplanation(value: string) {
  return EXPLANATIONS[value] || (/^[A-Z][A-Z0-9_]+$/.test(value) ? '추가 데이터 확인이 필요합니다.' : value);
}

export function selectClosingSnapshots(snapshots: ClosingSnapshot[], mode: ClosingMode, date = '') {
  const matching = snapshots.filter((snapshot) => snapshot.mode === mode && (!date || snapshot.tradeDate === date));
  const tradeDate = date || matching.map((snapshot) => snapshot.tradeDate).sort().at(-1) || '';
  const latest = new Map<ClosingMarket, ClosingSnapshot>();
  for (const snapshot of matching.filter((item) => item.tradeDate === tradeDate)) {
    const previous = latest.get(snapshot.market);
    if (!previous || snapshot.asOf > previous.asOf || (snapshot.asOf === previous.asOf && snapshot.createdAt > previous.createdAt)) {
      latest.set(snapshot.market, snapshot);
    }
  }
  return { tradeDate, latest };
}

export function displayedClosingCandidates(snapshot: ClosingSnapshot): ClosingCandidate[] {
  const candidates = snapshot.mode === 'REPLAY' || snapshot.phase === 'WATCH' ? snapshot.reviewCandidates : snapshot.picks;
  return candidates.slice(0, 5);
}

export function safeClosingEvidenceUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}
