export interface GlossaryEntry {
  code: string;
  term: string;
  alias: string;
  icon: string;
  oneLiner: string;
  formula?: string;
  detail?: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    code: 'vcp',
    term: 'VCP',
    alias: '변동성 압축 패턴',
    icon: '🫧',
    oneLiner: '주가 출렁임이 점점 좁아지며 힘을 모으는 구간 (0~100 점수)',
    formula: 'score = 100 × (1 − σ_last / σ_first) × tightness_weight',
    detail: 'Volatility Contraction Pattern. 상승 추세 종목이 매물을 소화하며 수축되는 과정. 70점 이상이면 피벗 돌파 시 신뢰도 높음.',
  },
  {
    code: 'sepa',
    term: 'SEPA',
    alias: '미너비니 8대 조건',
    icon: '✅',
    oneLiner: '추세주의 기술적·수급 조건 체크리스트 (Specific Entry Point Analysis)',
    detail: '마크 미너비니의 SEPA 기법. 8개 조건(추세·상대강도·기관수급 등)을 모두 충족해야 진입 허가.',
  },
  {
    code: 'ftd',
    term: 'FTD (Follow-Through Day)',
    alias: '상승 신호일',
    icon: '🚀',
    oneLiner: '하락 후 큰 거래량 상승으로 반전 확률이 높아지는 날',
    detail: '윌리엄 오닐의 FTD 개념. 랠리 4일째 이후 +1.5% 이상 대거래량 상승 시 바닥 반전 신호.',
  },
  {
    code: 'distribution',
    term: '분산일 (Distribution Day)',
    alias: '기관 매도일',
    icon: '📉',
    oneLiner: '거래량 증가와 함께 하락한 날 — 기관 매도 의심',
    detail: '최근 25거래일 기준 5개 이상이면 시장 약화 신호. 지수가 전일 대비 -0.2% 이상 하락 + 거래량 증가.',
  },
  {
    code: 'rs',
    term: 'RS Rating',
    alias: '상대 강도 1~99',
    icon: '💪',
    oneLiner: '최근 1년 동안 전체 종목 대비 얼마나 잘 올랐는지 백분위',
    detail: '80 이상이면 상위 20% 강세주. 진입 후보는 최소 80점 권장.',
  },
  {
    code: 'pivot',
    term: '피벗 (Pivot)',
    alias: '돌파 가격',
    icon: '🎯',
    oneLiner: '매집 박스의 고점 — 이 가격을 거래량과 함께 뚫으면 매수',
    detail: 'Base의 핸들 또는 박스 고점. 거래량이 평균의 1.5배 이상이어야 신뢰도 있는 돌파.',
  },
  {
    code: 'r-multiple',
    term: 'R-multiple',
    alias: '손실 대비 수익 배수',
    icon: '⚖️',
    oneLiner: '1R = 최초 손절 금액. +2R = 감수한 리스크의 2배 수익',
    formula: 'R = (현재가 - 진입가) / (진입가 - 손절가)',
    detail: '리스크 단위로 성과를 정규화. 목표: Expectancy > +0.2R.',
  },
  {
    code: 'breadth',
    term: '200일선 참여율',
    alias: '추세 동참률',
    icon: '🌊',
    oneLiner: '전체 종목 중 200일 이동평균선 위에 있는 비율 (시장 체력)',
    detail: '50% 이상이면 과반 종목이 장기 상승세. 30% 이하면 약세장 경계.',
  },
  {
    code: 'ma-convergence',
    term: '이동평균선 밀집',
    alias: '이평선 수렴',
    icon: '🧲',
    oneLiner: '50/150/200일선이 좁은 범위에 모여 방향 선택 임박',
    detail: '세 이평선의 간격이 3% 이내면 밀집 상태. 돌파 방향이 중요.',
  },
  {
    code: 'expectancy',
    term: 'Expectancy',
    alias: '1회 매매 기대값',
    icon: '🎰',
    oneLiner: '(승률 × 평균수익) − (패률 × 평균손실) — 양수면 시스템 유효',
    formula: 'E = (winRate × avgWin) - (lossRate × avgLoss)',
    detail: '0 이상이면 장기 생존 가능. +0.2R 이상이면 우위 있는 시스템.',
  },
  {
    code: 'adherence',
    term: 'Plan Adherence',
    alias: '계획 준수율',
    icon: '📏',
    oneLiner: '진입/손절/목표가를 계획대로 지킨 매매 비율',
    detail: '80% 이상이 목표. 낮다면 감정적 개입이 시스템을 훼손하고 있는 신호.',
  },
  {
    code: 'regime',
    term: 'Regime Score',
    alias: '시장 날씨 점수',
    icon: '🌤️',
    oneLiner: '6개 지표 종합 — 70↑ 맑음 · 40~70 흐림 · 40↓ 비',
    detail: 'SPY추세·HYG/IEF·VIX·달러금리·구리금·시장폭 6개 항목 합산 (100점 만점).',
  },
];

export function getGlossaryEntry(code: string): GlossaryEntry | undefined {
  return GLOSSARY.find((e) => e.code === code);
}
