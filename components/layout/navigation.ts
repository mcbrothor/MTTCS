export type FlowStepKey =
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
    key: 'market',
    step: '01',
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
    step: '02',
    label: '종목 발굴',
    sub: 'VCP · CAN SLIM',
    href: '/scanner',
    matchers: ['/scanner', '/canslim'],
    tabs: [
      { href: '/scanner', label: 'VCP Scanner' },
      { href: '/canslim', label: 'CAN SLIM' },
    ],
  },
  {
    key: 'watchlist',
    step: '03',
    label: '관심 종목',
    sub: '후보 추적',
    href: '/watchlist',
    matchers: ['/watchlist'],
    tabs: [],
  },
  {
    key: 'plan',
    step: '04',
    label: '매매 계획',
    sub: '리스크 계산',
    href: '/plan',
    matchers: ['/plan'],
    tabs: [],
  },
  {
    key: 'portfolio',
    step: '05',
    label: '포트폴리오',
    sub: '노출도 점검',
    href: '/portfolio',
    matchers: ['/portfolio'],
    tabs: [],
  },
  {
    key: 'contest',
    step: '06',
    label: '콘테스트',
    sub: 'LLM 비교 분석',
    href: '/contest',
    matchers: ['/contest'],
    tabs: [],
  },
  {
    key: 'review',
    step: '07',
    label: '성과 복기',
    sub: '대시보드 · 히스토리',
    href: '/history',
    matchers: ['/', '/history'],
    tabs: [
      { href: '/', label: '대시보드' },
      { href: '/history', label: '매매 복기' },
    ],
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
