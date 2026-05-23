export interface GlossaryItem {
  term: string;
  nickname: string;
  definition: string;
  guide?: string;
}

export const GLOSSARY: Record<string, GlossaryItem> = {
  VCP: {
    term: 'Volatility Contraction Pattern',
    nickname: '변동성 축소 패턴',
    definition: '주가가 컵이나 핸들 모양을 만들며 변동성이 점점 줄어드는 패턴입니다. 매물이 소화되고 있음을 의미합니다.',
    guide: '변동성이 좁아질수록(Tighter) 돌파 시의 에너지가 강해집니다.',
  },
  RS: {
    term: 'Relative Strength',
    nickname: '상대적 강도',
    definition: '시장(지수) 대비 해당 종목이 얼마나 강하게 움직이는지를 1~99 점수로 나타낸 지표입니다.',
    guide: '점수가 90점 이상인 종목은 시장 상위 10%의 주도주임을 의미합니다.',
  },
  SEPA: {
    term: 'Specific Entry Point Analysis',
    nickname: '정밀 타점 분석',
    definition: '마크 미너비니의 전략으로, 펀더멘털과 기술적 조건이 모두 충족되는 최적의 매수 시점을 찾는 분석법입니다.',
  },
  DISTRIBUTION_DAY: {
    term: 'Distribution Day',
    nickname: '기관 매도일',
    definition: '지수가 하락하면서 거래량이 전일보다 늘어난 날입니다. 큰 손들이 물량을 털어내고 있다는 신호입니다.',
    guide: '최근 4주 내에 기관 매도일이 5~6회 이상 쌓이면 시장 위험이 매우 높습니다.',
  },
  PIVOT: {
    term: 'Pivot Point',
    nickname: '최적 돌파 지점',
    definition: '주가가 저항선을 뚫고 상승하기 직전의 최소 저항 지점입니다.',
  },
  POCKET_PIVOT: {
    term: 'Pocket Pivot',
    nickname: '매집 돌파 시그널',
    definition: '베이스 안에서 거래량이 터지며 10일 또는 50일 이동평균선을 돌파하는 선제적 매수 신호입니다.',
  },
  EPS: {
    term: 'Earnings Per Share',
    nickname: '분기 순이익 성장',
    definition: '전년 동기 대비 주당 순이익의 증가율입니다. 우량주는 최소 25% 이상의 성장을 보여야 합니다.',
  },
  REVENUE: {
    term: 'Revenue Growth',
    nickname: '분기 매출 성장',
    definition: '회사의 매출 규모가 전년 동기 대비 얼마나 늘었는지 나타냅니다. 이익 성장과 함께 매출 성장이 동반되어야 진짜입니다.',
  },
  ROE: {
    term: 'Return On Equity',
    nickname: '자기자본이익률',
    definition: '회사가 주주의 돈을 얼마나 효율적으로 사용하여 이익을 내고 있는지 보여줍니다.',
    guide: '오닐은 연간 ROE가 최소 17% 이상인 종목을 추천합니다.',
  },
  TENNIS_BALL: {
    term: 'Tennis Ball Action',
    nickname: '테니스 공 반등',
    definition: '주가가 시장 하락 시 같이 떨어졌다가, 시장이 멈추면 테니스공처럼 빠르게 튀어 오르는 강한 탄력성입니다.',
    guide: '계란처럼 바닥에 붙어있는 종목보다 테니스공처럼 튀어 오르는 종목을 사야 합니다.',
  },
  C: {
    term: 'Current Quarterly Earnings',
    nickname: '분기 실적',
    definition: '최근 분기 주당순이익(EPS)이 전년 동기 대비 최소 25% 이상 증가했는지 확인합니다.',
  },
  A: {
    term: 'Annual Earnings Increases',
    nickname: '연간 실적',
    definition: '지난 3년간 연간 이익이 꾸준히 성장했는지, ROE가 17% 이상인지 확인합니다.',
  },
  N: {
    term: 'New Product, Service, Management, or Highs',
    nickname: '신고가/신제품',
    definition: '새로운 성장 동력이 있거나, 주가가 긴 횡보 끝에 신고가를 돌파하는 시점입니다.',
  },
  S: {
    term: 'Supply and Demand',
    nickname: '수급/발행주식수',
    definition: '발행 주식 수가 적당하고, 거래량이 수반되며 주가가 상승하는지 확인합니다.',
  },
  L: {
    term: 'Leader or Laggard',
    nickname: '주도주 여부',
    definition: '해당 업종 내에서 상대강도(RS) 점수가 80점 이상인 주도주를 선택해야 합니다.',
  },
  I: {
    term: 'Institutional Sponsorship',
    nickname: '기관의 매수',
    definition: '최근 기관 투자자들의 보유 비중이 늘어나고 있는지, 우량 기관이 참여했는지 확인합니다.',
  },
};
