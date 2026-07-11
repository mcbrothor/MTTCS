'use client';

import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Play,
  RefreshCw,
  Square,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import AsyncStatePanel from '@/components/ui/AsyncStatePanel';
import TableSkeleton from '@/components/ui/TableSkeleton';
import type { ScannerUniverse } from '@/types';
import type {
  ReversalAnalysis,
  ReversalGrade,
  ReversalStage,
} from '@/lib/finance/engines/trend-reversal-score';

type FilterKey = 'all' | 'confirmed' | 'trigger' | 'setup' | 'watch';
type SortKey = 'reversalScore' | 'pivot' | 'base' | 'rs' | 'risk';
type ViewType = 'card' | 'table';

interface UniverseItem {
  ticker: string;
  exchange?: string;
  name?: string;
}

interface ReversalResult {
  ticker: string;
  exchange: string;
  name: string | null;
  analysis: ReversalAnalysis;
}

interface ReversalApiResult {
  ticker: string;
  success: boolean;
  data?: ReversalAnalysis;
  error?: string;
}

interface ScanError {
  ticker: string;
  exchange: string;
  error: string;
}

const UNIVERSES: Record<ScannerUniverse, { label: string; desc: string; benchmark: string }> = {
  NASDAQ100: { label: 'NASDAQ 100', desc: '미국 대형 성장주 전환 초입 후보.', benchmark: 'QQQ' },
  SP500: { label: 'S&P 500', desc: '기관 유동성이 있는 대형주 전환 후보.', benchmark: 'SPY' },
  KOSPI200: { label: 'KOSPI 상위 200', desc: '국내 대형주 바닥 전환 감시 후보.', benchmark: '^KS200' },
  KOSDAQ150: { label: 'KOSDAQ 상위 150', desc: '국내 성장주 베이스 전환 후보.', benchmark: '^KQ150' },
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'confirmed', label: '확인' },
  { key: 'trigger', label: '돌파 임박' },
  { key: 'setup', label: '준비' },
  { key: 'watch', label: '관찰+' },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'reversalScore', label: '전환점수순' },
  { key: 'pivot', label: '피벗 근접순' },
  { key: 'base', label: '베이스 품질순' },
  { key: 'rs', label: 'RS 개선순' },
  { key: 'risk', label: '손절폭 낮은순' },
];

const gradeClass: Record<ReversalGrade, string> = {
  A: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200',
  B: 'border-indigo-400/40 bg-indigo-500/10 text-indigo-200',
  C: 'border-sky-400/40 bg-sky-500/10 text-sky-200',
  WATCH: 'border-amber-400/40 bg-amber-500/10 text-amber-200',
  REJECT: 'border-slate-700 bg-slate-900 text-slate-400',
};

const stageLabel: Record<ReversalStage, string> = {
  CONFIRMED: '확인된 전환',
  TRIGGER: '돌파 임박',
  SETUP: '준비',
  WATCH: '관찰',
  REJECT: '제외',
};

function formatNumber(value: number | null | undefined, digits = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return value.toFixed(digits);
}

function formatPrice(value: number | null | undefined, exchange: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  const isKr = exchange === 'KOSPI' || exchange === 'KOSDAQ';
  return value.toLocaleString(isKr ? 'ko-KR' : 'en-US', { maximumFractionDigits: isKr ? 0 : 2 });
}

function fallbackExchange(universe: ScannerUniverse) {
  if (universe === 'KOSPI200') return 'KOSPI';
  if (universe === 'KOSDAQ150') return 'KOSDAQ';
  return 'US';
}

export default function ReversalScannerPage() {
  const [universe, setUniverse] = useState<ScannerUniverse>('NASDAQ100');
  const [isScanning, setIsScanning] = useState(false);
  const [scanStage, setScanStage] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<ReversalResult[]>([]);
  const [scanErrors, setScanErrors] = useState<ScanError[]>([]);
  const [scanFatalError, setScanFatalError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('reversalScore');
  const [viewType, setViewType] = useState<ViewType>('card');
  const abortRef = useRef<AbortController | null>(null);

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

      setScanStage('전환 초입 분석 중');
      setProgress({ current: 0, total: items.length });

      const batchSize = 20;
      let allResults: ReversalResult[] = [];
      let allErrors: ScanError[] = [];

      for (let index = 0; index < items.length; index += batchSize) {
        if (abort.signal.aborted) break;
        const batch = items.slice(index, index + batchSize);
        const payload = batch.map((item) => ({
          ticker: item.ticker,
          exchange: item.exchange || fallbackExchange(universe),
          name: item.name ?? null,
        }));

        const scanResp = await fetch('/api/scanner/reversal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            benchmarkTicker: UNIVERSES[universe].benchmark,
            items: payload.map(({ ticker, exchange }) => ({ ticker, exchange })),
          }),
          signal: abort.signal,
        });

        if (scanResp.ok) {
          const json = await scanResp.json() as { results?: ReversalApiResult[] };
          if (json.results) {
            const successBatch = json.results
              .filter((row): row is ReversalApiResult & { data: ReversalAnalysis } => row.success && Boolean(row.data))
              .map((row) => {
                const source = payload.find((item) => item.ticker === row.ticker);
                return {
                  ticker: row.ticker,
                  exchange: source?.exchange || fallbackExchange(universe),
                  name: source?.name ?? null,
                  analysis: row.data,
                };
              });
            allResults = [...allResults, ...successBatch];

            const failedBatch = json.results
              .filter((row) => !row.success)
              .map((row) => {
                const source = payload.find((item) => item.ticker === row.ticker);
                return {
                  ticker: row.ticker,
                  exchange: source?.exchange || fallbackExchange(universe),
                  error: row.error || '분석 실패',
                };
              });
            allErrors = [...allErrors, ...failedBatch];
            setScanErrors(allErrors);
          }
        } else {
          const body = await scanResp.json().catch(() => ({})) as { message?: string };
          const error = body.message || `배치 요청 실패 (${scanResp.status})`;
          allErrors = [
            ...allErrors,
            ...payload.map((item) => ({ ticker: item.ticker, exchange: item.exchange, error })),
          ];
          setScanErrors(allErrors);
        }

        setProgress((prev) => ({ ...prev, current: Math.min(index + batchSize, items.length) }));
      }

      setResults(allResults);
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
    abortRef.current?.abort();
    abortRef.current = null;
    setIsScanning(false);
    setScanStage('중단됨');
  };

  const filteredAndSorted = useMemo(() => {
    let filtered = results;
    if (filter === 'confirmed') filtered = results.filter((item) => item.analysis.stage === 'CONFIRMED');
    if (filter === 'trigger') filtered = results.filter((item) => item.analysis.stage === 'TRIGGER');
    if (filter === 'setup') filtered = results.filter((item) => item.analysis.stage === 'SETUP');
    if (filter === 'watch') filtered = results.filter((item) => item.analysis.reversalScore >= 45);

    return [...filtered].sort((a, b) => {
      if (sort === 'pivot') return Math.abs(a.analysis.distanceToPivotPct ?? 999) - Math.abs(b.analysis.distanceToPivotPct ?? 999);
      if (sort === 'base') return b.analysis.breakdown.baseQuality - a.analysis.breakdown.baseQuality;
      if (sort === 'rs') return b.analysis.breakdown.relativeStrength - a.analysis.breakdown.relativeStrength;
      if (sort === 'risk') return (a.analysis.stopPct ?? 999) - (b.analysis.stopPct ?? 999);
      return b.analysis.reversalScore - a.analysis.reversalScore;
    });
  }, [results, filter, sort]);

  const stats = useMemo(() => ({
    total: results.length,
    confirmed: results.filter((item) => item.analysis.stage === 'CONFIRMED').length,
    trigger: results.filter((item) => item.analysis.stage === 'TRIGGER').length,
    setup: results.filter((item) => item.analysis.stage === 'SETUP').length,
  }), [results]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-white">
            <RefreshCw className="h-8 w-8 text-emerald-400" /> Reversal Scanner
          </h1>
          <p className="mt-1 text-slate-400">바닥 베이스 · RS 개선 · 수급 전환 · 피벗 임박 후보 발굴</p>
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
          <TableSkeleton cols={7} rows={5} />
        </div>
      )}

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-200">
          <Activity className="h-5 w-5 text-emerald-400" />
          Target Universe
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(UNIVERSES) as ScannerUniverse[]).map((uKey) => {
            const active = universe === uKey;
            return (
              <button
                key={uKey}
                onClick={() => { if (!isScanning) setUniverse(uKey); }}
                className={`rounded-xl border p-4 text-left transition-all ${
                  active
                    ? 'border-emerald-500 bg-emerald-600/15 ring-1 ring-emerald-500/40'
                    : 'border-slate-800 bg-slate-950/50 hover:border-slate-700 hover:bg-slate-800/50'
                }`}
              >
                <div className="font-bold text-slate-100">{UNIVERSES[uKey].label}</div>
                <div className="mt-1.5 text-xs leading-relaxed text-slate-400">{UNIVERSES[uKey].desc}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-4 md:flex-row md:items-center md:justify-between">
        {isScanning ? (
          <div className="flex items-center gap-4">
            <Button onClick={stopScan} variant="danger" icon={<Square className="h-4 w-4" />}>
              스캔 중지
            </Button>
            <div className="flex w-full flex-col gap-1 md:w-72">
              <div className="flex justify-between text-xs font-medium text-slate-300">
                <span className="flex items-center gap-1.5">
                  <LoadingSpinner size="sm" />
                  {scanStage}
                </span>
                <span>{progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-indigo-500 transition-all duration-300"
                  style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <Button onClick={startScan} variant="primary" icon={<Play className="h-4 w-4" />}>
            스캔 시작
          </Button>
        )}

        {results.length > 0 && (
          <div className="grid grid-cols-2 gap-2 text-sm text-slate-300 md:grid-cols-4">
            <span className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">전체 {stats.total}</span>
            <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-200">확인 {stats.confirmed}</span>
            <span className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-indigo-200">임박 {stats.trigger}</span>
            <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-200">준비 {stats.setup}</span>
          </div>
        )}
      </section>

      {scanErrors.length > 0 && (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-300" />
            <div>
              <h2 className="text-sm font-semibold text-amber-100">데이터 로딩 실패 {scanErrors.length}건</h2>
              <p className="mt-1 text-sm text-amber-100/70">성공 종목은 유지하고 실패 종목만 별도 표시합니다.</p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {scanErrors.slice(0, 9).map((item) => (
              <div key={`${item.exchange}:${item.ticker}`} className="rounded-lg border border-amber-400/20 bg-slate-950/50 px-3 py-2">
                <div className="text-xs font-semibold text-amber-100">{item.ticker} · {item.exchange}</div>
                <div className="mt-1 truncate text-xs text-amber-100/65" title={item.error}>{item.error}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {results.length > 0 && (
        <section className="flex flex-col flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-4 md:flex-row md:items-center">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <button
                key={item.key}
                onClick={() => setFilter(item.key)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                  filter === item.key
                    ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-200'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex w-full items-center gap-3 md:w-auto">
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="flex-grow rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm font-medium text-slate-300 outline-none focus:ring-1 focus:ring-emerald-500 md:flex-grow-0"
            >
              {SORTS.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
            <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-0.5">
              <button
                onClick={() => setViewType('card')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${viewType === 'card' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                카드
              </button>
              <button
                onClick={() => setViewType('table')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${viewType === 'table' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                테이블
              </button>
            </div>
          </div>
        </section>
      )}

      {results.length > 0 && (
        filteredAndSorted.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 py-16 text-center text-slate-500">
            해당 필터에 일치하는 전환 초입 후보가 없습니다.
          </div>
        ) : viewType === 'card' ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {filteredAndSorted.map((item, idx) => {
              const analysis = item.analysis;
              return (
                <motion.div
                  key={item.ticker}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="flex items-center gap-2 text-xl font-bold text-white">
                        {item.ticker}
                        <span className="text-xs font-medium text-slate-500">{item.exchange}</span>
                      </h3>
                      {item.name && <p className="mt-1 text-xs text-slate-500">{item.name}</p>}
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${gradeClass[analysis.grade]}`}>
                      {stageLabel[analysis.stage]} · {analysis.reversalScore}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <div>
                      <div className="text-xs text-slate-500">Reversal Stage</div>
                      <div className="mt-1 text-sm font-semibold text-slate-100">{stageLabel[analysis.stage]}</div>
                    </div>
                    <BarChart3 className="h-5 w-5 text-emerald-300" />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <Metric label="현재가" value={formatPrice(analysis.currentPrice, item.exchange)} />
                    <Metric label="피벗" value={formatPrice(analysis.pivotPrice, item.exchange)} />
                    <Metric label="피벗 이격" value={`${formatNumber(analysis.distanceToPivotPct)}%`} />
                    <Metric label="손절폭" value={`${formatNumber(analysis.stopPct)}%`} />
                    <Metric label="베이스" value={`${analysis.baseDays ?? '-'}일`} />
                    <Metric label="RS 20D" value={`${formatNumber(analysis.benchmarkRelative20dPct)}%p`} />
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                    <ScoreTile label="Base" value={analysis.breakdown.baseQuality} />
                    <ScoreTile label="RS" value={analysis.breakdown.relativeStrength} />
                    <ScoreTile label="Volume" value={analysis.breakdown.accumulation} />
                  </div>

                  <div className="mt-4 space-y-2">
                    {analysis.evidence.slice(0, 4).map((line) => (
                      <div key={line} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
                        {line}
                      </div>
                    ))}
                  </div>

                  {analysis.warnings.length > 0 && (
                    <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/80">
                      {analysis.warnings[0]}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="border-b border-slate-800 bg-slate-950 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-6 py-4 font-semibold">종목</th>
                  <th className="px-6 py-4 font-semibold">단계</th>
                  <th className="px-6 py-4 font-semibold text-right">점수</th>
                  <th className="px-6 py-4 font-semibold text-right">베이스</th>
                  <th className="px-6 py-4 font-semibold text-right">피벗 이격</th>
                  <th className="px-6 py-4 font-semibold text-right">RS 20D</th>
                  <th className="px-6 py-4 font-semibold text-right">손절폭</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredAndSorted.map((item) => {
                  const analysis = item.analysis;
                  return (
                    <tr key={item.ticker} className="hover:bg-slate-800/50">
                      <td className="px-6 py-4 font-bold text-white">{item.ticker}</td>
                      <td className="px-6 py-4">{stageLabel[analysis.stage]}</td>
                      <td className="px-6 py-4 text-right font-bold">{analysis.reversalScore}</td>
                      <td className="px-6 py-4 text-right">{analysis.baseDays ?? '-'}일</td>
                      <td className="px-6 py-4 text-right">{formatNumber(analysis.distanceToPivotPct)}%</td>
                      <td className="px-6 py-4 text-right">{formatNumber(analysis.benchmarkRelative20dPct)}%p</td>
                      <td className="px-6 py-4 text-right">{formatNumber(analysis.stopPct)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {!isScanning && results.length === 0 && !scanFatalError && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 py-16 text-center text-slate-500">
          유니버스를 선택하고 스캔을 시작하세요.
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-mono font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function ScoreTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
      <div className="text-slate-500">{label}</div>
      <div className="mt-1 font-mono font-semibold text-slate-100">{value}</div>
    </div>
  );
}
