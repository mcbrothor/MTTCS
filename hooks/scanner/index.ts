'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useContestSelection } from '../useContestSelection';
import {
  applyUniverseRsRankings,
  getVolumeSignalTier,
  isContestPoolTier,
  recommendationSortValue,
} from '@/lib/scanner-recommendation';
import type {
  MacroTrend,
  ScannerResult,
  ScannerUniverse,
  ScannerUniverseResponse,
} from '@/types';
import {
  LAST_UNIVERSE_STORAGE_KEY,
  LATEST_SCAN_UNIVERSE_STORAGE_KEY,
  RISK_PERCENT_FOR_SCAN,
  TOTAL_EQUITY_FOR_SCAN,
  UNIVERSES,
  type FilterKey,
  type SortKey,
  type ViewMode,
} from './constants';
import {
  getErrorMessage,
  initialResult,
  mapMarketAnalysisToScannerResult,
  parseFetchError,
  parseScannerUniverse,
  withRecommendation,
} from './helpers';
import {
  getInitialRestoredUniverse,
  loadScannerMetrics,
  readScannerSnapshot,
  writeScannerSnapshot,
} from './storage';
import { passesScannerMacroPolicy } from '@/lib/finance/market/macro-policy';

export {
  UNIVERSES,
  SCANNER_FILTERS,
  SORTS,
} from './constants';
export type { ViewMode, FilterKey, SortKey } from './constants';

export function useScanner() {
  const [universe, setUniverse] = useState<ScannerUniverse>(() => {
    if (typeof window === 'undefined') return 'NASDAQ100';
    // Use parseScannerUniverse for backward compatibility with old values (KOSPI100, KOSDAQ100)
    const stored = parseScannerUniverse(window.localStorage.getItem(LAST_UNIVERSE_STORAGE_KEY)) ||
                   parseScannerUniverse(window.localStorage.getItem(LATEST_SCAN_UNIVERSE_STORAGE_KEY));
    // Validate that result is in UNIVERSES object before returning
    if (stored && stored in UNIVERSES) return stored;
    return 'NASDAQ100';
  });
  const [results, setResults] = useState<ScannerResult[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [scanStage, setScanStage] = useState('대기 중');
  const [lastScannedAt, setLastScannedAt] = useState<string | null>(null);
  const [filterKey, setFilterKey] = useState<FilterKey>('all');
  const [sortKey, setSortKey] = useState<SortKey>('marketCap');
  const [viewMode, setViewMode] = useState<ViewMode>('web');
  const [customFilters, setCustomFilters] = useState<{ rsMin: number; vcpMin: number; distMax: number }>({ rsMin: 0, vcpMin: 0, distMax: 999 });
  const [showCustomFilter, setShowCustomFilter] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedResult, setSelectedResult] = useState<ScannerResult | null>(null);
  const {
    selectedTickers,
    toggleSelection: baseToggleSelected,
    clearSelection: baseClearSelection,
    limitMessage,
  } = useContestSelection(universe);

  const toggleSelected = useCallback((ticker: string) => {
    baseToggleSelected(ticker, universe);
  }, [baseToggleSelected, universe]);

  const clearSelection = useCallback(() => {
    baseClearSelection(universe);
  }, [baseClearSelection, universe]);
  const [isSavingWatchlist, setIsSavingWatchlist] = useState(false);
  const [macroTrend, setMacroTrend] = useState<MacroTrend | null>(null);
  const [showAllMacroResults, setShowAllMacroResults] = useState(false);

  const macroScopedResults = useMemo(() => {
    return results
      .map((item) => withRecommendation(item))
      .filter((item) => passesScannerMacroPolicy(item, macroTrend?.action_level, showAllMacroResults));
  }, [results, macroTrend, showAllMacroResults]);

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
              priceSource: c.priceSource,
            })),
            totalEquity: TOTAL_EQUITY_FOR_SCAN,
            riskPercent: RISK_PERCENT_FOR_SCAN,
          };

          const response = await fetch('/api/scanner/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: abortController.signal,
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

        // 1. 실시간 RS 랭킹 부여
        const withRealtimeRs = applyUniverseRsRankings(merged.results);

        // 2. 추천 등급 최종 평가
        const normalized = withRealtimeRs.map((item) => withRecommendation(item));

        setMacroTrend(merged.macroTrend);
        const now = new Date().toISOString();
        setResults(normalized);
        setLastScannedAt(now);
        setScanStage('스캔 완료');

        // 3. (제거) Recommended 등급 종목 자동 콘테스트 후보 선택 - 사용자 혼란 방지를 위해 제거
        // 4. 스냅샷 저장
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

  const filteredResults = useMemo(() => {
    let list = [...macroScopedResults];

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

    // 커스텀 필터 적용
    if (showCustomFilter) {
      if (customFilters.rsMin > 0) list = list.filter(row => (row.rsRating || 0) >= customFilters.rsMin);
      if (customFilters.vcpMin > 0) list = list.filter(row => (row.vcpScore || 0) >= customFilters.vcpMin);
      if (customFilters.distMax < 100) list = list.filter(row => row.distanceToPivotPct !== null && Math.abs(row.distanceToPivotPct) <= customFilters.distMax);
    }

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
  }, [macroScopedResults, filterKey, sortKey, showCustomFilter, customFilters]);

  const stats = useMemo(() => ({
    recommended: macroScopedResults.filter((item) => item.recommendationTier === 'Recommended').length,
    partial: macroScopedResults.filter((item) => item.recommendationTier === 'Partial').length,
    errors: macroScopedResults.filter((item) => item.status === 'error').length,
  }), [macroScopedResults]);

  const dataSourceSummary = useMemo(() => {
    const sources = Array.from(new Set(
      results
        .map((item) => item.priceSource || item.providerAttempts?.findLast((attempt) => attempt.status === 'success')?.provider)
        .filter((source): source is string => Boolean(source))
    ));

    if (sources.length === 0) {
      return universe === 'KOSPI200' || universe === 'KOSDAQ150'
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
    stats, dataSourceSummary, isSavingWatchlist,
    customFilters, setCustomFilters, showCustomFilter, setShowCustomFilter,
    limitMessage
  };
}
