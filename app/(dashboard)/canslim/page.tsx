'use client';

import Link from 'next/link';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Play,
  ScanSearch,
  Shield,
  Square,
  BarChart3,
  LayoutDashboard,
  Search,
  Plus,
  Check,
  Activity,
} from 'lucide-react';

import { useContestSelection } from '@/hooks/useContestSelection';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import CanslimDrilldownModal from '@/components/scanner/CanslimDrilldownModal';
import ScannerTabNav from '@/components/scanner/ScannerTabNav';
import MarketBanner from '@/components/ui/MarketBanner';
import { getCanslimLabel } from '@/lib/finance/engines/canslim-labels';
import {
  CANSLIM_PILLARS,
  getPillarDisplayStatus,
  getPillarPassCount,
  getPillarTooltip,
} from '@/lib/finance/engines/canslim-pillars';
import { applyUniverseRsRankings } from '@/lib/scanner-recommendation';
import { dualTierLabel } from '@/lib/finance/engines/canslim-engine';
import type {
  CanslimMacroMarketData,
  CanslimScannerResult,
  DualScreenerTier,
  ScannerResult,
  ScannerUniverse,
  ScannerUniverseResponse,
} from '@/types';

// === 상수 ===

const SCAN_CONCURRENCY = 3;
const KR_SCAN_CONCURRENCY = 2;
const STORAGE_PREFIX = 'mtn:canslim-snapshot:v1:';

type ViewMode = 'web' | 'app';
type FilterKey = 'all' | 'pass' | 'fail' | 'tier1' | 'watchlist' | 'short_term' | 'high_confidence' | 'warnings';
type SortKey = 'marketCap' | 'dualTier' | 'confidence' | 'rs' | 'pillar' | 'default';

const UNIVERSES: Record<ScannerUniverse, { label: string; desc: string }> = {
  NASDAQ100: { label: 'NASDAQ 100', desc: 'Nasdaq 100 대형 성장주에서 오닐 주도주를 탐색합니다.' },
  SP500: { label: 'S&P 500', desc: 'S&P 500에서 펀더멘털과 기술적 분석을 결합한 주도주를 찾습니다.' },
  KOSPI200: { label: 'KOSPI 상위 200', desc: 'KOSPI 시가총액 상위 200개 종목 오닐 스캔.' },
  KOSDAQ150: { label: 'KOSDAQ 상위 150', desc: 'KOSDAQ 시가총액 상위 150개 종목 오닐 스캔.' },
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'pass', label: 'PASS' },
  { key: 'fail', label: 'FAIL' },
  { key: 'tier1', label: 'TIER 1' },
  { key: 'watchlist', label: '워치리스트' },
  { key: 'short_term', label: '단기 후보' },
  { key: 'high_confidence', label: 'HIGH 신뢰' },
  { key: 'warnings', label: '경고 있음' },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'marketCap', label: '시가총액순' },
  { key: 'dualTier', label: '이중검증 티어' },
  { key: 'confidence', label: '신뢰도순' },
  { key: 'rs', label: 'RS순' },
  { key: 'pillar', label: '통과 Pillar 많은 순' },
  { key: 'default', label: '기본순' },
];

// === 유틸 ===

function storageKey(universe: ScannerUniverse) {
  return `${STORAGE_PREFIX}${universe}`;
}

interface StoredSnapshot {
  savedAt: string;
  universe: ScannerUniverse;
  results: CanslimScannerResult[];
  macro: CanslimMacroMarketData | null;
}

function readSnapshot(universe: ScannerUniverse): StoredSnapshot | null {
  try {
    const raw = window.localStorage.getItem(storageKey(universe));
    if (!raw) return null;
    return JSON.parse(raw) as StoredSnapshot;
  } catch {
    return null;
  }
}

function writeSnapshot(snapshot: StoredSnapshot) {
  window.localStorage.setItem(storageKey(snapshot.universe), JSON.stringify(snapshot));
  window.localStorage.setItem('mtn:scanner:latest-scan-universe:v1', snapshot.universe);
}

function tierSortValue(tier: DualScreenerTier) {
  if (tier === 'TIER_1') return 0;
  if (tier === 'WATCHLIST') return 1;
  if (tier === 'SHORT_TERM') return 2;
  return 3;
}

function confidenceSortValue(c: string) {
  if (c === 'HIGH') return 0;
  if (c === 'MEDIUM') return 1;
  return 2;
}

function tierBadgeClass(tier: DualScreenerTier) {
  const { color } = dualTierLabel(tier);
  const map: Record<string, string> = {
    emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
    amber: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
    blue: 'border-blue-500/40 bg-blue-500/10 text-blue-200',
    slate: 'border-slate-700 bg-slate-900 text-slate-400',
  };
  return map[color] ?? map.slate;
}

function formatPrice(value: number | null, currency: 'USD' | 'KRW') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat(currency === 'KRW' ? 'ko-KR' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'KRW' ? 0 : 2,
  }).format(value);
}

function formatMarketCap(value: number | null, currency?: string, ticker?: string) {
  if (!value) return '-';
  const isKorean = currency === 'KRW' || (ticker && /^\d{6}$/.test(ticker));
  
  if (isKorean) {
    const jo = value / 1e12;
    if (jo >= 1) return `₩${jo.toFixed(2)}조`;
    const eok = Math.round(value / 1e8);
    return `₩${eok.toLocaleString('ko-KR')}억`;
  }
  
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return value.toLocaleString();
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '알 수 없는 오류';
}

// === 메인 컴포넌트 ===

export default function CanslimScannerPage() {
  const [universe, setUniverse] = useState<ScannerUniverse>('NASDAQ100');
  const [results, setResults] = useState<CanslimScannerResult[]>([]);
  const [macro, setMacro] = useState<CanslimMacroMarketData | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [scanStage, setScanStage] = useState('대기 중');
  const [lastScannedAt, setLastScannedAt] = useState<string | null>(null);
  const [filterKey, setFilterKey] = useState<FilterKey>('all');
  const [sortKey, setSortKey] = useState<SortKey>('marketCap');
  const [selectedResult, setSelectedResult] = useState<CanslimScannerResult | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('web');
  const {
    selectedTickers,
    toggleSelection: baseToggleSelection,
    clearSelection: baseClearSelection,
    limitMessage,
  } = useContestSelection(universe);

  const toggleSelection = (t: string) => baseToggleSelection(t, universe);
  const clearSelection = () => baseClearSelection(universe);

  const abortRef = useRef<AbortController | null>(null);

  // 초기 복원
  useEffect(() => {
    const snapshot = readSnapshot(universe);
    if (snapshot) {
      setResults(snapshot.results);
      setMacro(snapshot.macro);
      setLastScannedAt(snapshot.savedAt);
    }
  }, [universe]);



  const handleToggleSelected = (ticker: string, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleSelection(ticker);
  };

  const handleUniverseChange = (u: ScannerUniverse) => {
    if (isScanning) return;
    setUniverse(u);
    const snapshot = readSnapshot(u);
    if (snapshot) {
      setResults(snapshot.results);
      setMacro(snapshot.macro);
      setLastScannedAt(snapshot.savedAt);
    } else {
      setResults([]);
      setMacro(null);
      setLastScannedAt(null);
    }
  };

  // === 스캔 시작 ===
  const startScan = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setProgress({ current: 0, total: 0 });
    setScanStage('유니버스 로딩 중');
    setMacro(null);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const resp = await fetch(`/api/scanner/universe?universe=${universe}`, { signal: abort.signal });
      if (!resp.ok) throw new Error(`유니버스 로딩 실패 (${resp.status})`);
      const meta = await resp.json() as ScannerUniverseResponse;

      const items = meta.items;
      setProgress({ current: 0, total: items.length });
      setScanStage('오닐 스캐너 평가 실행 중');

      let current: CanslimScannerResult[] = items.map((item) => ({
        ticker: item.ticker,
        exchange: item.exchange,
        name: item.name,
        market: universe.startsWith('KOS') ? 'KR' : 'US',
        currentPrice: item.currentPrice,
        marketCap: item.marketCap,
        currency: item.currency,
        canslimResult: {
          pass: false,
          confidence: 'LOW',
          failedPillar: null,
          warnings: [],
          nStatus: 'INVALID',
          stopLossPrice: null,
          pillarDetails: [],
        },
        basePattern: null,
        vcpGrade: null,
        vcpScore: null,
        dualTier: 'EXCLUDED',
        rsRating: null,
        mansfieldRsFlag: null,
        status: 'queued',
        analyzedAt: null,
        errorMessage: null,
        dataWarnings: [],
      }));
      setResults(current);

      const concurrency = universe.startsWith('KOS') ? KR_SCAN_CONCURRENCY : SCAN_CONCURRENCY;
      const queue = [...items];
      let completed = 0;

      const workers = Array(concurrency).fill(null).map(async () => {
        while (queue.length > 0 && !abort.signal.aborted) {
          const item = queue.shift();
          if (!item) break;

          current = current.map((r) => r.ticker === item.ticker ? { ...r, status: 'running' as const } : r);
          setResults([...current]);

          try {
            const params = new URLSearchParams({ ticker: item.ticker, exchange: item.exchange });
            const res = await fetch(`/api/scanner/canslim?${params.toString()}`, { signal: abort.signal });

            if (!res.ok) {
              const body = await res.json().catch(() => ({})) as { message?: string };
              throw new Error(body.message || `분석 실패 (${res.status})`);
            }

            const payload = await res.json() as {
              result: CanslimScannerResult;
              macro: CanslimMacroMarketData;
            };

            if (!macro) setMacro(payload.macro);

            current = current.map((r) =>
              r.ticker === item.ticker ? { ...payload.result, name: item.name, marketCap: payload.result.marketCap || item.marketCap } : r
            );
            setResults([...current]);
          } catch (err) {
            if (abort.signal.aborted) break;
            current = current.map((r) =>
              r.ticker === item.ticker
                ? { ...r, status: 'error' as const, errorMessage: getErrorMessage(err) }
                : r
            );
            setResults([...current]);
          } finally {
            completed++;
            setProgress({ current: completed, total: items.length });
          }
        }
      });

      await Promise.all(workers);

      // 이슈 1 해결: 스캔 완료 후 유니버스 전체에 대해 RS 랭킹 산정 적용
      if (!abort.signal.aborted) {
        current = applyUniverseRsRankings(current as unknown as ScannerResult[]) as unknown as CanslimScannerResult[];
        setResults([...current]);

        const now = new Date().toISOString();
        setLastScannedAt(now);
        setScanStage('스캔 완료');
        writeSnapshot({ savedAt: now, universe, results: current, macro });
      }
    } catch (err) {
      if (!abort.signal.aborted) {
        alert(`스캔 실패: ${getErrorMessage(err)}`);
      }
    } finally {
      setIsScanning(false);
      abortRef.current = null;
    }
  };

  const stopScan = () => {
    abortRef.current?.abort();
    setIsScanning(false);
    setScanStage('중단됨');
  };

  // === 필터 + 정렬 ===
  const filteredResults = useMemo(() => {
    let list = [...results];

    if (filterKey === 'pass') list = list.filter((r) => r.canslimResult.pass);
    else if (filterKey === 'fail') list = list.filter((r) => !r.canslimResult.pass && r.status === 'done');
    else if (filterKey === 'tier1') list = list.filter((r) => r.dualTier === 'TIER_1');
    else if (filterKey === 'watchlist') list = list.filter((r) => r.dualTier === 'WATCHLIST');
    else if (filterKey === 'short_term') list = list.filter((r) => r.dualTier === 'SHORT_TERM');
    else if (filterKey === 'high_confidence') list = list.filter((r) => r.canslimResult.confidence === 'HIGH');
    else if (filterKey === 'warnings') list = list.filter((r) => r.canslimResult.warnings.length > 0 || r.dataWarnings.length > 0);

    list.sort((a, b) => {
      if (sortKey === 'marketCap') return (b.marketCap ?? 0) - (a.marketCap ?? 0);
      if (sortKey === 'dualTier') return tierSortValue(a.dualTier) - tierSortValue(b.dualTier) || (b.rsRating ?? 0) - (a.rsRating ?? 0);
      if (sortKey === 'confidence') return confidenceSortValue(a.canslimResult.confidence) - confidenceSortValue(b.canslimResult.confidence);
      if (sortKey === 'rs') return (b.rsRating ?? 0) - (a.rsRating ?? 0);
      if (sortKey === 'pillar') return getPillarPassCount(b.canslimResult) - getPillarPassCount(a.canslimResult);
      return 0;
    });

    return list;
  }, [results, filterKey, sortKey]);

  // === 통계 ===
  const stats = useMemo(() => ({
    total: results.filter((r) => r.status === 'done').length,
    pass: results.filter((r) => r.canslimResult.pass).length,
    tier1: results.filter((r) => r.dualTier === 'TIER_1').length,
    watchlist: results.filter((r) => r.dualTier === 'WATCHLIST').length,
    errors: results.filter((r) => r.status === 'error').length,
  }), [results]);

  // === 테이블 렌더링 ===
  const renderTable = () => (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50 backdrop-blur-sm">
      <table className="w-full table-fixed divide-y divide-slate-800 text-xs">
        <colgroup>
          <col className="w-[4%]" />
          <col className="w-[12%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[12%]" />
          <col className="w-[10%]" />
          <col className="w-[12%]" />
          <col className="w-[8%]" />
          <col className="w-[12%]" />
          <col className="w-[10%]" />
        </colgroup>
        <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
          <tr>
            <th className="px-3 py-4 text-left">#</th>
            <th className="px-3 py-4 text-left">종목</th>
            <th className="px-3 py-4 text-right">시가총액</th>
            <th className="px-3 py-4 text-right">현재가</th>
            <th className="px-3 py-4 text-left">이중 검증</th>
            <th className="px-3 py-4 text-left">오닐 스캐너</th>
            <th className="px-3 py-4 text-left">신뢰도</th>
            <th className="px-3 py-4 text-right">RS</th>
            <th className="px-3 py-4 text-left">패턴</th>
            <th className="px-3 py-4 text-center">선정</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {filteredResults.map((r, idx) => (
            <tr
              key={r.ticker}
              className={`cursor-pointer transition-colors hover:bg-slate-800/40 ${selectedTickers.has(r.ticker) ? 'bg-rose-500/5' : ''}`}
              onClick={() => r.status === 'done' && setSelectedResult(r)}
            >
              <td className="px-3 py-4 text-slate-500 font-mono text-[10px]">{idx + 1}</td>
              <td className="px-3 py-4">
                <div className="font-bold text-white group-hover:text-rose-400 transition-colors">{r.ticker}</div>
                <div className="text-[10px] text-slate-500 truncate">{r.name}</div>
              </td>
              <td className="px-3 py-4 text-right font-mono text-slate-400">
                {formatMarketCap(r.marketCap, r.currency, r.ticker)}
              </td>
              <td className="px-3 py-4 text-right font-mono text-slate-300 font-medium">
                {r.status === 'running' ? <LoadingSpinner size="sm" /> : formatPrice(r.currentPrice, r.currency)}
              </td>
              <td className="px-3 py-4">
                {r.status === 'done' && (
                  <span className={`inline-flex rounded-lg border px-2 py-0.5 text-[10px] font-bold ${tierBadgeClass(r.dualTier)}`}>
                    {dualTierLabel(r.dualTier).emoji} {dualTierLabel(r.dualTier).label}
                  </span>
                )}
                {r.status === 'error' && <span className="text-rose-400 text-[10px]">에러</span>}
                {(r.status === 'queued' || r.status === 'running') && <span className="text-slate-600 text-[10px]">대기 중</span>}
              </td>
              <td className="px-3 py-4">
                {r.status === 'done' && (() => {
                  const labelInfo = getCanslimLabel(r.canslimResult.pass, r.canslimResult.failedPillar);
                  const Icon = labelInfo.icon;
                  return (
                    <span className={`inline-flex items-center gap-1 text-xs font-bold ${labelInfo.color} ${!r.canslimResult.pass && 'font-normal opacity-70'}`}>
                      <Icon className="h-3 w-3" />
                      {labelInfo.text}
                    </span>
                  );
                })()}
              </td>
              <td className="px-3 py-4">
                {r.status === 'done' && (
                  <span className={`text-[11px] font-bold tracking-tight ${
                    r.canslimResult.confidence === 'HIGH' ? 'text-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.2)]' :
                    r.canslimResult.confidence === 'MEDIUM' ? 'text-amber-400' : 'text-rose-400'
                  }`}>
                    {r.canslimResult.confidence}
                    {r.canslimResult.warnings.length > 0 && (
                      <AlertTriangle className="ml-1 inline h-3 w-3 text-amber-500" />
                    )}
                  </span>
                )}
              </td>
              <td className="px-3 py-4 text-right font-mono">
                {r.rsRating !== null ? (
                  <span className="inline-flex items-center gap-1 justify-end">
                    <span className={r.rsRating >= 90 ? 'text-emerald-400 font-bold' : r.rsRating >= 80 ? 'text-slate-200 font-semibold' : 'text-slate-500'}>
                      {r.rsRating}
                    </span>
                    {r.rsSource === 'BENCHMARK_PROXY' && (
                      <span
                        title="공식 유니버스 순위 기반 RS가 아닌, 벤치마크 대비 모멘텀으로 계산한 대체 점수입니다."
                        className="text-[9px] font-bold text-amber-300 bg-amber-500/10 px-1 rounded border border-amber-500/30"
                      >
                        PROXY
                      </span>
                    )}
                  </span>
                ) : '-'}
              </td>
              <td className="px-3 py-4">
                {r.basePattern ? (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-indigo-300 font-bold text-[10px] bg-indigo-500/10 px-1 rounded border border-indigo-500/20 w-fit">
                      {r.basePattern.type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[9px] text-slate-500 italic">Score: {r.vcpScore ?? '-'}</span>
                  </div>
                ) : <span className="text-slate-700">-</span>}
              </td>
              <td className="px-3 py-4 text-center">
                <button
                  onClick={(e) => handleToggleSelected(r.ticker, e)}
                  disabled={r.status !== 'done'}
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition-all ${
                    selectedTickers.has(r.ticker)
                      ? 'border-rose-500 bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                      : 'border-slate-800 text-slate-500 hover:border-rose-500/50 hover:text-rose-400'
                  } disabled:opacity-20`}
                >
                  {selectedTickers.has(r.ticker) ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // === 카드 렌더링 ===
  const renderCards = () => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {filteredResults.map((r) => (
        <motion.div
          key={r.ticker}
          layout
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`group flex flex-col overflow-hidden rounded-2xl border transition-all hover:border-rose-500/50 hover:shadow-2xl hover:shadow-rose-500/10 ${
            selectedTickers.has(r.ticker) ? 'border-rose-500 bg-rose-500/5' : 'border-slate-800 bg-slate-900/40'
          }`}
          onClick={() => r.status === 'done' && setSelectedResult(r)}
        >
          {/* 카드 헤더 */}
          <div className="relative border-b border-slate-800/50 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-black tracking-tight text-white group-hover:text-rose-400 transition-colors">
                    {r.ticker}
                  </span>
                  {r.status === 'done' && (
                    <span className={`inline-flex rounded-lg border px-1.5 py-0.5 text-[9px] font-bold ${tierBadgeClass(r.dualTier)}`}>
                      {dualTierLabel(r.dualTier).label}
                    </span>
                  )}
                </div>
                <span className="truncate text-xs text-slate-500 font-medium">{r.name}</span>
              </div>
              <button
                onClick={(e) => handleToggleSelected(r.ticker, e)}
                disabled={r.status !== 'done'}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all ${
                  selectedTickers.has(r.ticker)
                    ? 'border-rose-500 bg-rose-500 text-white shadow-xl shadow-rose-500/30 ring-2 ring-rose-500/20'
                    : 'border-slate-800 bg-slate-950 text-slate-500 hover:border-rose-500/50 hover:text-rose-400'
                } disabled:opacity-20`}
              >
                {selectedTickers.has(r.ticker) ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* 카드 바디 */}
          <div className="flex flex-1 flex-col p-4 space-y-4">
            {/* 상단 지표 영역 */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Price</span>
                <span className="font-mono text-base font-bold text-white tracking-tight">
                  {r.status === 'running' ? <LoadingSpinner size="sm" /> : formatPrice(r.currentPrice, r.currency)}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest text-right">
                  Relative Strength
                  {r.rsSource === 'BENCHMARK_PROXY' && (
                    <span
                      title="공식 유니버스 순위 기반 RS가 아닌, 벤치마크 대비 모멘텀으로 계산한 대체 점수입니다."
                      className="ml-1 text-[9px] font-bold text-amber-300 bg-amber-500/10 px-1 rounded border border-amber-500/30"
                    >
                      PROXY
                    </span>
                  )}
                </span>
                <span className={`font-mono text-base font-black ${
                  (r.rsRating ?? 0) >= 90 ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]' :
                  (r.rsRating ?? 0) >= 80 ? 'text-white' : 'text-slate-500'
                }`}>
                  {r.rsRating ?? '--'}
                </span>
              </div>
            </div>

            {/* Pillar 진행 대시보드 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">7 Pillar Score</span>
                <span className="text-[10px] font-black text-rose-300">{getPillarPassCount(r.canslimResult)} / 7 PASS</span>
              </div>
              <div className="flex gap-1">
                {CANSLIM_PILLARS.map((p) => {
                  const detail = {
                    description: getPillarTooltip(r.canslimResult, p),
                    status: getPillarDisplayStatus(r.canslimResult, p),
                  };
                  const isPass = detail.status === 'PASS';
                  const isFail = detail.status === 'FAIL';
                  return (
                    <div 
                      key={p} 
                      title={`${p}: ${detail?.description || '대기 중'}`}
                      className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                        isPass ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 
                        isFail ? 'bg-rose-500/40' : 'bg-slate-800'
                      }`} 
                    />
                  );
                })}
              </div>
              <div className="flex justify-between px-0.5">
                {CANSLIM_PILLARS.map((p) => (
                  <span key={p} className="text-[8px] font-bold text-slate-600">{p}</span>
                ))}
              </div>
            </div>

            {/* 카드 푸터 (메타 정보) */}
            <div className="mt-auto pt-3 border-t border-slate-800/50">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-slate-950/60 p-2 border border-slate-800/50">
                  <div className="text-[8px] font-bold text-slate-600 uppercase tracking-tighter mb-0.5 text-center">Confidence</div>
                  <div className={`text-[10px] font-black text-center ${
                    r.canslimResult.confidence === 'HIGH' ? 'text-emerald-400' :
                    r.canslimResult.confidence === 'MEDIUM' ? 'text-amber-400' : 'text-rose-400'
                  }`}>
                    {r.canslimResult.confidence}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-950/60 p-2 border border-slate-800/50">
                  <div className="text-[8px] font-bold text-slate-600 uppercase tracking-tighter mb-0.5 text-center">Market Cap</div>
                  <div className="text-[10px] font-black text-slate-300 text-center font-mono">
                    {formatMarketCap(r.marketCap, r.currency, r.ticker)}
                  </div>
                </div>
              </div>
              {r.basePattern && (
                <div className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-indigo-500/20 bg-indigo-500/5 py-1.5">
                  <LayoutDashboard className="h-3 w-3 text-indigo-400" />
                  <span className="text-[10px] font-bold text-indigo-300 truncate tracking-tight uppercase">
                    {r.basePattern.type.replace(/_/g, ' ')}
                  </span>
                </div>
              )}
            </div>
          </div>
          
          {/* 상태 오버레이 (에러/로딩) */}
          {r.status === 'error' && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/90 p-4 text-center backdrop-blur-sm">
              <AlertTriangle className="mb-2 h-8 w-8 text-rose-500" />
              <p className="text-xs font-bold text-rose-400">분석 실패</p>
              <p className="mt-1 text-[10px] text-slate-500 line-clamp-2">{r.errorMessage}</p>
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );

  // === 메인 렌더링 ===
  return (
    <div className="space-y-6 pb-12">
      {limitMessage && (
        <div className="fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-xl border border-amber-500/40 bg-amber-950/90 px-5 py-3 text-sm font-semibold text-amber-200 shadow-2xl backdrop-blur-md">
          {limitMessage}
        </div>
      )}
      <section className="panel-grid space-y-5 p-5 sm:p-6">
      {/* 글로벌 스캐너 탭 네비게이션 */}
      <ScannerTabNav />
      <MarketBanner compact={true} />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.9fr)]">
          <div className="space-y-4">
            <div>
              <h1 className="flex items-center gap-3 text-3xl font-black tracking-tightest text-white">
                <div className="rounded-2xl bg-rose-500/20 p-2.5 ring-1 ring-rose-500/40 shadow-[0_0_20px_rgba(244,63,94,0.1)]">
                  <ScanSearch className="h-6 w-6 text-rose-500" />
                </div>
                오닐 스캐너
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500 font-medium">
                윌리엄 오닐의 CANSLIM 원칙을 기반으로 강력한 실적 성장과 기술적 주도력을 가진 종목을 발굴합니다. 7 Pillar 필터와 VCP 패턴의 이중 검증을 통해 신뢰도 높은 투자 후보를 선별합니다.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-800 bg-slate-900/50 px-3 py-1.5 text-xs font-medium text-slate-400">
                Universe <span className="ml-1 font-mono text-white">{UNIVERSES[universe].label}</span>
              </span>
              <span className="rounded-full border border-slate-800 bg-slate-900/50 px-3 py-1.5 text-xs font-medium text-slate-400">
                Results <span className="ml-1 font-mono text-white">{filteredResults.length}</span>
              </span>
              <span className="rounded-full border border-slate-800 bg-slate-900/50 px-3 py-1.5 text-xs font-medium text-slate-400">
                Selected <span className="ml-1 font-mono text-white">{selectedTickers.size}/10</span>
              </span>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-800 bg-slate-900/50 p-4 shadow-xl">
            <div className="grid gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Scan Control
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  유니버스와 뷰 모드를 정한 뒤 바로 스캔을 실행할 수 있습니다.
                </p>
              </div>

              <div className="grid gap-3">
                <div className="grid gap-1.5 text-xs text-slate-500">
                  Universe Selection
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(UNIVERSES) as ScannerUniverse[]).map((u) => (
                      <button
                        key={u}
                        onClick={() => handleUniverseChange(u)}
                        disabled={isScanning}
                        className={`group relative overflow-hidden rounded-xl border p-2 text-left transition-all active:scale-95 ${
                          universe === u
                            ? 'border-rose-500/50 bg-rose-500/10 text-white ring-1 ring-rose-500/30'
                            : 'border-slate-800 bg-slate-950/40 text-slate-500 hover:border-slate-700'
                        }`}
                      >
                        <p className="text-[10px] font-black uppercase tracking-tightest">{UNIVERSES[u].label}</p>
                        <p className={`text-[8px] font-bold ${universe === u ? 'text-rose-400' : 'text-slate-700'}`}>
                          {u.includes('KOS') ? 'KR MARKET' : u === 'SP500' ? 'US MARKET' : 'TECH GROWTH'}
                        </p>
                        {universe === u && (
                          /* @ts-ignore - framer-motion layoutId type issue */
                          <motion.div layoutId="activeUniverse" className="absolute -bottom-1 left-0 right-0 h-0.5 bg-rose-500 blur-[2px]" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5 text-xs text-slate-500">
                    View Mode
                    <div className="flex rounded-xl border border-slate-800 bg-slate-950/40 p-1">
                      {(['web', 'app'] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setViewMode(mode)}
                          className={`flex-1 rounded-lg py-1.5 text-[10px] font-bold transition-all ${
                            viewMode === mode ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'text-slate-500'
                          }`}
                        >
                          {mode === 'web' ? 'TABLE' : 'CARDS'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-end">
                    {isScanning ? (
                      <Button onClick={stopScan} variant="danger" className="w-full h-10 flex items-center justify-center gap-2 rounded-xl font-bold active:scale-95 transition-all">
                        <Square className="h-3.5 w-3.5" /> 중단
                      </Button>
                    ) : (
                      <Button 
                        onClick={startScan} 
                        className="w-full h-10 flex items-center justify-center gap-2 rounded-xl border-none bg-gradient-to-br from-rose-600 to-rose-700 font-black text-white shadow-xl shadow-rose-500/20 hover:from-rose-500 hover:to-rose-600 active:scale-95 transition-all"
                      >
                        <Play className="h-3.5 w-3.5 fill-white" /> 스캔 시작
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      {/* 매크로 배너 */}
      {macro && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`group flex flex-col gap-4 rounded-2xl border p-5 shadow-2xl backdrop-blur-md transition-all ${
            macro.actionLevel === 'HALT' ? 'border-rose-500/40 bg-rose-500/5 shadow-rose-500/5' :
            macro.actionLevel === 'REDUCED' ? 'border-amber-500/40 bg-amber-500/5 shadow-amber-500/5' :
            'border-emerald-500/40 bg-emerald-500/5 shadow-emerald-500/5'
          }`}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className={`rounded-xl p-2 ${
                macro.actionLevel === 'HALT' ? 'bg-rose-500/20 text-rose-500' :
                macro.actionLevel === 'REDUCED' ? 'bg-amber-500/20 text-amber-500' : 
                'bg-emerald-500/20 text-emerald-500'
              }`}>
                <Shield className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Macro Direction</span>
                  <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${
                    macro.actionLevel === 'HALT' ? 'bg-rose-500' :
                    macro.actionLevel === 'REDUCED' ? 'bg-amber-500' : 'bg-emerald-500'
                  }`} />
                </div>
                <span className="text-xl font-black tracking-tightest text-white uppercase drop-shadow-sm">
                  Market Trend: {macro.actionLevel}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-6 rounded-xl bg-slate-950/40 px-5 py-3 border border-slate-800/40">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tighter">Distribution</span>
                <span className="font-mono text-base font-black text-rose-400">{macro.distributionDayCount}일</span>
              </div>
              <div className="h-8 w-px bg-slate-800/60" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tighter">Follow Thru</span>
                <span className={`font-mono text-base font-black ${macro.followThroughDay ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {macro.followThroughDay ? 'SET' : 'WAIT'}
                </span>
              </div>
            </div>
          </div>
          
          {macro.actionLevel === 'HALT' && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-rose-300">
              <AlertTriangle className="h-4 w-4 shrink-0 transition-transform group-hover:scale-110" />
              <p className="text-xs font-bold tracking-tight">오닐 스캐너 신규 진입 보류 — 하락 추세 또는 분배일 과다 상태</p>
            </div>
          )}
        </motion.div>
      )}



      {/* 진행 상태 바 */}
      {isScanning && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/80 p-5 shadow-2xl shadow-rose-500/5 backdrop-blur-md"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <LoadingSpinner size="sm" />
              <div className="flex flex-col">
                <span className="text-xs font-black text-rose-400 uppercase tracking-widest animate-pulse">Scanning Engine</span>
                <span className="text-sm font-bold text-white tracking-tight">{scanStage}</span>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="font-mono text-xl font-black text-white tracking-tighter">
                {progress.current} <span className="text-slate-600 text-sm">/ {progress.total}</span>
              </span>
              <span className="text-[10px] font-bold text-slate-500 uppercase">Analysis Load</span>
            </div>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-800/50 p-0.5 ring-1 ring-slate-700/50 shadow-inner">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-rose-600 via-amber-500 to-rose-400"
              initial={{ width: 0 }}
              animate={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
              transition={{ ease: 'easeOut', duration: 0.5 }}
            />
          </div>
        </motion.div>
      )}

      {/* 통계 바 */}
      {stats.total > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: '분석 종목', value: stats.total, color: 'text-white', icon: <Search className="h-3 w-3" /> },
            { label: 'PASS 유력', value: stats.pass, color: 'text-emerald-400', icon: <CheckCircle2 className="h-3 w-3" /> },
            { label: 'TIER 1 선정', value: stats.tier1, color: 'text-rose-400', icon: <Activity className="h-3 w-3" /> },
            { label: '공략 대기', value: stats.watchlist, color: 'text-amber-400', icon: <LayoutDashboard className="h-3 w-3" /> },
            { label: '데이터 부족', value: stats.errors, color: 'text-slate-500', icon: <AlertTriangle className="h-3 w-3" /> },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col gap-1 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
              <div className="flex items-center gap-1.5 opacity-60">
                {stat.icon}
                <span className="text-[10px] font-bold uppercase tracking-tight text-slate-400">{stat.label}</span>
              </div>
              <span className={`font-mono text-2xl font-black tracking-tightest ${stat.color}`}>
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      )}
      </section>

      {/* 필터 및 정렬 컨트롤 */}
      {results.length > 0 && (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center p-1 border-b border-slate-800/50 pb-5">
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilterKey(f.key)}
                className={`rounded-xl border px-3.5 py-1.5 text-[11px] font-black tracking-tighter transition-all hover:scale-105 active:scale-95 ${
                  filterKey === f.key
                    ? 'border-rose-500/50 bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                    : 'border-slate-800 bg-slate-900/60 text-slate-500 hover:border-slate-600 hover:text-slate-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          
          <div className="lg:ml-auto flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-slate-900/80 border border-slate-800 p-1 flex items-center gap-1">
                <BarChart3 className="h-3 w-3 text-slate-600 ml-2" />
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="bg-transparent text-[11px] font-black tracking-tighter text-slate-300 outline-none pr-3 cursor-pointer py-1"
                >
                  {SORTS.map((s) => (
                    <option key={s.key} value={s.key} className="bg-slate-900">{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {lastScannedAt && (
              <div className="flex items-center gap-2 font-mono text-[9px] font-bold text-slate-600 uppercase">
                <span className="h-1 w-1 rounded-full bg-emerald-500" />
                SCAN SYNC: {new Date(lastScannedAt).toLocaleTimeString('ko-KR')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 결과 영역 (조건부 렌더링) */}
      {filteredResults.length > 0 ? (
        <div className="min-h-[400px]">
          {viewMode === 'web' ? renderTable() : renderCards()}
        </div>
      ) : results.length > 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Search className="h-10 w-10 text-slate-800 mb-4" />
          <p className="text-sm font-bold text-slate-500">조건에 맞는 검색 결과가 없습니다.</p>
          <button 
            onClick={() => setFilterKey('all')}
            className="mt-2 text-xs font-bold text-rose-500 underline underline-offset-4"
          >
            필터 초기화
          </button>
        </div>
      )}

      {/* 초기 빈 상태 */}
      {results.length === 0 && !isScanning && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-800/50 py-32 text-center bg-slate-900/10"
        >
          <div className="relative mb-6">
            <ScanSearch className="h-16 w-16 text-slate-700" />
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
              className="absolute -inset-2 rounded-full border border-slate-800 border-t-rose-500/50 opacity-20"
            />
          </div>
          <p className="text-base font-black text-slate-400 tracking-tightest px-6">
            유니버스를 선택하고 <strong className="text-rose-500 drop-shadow-[0_0_10px_rgba(244,63,94,0.3)]">오닐 엔진</strong>을 가동하세요.
          </p>
          <p className="mt-2 text-[10px] font-black text-slate-600 uppercase tracking-widest max-w-sm px-8 leading-relaxed">
            윌리엄 오닐의 7 Pillar(M·C·A·N·S·L·I) 분석 프레임워크를 통해 실물 경제와 주가 모멘텀이 결합된 슈퍼 주도주를 탐색합니다.
          </p>
        </motion.div>
      )}

      {/* 하단 플로팅 툴바 (콘테스트 선정용) */}
      {selectedTickers.size > 0 && (
        <motion.div 
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-10 left-1/2 z-50 flex -translate-x-1/2 items-center gap-8 rounded-2xl border border-rose-500/30 bg-slate-950/90 px-8 py-5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] shadow-rose-500/10 backdrop-blur-2xl ring-1 ring-white/10"
        >
          <div className="flex flex-col border-r border-slate-800 pr-8">
            <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Contest Pool</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-white tracking-tight">{selectedTickers.size}</span>
              <span className="text-xs font-bold text-slate-600">/ 10 종목</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => clearSelection()}
              className="px-2 py-1 text-[11px] font-black text-slate-500 transition-colors hover:text-rose-400 uppercase tracking-tighter"
            >
              전체 해제
            </button>
            <Link href="/contest">
              <button className="group relative flex items-center gap-2 rounded-xl bg-gradient-to-br from-rose-600 to-rose-700 px-6 py-2.5 font-black text-white shadow-lg transition-all hover:from-rose-500 hover:to-rose-600 active:scale-95">
                <CheckCircle2 className="h-4 w-4" />
                선정 완료 (콘테스트 이동)
                <motion.div 
                  className="absolute inset-0 rounded-xl ring-2 ring-rose-500 opacity-0 group-hover:opacity-40"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                />
              </button>
            </Link>
          </div>
        </motion.div>
      )}

      {/* 드릴다운 모달 */}
      {selectedResult && (
        <CanslimDrilldownModal result={selectedResult} onClose={() => setSelectedResult(null)} />
      )}
    </div>
  );
}
