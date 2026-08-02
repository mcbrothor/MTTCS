export type FlowStepKey =
  | 'home'
  | 'market'
  | 'scanner'
  | 'watchlist'
  | 'plan'
  | 'portfolio'
  | 'contest'
  | 'review';

export interface FlowStepTab {
  href: string;
  label: string;
}

export interface FlowStep {
  key: FlowStepKey;
  step: string;
  label: string;
  sub: string;
  href: string;
  matchers: string[];
  tabs: FlowStepTab[];
}

export interface StrategyLink {
  href: string;
  label: string;
  sub: string;
  matchers: string[];
}

export const FLOW_STEPS: FlowStep[] = [
  {
    key: 'home',
    step: '00',
    label: '오늘',
    sub: '의사결정',
    href: '/',
    matchers: ['/'],
    tabs: [],
  },
  {
    key: 'market',
    step: '01',
    label: '시장 분석',
    sub: '진입 조건 확인',
    href: '/master-filter',
    matchers: ['/master-filter', '/macro', '/market-barometer', '/intelligence'],
    tabs: [
      { href: '/master-filter', label: '오늘의 결론' },
      { href: '/macro', label: '시장 밖 위험 점검' },
      { href: '/market-barometer', label: '과열 바로미터' },
      { href: '/intelligence', label: '실시간 인텔리전스' },
    ],
  },
  {
    key: 'scanner',
    step: '02',
    label: '종목 발굴',
    sub: 'SEPA/VCP · CAN SLIM',
    href: '/scanner',
    matchers: ['/scanner', '/canslim', '/leader', '/momentum', '/qullamaggie', '/reversal', '/cross-check'],
    tabs: [
      { href: '/scanner', label: '미너비니 스크리닝' },
      { href: '/canslim', label: '윌리엄 오닐 스크리닝' },
      { href: '/leader', label: '주도주 스캐너' },
      { href: '/momentum', label: '모멘텀 스캐너' },
      { href: '/qullamaggie', label: '쿨라매기 스캐너' },
      { href: '/reversal', label: '전환 초입' },
    ],
  },
  {
    key: 'contest',
    step: '03',
    label: '콘테스트',
    sub: 'LLM 비교 분석',
    href: '/contest',
    matchers: ['/contest'],
    tabs: [],
  },
  {
    key: 'watchlist',
    step: '04',
    label: '관심종목',
    sub: '후보 추적',
    href: '/watchlist',
    matchers: ['/watchlist'],
    tabs: [],
  },
  {
    key: 'plan',
    step: '05',
    label: '매매 계획',
    sub: '리스크 계산',
    href: '/plan',
    matchers: ['/plan'],
    tabs: [],
  },
  {
    key: 'portfolio',
    step: '06',
    label: '포트폴리오',
    sub: '노출도 점검',
    href: '/portfolio',
    matchers: ['/portfolio'],
    tabs: [],
  },
  {
    key: 'review',
    step: '07',
    label: '성과 복기',
    sub: '결과 축적',
    href: '/history',
    matchers: ['/history', '/recommendations'],
    tabs: [
      { href: '/history', label: '매매 복기' },
      { href: '/history?view=stats', label: '성과 통계' },
      { href: '/recommendations', label: '추천 이력' },
      { href: '/recommendations?view=metrics', label: '추천 성과' },
      { href: '/recommendations?view=diagnostics', label: '원인 분석' },
    ],
  },
];

export const STRATEGY_LINKS: StrategyLink[] = [
  {
    href: '/gold',
    label: '금 투자',
    sub: '코어·전술 전략',
    matchers: ['/gold'],
  },
  {
    href: '/nasdaq',
    label: '나스닥100',
    sub: 'QQQ·QLD·TQQQ',
    matchers: ['/nasdaq', '/qqq'],
  },
];

export const UTILITY_LINKS = [
  { href: '/guide', label: '사용 가이드' },
  { href: '/links', label: '링크 허브' },
  { href: '/admin', label: '관리' },
  { href: '/admin/local-analysis', label: '분석 큐' },
];

function matchesPath(pathname: string, matcher: string) {
  if (matcher === '/') return pathname === '/';
  return pathname === matcher || pathname.startsWith(`${matcher}/`);
}

export function findActiveFlowStep(pathname: string) {
  return FLOW_STEPS.find((step) => step.matchers.some((matcher) => matchesPath(pathname, matcher)));
}

export function getActiveFlowStep(pathname: string) {
  return findActiveFlowStep(pathname) ?? FLOW_STEPS[0];
}

export function findActiveStrategyLink(pathname: string) {
  return STRATEGY_LINKS.find((item) => item.matchers.some((matcher) => matchesPath(pathname, matcher)));
}

export function isActiveTab(pathname: string, href: string, search = '') {
  const [tabPath] = href.split('?');
  if (!matchesPath(pathname, tabPath)) return false;
  const [, tabSearch] = href.split('?');
  if (!tabSearch) return !search.includes('view=');
  return search === tabSearch;
}
