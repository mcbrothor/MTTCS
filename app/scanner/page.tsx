'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Play, ScanSearch, Square } from 'lucide-react';
import { motion } from 'framer-motion';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import MarketBanner from '@/components/ui/MarketBanner';
import VcpDrilldownModal from '@/components/scanner/VcpDrilldownModal';
import {
  applyUniverseRsRankings,
  evaluateScannerRecommendation,
  getVolumeSignalTier,
  isContestPoolTier,
  recommendationSortValue,
  type VolumeSignalTier,
} from '@/lib/scanner-recommendation';
import type {
  MarketAnalysisResponse,
  ProviderAttempt,
  RecommendationTier,
  ScannerConstituent,
  ScannerResult,
  ScannerUniverse,
  ScannerUniverseResponse,
} from '@/types';

const TOTAL_EQUITY_FOR_SCAN = '50000';
const RISK_PERCENT_FOR_SCAN = '1';
const SCAN_CONCURRENCY = 4;
const KOSPI_SCAN_CONCURRENCY = 2;
const KOSDAQ_SCAN_CONCURRENCY = 2;
const SCANNER_STORAGE_PREFIX = 'mtn:scanner-snapshot:v3:';
const LAST_UNIVERSE_STORAGE_KEY = 'mtn:scanner:last-universe:v1';
const LATEST_SCAN_UNIVERSE_STORAGE_KEY = 'mtn:scanner:latest-scan-universe:v1';
const CONTEST_SELECTION_STORAGE_KEY = 'mtn:contest:selected:v1';

type ViewMode = 'web' | 'app';
type FilterKey =
  | 'all'
  | 'recommended'
  | 'partial'
  | 'contestPool'
  | 'nearPivot'
  | 'volume'
  | 'volumeStrong'
  | 'pocketPivot'
  | 'volumeDryUp'
  | 'breakoutVolume'
  | 'rs90'
  | 'error';
type SortKey = 'marketCap' | 'recommendation' | 'vcpScore' | 'pivot' | 'sepa' | 'rs';

interface StoredScannerSnapshot {
  savedAt: string;
  universeMeta: ScannerUniverseResponse;
  results: ScannerResult[];
}

const UNIVERSES: Record<ScannerUniverse, { label: string; description: string }> = {
  NASDAQ100: {
    label: 'NASDAQ 100',
    description: 'Nasdaq 100 대형 성장주를 시가총액 기준으로 불러와 SEPA/VCP 후보를 스캔합니다.',
  },
  SP500: {
    label: 'S&P 500',
    description: 'S&P 500 전체에서 대형 주도주 후보를 비교합니다.',
  },
  KOSPI100: {
    label: 'KOSPI 시총 상위 100',
    description: 'KOSPI 전체 시가총액 상위 100개를 기준으로 국내 주도주 후보를 확인합니다.',
  },
  KOSDAQ100: {
    label: 'KOSDAQ 시총 상위 100',
    description: 'KOSDAQ 시가총액 상위 100개를 기준으로 성장주 후보를 확인합니다.',
  },
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'recommended', label: 'Recommended' },
  { key: 'partial', label: 'Partial' },
  { key: 'contestPool', label: '콘테스트 풀' },
  { key: 'nearPivot', label: '피벗 5% 이내' },
  { key: 'volume', label: '거래량 신호' },
  { key: 'error', label: '오류' },
];

const SCANNER_FILTERS: { key: FilterKey; label: string }[] = [
  ...FILTERS.map((filter) => ({
    key: filter.key,
    label:
      filter.key === 'all'
        ? '전체'
        : filter.key === 'contestPool'
          ? '콘테스트 풀'
          : filter.key === 'nearPivot'
            ? '피벗 5% 이내'
            : filter.key === 'volume'
              ? '거래량 Watch+'
              : filter.key === 'error'
                ? '오류'
                : filter.label,
  })),
  { key: 'volumeStrong', label: '거래량 Strong' },
  { key: 'pocketPivot', label: '포켓 피벗' },
  { key: 'volumeDryUp', label: '거래량 건조화' },
  { key: 'breakoutVolume', label: '돌파 거래량' },
  { key: 'rs90', label: 'RS 90+' },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'marketCap', label: '시가총액순' },
  { key: 'recommendation', label: '추천 우선' },
  { key: 'vcpScore', label: 'VCP 점수순' },
  { key: 'pivot', label: '피벗 근접순' },
  { key: 'sepa', label: 'SEPA 우선' },
  { key: 'rs', label: 'RS 우선' },
];

function scannerStorageKey(universe: ScannerUniverse) {
  return `${SCANNER_STORAGE_PREFIX}${universe}`;
}

function parseScannerUniverse(value: string | null): ScannerUniverse | null {
  if (value === 'NASDAQ100' || value === 'SP500' || value === 'KOSPI100' || value === 'KOSDAQ100') return value;
  return null;
}

function withRecommendation(result: ScannerResult): ScannerResult {
  return {
    ...result,
    ...evaluateScannerRecommendation(result),
  };
}

function readScannerSnapshot(universe: ScannerUniverse): StoredScannerSnapshot | null {
  try {
    const raw = window.localStorage.getItem(scannerStorageKey(universe));
    if (!raw) return null;

    const snapshot = JSON.parse(raw) as StoredScannerSnapshot;
    if (!snapshot.universeMeta || snapshot.universeMeta.universe !== universe || !Array.isArray(snapshot.results)) return null;
    return {
      ...snapshot,
      results: applyUniverseRsRankings(snapshot.results).map((item) => withRecommendation(item)),
    };
  } catch {
    return null;
  }
}

function writeScannerSnapshot(universeMeta: ScannerUniverseResponse, results: ScannerResult[], savedAt: string) {
  const snapshot: StoredScannerSnapshot = {
    savedAt,
    universeMeta,
    results: applyUniverseRsRankings(results).map((item) => withRecommendation(item)),
  };
  window.localStorage.setItem(scannerStorageKey(universeMeta.universe), JSON.stringify(snapshot));
  window.localStorage.setItem(LAST_UNIVERSE_STORAGE_KEY, universeMeta.universe);
  window.localStorage.setItem(LATEST_SCAN_UNIVERSE_STORAGE_KEY, universeMeta.universe);
}

function readStoredUniverse(key: string) {
  return parseScannerUniverse(window.localStorage.getItem(key));
}

function uniqueUniverses(items: (ScannerUniverse | null)[]) {
  return items.filter((item, index): item is ScannerUniverse => Boolean(item) && items.indexOf(item) === index);
}

function getInitialRestoredUniverse() {
  if (typeof window === 'undefined') return 'NASDAQ100';
  const latestScannedUniverse = readStoredUniverse(LATEST_SCAN_UNIVERSE_STORAGE_KEY);
  const lastSelectedUniverse = readStoredUniverse(LAST_UNIVERSE_STORAGE_KEY);
  const candidates = uniqueUniverses([
    latestScannedUniverse,
    lastSelectedUniverse,
    'NASDAQ100',
    'SP500',
    'KOSPI100',
    'KOSDAQ100',
  ]);

  const universeWithSnapshot = candidates.find((candidate) => readScannerSnapshot(candidate));
  return universeWithSnapshot ?? lastSelectedUniverse ?? latestScannedUniverse ?? 'NASDAQ100';
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function scanConcurrencyFor(universe: ScannerUniverse) {
  if (universe === 'KOSPI100') return KOSPI_SCAN_CONCURRENCY;
  if (universe === 'KOSDAQ100') return KOSDAQ_SCAN_CONCURRENCY;
  return SCAN_CONCURRENCY;
}

function initialResult(item: ScannerConstituent): ScannerResult {
  return {
    ...item,
    status: 'queued',
    recommendationTier: 'Low Priority',
    recommendationReason: '스캔 대기 중입니다.',
    sepaMissingCount: null,
    exceptionSignals: [],
    providerAttempts: [],
    sepaStatus: null,
    sepaPassed: null,
    sepaFailed: null,
    vcpScore: null,
    vcpGrade: null,
    contractionScore: null,
    volumeDryUpScore: null,
    bbSqueezeScore: null,
    pocketPivotScore: null,
    vcpDetails: null,
    fundamentals: null,
    pivotPrice: null,
    recommendedEntry: null,
    distanceToPivotPct: null,
    breakoutVolumeStatus: null,
    baseType: null,
    momentumBranch: null,
    eightWeekReturnPct: null,
    distanceFromMa50Pct: null,
    low52WeekAdvancePct: null,
    highTightFlag: null,
    rsRating: null,
    internalRsRating: null,
    externalRsRating: null,
    rsRank: null,
    rsUniverseSize: null,
    rsPercentile: null,
    weightedMomentumScore: null,
    benchmarkRelativeScore: null,
    rsLineNewHigh: null,
    rsLineNearHigh: null,
    tennisBallCount: null,
    tennisBallScore: null,
    return3m: null,
    return6m: null,
    return9m: null,
    return12m: null,
    analyzedAt: null,
    errorMessage: null,
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
}

async function parseFetchError(response: Response) {
  try {
    const body = await response.json() as { message?: string; error?: string; details?: { providerAttempts?: ProviderAttempt[] } };
    return {
      message: body.message || body.error || `요청 실패 (${response.status})`,
      providerAttempts: body.details?.providerAttempts || [],
    };
  } catch {
    return { message: `요청 실패 (${response.status})`, providerAttempts: [] };
  }
}

async function scanConstituent(item: ScannerConstituent, signal: AbortSignal): Promise<ScannerResult> {
  const params = new URLSearchParams({
    ticker: item.ticker,
    exchange: item.exchange,
    totalEquity: TOTAL_EQUITY_FOR_SCAN,
    riskPercent: RISK_PERCENT_FOR_SCAN,
    includeFundamentals: 'false',
  });

  const response = await fetch(`/api/market-data?${params.toString()}`, { signal });
  if (!response.ok) {
    const parsed = await parseFetchError(response);
    const error = new Error(parsed.message) as Error & { providerAttempts?: ProviderAttempt[] };
    error.providerAttempts = parsed.providerAttempts;
    throw error;
  }

  const analysis = await response.json() as MarketAnalysisResponse;
  const latestBar = analysis.priceData.at(-1);
  const latestClose = latestBar?.close ?? null;
  const currentPrice = item.currentPrice ?? latestClose;
  const priceAsOf = item.currentPrice !== null ? item.priceAsOf : latestBar?.date ?? item.priceAsOf;
  const recommendedEntry = analysis.vcpAnalysis.recommendedEntry || null;
  const pivotPrice = analysis.vcpAnalysis.pivotPrice ?? recommendedEntry;
  const distanceToPivotPct =
    currentPrice && recommendedEntry
      ? round(((currentPrice - recommendedEntry) / recommendedEntry) * 100)
      : null;

  return withRecommendation({
    ...item,
    recommendationTier: 'Low Priority',
    recommendationReason: '',
    sepaMissingCount: null,
    exceptionSignals: [],
    currentPrice,
    priceAsOf,
    priceSource: analysis.providerUsed || item.priceSource,
    status: 'done',
    providerAttempts: analysis.providerAttempts || [],
    sepaStatus: analysis.sepaEvidence.status,
    sepaPassed: analysis.sepaEvidence.summary.passed,
    sepaFailed: analysis.sepaEvidence.summary.failed,
    vcpScore: analysis.vcpAnalysis.score,
    vcpGrade: analysis.vcpAnalysis.grade,
    contractionScore: analysis.vcpAnalysis.contractionScore,
    volumeDryUpScore: analysis.vcpAnalysis.volumeDryUpScore,
    bbSqueezeScore: analysis.vcpAnalysis.bbSqueezeScore,
    pocketPivotScore: analysis.vcpAnalysis.pocketPivotScore,
    vcpDetails: analysis.vcpAnalysis.details,
    fundamentals: analysis.fundamentals,
    pivotPrice,
    distanceToPivotPct,
    recommendedEntry,
    baseType: analysis.vcpAnalysis.baseType,
    momentumBranch: analysis.vcpAnalysis.momentumBranch,
    eightWeekReturnPct: analysis.vcpAnalysis.eightWeekReturnPct,
    distanceFromMa50Pct: analysis.vcpAnalysis.distanceFromMa50Pct,
    low52WeekAdvancePct: analysis.vcpAnalysis.low52WeekAdvancePct,
    highTightFlag: analysis.vcpAnalysis.highTightFlag,
    rsRating: analysis.sepaEvidence.metrics.rsRating,
    internalRsRating: analysis.sepaEvidence.metrics.internalRsRating ?? null,
    externalRsRating: analysis.sepaEvidence.metrics.externalRsRating ?? null,
    rsRank: analysis.sepaEvidence.metrics.rsRank ?? null,
    rsUniverseSize: analysis.sepaEvidence.metrics.rsUniverseSize ?? null,
    rsPercentile: analysis.sepaEvidence.metrics.rsPercentile ?? null,
    weightedMomentumScore: analysis.sepaEvidence.metrics.weightedMomentumScore ?? null,
    benchmarkRelativeScore: analysis.sepaEvidence.metrics.benchmarkRelativeScore ?? null,
    rsLineNewHigh: analysis.sepaEvidence.metrics.rsLineNewHigh ?? null,
    rsLineNearHigh: analysis.sepaEvidence.metrics.rsLineNearHigh ?? null,
    tennisBallCount: analysis.sepaEvidence.metrics.tennisBallCount ?? null,
    tennisBallScore: analysis.sepaEvidence.metrics.tennisBallScore ?? null,
    return3m: analysis.sepaEvidence.metrics.return3m ?? null,
    return6m: analysis.sepaEvidence.metrics.return6m ?? null,
    return9m: analysis.sepaEvidence.metrics.return9m ?? null,
    return12m: analysis.sepaEvidence.metrics.return12m ?? null,
    analyzedAt: new Date().toISOString(),
    breakoutVolumeStatus: analysis.vcpAnalysis.breakoutVolumeStatus,
    errorMessage: null,
  });
}

function formatMarketCap(value: number | null, currency: ScannerResult['currency']) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  if (currency === 'KRW') return `${Math.round(value / 100_000_000).toLocaleString('ko-KR')}억`;
  if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  return `$${(value / 1_000_000_000).toFixed(1)}B`;
}

function formatPrice(value: number | null, currency: ScannerResult['currency']) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat(currency === 'KRW' ? 'ko-KR' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'KRW' ? 0 : 2,
  }).format(value);
}

function tierClass(tier: RecommendationTier) {
  if (tier === 'Recommended') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (tier === 'Partial') return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  if (tier === 'Error') return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
  return 'border-slate-700 bg-slate-900 text-slate-300';
}

function sepaLabel(result: ScannerResult) {
  if (result.status === 'error') return 'Error';
  if (result.status !== 'done') return 'Pending';
  if (result.sepaStatus === 'pass') return 'Pass';
  if ((result.sepaMissingCount ?? 99) <= 2) return 'Partial';
  return 'Weak';
}

function baseTypeLabel(result: ScannerResult) {
  if (result.baseType === 'High_Tight_Flag') return 'HTF';
  if (result.baseType === 'Standard_VCP') return 'Standard';
  if (result.momentumBranch === 'EXTENDED') return 'Extended';
  return '-';
}

function formatRs(result: ScannerResult) {
  if (typeof result.rsRating !== 'number') return '-';
  const rank = result.rsRank && result.rsUniverseSize ? ` #${result.rsRank}/${result.rsUniverseSize}` : '';
  return `${result.rsRating}${rank}`;
}
function saveContestSelection(universe: ScannerUniverse, selectedTickers: Set<string>) {
  window.localStorage.setItem(
    CONTEST_SELECTION_STORAGE_KEY,
    JSON.stringify({ universe, tickers: Array.from(selectedTickers), savedAt: new Date().toISOString() })
  );
}

function readContestSelection(universe: ScannerUniverse, results: ScannerResult[]) {
  try {
    const raw = window.localStorage.getItem(CONTEST_SELECTION_STORAGE_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw) as { universe?: ScannerUniverse; tickers?: string[] };
    if (parsed.universe !== universe || !Array.isArray(parsed.tickers)) return new Set<string>();
    const validTickers = new Set(results.map((item) => item.ticker));
    return new Set(parsed.tickers.filter((ticker) => validTickers.has(ticker)).slice(0, 10));
  } catch {
    return new Set<string>();
  }
}

function volumeSignalClass(tier: VolumeSignalTier) {
  if (tier === 'Strong') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (tier === 'Watch') return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  if (tier === 'Weak') return 'border-slate-700 bg-slate-900 text-slate-300';
  return 'border-slate-800 bg-slate-950 text-slate-500';
}

function volumeSignalDetail(result: ScannerResult) {
  const dryUp = result.volumeDryUpScore ?? '-';
  const pocket = result.pocketPivotScore ?? '-';
  const breakout = result.breakoutVolumeStatus || 'unknown';
  return `DU ${dryUp} / PP ${pocket} / ${breakout}`;
}

export default function ScannerPage() {
  const [universe, setUniverse] = useState<ScannerUniverse>('NASDAQ100');
  const [results, setResults] = useState<ScannerResult[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [scanStage, setScanStage] = useState('대기 중');
  const [lastScannedAt, setLastScannedAt] = useState<string | null>(null);
  const [filterKey, setFilterKey] = useState<FilterKey>('all');
  const [sortKey, setSortKey] = useState<SortKey>('marketCap');
  const [viewMode, setViewMode] = useState<ViewMode>('web');
  const [busy, setBusy] = useState(false);
  const [selectedResult, setSelectedResult] = useState<ScannerResult | null>(null);
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());
  const [isSavingWatchlist, setIsSavingWatchlist] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const initial = getInitialRestoredUniverse();
    setUniverse(initial);
    const snapshot = readScannerSnapshot(initial);
    if (snapshot) {
      setResults(snapshot.results);
      setLastScannedAt(snapshot.savedAt);
      setSelectedTickers(readContestSelection(initial, snapshot.results));
    }
  }, []);

  const handleUniverseChange = (newUniverse: ScannerUniverse) => {
    if (isScanning) return;
    setUniverse(newUniverse);
    const snapshot = readScannerSnapshot(newUniverse);
    if (snapshot) {
      setResults(snapshot.results);
      setLastScannedAt(snapshot.savedAt);
      setSelectedTickers(readContestSelection(newUniverse, snapshot.results));
    } else {
      setResults([]);
      setSelectedTickers(new Set());
      setLastScannedAt(null);
    }
    localStorage.setItem(LAST_UNIVERSE_STORAGE_KEY, newUniverse);
  };

  const startScan = async () => {
    if (busy || isScanning) return;

    setBusy(true);
    setIsScanning(true);
    setProgress({ current: 0, total: 0 });
    setScanStage('유니버스 로딩 중');
    setSelectedTickers(new Set());

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const resp = await fetch(`/api/scanner/universe?universe=${universe}`, { signal: abortController.signal });
      if (!resp.ok) {
        const parsed = await parseFetchError(resp);
        throw new Error(parsed.message);
      }

      const meta = await resp.json() as ScannerUniverseResponse;
      const initialResults = meta.items.map(initialResult);
      let latestResults = initialResults;
      setResults(initialResults);
      setProgress({ current: 0, total: initialResults.length });
      setScanStage('KIS 가격 조회 → Yahoo fallback → 벤치마크 → SEPA/VCP 계산');

      const concurrency = scanConcurrencyFor(universe);
      const queue = [...initialResults];
      let completedCount = 0;

      const workers = Array(concurrency).fill(null).map(async () => {
        while (queue.length > 0 && !abortController.signal.aborted) {
          const item = queue.shift();
          if (!item) break;

          latestResults = latestResults.map((row) => row.ticker === item.ticker ? { ...row, status: 'running' } : row);
          setResults(latestResults);

          try {
            const result = await scanConstituent(item, abortController.signal);
            latestResults = latestResults.map((row) => row.ticker === result.ticker ? result : row);
            setResults(latestResults);
          } catch (err) {
            if (abortController.signal.aborted) break;
            const providerAttempts = (err as { providerAttempts?: ProviderAttempt[] }).providerAttempts || [];
            const errorResult = withRecommendation({
              ...initialResult(item),
              status: 'error',
              providerAttempts,
              errorMessage: getErrorMessage(err),
            });
            latestResults = latestResults.map((row) => row.ticker === item.ticker ? errorResult : row);
            setResults(latestResults);
          } finally {
            completedCount += 1;
            setProgress({ current: completedCount, total: initialResults.length });
          }
        }
      });

      await Promise.all(workers);

      if (!abortController.signal.aborted) {
        const normalized = applyUniverseRsRankings(latestResults).map((item) => withRecommendation(item));
        const nextSelected = new Set<string>();
        const now = new Date().toISOString();
        setResults(normalized);
        setSelectedTickers(nextSelected);
        setLastScannedAt(now);
        setScanStage('스캔 완료');
        writeScannerSnapshot(meta, normalized, now);
        saveContestSelection(meta.universe, nextSelected);
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        alert(`스캔 시작 실패: ${getErrorMessage(err)}`);
      }
    } finally {
      setIsScanning(false);
      setBusy(false);
      abortControllerRef.current = null;
    }
  };

  const stopScan = () => {
    abortControllerRef.current?.abort();
    setIsScanning(false);
    setBusy(false);
    setScanStage('중단됨');
  };

  const addToWatchlist = async (item: ScannerResult) => {
    if (isSavingWatchlist) return;

    setIsSavingWatchlist(true);
    try {
      const response = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ticker: item.ticker,
          exchange: item.exchange,
          memo: `Scanner ${item.recommendationTier} / ${item.baseType ?? item.vcpGrade ?? 'unknown'} / RS ${item.rsRating ?? 'n/a'} / SEPA ${item.sepaStatus ?? 'unknown'}`,
          tags: ['scanner', item.recommendationTier, item.baseType, item.vcpGrade, item.sepaStatus, item.rsRating ? `RS${item.rsRating}` : null].filter(Boolean),
          priority: item.recommendationTier === 'Recommended' ? 2 : 1,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || '관심종목 저장에 실패했습니다.');
      }
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setIsSavingWatchlist(false);
    }
  };

  const toggleSelected = (ticker: string) => {
    setSelectedTickers((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else if (next.size < 10) next.add(ticker);
      else alert('콘테스트 분석 후보는 최대 10개까지 선택할 수 있습니다.');
      saveContestSelection(universe, next);
      return next;
    });
  };

  const filteredResults = useMemo(() => {
    let list = results.map((item) => withRecommendation(item));

    if (filterKey === 'recommended') list = list.filter((row) => row.recommendationTier === 'Recommended');
    else if (filterKey === 'partial') list = list.filter((row) => row.recommendationTier === 'Partial');
    else if (filterKey === 'contestPool') list = list.filter((row) => isContestPoolTier(row.recommendationTier));
    else if (filterKey === 'nearPivot') list = list.filter((row) => row.distanceToPivotPct !== null && Math.abs(row.distanceToPivotPct) <= 5);
    else if (filterKey === 'volume') list = list.filter((row) => ['Strong', 'Watch'].includes(getVolumeSignalTier(row)));
    else if (filterKey === 'volumeStrong') list = list.filter((row) => getVolumeSignalTier(row) === 'Strong');
    else if (filterKey === 'pocketPivot') list = list.filter((row) => (row.pocketPivotScore || 0) >= 40);
    else if (filterKey === 'volumeDryUp') list = list.filter((row) => (row.volumeDryUpScore || 0) >= 50);
    else if (filterKey === 'breakoutVolume') list = list.filter((row) => row.breakoutVolumeStatus === 'confirmed' || row.breakoutVolumeStatus === 'pending');
    else if (filterKey === 'rs90') list = list.filter((row) => (row.rsRating || 0) >= 90);
    else if (filterKey === 'error') list = list.filter((row) => row.status === 'error');

    list.sort((a, b) => {
      if (sortKey === 'recommendation') {
        return recommendationSortValue(a.recommendationTier) - recommendationSortValue(b.recommendationTier) || (b.vcpScore || 0) - (a.vcpScore || 0);
      }
      if (sortKey === 'vcpScore') return (b.vcpScore || 0) - (a.vcpScore || 0);
      if (sortKey === 'pivot') {
        const da = a.distanceToPivotPct === null ? 999 : Math.abs(a.distanceToPivotPct);
        const db = b.distanceToPivotPct === null ? 999 : Math.abs(b.distanceToPivotPct);
        return da - db;
      }
      if (sortKey === 'sepa') {
        const missingA = a.sepaMissingCount ?? 99;
        const missingB = b.sepaMissingCount ?? 99;
        return missingA - missingB || (b.vcpScore || 0) - (a.vcpScore || 0);
      }
      if (sortKey === 'rs') return (b.rsRating || 0) - (a.rsRating || 0) || (b.weightedMomentumScore || 0) - (a.weightedMomentumScore || 0);
      return a.rank - b.rank;
    });

    return list;
  }, [results, filterKey, sortKey]);

  const stats = useMemo(() => ({
    recommended: results.filter((item) => item.recommendationTier === 'Recommended').length,
    partial: results.filter((item) => item.recommendationTier === 'Partial').length,
    errors: results.filter((item) => item.status === 'error').length,
  }), [results]);

  const selectionColumn = (result: ScannerResult) => (
    <button
      type="button"
      disabled={result.status !== 'done'}
      onClick={(event) => {
        event.stopPropagation();
        toggleSelected(result.ticker);
      }}
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition-colors ${
        selectedTickers.has(result.ticker)
          ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
          : 'border-slate-700 text-slate-400 hover:border-slate-500'
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      <CheckCircle2 className="h-3.5 w-3.5" />
      후보
    </button>
  );

  const tierBadge = (result: ScannerResult) => (
    <span className={`inline-flex rounded-lg border px-2 py-1 text-xs font-bold ${tierClass(result.recommendationTier)}`}>
      {result.recommendationTier}
    </span>
  );

  const renderTable = () => (
    <div className="overflow-hidden rounded-lg border border-slate-800">
      <table className="w-full table-fixed divide-y divide-slate-800 text-xs">
        <colgroup>
          <col className="w-[4%]" />
          <col className="w-[18%]" />
          <col className="w-[9%]" />
          <col className="w-[9%]" />
          <col className="w-[8%]" />
          <col className="w-[10%]" />
          <col className="w-[12%]" />
          <col className="w-[12%]" />
          <col className="w-[7%]" />
          <col className="w-[6%]" />
          <col className="w-[5%]" />
        </colgroup>
        <thead className="bg-slate-950 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-2 py-3 text-left">#</th>
            <th className="px-2 py-3 text-left">종목</th>
            <th className="px-2 py-3 text-right">시총</th>
            <th className="px-2 py-3 text-right">현재가</th>
            <th className="px-2 py-3 text-left">SEPA</th>
            <th className="px-2 py-3 text-left">추천 등급</th>
            <th className="px-2 py-3 text-left">상대강도/패턴</th>
            <th className="px-2 py-3 text-left">거래량</th>
            <th className="px-2 py-3 text-right">피벗</th>
            <th className="px-2 py-3 text-left">데이터</th>
            <th className="px-2 py-3 text-center">후보</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 bg-slate-950/40">
          {filteredResults.map((result) => {
            const volumeTier = getVolumeSignalTier(result);
            return (
              <tr
                key={result.ticker}
                onClick={() => result.status === 'done' && setSelectedResult(result)}
                className={`cursor-pointer transition-colors hover:bg-slate-900 ${selectedTickers.has(result.ticker) ? 'bg-emerald-500/5' : ''}`}
              >
                <td className="px-2 py-3 font-mono text-slate-400">{result.rank}</td>
                <td className="px-2 py-3">
                  <p className="truncate font-mono font-bold text-white">{result.ticker}</p>
                  <p className="truncate text-[11px] text-slate-500">{result.name}</p>
                </td>
                <td className="px-2 py-3 text-right font-mono text-slate-300">{formatMarketCap(result.marketCap, result.currency)}</td>
                <td className="px-2 py-3 text-right font-mono text-slate-300">{formatPrice(result.currentPrice, result.currency)}</td>
                <td className="px-2 py-3">
                  <span className="text-slate-300">{sepaLabel(result)}</span>
                  {result.sepaMissingCount !== null && <p className="text-[10px] text-slate-500">미충족 {result.sepaMissingCount}</p>}
                </td>
                <td className="px-2 py-3">{tierBadge(result)}</td>
                <td className="px-2 py-3">
                  <p className="font-mono text-slate-200">RS {formatRs(result)}</p>
                  <p className="mt-1 truncate text-[10px] text-slate-500">{baseTypeLabel(result)} · VCP {result.vcpScore ?? '-'}</p>
                </td>
                <td className="px-2 py-3">
                  <span className={`inline-flex rounded-lg border px-2 py-1 text-[11px] font-bold ${volumeSignalClass(volumeTier)}`}>
                    {volumeTier}
                  </span>
                  <p className="mt-1 truncate text-[10px] text-slate-500">{volumeSignalDetail(result)}</p>
                </td>
                <td className="px-2 py-3 text-right font-mono text-slate-300">
                  {result.distanceToPivotPct !== null ? `${result.distanceToPivotPct > 0 ? '+' : ''}${result.distanceToPivotPct}%` : '-'}
                </td>
                <td className="px-2 py-3 text-[10px] text-slate-400">
                  <p className="truncate">{result.priceSource || result.providerAttempts?.at(-1)?.provider || '-'}</p>
                  <p className={result.status === 'error' ? 'truncate text-rose-300' : result.status === 'running' ? 'text-emerald-300' : 'text-slate-500'}>
                    {result.status === 'error' ? result.errorMessage || '오류' : result.status === 'running' ? '분석 중' : result.status === 'done' ? '완료' : '대기'}
                  </p>
                </td>
                <td className="px-2 py-3 text-center">{selectionColumn(result)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
  const renderCards = () => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {filteredResults.map((result) => (
        <motion.div
          key={result.ticker}
          layout
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ scale: 1.02 }}
          onClick={() => result.status === 'done' && setSelectedResult(result)}
          className={`group relative cursor-pointer rounded-lg border p-4 transition-all ${
            isContestPoolTier(result.recommendationTier)
              ? 'border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50'
              : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
          } ${selectedTickers.has(result.ticker) ? 'ring-2 ring-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.2)]' : ''}`}
        >
          {result.status === 'done' && (
            <div className="absolute -left-2 -top-2 z-10">
              {selectionColumn(result)}
            </div>
          )}

          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-mono font-bold text-white">{result.ticker}</h3>
              <p className="truncate text-xs text-slate-500">{result.name}</p>
            </div>
            {tierBadge(result)}
          </div>

          {result.status === 'done' && (
            <div className="space-y-2">
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">SEPA</span>
                <span className="text-slate-300">{sepaLabel(result)}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">VCP</span>
                <span className="text-slate-300">{result.vcpGrade} ({result.vcpScore ?? '-'})</span>
              </div>
                            <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">RS / Base</span>
                <span className="text-slate-300">{formatRs(result)} / {baseTypeLabel(result)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[10px]">
                <span className="text-slate-500">거래량</span>
                <span className={`rounded-lg border px-2 py-0.5 font-semibold ${volumeSignalClass(getVolumeSignalTier(result))}`}>
                  {getVolumeSignalTier(result)}
                </span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">피벗 거리</span>
                <span className={Math.abs(result.distanceToPivotPct || 0) <= 5 ? 'font-bold text-emerald-400' : 'text-slate-300'}>
                  {result.distanceToPivotPct !== null ? `${result.distanceToPivotPct > 0 ? '+' : ''}${result.distanceToPivotPct}%` : '-'}
                </span>
              </div>
              <p className="line-clamp-2 text-[10px] text-slate-500">{result.recommendationReason}</p>
            </div>
          )}

          {result.status === 'running' && (
            <div className="flex items-center gap-2 text-xs text-emerald-300">
              <LoadingSpinner className="h-3 w-3" /> KIS/Yahoo 데이터 분석 중
            </div>
          )}

          {result.status === 'error' && (
            <p className="truncate text-[10px] text-red-400">{result.errorMessage}</p>
          )}
        </motion.div>
      ))}
    </div>
  );

  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <MarketBanner />

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <ScanSearch className="h-6 w-6 text-emerald-400" /> VCP 마스터 스캐너
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            SEPA/VCP 조건과 예외 신호를 함께 판단해 콘테스트 비교 후보를 만듭니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={universe}
            onChange={(event) => handleUniverseChange(event.target.value as ScannerUniverse)}
            disabled={isScanning}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          >
            {Object.entries(UNIVERSES).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-1">
            <button
              type="button"
              onClick={() => setViewMode('web')}
              className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold ${viewMode === 'web' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}
            >
              웹
            </button>
            <button
              type="button"
              onClick={() => setViewMode('app')}
              className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold ${viewMode === 'app' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}
            >
              앱
            </button>
          </div>

          {isScanning ? (
            <Button variant="danger" onClick={stopScan} icon={<Square className="h-4 w-4" />}>중단</Button>
          ) : (
            <Button onClick={startScan} icon={<Play className="h-4 w-4" />} disabled={busy}>스캔 시작</Button>
          )}
        </div>
      </div>

      <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">{UNIVERSES[universe].label}</p>
            <p className="mt-1 text-xs text-slate-400">{UNIVERSES[universe].description}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs sm:flex sm:text-left">
            <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-200">Recommended {stats.recommended}</span>
            <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-200">Partial {stats.partial}</span>
            <span className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-200">Error {stats.errors}</span>
          </div>
        </div>

        {isScanning && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-emerald-300">{scanStage}</span>
              <span className="text-sm text-slate-400">{progress.current} / {progress.total}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              데이터 흐름: 유니버스 API → KIS 가격 조회 → Yahoo fallback → 벤치마크 조회 → SEPA/VCP 계산
            </p>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex flex-wrap gap-2">
          {SCANNER_FILTERS.map((filter) => (
            <button
              key={filter.key}
              onClick={() => setFilterKey(filter.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filterKey === filter.key ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">정렬:</span>
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            className="bg-transparent text-xs text-slate-300 outline-none"
          >
            {SORTS.map((sort) => (
              <option key={sort.key} value={sort.key}>{sort.label}</option>
            ))}
          </select>
          {lastScannedAt && (
            <span className="ml-4 text-xs text-slate-500">최근 스캔: {new Date(lastScannedAt).toLocaleString('ko-KR')}</span>
          )}
        </div>
      </div>

      {viewMode === 'web' ? renderTable() : renderCards()}

      {results.length === 0 && !isScanning && (
        <div className="py-20 text-center">
          <ScanSearch className="mx-auto mb-4 h-12 w-12 text-slate-700" />
          <h3 className="font-bold text-slate-400">스캔 결과가 없습니다.</h3>
          <p className="mt-1 text-sm text-slate-600">상단의 스캔 시작 버튼으로 시장 조사를 시작하세요.</p>
        </div>
      )}

      {selectedTickers.size > 0 && (
        <div className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-6 rounded-lg border border-emerald-500/30 bg-slate-950/90 px-6 py-4 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-emerald-400">콘테스트 분석 후보</span>
            <span className="text-lg font-bold text-white">{selectedTickers.size} / 10 종목</span>
          </div>

          <div className="h-8 w-px bg-slate-800" />

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSelectedTickers(new Set());
                saveContestSelection(universe, new Set());
              }}
              className="text-sm text-slate-400 transition-colors hover:text-white"
            >
              전체 해제
            </button>
            <Link
              href="/contest"
              onClick={() => saveContestSelection(universe, selectedTickers)}
            >
              <Button icon={<ScanSearch className="h-4 w-4" />} className="bg-emerald-600 hover:bg-emerald-500">
                콘테스트로 이동
              </Button>
            </Link>
          </div>
        </div>
      )}

      <VcpDrilldownModal
        result={selectedResult}
        onClose={() => setSelectedResult(null)}
        onAddToWatchlist={addToWatchlist}
        isSavingWatchlist={isSavingWatchlist}
      />
    </div>
  );
}
