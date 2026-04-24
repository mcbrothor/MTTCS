import type { MacroTrend, ScannerResult, ScannerUniverse, ScannerUniverseResponse, StockMetric } from '@/types';

export const TOTAL_EQUITY_FOR_SCAN = '50000';
export const RISK_PERCENT_FOR_SCAN = '1';
export const SCANNER_STORAGE_PREFIX = 'mtn:scanner-snapshot:v3:';
export const LAST_UNIVERSE_STORAGE_KEY = 'mtn:scanner:last-universe:v1';
export const LATEST_SCAN_UNIVERSE_STORAGE_KEY = 'mtn:scanner:latest-scan-universe:v1';

export type ViewMode = 'web' | 'app';
export type FilterKey =
  | 'all'
  | 'sepaPass'
  | 'recommended'
  | 'partial'
  | 'contestPool'
  | 'nearPivot'
  | 'volume'
  | 'rs90'
  | 'error';
export type SortKey = 'marketCap' | 'recommendation' | 'vcpScore' | 'pivot' | 'sepa' | 'rs';

export interface StoredScannerSnapshot {
  savedAt: string;
  universeMeta: ScannerUniverseResponse;
  results: ScannerResult[];
}

export interface ScannerMetricsResponse {
  market: 'KR' | 'US';
  macroTrend: MacroTrend | null;
  metrics: { ticker: string; metric: StockMetric | null }[];
}

export const UNIVERSES: Record<ScannerUniverse, { label: string; description: string }> = {
  NASDAQ100: {
    label: 'NASDAQ 100',
    description: 'Nasdaq 100 대형 성장주를 시가총액 기준으로 불러와 SEPA/VCP 후보를 스캔합니다.',
  },
  SP500: {
    label: 'S&P 500',
    description: 'S&P 500 전체에서 대형 주도주 후보를 비교합니다.',
  },
  KOSPI200: {
    label: 'KOSPI 시총 상위 200',
    description: 'KOSPI 전체 시가총액 상위 200개를 기준으로 국내 주도주 후보를 확인합니다.',
  },
  KOSDAQ150: {
    label: 'KOSDAQ 시총 상위 150',
    description: 'KOSDAQ 시가총액 상위 150개를 기준으로 성장주 후보를 확인합니다.',
  },
  RUSSELL2000: {
    label: 'Russell 2000',
    description: '미국 소형주 Russell 2000 전체에서 초기 주도주 후보를 발굴합니다. 주도주는 대형지수 편입 전에 시작합니다.',
  },
  KOSDAQALL: {
    label: 'KOSDAQ 전체',
    description: 'KOSDAQ 시총 상위 전체(최대 1000개)를 스캔합니다. 차세대 리더는 KOSDAQ150 밖에서 시작합니다.',
  },
};

export const SCANNER_FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'sepaPass', label: 'SEPA 통과' },
  { key: 'recommended', label: 'Recommended' },
  { key: 'partial', label: 'Partial' },
  { key: 'contestPool', label: '콘테스트 풀' },
  { key: 'nearPivot', label: '피벗 5% 이내' },
  { key: 'volume', label: '거래량 신호' },
  { key: 'rs90', label: 'RS 90+' },
  { key: 'error', label: '오류' },
];

export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'marketCap', label: '시가총액순' },
  { key: 'recommendation', label: '추천 우선' },
  { key: 'vcpScore', label: 'VCP 점수순' },
  { key: 'pivot', label: '피벗 근접순' },
  { key: 'sepa', label: 'SEPA 우선' },
  { key: 'rs', label: 'RS 우선' },
];
