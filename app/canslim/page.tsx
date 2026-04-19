'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Play,
  ScanSearch,
  Shield,
  Square,
  XCircle,
  Info,
  BarChart3,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import MarketBanner from '@/components/ui/MarketBanner';
import CanslimDrilldownModal from '@/components/scanner/CanslimDrilldownModal';
import { dualTierLabel } from '@/lib/finance/canslim-engine';
import type {
  CanslimMacroMarketData,
  CanslimScannerResult,
  DualScreenerTier,
  ScannerConstituent,
  ScannerUniverse,
  ScannerUniverseResponse,
} from '@/types';

// === 상수 ===

const SCAN_CONCURRENCY = 3;
const KR_SCAN_CONCURRENCY = 2;
const STORAGE_PREFIX = 'mtn:canslim-snapshot:v1:';

type FilterKey = 'all' | 'pass' | 'fail' | 'tier1' | 'watchlist' | 'short_term' | 'high_confidence' | 'warnings';
type SortKey = 'default' | 'confidence' | 'dualTier' | 'rs' | 'pillar';

const UNIVERSES: Record<ScannerUniverse, { label: string; desc: string }> = {
  NASDAQ100: { label: 'NASDAQ 100', desc: 'Nasdaq 100 대형 성장주에서 CAN SLIM 주도주를 탐색합니다.' },
  SP500: { label: 'S&P 500', desc: 'S&P 500에서 펀더멘털과 기술적 분석을 결합한 주도주를 찾습니다.' },
  KOSPI100: { label: 'KOSPI 상위 100', desc: 'KOSPI 시가총액 상위 100개 종목 CAN SLIM 스캔.' },
  KOSDAQ100: { label: 'KOSDAQ 상위 100', desc: 'KOSDAQ 시가총액 상위 100개 종목 CAN SLIM 스캔.' },
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
  { key: 'default', label: '기본순' },
  { key: 'dualTier', label: '이중검증 티어' },
  { key: 'confidence', label: '신뢰도순' },
  { key: 'rs', label: 'RS순' },
  { key: 'pillar', label: '통과 Pillar 많은 순' },
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

function pillarPassCount(result: CanslimScannerResult) {
  return result.canslimResult.pillarDetails.filter((d) => d.status === 'PASS').length;
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
  const [sortKey, setSortKey] = useState<SortKey>('dualTier');
  const [selectedResult, setSelectedResult] = useState<CanslimScannerResult | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // 초기 복원
  useEffect(() => {
    const snapshot = readSnapshot(universe);
    if (snapshot) {
      setResults(snapshot.results);
      setMacro(snapshot.macro);
      setLastScannedAt(snapshot.savedAt);
    }
  }, []);

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
      // 1. 유니버스 가져오기
      const resp = await fetch(`/api/scanner/universe?universe=${universe}`, { signal: abort.signal });
      if (!resp.ok) throw new Error(`유니버스 로딩 실패 (${resp.status})`);
      const meta = await resp.json() as ScannerUniverseResponse;

      const items = meta.items;
      setProgress({ current: 0, total: items.length });
      setScanStage('CAN SLIM 평가 실행 중');

      // 초기 빈 결과
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

      // 2. 병렬 스캔
      const concurrency = universe.startsWith('KOS') ? KR_SCAN_CONCURRENCY : SCAN_CONCURRENCY;
      const queue = [...items];
      let completed = 0;

      const workers = Array(concurrency).fill(null).map(async () => {
        while (queue.length > 0 && !abort.signal.aborted) {
          const item = queue.shift();
          if (!item) break;

          // 진행 중 상태 업데이트
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

            // 매크로 데이터는 첫 번째 응답에서 캐시
            if (!macro) setMacro(payload.macro);

            current = current.map((r) =>
              r.ticker === item.ticker ? { ...payload.result, name: item.name, marketCap: item.marketCap } : r
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

      if (!abort.signal.aborted) {
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
      if (sortKey === 'dualTier') return tierSortValue(a.dualTier) - tierSortValue(b.dualTier) || (b.rsRating ?? 0) - (a.rsRating ?? 0);
      if (sortKey === 'confidence') return confidenceSortValue(a.canslimResult.confidence) - confidenceSortValue(b.canslimResult.confidence);
      if (sortKey === 'rs') return (b.rsRating ?? 0) - (a.rsRating ?? 0);
      if (sortKey === 'pillar') return pillarPassCount(b) - pillarPassCount(a);
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

  // === 렌더링 ===
  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ScanSearch className="h-7 w-7 text-rose-500" />
            CAN SLIM 스캐너
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            윌리엄 오닐의 7 Pillar 필터로 진짜 주도주를 발굴합니다. VCP 스캐너와 이중 검증.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isScanning ? (
            <Button onClick={stopScan} variant="danger" size="sm" className="flex items-center gap-2">
              <Square className="h-4 w-4" /> 중단
            </Button>
          ) : (
            <Button onClick={startScan} variant="primary" size="sm" className="flex items-center gap-2">
              <Play className="h-4 w-4" /> CAN SLIM 스캔
            </Button>
          )}
        </div>
      </div>

      {/* 매크로 배너 */}
      {macro && (
        <div className={`rounded-xl border p-4 ${
          macro.actionLevel === 'HALT' ? 'border-rose-500/30 bg-rose-500/5' :
          macro.actionLevel === 'REDUCED' ? 'border-amber-500/30 bg-amber-500/5' :
          'border-emerald-500/30 bg-emerald-500/5'
        }`}>
          <div className="flex items-center gap-3 text-sm">
            <Shield className={`h-5 w-5 ${
              macro.actionLevel === 'HALT' ? 'text-rose-400' :
              macro.actionLevel === 'REDUCED' ? 'text-amber-400' : 'text-emerald-400'
            }`} />
            <span className="font-medium text-white">
              M: 시장 방향성 — {macro.actionLevel}
            </span>
            <span className="text-slate-400">
              분배일: {macro.distributionDayCount}일 | FTD: {macro.followThroughDay ? '확인됨' : '미확인'}
            </span>
          </div>
          {macro.actionLevel === 'HALT' && (
            <p className="mt-2 text-xs text-rose-300">⚠️ CAN SLIM 신규 발굴 전면 정지 — 분배일 과다 또는 하락 추세</p>
          )}
        </div>
      )}

      {/* 유니버스 선택 */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(UNIVERSES) as ScannerUniverse[]).map((u) => (
          <button
            key={u}
            type="button"
            disabled={isScanning}
            onClick={() => handleUniverseChange(u)}
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              universe === u
                ? 'border-rose-500/50 bg-rose-500/15 text-rose-200'
                : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {UNIVERSES[u].label}
          </button>
        ))}
      </div>

      {/* 진행 상태 */}
      {isScanning && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-slate-700 bg-slate-800/50 p-4"
        >
          <div className="flex items-center gap-3">
            <LoadingSpinner size="sm" />
            <span className="text-sm text-white">{scanStage}</span>
            <span className="ml-auto font-mono text-sm text-slate-400">
              {progress.current}/{progress.total}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-700">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
              transition={{ ease: 'easeOut' }}
            />
          </div>
        </motion.div>
      )}

      {/* 통계 카드 */}
      {stats.total > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: '분석 완료', value: stats.total, color: 'text-white' },
            { label: 'PASS', value: stats.pass, color: 'text-emerald-400' },
            { label: 'TIER 1', value: stats.tier1, color: 'text-rose-400' },
            { label: '워치리스트', value: stats.watchlist, color: 'text-amber-400' },
            { label: '오류', value: stats.errors, color: 'text-slate-500' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3 text-center">
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-slate-500">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* 필터 + 정렬 */}
      {results.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilterKey(f.key)}
              className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                filterKey === f.key
                  ? 'border-rose-500/50 bg-rose-500/15 text-rose-200'
                  : 'border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="mx-2 text-slate-600">|</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300 outline-none focus:border-slate-500"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          {lastScannedAt && (
            <span className="ml-auto text-xs text-slate-600">
              마지막 스캔: {new Date(lastScannedAt).toLocaleString('ko-KR')}
            </span>
          )}
        </div>
      )}

      {/* 결과 테이블 */}
      {filteredResults.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full table-fixed divide-y divide-slate-800 text-xs">
            <colgroup>
              <col className="w-[5%]" />
              <col className="w-[15%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead className="bg-slate-950 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-3 text-left">#</th>
                <th className="px-2 py-3 text-left">종목</th>
                <th className="px-2 py-3 text-right">현재가</th>
                <th className="px-2 py-3 text-left">이중 검증</th>
                <th className="px-2 py-3 text-left">CAN SLIM</th>
                <th className="px-2 py-3 text-left">신뢰도</th>
                <th className="px-2 py-3 text-left">VCP</th>
                <th className="px-2 py-3 text-right">RS</th>
                <th className="px-2 py-3 text-left">패턴</th>
                <th className="px-2 py-3 text-right">손절가</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredResults.map((r, idx) => (
                <tr
                  key={r.ticker}
                  className="cursor-pointer transition-colors hover:bg-slate-800/50"
                  onClick={() => r.status === 'done' && setSelectedResult(r)}
                >
                  <td className="px-2 py-3 text-slate-500">{idx + 1}</td>
                  <td className="px-2 py-3">
                    <div className="font-medium text-white truncate">{r.ticker}</div>
                    <div className="text-[10px] text-slate-500 truncate">{r.name}</div>
                  </td>
                  <td className="px-2 py-3 text-right font-mono text-slate-300">
                    {r.status === 'running' ? <LoadingSpinner size="sm" /> : formatPrice(r.currentPrice, r.currency)}
                  </td>
                  <td className="px-2 py-3">
                    {r.status === 'done' && (
                      <span className={`inline-flex rounded-lg border px-2 py-0.5 text-[10px] font-bold ${tierBadgeClass(r.dualTier)}`}>
                        {dualTierLabel(r.dualTier).emoji} {dualTierLabel(r.dualTier).label}
                      </span>
                    )}
                    {r.status === 'error' && (
                      <span className="text-rose-400 text-[10px]">에러</span>
                    )}
                    {(r.status === 'queued' || r.status === 'running') && (
                      <span className="text-slate-600 text-[10px]">대기 중</span>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    {r.status === 'done' && (
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${r.canslimResult.pass ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {r.canslimResult.pass ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {r.canslimResult.pass ? 'PASS' : r.canslimResult.failedPillar ?? 'FAIL'}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    {r.status === 'done' && (
                      <span className={`text-xs font-medium ${
                        r.canslimResult.confidence === 'HIGH' ? 'text-emerald-400' :
                        r.canslimResult.confidence === 'MEDIUM' ? 'text-amber-400' : 'text-rose-400'
                      }`}>
                        {r.canslimResult.confidence}
                        {r.canslimResult.warnings.length > 0 && (
                          <AlertTriangle className="ml-1 inline h-3 w-3 text-amber-500" />
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    {r.vcpGrade && (
                      <span className={`text-xs ${
                        r.vcpGrade === 'strong' ? 'text-emerald-400' :
                        r.vcpGrade === 'forming' ? 'text-amber-400' :
                        'text-slate-500'
                      }`}>
                        {r.vcpGrade}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-3 text-right font-mono">
                    {r.rsRating !== null ? (
                      <span className={r.rsRating >= 90 ? 'text-emerald-400 font-bold' : r.rsRating >= 80 ? 'text-slate-200' : 'text-slate-500'}>
                        {r.rsRating}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-2 py-3 text-[10px]">
                    {r.basePattern ? (
                      <span className="text-indigo-300">{r.basePattern.type.replace(/_/g, ' ')}</span>
                    ) : '-'}
                  </td>
                  <td className="px-2 py-3 text-right font-mono text-rose-300/70">
                    {r.canslimResult.stopLossPrice !== null ? formatPrice(r.canslimResult.stopLossPrice, r.currency) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 빈 상태 */}
      {results.length === 0 && !isScanning && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 py-20 text-center">
          <ScanSearch className="h-12 w-12 text-slate-600" />
          <p className="mt-4 text-sm text-slate-400">
            유니버스를 선택하고 <strong>CAN SLIM 스캔</strong>을 시작하세요.
          </p>
          <p className="mt-1 text-xs text-slate-600">
            윌리엄 오닐의 7 Pillar(M·C·A·N·S·L·I) 필터로 주도주를 발굴합니다.
          </p>
        </div>
      )}

      {/* 드릴다운 모달 */}
      {selectedResult && (
        <CanslimDrilldownModal result={selectedResult} onClose={() => setSelectedResult(null)} />
      )}
    </div>
  );
}
