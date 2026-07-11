'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Play,
  Square,
  Activity,
  Flame,
  AlertTriangle,
  History,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import AsyncStatePanel from '@/components/ui/AsyncStatePanel';
import TableSkeleton from '@/components/ui/TableSkeleton';
import type { DataSourceMeta, ScannerUniverse } from '@/types';
import type { SurgeGrade, SurgeMetrics } from '@/lib/finance/engines/surge-score';
import type { DailyScannerSnapshot, DailyScannerSnapshotCandidate } from '@/lib/scanner/daily-snapshot';
import type { MomentumDrilldownResult } from '@/components/scanner/MomentumDrilldownModal';

const MomentumDrilldownModal = dynamic(() => import('@/components/scanner/MomentumDrilldownModal'), { ssr: false });

type FilterKey = 'all' | 'explosive' | 'breakout' | 'warm';
type SortKey = 'rvol' | 'roc';
type ViewType = 'card' | 'table';

interface SurgeResult {
  ticker: string;
  exchange: string;
  metrics: SurgeMetrics;
  currentPrice: number | null;
}

interface UniverseItem {
  ticker: string;
  exchange?: string;
}

interface MomentumApiResult {
  ticker: string;
  success: boolean;
  data?: SurgeMetrics & { currentPrice?: number | null };
  error?: string;
}

interface MomentumScanError {
  ticker: string;
  exchange: string;
  error: string;
}

type ResultOrigin = {
  kind: 'snapshot' | 'live';
  label: string;
  asOf: string;
  warning?: string | null;
};

const UNIVERSES: Record<ScannerUniverse, { label: string; desc: string }> = {
  NASDAQ100: { label: 'NASDAQ 100', desc: 'Nasdaq 100 대형 기술주 대상 급등/거래량 폭발 포착.' },
  SP500: { label: 'S&P 500', desc: 'S&P 500 기관 수급 쏠림 및 돌파 종목 포착.' },
  KOSPI200: { label: 'KOSPI 상위 200', desc: '코스피 대장주 유동성 쏠림 및 급등 포착.' },
  KOSDAQ150: { label: 'KOSDAQ 상위 150', desc: '코스닥 테마주, 중소형 기술주의 폭발적인 모멘텀 스캔.' },
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'explosive', label: '🌋 Explosive (RVOL 3.0+ & 5%+)' },
  { key: 'breakout', label: '🔥 Breakout (RVOL 2.0+ & 3%+)' },
  { key: 'warm', label: '♨️ Warm (RVOL 1.5+)' },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'rvol', label: '거래량 폭발순 (RVOL)' },
  { key: 'roc', label: '당일 등락률순 (ROC)' },
];

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function surgeGrade(value: unknown): SurgeGrade {
  return value === 'EXPLOSIVE' || value === 'BREAKOUT' || value === 'WARM' ? value : 'NONE';
}

function snapshotToResult(candidate: DailyScannerSnapshotCandidate): SurgeResult {
  const raw = candidate.raw;
  const metrics = candidate.metrics;
  const currentVolume = numberValue(raw.currentVolume);
  return {
    ticker: candidate.ticker,
    exchange: candidate.exchange,
    currentPrice: candidate.price,
    metrics: {
      grade: surgeGrade(metrics.grade ?? candidate.grade),
      rvol: numberValue(metrics.rvol),
      rawRvol: numberValue(raw.rawRvol ?? metrics.raw_rvol ?? metrics.rvol),
      roc: numberValue(metrics.roc),
      avgVolume20d: numberValue(raw.avgVolume20d),
      currentVolume,
      estimatedVolume: numberValue(raw.estimatedVolume ?? metrics.estimated_volume, currentVolume),
      isIntraday: Boolean(raw.isIntraday ?? metrics.is_intraday),
    },
  };
}

function gradeLabel(grade: SurgeGrade) {
  if (grade === 'EXPLOSIVE') return { emoji: '🌋', label: 'Explosive', styles: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20', fill: 'bg-rose-500', groupHover: 'hover:border-rose-500/50' } };
  if (grade === 'BREAKOUT') return { emoji: '🔥', label: 'Breakout', styles: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20', fill: 'bg-orange-500', groupHover: 'hover:border-orange-500/50' } };
  if (grade === 'WARM') return { emoji: '♨️', label: 'Warm', styles: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', fill: 'bg-amber-500', groupHover: 'hover:border-amber-500/50' } };
  return { emoji: '📉', label: 'None', styles: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/20', fill: 'bg-slate-500', groupHover: 'hover:border-slate-500/50' } };
}

export default function MomentumScannerPage() {
  const [universe, setUniverse] = useState<ScannerUniverse>('NASDAQ100');
  const [isScanning, setIsScanning] = useState(false);
  const [scanStage, setScanStage] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  
  const [results, setResults] = useState<SurgeResult[]>([]);
  const [scanErrors, setScanErrors] = useState<MomentumScanError[]>([]);
  const [scanFatalError, setScanFatalError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('rvol');
  const [viewType, setViewType] = useState<ViewType>('card');
  const [selectedResult, setSelectedResult] = useState<SurgeResult | null>(null);
  const [resultOrigin, setResultOrigin] = useState<ResultOrigin | null>(null);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(true);
  
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoadingSnapshot(true);

    fetch(`/api/scanner/snapshots?source=momentum&universe=${universe}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { data?: DailyScannerSnapshot; meta?: DataSourceMeta; message?: string };
        if (!response.ok) throw new Error(payload.message || `캐시 로딩 실패 (${response.status})`);
        const snapshot = payload.data;
        if (!snapshot?.candidates.length || !snapshot.run) return;
        setResults(snapshot.candidates.map(snapshotToResult));
        setResultOrigin({
          kind: 'snapshot',
          label: `${snapshot.run.runDate} 일일 스냅샷`,
          asOf: payload.meta?.asOf || snapshot.run.updatedAt,
          warning: snapshot.run.warning,
        });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setResultOrigin(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingSnapshot(false);
      });

    return () => controller.abort();
  }, [universe]);

  const startScan = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setProgress({ current: 0, total: 0 });
    setScanStage('유니버스 로딩 중');
    setScanErrors([]);
    setScanFatalError(null);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const resp = await fetch(`/api/scanner/universe?universe=${universe}`, { signal: abort.signal });
      if (!resp.ok) throw new Error(`유니버스 로딩 실패 (${resp.status})`);
      const { items } = await resp.json() as { items: UniverseItem[] };

      setScanStage('모멘텀 엔진 가동 중');
      setProgress({ current: 0, total: items.length });

      const batchSize = 20;
      let allResults: SurgeResult[] = [];
      let allErrors: MomentumScanError[] = [];

      for (let i = 0; i < items.length; i += batchSize) {
        if (abort.signal.aborted) break;
        const batch = items.slice(i, i + batchSize);
        
        const payload = batch.map((item) => ({
          ticker: item.ticker,
          exchange: item.exchange || (universe.includes('KOS') ? (universe.includes('KOSPI') ? 'KOSPI' : 'KOSDAQ') : 'US'),
        }));

        const scanResp = await fetch('/api/scanner/momentum', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: payload }),
          signal: abort.signal,
        });

        if (scanResp.ok) {
          const json = await scanResp.json() as { results?: MomentumApiResult[] };
          if (json.results) {
             const successBatch = json.results
                .filter((r): r is MomentumApiResult & { data: SurgeMetrics & { currentPrice?: number | null } } => r.success && Boolean(r.data))
                .map((r) => ({
                    ticker: r.ticker,
                    exchange: payload.find((p) => p.ticker === r.ticker)?.exchange || 'US',
                    metrics: {
                       rvol: r.data.rvol,
                       rawRvol: r.data.rawRvol,
                       roc: r.data.roc,
                       avgVolume20d: r.data.avgVolume20d,
                       currentVolume: r.data.currentVolume,
                       estimatedVolume: r.data.estimatedVolume,
                       grade: r.data.grade,
                       isIntraday: r.data.isIntraday,
                    },
                    currentPrice: r.data.currentPrice ?? null,
                }));
             allResults = [...allResults, ...successBatch];

             const failedBatch = json.results
                .filter((r) => !r.success)
                .map((r) => ({
                  ticker: r.ticker,
                  exchange: payload.find((p) => p.ticker === r.ticker)?.exchange || 'US',
                  error: r.error || '분석 실패',
                }));
             allErrors = [...allErrors, ...failedBatch];
             setScanErrors(allErrors);
          }
        } else {
          const body = await scanResp.json().catch(() => ({})) as { message?: string };
          const error = body.message || `배치 요청 실패 (${scanResp.status})`;
          const failedBatch = payload.map((item) => ({
            ticker: item.ticker,
            exchange: item.exchange,
            error,
          }));
          allErrors = [...allErrors, ...failedBatch];
          setScanErrors(allErrors);
        }
        setProgress((prev) => ({ ...prev, current: Math.min(i + batchSize, items.length) }));
      }

      setResults(allResults);
      setResultOrigin({ kind: 'live', label: '실시간 재스캔', asOf: new Date().toISOString() });
      setScanStage(allErrors.length > 0 ? `완료 · 실패 ${allErrors.length}건` : '완료');
    } catch (err: unknown) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setScanFatalError(err instanceof Error ? err.message : '알 수 없는 오류');
      }
    } finally {
      setIsScanning(false);
      abortRef.current = null;
    }
  };

  const stopScan = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsScanning(false);
    setScanStage('중단됨');
  };

  const recalculateResult = async (target: MomentumDrilldownResult) => {
    try {
      const response = await fetch('/api/scanner/momentum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ ticker: target.ticker, exchange: target.exchange }] }),
      });
      const payload = await response.json() as { results?: MomentumApiResult[]; message?: string };
      const row = payload.results?.[0];
      if (!response.ok || !row?.success || !row.data) {
        throw new Error(row?.error || payload.message || '단일 종목 재계산에 실패했습니다.');
      }
      const updated: SurgeResult = {
        ticker: row.ticker,
        exchange: target.exchange,
        currentPrice: row.data.currentPrice ?? null,
        metrics: {
          rvol: row.data.rvol,
          rawRvol: row.data.rawRvol,
          roc: row.data.roc,
          avgVolume20d: row.data.avgVolume20d,
          currentVolume: row.data.currentVolume,
          estimatedVolume: row.data.estimatedVolume,
          grade: row.data.grade,
          isIntraday: row.data.isIntraday,
        },
      };
      setResults((current) => current.map((item) => item.ticker === updated.ticker ? updated : item));
      setSelectedResult(updated);
      setResultOrigin({ kind: 'live', label: `${updated.ticker} 단일 재계산`, asOf: new Date().toISOString() });
    } catch (error) {
      setScanFatalError(error instanceof Error ? error.message : '단일 종목 재계산에 실패했습니다.');
    }
  };

  const filteredAndSorted = useMemo(() => {
    let filtered = results;
    if (filter === 'explosive') filtered = results.filter((r) => r.metrics.grade === 'EXPLOSIVE');
    if (filter === 'breakout') filtered = results.filter((r) => r.metrics.grade === 'BREAKOUT' || r.metrics.grade === 'EXPLOSIVE');
    if (filter === 'warm') filtered = results.filter((r) => r.metrics.grade !== 'NONE');

    return filtered.sort((a, b) => {
      if (sort === 'rvol') return b.metrics.rvol - a.metrics.rvol;
      if (sort === 'roc') return b.metrics.roc - a.metrics.roc;
      return 0;
    });
  }, [results, filter, sort]);

  const hasIntraday = results.some(r => r.metrics.isIntraday);

  return (
    <div className="space-y-6">
      {(isLoadingSnapshot || resultOrigin) && (
        <section
          data-testid="momentum-data-origin"
          className="flex flex-col gap-2 rounded-xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-sky-300" />
            <span>{isLoadingSnapshot ? '최신 일일 스냅샷 확인 중' : `${resultOrigin?.label} · ${resultOrigin ? new Date(resultOrigin.asOf).toLocaleString('ko-KR') : ''}`}</span>
          </div>
          {resultOrigin?.kind === 'snapshot' && <span className="text-xs text-sky-200/70">전체 재스캔 없이 즉시 표시</span>}
          {resultOrigin?.warning && <span className="text-xs text-amber-200">후속 Top5 분석 경고 · 후보 데이터는 정상</span>}
        </section>
      )}
      {hasIntraday && (
        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 flex items-center gap-3 text-sm text-indigo-300">
          <Activity className="w-5 h-5 flex-shrink-0" />
          <p>
            <strong className="text-indigo-200">장 운영 중입니다.</strong>{' '}
            거래량 폭발 지표(RVOL)는 현재 시각까지의 거래량을 기반으로 추정된 하루 예상 거래량을 기준으로 산출되었습니다.
          </p>
        </div>
      )}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <Flame className="w-8 h-8 text-rose-500" /> Momentum Scanner
          </h1>
          <p className="text-slate-400 mt-1">상대 거래량(RVOL)과 등락률(ROC) 기반의 모멘텀 돌파/급등 포착 스캐너</p>
        </div>
      </header>

      {scanFatalError && (
        <AsyncStatePanel
          state="error"
          title="스캔 실패"
          message={scanFatalError}
          onRetry={startScan}
        />
      )}

      {isScanning && filteredAndSorted.length === 0 && !scanFatalError && (
        <div className="overflow-visible rounded-xl border border-slate-800 bg-slate-950/40 shadow-xl mt-6">
          <TableSkeleton cols={6} rows={5} />
        </div>
      )}

      {/* Universe Selection */}
      <section className="p-4 sm:p-5 rounded-2xl bg-slate-900 border border-slate-800">
        <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-400" />
          Target Universe
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(Object.keys(UNIVERSES) as ScannerUniverse[]).map((uKey) => {
            const active = universe === uKey;
            return (
              <button
                key={uKey}
                onClick={() => { if (!isScanning) setUniverse(uKey); }}
                className={`text-left p-4 rounded-xl transition-all border ${
                  active
                    ? 'bg-indigo-600/20 border-indigo-500 ring-1 ring-indigo-500/50'
                    : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'
                }`}
              >
                <div className="font-bold text-slate-100">{UNIVERSES[uKey].label}</div>
                <div className="text-xs text-slate-400 mt-1.5 leading-relaxed">{UNIVERSES[uKey].desc}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Controls */}
      <section className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="flex flex-col w-full md:w-auto">
          {isScanning ? (
            <div className="flex items-center gap-4">
              <Button onClick={stopScan} variant="danger" icon={<Square className="w-4 h-4" />}>
                스캔 중지
              </Button>
              <div className="flex flex-col gap-1 w-full md:w-64">
                <div className="flex justify-between text-xs font-medium text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <LoadingSpinner size="sm" />
                    {scanStage}
                  </span>
                  <span>{progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-rose-500 to-indigo-500 transition-all duration-300"
                    style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <Button onClick={startScan} variant="primary" icon={<Play className="w-4 h-4" />}>
              스캔 시작
            </Button>
          )}
        </div>
      </section>

      {scanErrors.length > 0 && (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-300" />
              <div>
                <h2 className="text-sm font-semibold text-amber-100">데이터 로딩 실패 {scanErrors.length}건</h2>
                <p className="mt-1 text-sm text-amber-100/70">
                  성공한 종목은 계속 표시하고, 실패 종목은 아래 원인만 별도로 남깁니다.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setScanErrors([])}
              className="self-start rounded-lg border border-amber-400/30 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-400/10"
            >
              닫기
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {scanErrors.slice(0, 9).map((item) => (
              <div key={`${item.exchange}:${item.ticker}`} className="rounded-lg border border-amber-400/20 bg-slate-950/50 px-3 py-2">
                <div className="text-xs font-semibold text-amber-100">{item.ticker} · {item.exchange}</div>
                <div className="mt-1 truncate text-xs text-amber-100/65" title={item.error}>{item.error}</div>
              </div>
            ))}
          </div>
          {scanErrors.length > 9 && (
            <p className="mt-2 text-xs text-amber-100/60">외 {scanErrors.length - 9}건은 로그에 누적되어 있습니다.</p>
          )}
        </section>
      )}

      {/* Filters & Sorts */}
      {results.length > 0 && (
        <section className="flex flex-col md:flex-row flex-wrap gap-4 p-4 rounded-2xl bg-slate-900 border border-slate-800 items-start md:items-center justify-between">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  filter === f.key
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'bg-slate-950 text-slate-400 border border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-950 text-slate-300 border border-slate-700 outline-none focus:ring-1 focus:ring-rose-500 flex-grow md:flex-grow-0"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
            <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5">
              <button
                onClick={() => setViewType('card')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  viewType === 'card' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                카드
              </button>
              <button
                onClick={() => setViewType('table')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  viewType === 'table' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                테이블
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Results */}
      {results.length > 0 && (
        <>
          {filteredAndSorted.length === 0 && !isScanning ? (
            <div className="py-16 text-center text-slate-500 bg-slate-900 rounded-2xl border border-slate-800">
              해당 필터에 일치하는 모멘텀 급등 종목이 없습니다.
            </div>
          ) : (
            viewType === 'card' ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredAndSorted.map((item, idx) => {
                  const gl = gradeLabel(item.metrics.grade);
                  return (
                    <motion.div
                      key={item.ticker}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className={`relative p-5 rounded-2xl border bg-slate-900 overflow-hidden group transition-colors border-slate-800 ${gl.styles.groupHover}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedResult(item)}
                      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedResult(item); }}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            {item.ticker}
                          </h3>
                          <span className={`inline-flex mt-1 items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${gl.styles.bg} ${gl.styles.text} border ${gl.styles.border}`}>
                            {gl.emoji} {gl.label}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-slate-100">
                             {item.currentPrice?.toFixed(2) || 'N/A'}
                          </div>
                          <div className={`text-sm font-bold flex justify-end items-center gap-1 ${item.metrics.roc > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                             {item.metrics.roc > 0 ? '+' : ''}{item.metrics.roc}%
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 p-3 bg-slate-950/50 rounded-xl border border-slate-800/50">
                         <div>
                             <div className="text-xs font-medium text-slate-500 mb-1">RVOL (상대거래량)</div>
                             <div className="text-lg font-bold text-slate-200">
                               {item.metrics.isIntraday ? '~' : ''}{item.metrics.rvol.toFixed(1)}x
                             </div>
                         </div>
                         <div>
                             <div className="text-xs font-medium text-slate-500 mb-1">{item.metrics.isIntraday ? '추정 거래량' : '오늘 거래량'}</div>
                             <div className="text-lg font-bold text-slate-200">{((item.metrics.isIntraday ? item.metrics.estimatedVolume : item.metrics.currentVolume) / 1000000).toFixed(1)}M</div>
                         </div>
                         <div className="col-span-2 relative h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                             <div 
                               className={`absolute top-0 left-0 h-full rounded-full ${gl.styles.fill} transition-all`}
                               style={{ width: `${Math.min(item.metrics.rvol / 5 * 100, 100)}%` }} 
                             />
                         </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-950 border-b border-slate-800 text-xs uppercase text-slate-400">
                    <tr>
                      <th className="px-6 py-4 font-semibold">종목 (Ticker)</th>
                      <th className="px-6 py-4 font-semibold">등급 (Grade)</th>
                      <th className="px-6 py-4 font-semibold text-right">현재가 (Price)</th>
                      <th className="px-6 py-4 font-semibold text-right">등락률 (ROC)</th>
                      <th className="px-6 py-4 font-semibold text-right">RVOL</th>
                      <th className="px-6 py-4 font-semibold text-right">당일 거래량 (Vol)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredAndSorted.map((item) => {
                      const gl = gradeLabel(item.metrics.grade);
                      return (
                        <tr key={item.ticker} className="cursor-pointer hover:bg-slate-800/50 transition-colors" onClick={() => setSelectedResult(item)}>
                          <td className="px-6 py-4 font-bold text-white">{item.ticker}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${gl.styles.bg} ${gl.styles.text} border ${gl.styles.border}`}>
                              {gl.emoji} {gl.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right font-medium">
                            {item.currentPrice?.toFixed(2) || 'N/A'}
                          </td>
                          <td className={`px-6 py-4 text-right font-bold ${item.metrics.roc > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {item.metrics.roc > 0 ? '+' : ''}{item.metrics.roc}%
                          </td>
                          <td className="px-6 py-4 text-right font-bold text-slate-100">
                            {item.metrics.isIntraday ? '~' : ''}{item.metrics.rvol.toFixed(2)}x
                          </td>
                          <td className="px-6 py-4 text-right text-slate-400">
                            {((item.metrics.isIntraday ? item.metrics.estimatedVolume : item.metrics.currentVolume) / 1000000).toFixed(1)}M
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}
      {selectedResult && (
        <MomentumDrilldownModal
          result={selectedResult}
          onClose={() => setSelectedResult(null)}
          onRecalculate={recalculateResult}
        />
      )}
    </div>
  );
}
