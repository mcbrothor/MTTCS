import type { MacroRegime, MarketState, MasterFilterMetricDetail } from '@/types';
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

  if (lower.includes('trend') || source.includes('추세')) return '추세';
  if (lower.includes('breadth') || source.includes('시장 폭')) return '함께 오르는 종목 비율';
  if (lower.includes('volatility') || lower.includes('vix') || source.includes('변동성')) return '시장 불안도';
  if (lower.includes('follow-through') || lower === 'ftd' || source.includes('팔로')) return '반등 확인일';
  if (lower.includes('distribution') || source.includes('분산') || source.includes('분배')) return '큰손 매도 흔적';
  if (lower.includes('nh/nl') || lower.includes('new high') || source.includes('신고가')) return '새 고점/새 저점 균형';
  if (lower.includes('sector') || source.includes('섹터')) return '강한 업종';

  return source;
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
  if (decision === 'GO_FULL') return '투자 가능 · 권장 비중 100%';
  if (decision === 'GO_75') return '투자 가능 · 권장 비중 75%';
  if (decision === 'GO_50') return '투자 가능하지만 조심 · 권장 비중 50%';
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
    return '진입 가능 신호가 위험 구간입니다. 큰 흐름이 좋아 보여도 새 매수보다 현금 확보와 보유 종목 방어가 먼저입니다.';
  }

  if (state === 'YELLOW') {
    return '진입 가능 신호가 아직 충분히 좋아지지 않았습니다. 새 매수는 보류하고 기존 포지션만 관리합니다.';
  }

  if (regime === 'RISK_ON') {
    return '진입 가능 신호가 좋고 큰 흐름도 우호적입니다. 계획한 종목을 정상 비중 안에서 검토할 수 있습니다.';
  }

  if (regime === 'RISK_OFF') {
    return '진입 가능 신호는 통과했지만 큰 흐름이 불안합니다. 새 매수를 하더라도 절반 비중과 더 엄격한 손절선이 필요합니다.';
  }

  return '진입 가능 신호는 좋지만 큰 흐름이 뚜렷하지 않습니다. 정상보다 작은 비중으로 조심스럽게 접근합니다.';
}
