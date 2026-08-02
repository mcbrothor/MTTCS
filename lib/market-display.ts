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

export function friendlyMarketLabel(market: string | null | undefined) {
  if (market === 'US') return '미국 시장';
  if (market === 'KR') return '한국 시장';
  return market || '시장';
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

export function formatMovingAverageValue(value: number | string) {
  const numericValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue.toFixed(1) : String(value);
}

export function friendlyMetricValue(detail: MasterFilterMetricDetail) {
  const label = friendlyMetricLabel(detail.label);
  const value = detail.value;
  const raw = value === null ? '확인 필요' : String(value);
  const lower = raw.toLowerCase();

  if (label === '지수 평균선 위치' && raw.includes('/')) {
    const [ma50, ma200] = raw.split('/').map((item) => item.trim());
    return `50일선 ${formatMovingAverageValue(ma50)} · 200일선 ${formatMovingAverageValue(ma200)}`;
  }
  if (label === '강한 반등 확인 여부') {
    if (lower.includes('unconfirmed')) return '아직 확인되지 않음';
    if (lower.includes('confirmed')) return '강한 반등 확인';
  }
  if (label === '강한 업종' && lower.includes('sector')) {
    const count = raw.match(/\d+/)?.[0];
    return count ? `${count}개 업종 비교` : '업종 흐름 비교';
  }

  const unit = detail.unit?.toLowerCase();
  if (!unit) return raw;
  if (unit === '%') return `${raw}%`;
  if (unit === 'pts' || unit === 'point' || unit === 'points') return `${raw}포인트`;
  if (unit === 'day' || unit === 'days') return `${raw}일`;
  if (unit === 'ratio') return `${raw}배`;
  return raw;
}

export function friendlyMetricThreshold(detail: MasterFilterMetricDetail) {
  const label = friendlyMetricLabel(detail.label);
  const raw = String(detail.threshold);

  if (label === '지수 평균선 위치') {
    return '현재가가 50일선·200일선 위, 50일선이 200일선 위';
  }
  if (label === '시장 폭') return `${raw}% 이상이면 양호`;
  if (label === '시장 불안도') return `${raw} 이하이면 안정`;
  if (label === '강한 반등 확인 여부') return '하락 뒤 4일째 이후 거래량을 동반한 강한 반등';
  if (label === '분산일') return `${raw}일 미만이면 양호`;
  if (label === '새 고점 종목과 새 저점 종목의 힘겨루기') return `${raw}배 이상이면 양호`;
  if (label === '강한 업종') return '공격 업종 2개 이상이 최근 20일 상위권';
  if (label === '20일 평균 하루 변동폭') return '1.8% 이하면 안정 · 2.8% 이상이면 과열';
  return raw;
}

export function friendlyDataSource(source: string | null | undefined) {
  const raw = source?.trim();
  if (!raw) return '출처 확인 필요';
  const lower = raw.toLowerCase();
  const ticker = raw.match(/\b(SPY|QQQ|MAGS|KOSPI 200)\b/i)?.[0]?.toUpperCase();

  if (lower.includes('e2e fixture') || lower === 'mock') return '화면 검증용 데이터';
  if (lower.includes('mtn aggregator') || lower.includes('market analysis engine')) return '통합 시장 데이터 · 자체 분석';
  if (lower.includes('roundhill') || lower.includes('mags')) return '빅테크 7종목 묶음 데이터';
  if (lower.includes('cboe')) return '옵션 시장 데이터';
  if (lower.includes('sector etf')) return '업종 상장지수펀드 대용값';
  if (lower.includes('breadth proxy') || lower.includes('etf proxy')) return '시장 참여 폭 대용값';
  if (lower.includes('high/low range')) return `${ticker ?? '대표 지수'} 고가·저가 데이터`;
  if (lower.includes('volume proxy')) return `${ticker ?? '대표 지수'} 거래량 대용값`;
  if (lower.includes('yahoo finance') || lower === 'yahoo') return `미국 시장 데이터${ticker ? ` · ${ticker}` : ''}`;
  if (lower.includes('kis')) return '한국 시장 데이터';
  if (lower.includes('proxy')) return `${ticker ?? '시장'} 대용값`;
  return raw;
}

const SECTOR_LABELS: Record<string, string> = {
  Technology: '기술',
  'Consumer Discretionary': '자유소비재',
  'Communication Services': '커뮤니케이션 서비스',
  Industrials: '산업재',
  Financials: '금융',
  'Health Care': '헬스케어',
  Energy: '에너지',
  'Consumer Staples': '필수소비재',
  Utilities: '유틸리티',
  Materials: '소재',
};

const US_FUND_LABELS: Record<string, string> = {
  XLK: '미국 기술 업종 상장지수펀드',
  XLY: '미국 자유소비재 업종 상장지수펀드',
  XLC: '미국 커뮤니케이션 서비스 업종 상장지수펀드',
  XLI: '미국 산업재 업종 상장지수펀드',
  XLF: '미국 금융 업종 상장지수펀드',
  XLV: '미국 헬스케어 업종 상장지수펀드',
  XLE: '미국 에너지 업종 상장지수펀드',
  XLP: '미국 필수소비재 업종 상장지수펀드',
  XLU: '미국 유틸리티 업종 상장지수펀드',
  XLB: '미국 소재 업종 상장지수펀드',
};

export function friendlySectorLabel(sector: string | null | undefined) {
  if (!sector) return '업종 확인 필요';
  return SECTOR_LABELS[sector] ?? sector;
}

export function friendlyFundName(symbol: string, name: string | null | undefined) {
  return US_FUND_LABELS[symbol] ?? name ?? symbol;
}

export function friendlyIssue(message: string | null | undefined) {
  if (!message) return null;
  const lower = message.toLowerCase();

  if (lower.includes('authentication') || lower.includes('unauthorized')) {
    return '데이터 연결 인증이 필요합니다. 로그인 상태와 서버 연결을 확인해 주세요.';
  }
  if (lower.includes('timeout') || lower.includes('aborted')) {
    return '데이터 응답이 늦어지고 있습니다. 최근 정상 값 또는 다음 갱신을 기다려 주세요.';
  }
  if (lower.includes('daily history is stale')) {
    return '장마감 데이터와 현재 시세의 기준 시각이 달라 오늘 판단을 보수적으로 낮췄습니다.';
  }
  if (lower.includes('korea index shock is beyond -5')) {
    return '국내 지수가 장중 5% 이상 급락해 이동평균선과 관계없이 새 매수를 중단했습니다.';
  }
  if (lower.includes('korea index shock is beyond -3')) {
    return '국내 지수가 장중 3% 이상 하락해 오늘은 진입 가능 판정을 내리지 않습니다.';
  }
  if (lower.includes('us intraday risk shock is severe')) {
    return '미국 증시의 장중 하락 폭이 중단 기준을 넘어 새 매수를 멈췄습니다.';
  }
  if (lower.includes('us intraday risk shock detected')) {
    return '미국 증시의 장중 하락 폭이 주의 기준을 넘어 오늘은 진입 가능 판정을 내리지 않습니다.';
  }
  return message;
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
