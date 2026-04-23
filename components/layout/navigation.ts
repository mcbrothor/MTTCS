export type FlowStepKey =
  | 'dashboard'
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

export const FLOW_STEPS: FlowStep[] = [
  {
    key: 'dashboard',
    step: '01',
    label: '대시보드',
    sub: '커맨드 센터',
    href: '/',
    matchers: ['/'],
    tabs: [],
  },
  {
    key: 'market',
    step: '02',
    label: '시장 분석',
    sub: '진입 조건 확인',
    href: '/master-filter',
    matchers: ['/master-filter', '/macro'],
    tabs: [
      { href: '/master-filter', label: '마스터 필터' },
      { href: '/macro', label: '매크로' },
    ],
  },
  {
    key: 'scanner',
    step: '03',
    label: '종목 발굴',
    sub: '미너비니 · 오닐',
    href: '/scanner',
    matchers: ['/scanner', '/canslim'],
    tabs: [
      { href: '/scanner', label: '미너비니 스캐너' },
      { href: '/canslim', label: '오닐 스캐너' },
    ],
  },
  {
    key: 'watchlist',
    step: '04',
    label: '관심 종목',
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
    key: 'contest',
    step: '07',
    label: '콘테스트',
    sub: 'LLM 비교 분석',
    href: '/contest',
    matchers: ['/contest'],
    tabs: [],
  },
  {
    key: 'review',
    step: '08',
    label: '성과 복기',
    sub: '히스토리',
    href: '/history',
    matchers: ['/history'],
    tabs: [],
  },
];

export const UTILITY_LINKS = [
  { href: '/guide', label: '가이드' },
  { href: '/links', label: '링크 허브' },
  { href: '/admin', label: '관리' },
];

function matchesPath(pathname: string, matcher: string) {
  if (matcher === '/') return pathname === '/';
  return pathname === matcher || pathname.startsWith(`${matcher}/`);
}

export function getActiveFlowStep(pathname: string) {
  return FLOW_STEPS.find((step) => step.matchers.some((matcher) => matchesPath(pathname, matcher))) ?? FLOW_STEPS[0];
}

export function isActiveTab(pathname: string, href: string) {
  return matchesPath(pathname, href);
}
