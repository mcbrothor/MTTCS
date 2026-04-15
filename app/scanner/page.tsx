'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Play, ScanSearch, Square, Star } from 'lucide-react';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import MarketBanner from '@/components/ui/MarketBanner';
import RiskModal from '@/components/ui/RiskModal';
import { useMarket } from '@/contexts/MarketContext';
import type {
  AssessmentStatus,
  MarketAnalysisResponse,
  ScannerConstituent,
  ScannerResult,
  ScannerUniverse,
  ScannerUniverseResponse,
  VcpAnalysis,
} from '@/types';

const TOTAL_EQUITY_FOR_SCAN = '50000';
const RISK_PERCENT_FOR_SCAN = '1';
const SCAN_CONCURRENCY = 4;
const KOSPI_SCAN_CONCURRENCY = 2;
const KOSDAQ_SCAN_CONCURRENCY = 2;
const SCANNER_STORAGE_PREFIX = 'mtn:scanner-snapshot:v2:';
const LAST_UNIVERSE_STORAGE_KEY = 'mtn:scanner:last-universe:v1';
const LATEST_SCAN_UNIVERSE_STORAGE_KEY = 'mtn:scanner:latest-scan-universe:v1';

interface StoredScannerSnapshot {
  savedAt: string;
  universeMeta: ScannerUniverseResponse;
  results: ScannerResult[];
}

const UNIVERSES: Record<ScannerUniverse, { label: string; description: string }> = {
  NASDAQ100: {
    label: 'NASDAQ 100',
    description: 'Nasdaq 공식 목록을 시가총액 기준으로 정렬하고 SEPA/VCP 후보를 빠르게 확인합니다.',
  },
  SP500: {
    label: 'S&P 500',
    description: 'S&P 500 대형주를 시가총액 기준으로 정렬하고 SEPA/VCP 후보를 확인합니다.',
  },
  KOSPI100: {
    label: 'KOSPI 100',
    description: 'KRX 공식 구성종목을 우선 확인하고, 세션 제한 시 KIS 시가총액 순위로 대체합니다.',
  },
  KOSDAQ100: {
    label: 'KOSDAQ 100',
    description: 'KOSDAQ 100 후보군을 시가총액 기준으로 정렬하고 국내 성장주 패턴을 확인합니다.',
  },
};

const FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'sepa', label: 'SEPA 통과' },
  { key: 'strong', label: 'VCP Strong' },
  { key: 'forming', label: 'Forming 이상' },
  { key: 'nearPivot', label: '피벗 3% 이내' },
  { key: 'volume', label: '거래량 확인' },
  { key: 'error', label: '오류' },
] as const;

const SORTS = [
  { key: 'marketCap', label: '시가총액순' },
  { key: 'vcpScore', label: 'VCP 점수순' },
  { key: 'pivot', label: '피벗 근접순' },
  { key: 'sepa', label: 'SEPA 우선' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];
type SortKey = (typeof SORTS)[number]['key'];

function scannerStorageKey(universe: ScannerUniverse) {
  return `${SCANNER_STORAGE_PREFIX}${universe}`;
}

function parseScannerUniverse(value: string | null): ScannerUniverse | null {
  if (value === 'NASDAQ100' || value === 'SP500' || value === 'KOSPI100' || value === 'KOSDAQ100') return value;
  return null;
}

function readScannerSnapshot(universe: ScannerUniverse): StoredScannerSnapshot | null {
  try {
    const raw = window.localStorage.getItem(scannerStorageKey(universe));
    if (!raw) return null;

    const snapshot = JSON.parse(raw) as StoredScannerSnapshot;
    if (!snapshot.universeMeta || snapshot.universeMeta.universe !== universe || !Array.isArray(snapshot.results)) return null;
    return snapshot;
  } catch {
    return null;
  }
}

function writeScannerSnapshot(universeMeta: ScannerUniverseResponse, results: ScannerResult[], savedAt: string) {
  const snapshot: StoredScannerSnapshot = {
    savedAt,
    universeMeta,
    results,
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

function initialResult(item: ScannerConstituent): ScannerResult {
  return {
    ...item,
    status: 'queued',
    sepaStatus: null,
    sepaPassed: null,
    sepaFailed: null,
    vcpScore: null,
    vcpGrade: null,
    pivotPrice: null,
    recommendedEntry: null,
    distanceToPivotPct: null,
    breakoutVolumeStatus: null,
    analyzedAt: null,
    errorMessage: null,
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
}

async function parseFetchError(response: Response) {
  try {
    const body = await response.json() as { message?: string; error?: string };
    return body.message || body.error || `요청 실패 (${response.status})`;
  } catch {
    return `요청 실패 (${response.status})`;
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
    throw new Error(await parseFetchError(response));
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

  return {
    ...item,
    currentPrice,
    priceAsOf,
    status: 'done',
    sepaStatus: analysis.sepaEvidence.status,
    sepaPassed: analysis.sepaEvidence.summary.passed,
    sepaFailed: analysis.sepaEvidence.summary.failed,
    vcpScore: analysis.vcpAnalysis.score,
    vcpGrade: analysis.vcpAnalysis.grade,
    pivotPrice,
    recommendedEntry,
    distanceToPivotPct,
    breakoutVolumeStatus: analysis.vcpAnalysis.breakoutVolumeStatus,
    analyzedAt: new Date().toISOString(),
    errorMessage: null,
  };
}

function statusRank(status: AssessmentStatus | null) {
  if (status === 'pass') return 0;
  if (status === 'warning') return 1;
  if (status === 'info') return 2;
  if (status === 'fail') return 3;
  return 4;
}

function applyFilter(item: ScannerResult, filter: FilterKey) {
  if (filter === 'sepa') return item.sepaStatus === 'pass';
  if (filter === 'strong') return item.vcpGrade === 'strong';
  if (filter === 'forming') return item.vcpGrade === 'strong' || item.vcpGrade === 'forming';
  if (filter === 'nearPivot') return item.distanceToPivotPct !== null && Math.abs(item.distanceToPivotPct) <= 3;
  if (filter === 'volume') return item.breakoutVolumeStatus === 'confirmed';
  if (filter === 'error') return item.status === 'error';
  return true;
}

function sortResults(items: ScannerResult[], sortKey: SortKey) {
  const sorted = [...items];
  sorted.sort((a, b) => {
    if (sortKey === 'vcpScore') {
      return (b.vcpScore ?? -1) - (a.vcpScore ?? -1) || (b.marketCap ?? 0) - (a.marketCap ?? 0);
    }

    if (sortKey === 'pivot') {
      const aDistance = a.distanceToPivotPct === null ? Number.POSITIVE_INFINITY : Math.abs(a.distanceToPivotPct);
      const bDistance = b.distanceToPivotPct === null ? Number.POSITIVE_INFINITY : Math.abs(b.distanceToPivotPct);
      return aDistance - bDistance || (b.vcpScore ?? -1) - (a.vcpScore ?? -1);
    }

    if (sortKey === 'sepa') {
      return statusRank(a.sepaStatus) - statusRank(b.sepaStatus) || (b.vcpScore ?? -1) - (a.vcpScore ?? -1);
    }

    return (b.marketCap ?? 0) - (a.marketCap ?? 0) || a.rank - b.rank;
  });
  return sorted;
}

function formatMarketCap(value: number | null, currency: ScannerConstituent['currency']) {
  if (value === null) return '-';

  if (currency === 'KRW') {
    const trillion = value / 1_0000_0000_0000;
    const billion = value / 1_0000_0000;
    if (trillion >= 1) return `${round(trillion, 1).toLocaleString('ko-KR')}조원`;
    return `${round(billion, 0).toLocaleString('ko-KR')}억원`;
  }

  const trillion = value / 1_000_000_000_000;
  const billion = value / 1_000_000_000;
  if (trillion >= 1) return `$${round(trillion, 2).toLocaleString('en-US')}T`;
  return `$${round(billion, 1).toLocaleString('en-US')}B`;
}

function formatPrice(value: number | null, currency: ScannerConstituent['currency']) {
  if (value === null) return '-';
  return new Intl.NumberFormat(currency === 'KRW' ? 'ko-KR' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'KRW' ? 0 : 2,
  }).format(value);
}

function formatDateTime(value: string | null) {
  if (!value) return '기준 시각 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function sepaBadge(status: AssessmentStatus | null) {
  if (status === 'pass') return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300';
  if (status === 'warning') return 'border-amber-500/40 bg-amber-500/15 text-amber-300';
  if (status === 'fail') return 'border-red-500/40 bg-red-500/15 text-red-300';
  return 'border-slate-700 bg-slate-800 text-slate-400';
}

function vcpBadge(grade: VcpAnalysis['grade'] | null) {
  if (grade === 'strong') return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300';
  if (grade === 'forming') return 'border-blue-500/40 bg-blue-500/15 text-blue-300';
  if (grade === 'weak') return 'border-amber-500/40 bg-amber-500/15 text-amber-300';
  return 'border-slate-700 bg-slate-800 text-slate-400';
}

function sepaLabel(status: AssessmentStatus | null) {
  if (status === 'pass') return '통과';
  if (status === 'warning') return '주의';
  if (status === 'fail') return '실패';
  if (status === 'info') return '정보';
  return '대기';
}

function vcpLabel(grade: VcpAnalysis['grade'] | null) {
  if (grade === 'strong') return 'Strong';
  if (grade === 'forming') return 'Forming';
  if (grade === 'weak') return 'Weak';
  if (grade === 'none') return 'None';
  return '대기';
}

function volumeLabel(status: VcpAnalysis['breakoutVolumeStatus'] | null) {
  if (status === 'confirmed') return '확인';
  if (status === 'pending') return '대기';
  if (status === 'weak') return '약함';
  return '정보 없음';
}

function distanceText(value: number | null) {
  if (value === null) return '-';
  if (value > 0) return `피벗 위 ${value}%`;
  if (value < 0) return `피벗 아래 ${Math.abs(value)}%`;
  return '피벗 부근';
}

function distanceClass(value: number | null) {
  if (value === null) return 'text-slate-500';
  const abs = Math.abs(value);
  if (abs <= 3) return 'text-emerald-300';
  if (abs <= 7) return 'text-amber-300';
  return 'text-slate-300';
}

export default function ScannerPage() {
  const { data: marketData, bypassRisk } = useMarket();
  const isRed = marketData?.state === 'RED' && !bypassRisk;
  const [selectedUniverse, setSelectedUniverse] = useState<ScannerUniverse>('NASDAQ100');
  const [universeMeta, setUniverseMeta] = useState<ScannerUniverseResponse | null>(null);
  const [results, setResults] = useState<ScannerResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [activeUniverse, setActiveUniverse] = useState<ScannerUniverse | null>(null);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [restoredSnapshot, setRestoredSnapshot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sortKey, setSortKey] = useState<SortKey>('marketCap');
  const [savingWatchlist, setSavingWatchlist] = useState<Set<string>>(new Set());
  const runIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const universeMetaRef = useRef<ScannerUniverseResponse | null>(null);
  const resultsRef = useRef<ScannerResult[]>([]);
  const snapshotAtRef = useRef<string | null>(null);

  const completedCount = results.filter((item) => item.status === 'done' || item.status === 'error').length;
  const runningCount = results.filter((item) => item.status === 'running').length;
  const totalCount = results.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const stats = useMemo(() => {
    const done = results.filter((item) => item.status === 'done');
    return {
      total: results.length,
      sepaPass: done.filter((item) => item.sepaStatus === 'pass').length,
      strong: done.filter((item) => item.vcpGrade === 'strong').length,
      formingPlus: done.filter((item) => item.vcpGrade === 'strong' || item.vcpGrade === 'forming').length,
      nearPivot: done.filter((item) => item.distanceToPivotPct !== null && Math.abs(item.distanceToPivotPct) <= 3).length,
      errors: results.filter((item) => item.status === 'error').length,
    };
  }, [results]);

  const visibleResults = useMemo(
    () => sortResults(results.filter((item) => applyFilter(item, filter)), sortKey),
    [filter, results, sortKey]
  );

  useEffect(() => {
    universeMetaRef.current = universeMeta;
  }, [universeMeta]);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    snapshotAtRef.current = snapshotAt;
  }, [snapshotAt]);

  const updateResult = (ticker: string, next: Partial<ScannerResult>) => {
    setResults((prev) => prev.map((item) => (item.ticker === ticker ? { ...item, ...next } : item)));
  };

  const restoreUniverseSnapshot = useCallback((universe: ScannerUniverse) => {
    const snapshot = readScannerSnapshot(universe);
    if (!snapshot) {
      setUniverseMeta(null);
      setResults([]);
      setSnapshotAt(null);
      setRestoredSnapshot(false);
      setNotice(null);
      setFilter('all');
      setSortKey('marketCap');
      return;
    }

    setUniverseMeta(snapshot.universeMeta);
    setResults(snapshot.results);
    setSnapshotAt(snapshot.savedAt);
    setRestoredSnapshot(true);
    setFilter('all');
    setSortKey('marketCap');
    setNotice(`${formatDateTime(snapshot.savedAt)} 스캔 기록을 불러왔습니다. 새 스캔 버튼을 누르면 기록이 갱신됩니다.`);
  }, []);

  useEffect(() => {
    try {
      const initialUniverse = getInitialRestoredUniverse();
      setSelectedUniverse(initialUniverse);
      restoreUniverseSnapshot(initialUniverse);
    } catch {
      setSelectedUniverse('NASDAQ100');
      restoreUniverseSnapshot('NASDAQ100');
    }
  }, [restoreUniverseSnapshot]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      const currentMeta = universeMetaRef.current;
      const currentResults = resultsRef.current;
      if (!currentMeta || currentResults.length === 0) return;

      try {
        writeScannerSnapshot(currentMeta, currentResults, snapshotAtRef.current ?? new Date().toISOString());
      } catch {
        // Browser storage failures should not block leaving the page.
      }
    };
  }, []);

  const selectUniverse = (universe: ScannerUniverse) => {
    if (scanning) return;
    setSelectedUniverse(universe);
    try {
      window.localStorage.setItem(LAST_UNIVERSE_STORAGE_KEY, universe);
    } catch {
      // 선택 상태 저장 실패는 화면 전환 자체를 막지 않습니다.
    }
    restoreUniverseSnapshot(universe);
  };

  const runScan = async (universe: ScannerUniverse) => {
    runIdRef.current += 1;
    const runId = runIdRef.current;
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setSelectedUniverse(universe);
    setScanning(true);
    setActiveUniverse(universe);
    setError(null);
    setNotice(null);
    setUniverseMeta(null);
    setResults([]);
    setSnapshotAt(null);
    setRestoredSnapshot(false);
    setFilter('all');
    setSortKey('marketCap');

    try {
      window.localStorage.setItem(LAST_UNIVERSE_STORAGE_KEY, universe);
    } catch {
      // 스캔 자체는 계속 진행하고, 완료 시점에 저장 실패를 다시 안내합니다.
    }

    try {
      const universeResponse = await fetch(`/api/scanner/universe?universe=${universe}`, {
        signal: abortRef.current.signal,
      });

      if (!universeResponse.ok) {
        throw new Error(await parseFetchError(universeResponse));
      }

      const data = await universeResponse.json() as ScannerUniverseResponse;
      if (runIdRef.current !== runId) return;

      setUniverseMeta(data);
      const resultByTicker = new Map(data.items.map((item) => [item.ticker, initialResult(item)]));
      setResults(Array.from(resultByTicker.values()));

      let nextIndex = 0;
      const concurrency =
        data.universe === 'KOSPI100'
          ? KOSPI_SCAN_CONCURRENCY
          : data.universe === 'KOSDAQ100'
            ? KOSDAQ_SCAN_CONCURRENCY
            : SCAN_CONCURRENCY;
      const workers = Array.from({ length: Math.min(concurrency, data.items.length) }, async () => {
        while (nextIndex < data.items.length && runIdRef.current === runId) {
          const item = data.items[nextIndex];
          nextIndex += 1;

          resultByTicker.set(item.ticker, { ...resultByTicker.get(item.ticker)!, status: 'running' });
          updateResult(item.ticker, { status: 'running' });

          try {
            const analyzed = await scanConstituent(item, abortRef.current?.signal || new AbortController().signal);
            if (runIdRef.current === runId) {
              resultByTicker.set(item.ticker, analyzed);
              updateResult(item.ticker, analyzed);
            }
          } catch (scanError) {
            if (runIdRef.current === runId && !abortRef.current?.signal.aborted) {
              const failedResult: ScannerResult = {
                ...resultByTicker.get(item.ticker)!,
                status: 'error',
                errorMessage: getErrorMessage(scanError),
                analyzedAt: new Date().toISOString(),
              };
              resultByTicker.set(item.ticker, failedResult);
              updateResult(item.ticker, failedResult);
            }
          }
        }
      });

      await Promise.all(workers);
      if (runIdRef.current === runId) {
        const completedAt = new Date().toISOString();
        const finalResults = data.items.map((item) => resultByTicker.get(item.ticker) || initialResult(item));
        setResults(finalResults);
        writeScannerSnapshot(data, finalResults, completedAt);
        setSnapshotAt(completedAt);
        setNotice(`${data.label} 스캔이 완료되었습니다. 이 결과는 ${formatDateTime(completedAt)} 기준 기록으로 저장됩니다.`);
      }
    } catch (scanError) {
      if (runIdRef.current === runId && !abortRef.current?.signal.aborted) {
        setError(getErrorMessage(scanError));
      }
    } finally {
      if (runIdRef.current === runId) {
        setScanning(false);
        setActiveUniverse(null);
      }
    }
  };

  const stopScan = () => {
    runIdRef.current += 1;
    abortRef.current?.abort();
    const stoppedAt = results.length > 0 ? new Date().toISOString() : null;
    if (stoppedAt && universeMeta) {
      try {
        writeScannerSnapshot(universeMeta, results, stoppedAt);
      } catch {
        setError('스캔 결과를 브라우저에 저장하지 못했습니다. 저장 공간을 확인해 주세요.');
      }
    }
    setScanning(false);
    setActiveUniverse(null);
    setSnapshotAt(stoppedAt);
    setNotice('스캔을 중지했습니다. 이미 완료된 결과는 그대로 남겨두었습니다.');
  };

  const addToWatchlist = async (item: ScannerResult) => {
    setSavingWatchlist((prev) => new Set(prev).add(item.ticker));
    setError(null);
    setNotice(null);

    try {
      const response = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ticker: item.ticker,
          exchange: item.exchange,
          memo: `${universeMeta?.label || '스캐너'}: SEPA ${sepaLabel(item.sepaStatus)}, VCP ${vcpLabel(item.vcpGrade)}, 피벗 ${distanceText(item.distanceToPivotPct)}`,
          tags: ['스캐너', item.vcpGrade ? `VCP-${item.vcpGrade}` : 'VCP대기'],
          priority: item.sepaStatus === 'pass' && item.vcpGrade === 'strong' ? 1 : 0,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseFetchError(response));
      }

      setNotice(`${item.ticker}를 관심 종목에 저장했습니다.`);
    } catch (watchlistError) {
      setError(getErrorMessage(watchlistError));
    } finally {
      setSavingWatchlist((prev) => {
        const next = new Set(prev);
        next.delete(item.ticker);
        return next;
      });
    }
  };

  return (
    <>
      <MarketBanner />
      <RiskModal />
      <div className={`mx-auto max-w-7xl space-y-6 pb-12 transition-all duration-500 ${isRed ? 'blur-md pointer-events-none select-none overflow-hidden h-[80vh]' : ''}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">Scanner</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">종목군 스캐너</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            먼저 큰 종목군을 훑어 SEPA 통과 여부, VCP 점수, 피벗 근접도를 확인한 뒤 바로 신규 계획으로 이어갑니다.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => runScan(selectedUniverse)}
            disabled={scanning}
            className="gap-2"
          >
            {scanning && activeUniverse === selectedUniverse ? <LoadingSpinner size="sm" /> : <Play className="h-4 w-4" />}
            {UNIVERSES[selectedUniverse].label} 스캔
          </Button>
          {scanning && (
            <Button type="button" variant="ghost" onClick={stopScan} className="gap-2">
              <Square className="h-4 w-4" />
              중지
            </Button>
          )}
        </div>
      </div>

      <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(UNIVERSES) as ScannerUniverse[]).map((universe) => {
            const isSelected = selectedUniverse === universe;
            return (
              <button
                key={universe}
                type="button"
                onClick={() => selectUniverse(universe)}
                disabled={scanning}
                className={`rounded-lg border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  isSelected
                    ? 'border-emerald-500/50 bg-emerald-500/15'
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'
                }`}
              >
                <span className={`text-sm font-bold ${isSelected ? 'text-emerald-200' : 'text-slate-200'}`}>
                  {UNIVERSES[universe].label}
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-400">
                  {UNIVERSES[universe].description}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-300">
              <ScanSearch className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">스캔 흐름</h2>
              <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-400">
                KOSPI 100은 공식 구성종목 확인에는 KRX를 우선 사용합니다. 가격, 일봉, VCP 계산은 기존 KIS 기반 분석을 사용하며,
                KRX 세션 제한이 걸리면 KIS 시가총액 순위로 대체해 화면에 명확히 표시합니다.
              </p>
            </div>
          </div>
          {universeMeta && (
            <div className="min-w-[240px] rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-400">
              <p className="font-semibold text-slate-200">{universeMeta.label}</p>
              {snapshotAt && (
                <p className="mt-1 text-emerald-300">
                  스캔 기록: {formatDateTime(snapshotAt)}
                  {restoredSnapshot ? ' 불러옴' : ''}
                </p>
              )}
              <p className="mt-1">목록 기준: {formatDateTime(universeMeta.asOf)}</p>
              <p className="mt-1">소스: {universeMeta.source}</p>
              {universeMeta.delayNote && <p className="mt-1 text-amber-300">{universeMeta.delayNote}</p>}
            </div>
          )}
        </div>

        {scanning || totalCount > 0 ? (
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
              <span>
                {completedCount}/{totalCount} 완료
                {runningCount > 0 ? `, ${runningCount}개 분석 중` : ''}
              </span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-lg bg-slate-800">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        ) : null}
      </section>

      {(error || notice || universeMeta?.warnings?.length) && (
        <div className="space-y-2">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
              {notice}
            </div>
          )}
          {universeMeta?.warnings.map((warning) => (
            <div key={warning} className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              {warning}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Metric label="전체" value={stats.total} />
        <Metric label="SEPA 통과" value={stats.sepaPass} />
        <Metric label="VCP Strong" value={stats.strong} />
        <Metric label="Forming 이상" value={stats.formingPlus} />
        <Metric label="피벗 3% 이내" value={stats.nearPivot} />
        <Metric label="오류" value={stats.errors} tone={stats.errors > 0 ? 'warning' : 'neutral'} />
      </div>

      <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filter === item.key
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
                    : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-400">
            정렬
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
            >
              {SORTS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5 space-y-3 lg:hidden">
          {visibleResults.length === 0 ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6 text-center text-sm text-slate-500">
              스캔 버튼을 누르면 종목군의 SEPA, VCP, 피벗 근접도가 자동 계산됩니다.
            </div>
          ) : (
            visibleResults.map((item) => (
              <article key={item.ticker} className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-slate-500">#{item.rank}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-lg font-bold text-white">{item.ticker}</span>
                      {item.status === 'running' && <LoadingSpinner size="sm" />}
                      {item.status === 'error' && <span className="text-xs text-red-300">오류</span>}
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-300">{item.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.exchange}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-sm text-slate-100">{formatPrice(item.currentPrice, item.currency)}</p>
                    <p className="mt-1 text-xs text-slate-500">기준: {formatDateTime(item.priceAsOf)}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">시가총액</p>
                    <p className="mt-1 font-mono text-slate-200">{formatMarketCap(item.marketCap, item.currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">피벗 근접도</p>
                    <p className={`mt-1 font-semibold ${distanceClass(item.distanceToPivotPct)}`}>
                      {distanceText(item.distanceToPivotPct)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">SEPA</p>
                    <span className={`mt-1 inline-flex rounded-lg border px-2 py-1 text-xs font-semibold ${sepaBadge(item.sepaStatus)}`}>
                      {sepaLabel(item.sepaStatus)}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">VCP</p>
                    <span className={`mt-1 inline-flex rounded-lg border px-2 py-1 text-xs font-semibold ${vcpBadge(item.vcpGrade)}`}>
                      {vcpLabel(item.vcpGrade)}
                      {item.vcpScore !== null ? ` ${item.vcpScore}점` : ''}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">거래량</p>
                    <p className="mt-1 text-slate-300">{volumeLabel(item.breakoutVolumeStatus)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">진입가</p>
                    <p className="mt-1 font-mono text-slate-300">
                      {item.recommendedEntry !== null ? formatPrice(item.recommendedEntry, item.currency) : '-'}
                    </p>
                  </div>
                </div>

                {item.errorMessage && <p className="mt-3 text-xs text-red-300">{item.errorMessage}</p>}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Link
                    href={`/plan?ticker=${encodeURIComponent(item.ticker)}&exchange=${encodeURIComponent(item.exchange)}`}
                    className="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-500/20 px-3 py-2 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/30"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    계획
                  </Link>
                  <button
                    type="button"
                    onClick={() => addToWatchlist(item)}
                    disabled={savingWatchlist.has(item.ticker)}
                    className="inline-flex items-center justify-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Star className="h-3.5 w-3.5" />
                    {savingWatchlist.has(item.ticker) ? '저장 중' : '관심'}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>

        <div className="mt-5 hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[1120px] text-left text-sm text-slate-300">
            <thead className="border-b border-slate-700 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-3 pr-3">순위</th>
                <th className="py-3 pr-3">티커</th>
                <th className="py-3 pr-3">종목명</th>
                <th className="py-3 pr-3">시가총액</th>
                <th className="py-3 pr-3">현재가</th>
                <th className="py-3 pr-3">SEPA</th>
                <th className="py-3 pr-3">VCP</th>
                <th className="py-3 pr-3">피벗 근접도</th>
                <th className="py-3 pr-3">거래량</th>
                <th className="py-3 text-right">액션</th>
              </tr>
            </thead>
            <tbody>
              {visibleResults.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-500">
                    스캔 버튼을 누르면 종목군의 SEPA, VCP, 피벗 근접도가 자동 계산됩니다.
                  </td>
                </tr>
              ) : (
                visibleResults.map((item) => (
                  <tr key={item.ticker} className="border-b border-slate-800 transition-colors hover:bg-slate-900/50">
                    <td className="py-3 pr-3 font-mono text-xs text-slate-500">{item.rank}</td>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-bold text-white">{item.ticker}</span>
                        {item.status === 'running' && <LoadingSpinner size="sm" />}
                        {item.status === 'error' && <span className="text-xs text-red-300">오류</span>}
                      </div>
                    </td>
                    <td className="max-w-[220px] py-3 pr-3">
                      <p className="truncate text-sm text-slate-200">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.exchange}</p>
                    </td>
                    <td className="py-3 pr-3 font-mono text-sm text-slate-300">
                      {formatMarketCap(item.marketCap, item.currency)}
                    </td>
                    <td className="py-3 pr-3">
                      <p className="font-mono text-sm text-slate-100">{formatPrice(item.currentPrice, item.currency)}</p>
                      <p className="mt-1 text-xs text-slate-500">기준: {formatDateTime(item.priceAsOf)}</p>
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`inline-flex min-w-[64px] justify-center rounded-lg border px-2 py-1 text-xs font-semibold ${sepaBadge(item.sepaStatus)}`}>
                        {sepaLabel(item.sepaStatus)}
                      </span>
                      {item.sepaPassed !== null && (
                        <p className="mt-1 text-xs text-slate-500">{item.sepaPassed}통과 / {item.sepaFailed}실패</p>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`inline-flex min-w-[76px] justify-center rounded-lg border px-2 py-1 text-xs font-semibold ${vcpBadge(item.vcpGrade)}`}>
                        {vcpLabel(item.vcpGrade)}
                      </span>
                      {item.vcpScore !== null && (
                        <p className="mt-1 font-mono text-xs text-slate-500">{item.vcpScore}점</p>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <p className={`font-semibold ${distanceClass(item.distanceToPivotPct)}`}>
                        {distanceText(item.distanceToPivotPct)}
                      </p>
                      {item.recommendedEntry !== null && (
                        <p className="mt-1 text-xs text-slate-500">진입가 {formatPrice(item.recommendedEntry, item.currency)}</p>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <span className="text-sm text-slate-300">{volumeLabel(item.breakoutVolumeStatus)}</span>
                      {item.errorMessage && <p className="mt-1 max-w-[160px] truncate text-xs text-red-300">{item.errorMessage}</p>}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/plan?ticker=${encodeURIComponent(item.ticker)}&exchange=${encodeURIComponent(item.exchange)}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/30"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          계획
                        </Link>
                        <button
                          type="button"
                          onClick={() => addToWatchlist(item)}
                          disabled={savingWatchlist.has(item.ticker)}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Star className="h-3.5 w-3.5" />
                          {savingWatchlist.has(item.ticker) ? '저장 중' : '관심'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
    </>
  );
}
function Metric({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'warning' }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 font-mono text-2xl font-bold ${tone === 'warning' ? 'text-amber-300' : 'text-white'}`}>{value}</p>
    </div>
  );
}
