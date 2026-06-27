import type { EarlyWarningSeverity, MacroRegime, MarketState, MasterFilterMetricDetail } from '@/types';
import type { Decision } from '@/lib/decision/rule';

type DataCheck = 'DATA_CHECK';

export function friendlyMacroRegimeLabel(regime: MacroRegime | DataCheck | null | undefined) {
  if (regime === 'RISK_ON') return '투자하기 좋은 흐름';
  if (regime === 'NEUTRAL') return '애매한 흐름';
  if (regime === 'RISK_OFF') return '조심해야 할 흐름';
  return '데이터 확인 필요';
}

export function friendlyMarketStateLabel(state: MarketState | null | undefined) {
  if (state === 'GREEN') return '진입 가능';
  if (state === 'YELLOW') return '신규 매수 보류';
  if (state === 'RED') return '신규 매수 금지';
  return '데이터 확인 필요';
}

export function friendlyMetricLabel(label: string | null | undefined) {
  const source = label ?? '';
  const lower = source.toLowerCase();

  if (lower.includes('trend') || source.includes('추세')) return '지수 평균선 위치';
  if (lower.includes('breadth') || source.includes('시장 폭')) return '시장 폭';
  if (lower.includes('volatility') || lower.includes('vix') || source.includes('변동성')) return '시장 불안도';
  if (lower.includes('follow-through') || lower === 'ftd' || source.includes('팔로')) return '강한 반등 확인 여부';
  if (lower.includes('distribution') || source.includes('분산') || source.includes('분배')) return '분산일';
  if (lower.includes('nh/nl') || lower.includes('new high') || source.includes('신고가')) return '새 고점 종목과 새 저점 종목의 힘겨루기';
  if (lower.includes('sector') || source.includes('섹터')) return '강한 업종';
  if (lower.includes('average daily range') || lower === 'adr' || source.includes('ADR')) return '20일 평균 하루 변동폭';

  return source;
}

export function friendlyMetricDescription(label: string | null | undefined, fallback: string) {
  const friendly = friendlyMetricLabel(label);
  if (friendly === '지수 평균선 위치') return '대표 지수가 중요한 평균선 위에서 버티는지 봅니다.';
  if (friendly === '시장 폭') return '상승 흐름에 참여하는 종목이 충분한지 봅니다.';
  if (friendly === '시장 불안도') return '옵션 시장이 예상하는 불안 정도가 높아지는지 봅니다.';
  if (friendly === '강한 반등 확인 여부') return '하락 후 거래량을 동반한 강한 반등이 있었는지 봅니다.';
  if (friendly === '분산일') return '거래량이 늘면서 하락한 날이 누적되는지 봅니다.';
  if (friendly === '새 고점 종목과 새 저점 종목의 힘겨루기') return '새 고점 근처 종목이 새 저점 근처 종목보다 충분히 많은지 봅니다.';
  if (friendly === '강한 업종') return '돈이 성장·경기민감 업종으로 남아 있는지 봅니다.';
  if (friendly === '20일 평균 하루 변동폭') return '하루 중 가격 흔들림이 커져 포지션 크기를 줄여야 하는지 봅니다.';
  return fallback;
}

export function friendlyMacroComponentLabel(label: string | null | undefined) {
  const source = label ?? '';
  const lower = source.toLowerCase();

  if (source.includes('크레딧') || lower.includes('credit')) return '신용 시장';
  if (source.includes('변동성') || lower.includes('volatility')) return '시장 불안도';
  if (source.includes('달러') || source.includes('금리') || lower.includes('rates')) return '달러/금리 부담';
  if (source.includes('수익률 곡선') || lower.includes('curve')) return '금리 흐름';
  if (source.includes('경기 민감') || lower.includes('econ')) return '경기 민감 자산';
  if (source.includes('시장 폭') || lower.includes('breadth')) return '시장 참여 폭';
  if (lower.includes('leadership')) return '주도 자산 흐름';

  return source;
}

export function friendlyMetricStatus(status: MasterFilterMetricDetail['status']) {
  if (status === 'PASS') return '좋음';
  if (status === 'WARNING') return '주의';
  return '위험';
}

export function friendlyDecisionHeadline(decision: Decision, isUnscored: boolean) {
  if (isUnscored) return '데이터 확인 필요';
  if (decision === 'GO_FULL') return '정상 진입 가능';
  if (decision === 'GO_75') return '작게 진입 가능';
  if (decision === 'GO_50') return '비중 줄여 진입';
  if (decision === 'NO_GO') return '방어 우선';
  return '신규 매수 보류';
}

export function friendlyDecisionReason(
  state: MarketState,
  regime: MacroRegime | null,
  isUnscored: boolean
) {
  if (isUnscored || state === 'GREY') {
    return '필수 데이터가 아직 완전하지 않습니다. 시장이 나쁘다는 뜻이 아니라, 판단을 잠시 멈추고 데이터를 확인해야 하는 상태입니다.';
  }

  if (state === 'RED') {
    return '지금 새로 사기에는 위험 구간입니다. 시장 밖 흐름이 좋아 보여도 새 매수보다 현금 확보와 보유 종목 방어가 먼저입니다.';
  }

  if (state === 'YELLOW') {
    return '지금 새로 사도 된다는 근거가 아직 충분하지 않습니다. 새 매수는 보류하고 기존 포지션만 관리합니다.';
  }

  if (regime === 'RISK_ON') {
    return '시장 내부 건강도와 시장 밖 흐름이 모두 우호적입니다. 계획한 종목을 정상 비중 안에서 검토할 수 있습니다.';
  }

  if (regime === 'RISK_OFF') {
    return '시장 내부 건강도는 통과했지만 시장 밖 위험이 불안합니다. 새 매수를 하더라도 절반 비중과 더 엄격한 손절선이 필요합니다.';
  }

  return '시장 내부 건강도는 좋지만 시장 밖 흐름이 뚜렷하지 않습니다. 정상보다 작은 비중으로 조심스럽게 접근합니다.';
}

export function friendlyEarlyWarningStatus(status: EarlyWarningSeverity) {
  if (status === 'OK') return '정상';
  if (status === 'WATCH') return '주의';
  if (status === 'REDUCE') return '축소';
  return '중단';
}
