'use client';

import { get, set } from 'idb-keyval';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useContestSelection } from './useContestSelection';
import {
  evaluateScannerRecommendation,
  getVolumeSignalTier,
  isContestPoolTier,
  recommendationSortValue,
} from '@/lib/scanner-recommendation';
import type {
  MarketAnalysisResponse,
  ProviderAttempt,
  ScannerConstituent,
  ScannerResult,
  ScannerUniverse,
  ScannerUniverseResponse,
  MacroTrend,
  StockMetric,
} from '@/types';

const TOTAL_EQUITY_FOR_SCAN = '50000';
const RISK_PERCENT_FOR_SCAN = '1';
const SCANNER_STORAGE_PREFIX = 'mtn:scanner-snapshot:v3:';
const LAST_UNIVERSE_STORAGE_KEY = 'mtn:scanner:last-universe:v1';
const LATEST_SCAN_UNIVERSE_STORAGE_KEY = 'mtn:scanner:latest-scan-universe:v1';

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

interface StoredScannerSnapshot {
  savedAt: string;
  universeMeta: ScannerUniverseResponse;
  results: ScannerResult[];
}


interface ScannerMetricsResponse {
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
  KOSPI100: {
    label: 'KOSPI 시총 상위 100',
    description: 'KOSPI 전체 시가총액 상위 100개를 기준으로 국내 주도주 후보를 확인합니다.',
  },
  KOSDAQ100: {
    label: 'KOSDAQ 시총 상위 100',
    description: 'KOSDAQ 시가총액 상위 100개를 기준으로 성장주 후보를 확인합니다.',
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

async function readScannerSnapshot(universe: ScannerUniverse): Promise<StoredScannerSnapshot | null> {
  try {
    const raw = await get(scannerStorageKey(universe));
    if (!raw) return null;

    const snapshot = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!snapshot.universeMeta || snapshot.universeMeta.universe !== universe || !Array.isArray(snapshot.results)) return null;
    return {
      ...snapshot,
      results: snapshot.results.map((item: ScannerResult) => withRecommendation(item)),
    };
  } catch {
    return null;
  }
}

async function writeScannerSnapshot(universeMeta: ScannerUniverseResponse, results: ScannerResult[], savedAt: string) {
  const snapshot: StoredScannerSnapshot = {
    savedAt,
    universeMeta,
    results: results.map((item) => withRecommendation(item)),
  };
  await set(scannerStorageKey(universeMeta.universe), snapshot);
  window.localStorage.setItem(LAST_UNIVERSE_STORAGE_KEY, universeMeta.universe);
  window.localStorage.setItem(LATEST_SCAN_UNIVERSE_STORAGE_KEY, universeMeta.universe);
}

function readStoredUniverse(key: string) {
  return parseScannerUniverse(window.localStorage.getItem(key));
}

function uniqueUniverses(items: (ScannerUniverse | null)[]) {
  return items.filter((item, index): item is ScannerUniverse => Boolean(item) && items.indexOf(item) === index);
}

async function getInitialRestoredUniverse() {
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

  for (const candidate of candidates) {
    const snap = await readScannerSnapshot(candidate);
    if (snap) return candidate;
  }
  return lastSelectedUniverse ?? latestScannedUniverse ?? 'NASDAQ100';
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function rsPercentile(rank: number | null | undefined, universeSize: number | null | undefined) {
  if (!rank || !universeSize) return null;
  if (universeSize <= 1) return 50;
  return Math.round((1 - ((rank - 1) / (universeSize - 1))) * 100);
}

function mergeStandardMetrics(results: ScannerResult[], rows: { ticker: string; metric: StockMetric | null }[], macroTrend: MacroTrend | null) {
  const byTicker = new Map(rows.map((row) => [row.ticker, row.metric]));
  return results.map((item) => {
    const metric = byTicker.get(item.ticker) || null;
    return withRecommendation({
      ...item,
      rsRating: metric?.rs_rating ?? null,
      internalRsRating: metric?.rs_rating ?? null,
      rsRank: metric?.rs_rank ?? null,
      rsUniverseSize: metric?.rs_universe_size ?? null,
      rsPercentile: rsPercentile(metric?.rs_rank, metric?.rs_universe_size),
      ibdProxyScore: metric?.ibd_proxy_score ?? null,
      weightedMomentumScore: metric?.ibd_proxy_score ?? null,
      mansfieldRsFlag: metric?.mansfield_rs_flag ?? null,
      mansfieldRsScore: metric?.mansfield_rs_score ?? null,
      rsDataQuality: metric?.data_quality ?? 'NA',
      macroActionLevel: macroTrend?.action_level ?? null,
    });
  });
}

async function loadScannerMetrics(universe: ScannerUniverse, rows: ScannerResult[]) {
  const tickers = rows.map((item) => item.ticker).filter(Boolean);
  if (tickers.length === 0) return { results: rows.map(withRecommendation), macroTrend: null as MacroTrend | null };
  try {
    const query = new URLSearchParams({ universe, tickers: tickers.join(',') });
    const response = await fetch('/api/scanner/metrics?' + query.toString());
    if (!response.ok) throw new Error('metrics ' + response.status);
    const payload = await response.json() as ScannerMetricsResponse;
    return { results: mergeStandardMetrics(rows, payload.metrics, payload.macroTrend), macroTrend: payload.macroTrend };
  } catch {
    return {
      results: rows.map((item) => withRecommendation({
        ...item,
        rsRating: null,
        internalRsRating: null,
        rsRank: null,
        rsUniverseSize: null,
        rsPercentile: null,
        ibdProxyScore: null,
        weightedMomentumScore: null,
        mansfieldRsFlag: null,
        mansfieldRsScore: null,
        rsDataQuality: 'NA',
        macroActionLevel: null,
      })),
      macroTrend: null as MacroTrend | null,
    };
  }
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
    sepaCriteria: null,
    sepaEvidence: null,
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
    dataWarnings: [],
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

function mapMarketAnalysisToScannerResult(item: ScannerConstituent, analysis: MarketAnalysisResponse): ScannerResult {
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
    dataWarnings: analysis.warnings || [],
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
    sepaCriteria: analysis.sepaEvidence.criteria,
    sepaEvidence: analysis.sepaEvidence,
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






// Moved to useContestSelection.ts




export function useScanner() {
  const [universe, setUniverse] = useState<ScannerUniverse>(() => {
    if (typeof window === 'undefined') return 'NASDAQ100';
    return (window.localStorage.getItem(LAST_UNIVERSE_STORAGE_KEY) as ScannerUniverse) || 
           (window.localStorage.getItem(LATEST_SCAN_UNIVERSE_STORAGE_KEY) as ScannerUniverse) || 
           'NASDAQ100';
  });
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
  const { selectedTickers, toggleSelection: toggleSelected, clearSelection } = useContestSelection();
  const [isSavingWatchlist, setIsSavingWatchlist] = useState(false);
  const [macroTrend, setMacroTrend] = useState<MacroTrend | null>(null);
  const [showAllMacroResults, setShowAllMacroResults] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    const init = async () => {
      const initial = await getInitialRestoredUniverse();
      if (!active) return;
      setUniverse(initial);
      const snapshot = await readScannerSnapshot(initial);
      if (!active) return;
      if (snapshot) {
        setResults(snapshot.results);
        setLastScannedAt(snapshot.savedAt);
        // Selected tickers now synced globally via useContestSelection
        loadScannerMetrics(initial, snapshot.results).then((merged) => {
          if (!active) return;
          setResults(merged.results);
          setMacroTrend(merged.macroTrend);
        });
      }
    };
    init();
    return () => { active = false; };
  }, []);

  const handleUniverseChange = async (newUniverse: ScannerUniverse) => {
    if (isScanning) return;
    setUniverse(newUniverse);
    const snapshot = await readScannerSnapshot(newUniverse);
    if (snapshot) {
      setResults(snapshot.results);
      setLastScannedAt(snapshot.savedAt);
      // Selected tickers now synced globally via useContestSelection
      loadScannerMetrics(newUniverse, snapshot.results).then((merged) => {
        setResults(merged.results);
        setMacroTrend(merged.macroTrend);
      });
    } else {
      setResults([]);
      setLastScannedAt(null);
      setMacroTrend(null);
    }
    localStorage.setItem(LAST_UNIVERSE_STORAGE_KEY, newUniverse);
  };

  const startScan = async () => {
    if (busy || isScanning) return;

    setBusy(true);
    setIsScanning(true);
    setProgress({ current: 0, total: 0 });
    setScanStage('유니버스 로딩 중');

        setMacroTrend(null);
    setShowAllMacroResults(false);

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

      const batchSize = 10;
      let completedCount = 0;

      for (let i = 0; i < initialResults.length; i += batchSize) {
        if (abortController.signal.aborted) break;
        const chunk = initialResults.slice(i, i + batchSize);
        
        latestResults = latestResults.map((row) => chunk.some(c => c.ticker === row.ticker) ? { ...row, status: 'running' } : row);
        setResults(latestResults);

        try {
          const payload = {
            items: chunk.map(c => ({
              ticker: c.ticker,
              exchange: c.exchange,
              currentPrice: c.currentPrice,
              priceAsOf: c.priceAsOf,
              priceSource: c.priceSource
            })),
            totalEquity: TOTAL_EQUITY_FOR_SCAN,
            riskPercent: RISK_PERCENT_FOR_SCAN,
          };

          const response = await fetch('/api/scanner/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: abortController.signal
          });

          if (!response.ok) {
            const parsed = await parseFetchError(response);
            throw new Error(parsed.message);
          }

          const batchResp = await response.json();
          const batchResults = batchResp.results;

          for (const res of batchResults) {
            const item = chunk.find(c => c.ticker === res.ticker)!;
            if (res.success) {
              const mapped = mapMarketAnalysisToScannerResult(item, res.data);
              latestResults = latestResults.map((row) => row.ticker === item.ticker ? mapped : row);
            } else {
              const errorResult = withRecommendation({
                ...initialResult(item),
                status: 'error',
                providerAttempts: res.providerAttempts || [],
                errorMessage: res.error,
              });
              latestResults = latestResults.map((row) => row.ticker === item.ticker ? errorResult : row);
            }
          }
          setResults(latestResults);
        } catch (err) {
          if (abortController.signal.aborted) break;
          const errMsg = getErrorMessage(err);
          for (const item of chunk) {
             const errorResult = withRecommendation({
               ...initialResult(item),
               status: 'error',
               errorMessage: errMsg,
             });
             latestResults = latestResults.map((row) => row.ticker === item.ticker ? errorResult : row);
          }
          setResults(latestResults);
        } finally {
          completedCount += chunk.length;
          setProgress({ current: completedCount, total: initialResults.length });
        }
      }

      if (!abortController.signal.aborted) {
        const merged = await loadScannerMetrics(meta.universe, latestResults);
        const normalized = merged.results.map((item) => withRecommendation(item));
        setMacroTrend(merged.macroTrend);
                const now = new Date().toISOString();
        setResults(normalized);
        setLastScannedAt(now);
        setScanStage('스캔 완료');
        writeScannerSnapshot(meta, normalized, now);
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

// Handled by toggleSelected from useContestSelection


  const filteredResults = useMemo(() => {
    let list = results.map((item) => withRecommendation(item));

    if (macroTrend?.action_level === 'REDUCED' && !showAllMacroResults && filterKey === 'all') {
      list = list.filter((row) => (row.rsRating || 0) >= 80 || row.status !== 'done');
    }

    if (filterKey === 'sepaPass') list = list.filter((row) => row.sepaStatus === 'pass');
    else if (filterKey === 'recommended') list = list.filter((row) => row.recommendationTier === 'Recommended');
    else if (filterKey === 'partial') list = list.filter((row) => row.recommendationTier === 'Partial');
    else if (filterKey === 'contestPool') list = list.filter((row) => isContestPoolTier(row.recommendationTier));
    else if (filterKey === 'nearPivot') list = list.filter((row) => row.distanceToPivotPct !== null && Math.abs(row.distanceToPivotPct) <= 5);
    else if (filterKey === 'volume') {
      list = list.filter((row) => 
        ['Strong', 'Watch'].includes(getVolumeSignalTier(row)) || 
        (row.pocketPivotScore || 0) >= 40 || 
        (row.volumeDryUpScore || 0) >= 50 ||
        row.breakoutVolumeStatus === 'confirmed'
      );
    }
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
  }, [results, filterKey, sortKey, macroTrend, showAllMacroResults]);

  const stats = useMemo(() => ({
    recommended: results.filter((item) => item.recommendationTier === 'Recommended').length,
    partial: results.filter((item) => item.recommendationTier === 'Partial').length,
    errors: results.filter((item) => item.status === 'error').length,
  }), [results]);

  const dataSourceSummary = useMemo(() => {
    const sources = Array.from(new Set(
      results
        .map((item) => item.priceSource || item.providerAttempts?.findLast((attempt) => attempt.status === 'success')?.provider)
        .filter((source): source is string => Boolean(source))
    ));

    if (sources.length === 0) {
      return universe === 'KOSPI100' || universe === 'KOSDAQ100'
        ? '유니버스: Naver Finance 시가총액 순위 · 가격/분석: KIS → Yahoo fallback'
        : '유니버스: 공식/공개 구성종목 API · 가격/분석: KIS → Yahoo fallback';
    }

    return sources.slice(0, 4).join(' · ') + (sources.length > 4 ? ` 외 ${sources.length - 4}개` : '');
  }, [results, universe]);
  return { 
    universe, results, isScanning, progress, scanStage, lastScannedAt,
    filterKey, setFilterKey, sortKey, setSortKey, viewMode, setViewMode, busy, 
    selectedResult, setSelectedResult, selectedTickers, clearSelection, macroTrend, 
    showAllMacroResults, setShowAllMacroResults, handleUniverseChange, 
    startScan, stopScan, addToWatchlist, toggleSelected, filteredResults, 
    stats, dataSourceSummary, isSavingWatchlist 
  };
}