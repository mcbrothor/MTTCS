'use client';

import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  BarChart2,
  BarChart3,
  Play,
  Square,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import AsyncStatePanel from '@/components/ui/AsyncStatePanel';
import TableSkeleton from '@/components/ui/TableSkeleton';
import QullamaggieEvidenceModal from '@/components/qullamaggie/QullamaggieEvidenceModal';
import type { ScannerUniverse } from '@/types';
import type {
  QullamaggieAnalysis,
  QullamaggieGrade,
  QullamaggieSetup,
} from '@/lib/finance/engines/qullamaggie-score';

type FilterKey = 'all' | 'super' | 'breakout' | 'ep' | 'watch';
type SortKey = 'qScore' | 'return3m' | 'pivot' | 'rvol' | 'risk';
type ViewType = 'card' | 'table';

interface UniverseItem {
  ticker: string;
  exchange?: string;
  name?: string;
}

interface QullamaggieResult {
  ticker: string;
  exchange: string;
  name: string | null;
  analysis: QullamaggieAnalysis;
}

interface QullamaggieApiResult {
  ticker: string;
  success: boolean;
  data?: QullamaggieAnalysis;
  error?: string;
}

interface ScanError {
  ticker: string;
  exchange: string;
  error: string;
}

const UNIVERSES: Record<ScannerUniverse, { label: string; desc: string }> = {
  NASDAQ100: { label: 'NASDAQ 100', desc: '미국 대형 성장주 쿨라매기 셋업 후보.' },
  SP500: { label: 'S&P 500', desc: '기관 유동성 중심의 대형주 돌파 후보.' },
  KOSPI200: { label: 'KOSPI 상위 200', desc: '국내 대형 주도주의 베이스 돌파 후보.' },
  KOSDAQ150: { label: 'KOSDAQ 상위 150', desc: '국내 성장주 EP·돌파 후보.' },
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'super', label: 'Super' },
  { key: 'breakout', label: 'Breakout' },
  { key: 'ep', label: 'EP' },
  { key: 'watch', label: 'Watch+' },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'qScore', label: 'Q-Score순' },
  { key: 'return3m', label: '3개월 상승률순' },
  { key: 'pivot', label: '피벗 근접순' },
  { key: 'rvol', label: 'RVOL순' },
  { key: 'risk', label: '손절폭 낮은순' },
];

const gradeClass: Record<QullamaggieGrade, string> = {
  SUPER: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200',
  A: 'border-indigo-400/40 bg-indigo-500/10 text-indigo-200',
  B: 'border-sky-400/40 bg-sky-500/10 text-sky-200',
  WATCH: 'border-amber-400/40 bg-amber-500/10 text-amber-200',
  REJECT: 'border-slate-700 bg-slate-900 text-slate-400',
};

const setupLabel: Record<QullamaggieSetup, string> = {
  SUPER_BREAKOUT: 'Super Breakout',
  BREAKOUT: 'Continuation Breakout',
  EP: 'Episodic Pivot',
  PARABOLIC_WARNING: 'Parabolic Warning',
  NONE: 'No Setup',
};

function formatNumber(value: number | null | undefined, digits = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return value.toFixed(digits);
}

function formatPrice(value: number | null | undefined, exchange: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  const locale = exchange === 'KOSPI' || exchange === 'KOSDAQ' ? 'ko-KR' : 'en-US';
  return value.toLocaleString(locale, { maximumFractionDigits: exchange === 'KOSPI' || exchange === 'KOSDAQ' ? 0 : 2 });
}

export default function QullamaggieScannerPage() {
  const [universe, setUniverse] = useState<ScannerUniverse>('NASDAQ100');
  const [isScanning, setIsScanning] = useState(false);
  const [scanStage, setScanStage] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<QullamaggieResult[]>([]);
  const [scanErrors, setScanErrors] = useState<ScanError[]>([]);
  const [scanFatalError, setScanFatalError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('qScore');
  const [viewType, setViewType] = useState<ViewType>('card');
  const [modalItem, setModalItem] = useState<{ ticker: string; exchange: string; snapshotId: string | null } | null>(null);
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

      setScanStage('쿨라매기 셋업 분석 중');
      setProgress({ current: 0, total: items.length });

      const batchSize = 20;
      let allResults: QullamaggieResult[] = [];
      let allErrors: ScanError[] = [];

      for (let i = 0; i < items.length; i += batchSize) {
        if (abort.signal.aborted) break;
        const batch = items.slice(i, i + batchSize);
        const payload = batch.map((item) => ({
          ticker: item.ticker,
          exchange: item.exchange || (universe.includes('KOS') ? (universe.includes('KOSPI') ? 'KOSPI' : 'KOSDAQ') : 'US'),
          name: item.name ?? null,
        }));

        const scanResp = await fetch('/api/scanner/qullamaggie', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: payload.map(({ ticker, exchange }) => ({ ticker, exchange })) }),
          signal: abort.signal,
        });

        if (scanResp.ok) {
          const json = await scanResp.json() as { results?: QullamaggieApiResult[] };
          if (json.results) {
            const successBatch = json.results
              .filter((r): r is QullamaggieApiResult & { data: QullamaggieAnalysis } => r.success && Boolean(r.data))
              .map((r) => {
                const source = payload.find((p) => p.ticker === r.ticker);
                return {
                  ticker: r.ticker,
                  exchange: source?.exchange || 'US',
                  name: source?.name ?? null,
                  analysis: r.data,
                };
              });
            allResults = [...allResults, ...successBatch];

            const failedBatch = json.results
              .filter((r) => !r.success)
              .map((r) => {
                const source = payload.find((p) => p.ticker === r.ticker);
                return {
                  ticker: r.ticker,
                  exchange: source?.exchange || 'US',
                  error: r.error || '분석 실패',
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

        setProgress((prev) => ({ ...prev, current: Math.min(i + batchSize, items.length) }));
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
    if (filter === 'super') filtered = results.filter((r) => r.analysis.primarySetup === 'SUPER_BREAKOUT' || r.analysis.grade === 'SUPER');
    if (filter === 'breakout') filtered = results.filter((r) => r.analysis.setupFlags.includes('BREAKOUT'));
    if (filter === 'ep') filtered = results.filter((r) => r.analysis.setupFlags.includes('EP'));
    if (filter === 'watch') filtered = results.filter((r) => r.analysis.qScore >= 40);

    return [...filtered].sort((a, b) => {
      if (sort === 'return3m') return (b.analysis.return3mPct ?? -999) - (a.analysis.return3mPct ?? -999);
      if (sort === 'pivot') return Math.abs(a.analysis.distanceToPivotPct ?? 999) - Math.abs(b.analysis.distanceToPivotPct ?? 999);
      if (sort === 'rvol') return (b.analysis.rvol20 ?? 0) - (a.analysis.rvol20 ?? 0);
      if (sort === 'risk') return (a.analysis.stopPct ?? 999) - (b.analysis.stopPct ?? 999);
      return b.analysis.qScore - a.analysis.qScore;
    });
  }, [results, filter, sort]);

  const stats = useMemo(() => ({
    total: results.length,
    super: results.filter((r) => r.analysis.grade === 'SUPER').length,
    breakout: results.filter((r) => r.analysis.setupFlags.includes('BREAKOUT')).length,
    ep: results.filter((r) => r.analysis.setupFlags.includes('EP')).length,
  }), [results]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-white">
            <Activity className="h-8 w-8 text-emerald-400" /> Qullamaggie Scanner
          </h1>
          <p className="mt-1 text-slate-400">Breakout · EP · Super Breakout 후보 발굴</p>
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
            <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-200">Super {stats.super}</span>
            <span className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-indigo-200">Breakout {stats.breakout}</span>
            <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-200">EP {stats.ep}</span>
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
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                  filter === f.key
                    ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-200'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex w-full items-center gap-3 md:w-auto">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="flex-grow rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm font-medium text-slate-300 outline-none focus:ring-1 focus:ring-emerald-500 md:flex-grow-0"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
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
            해당 필터에 일치하는 쿨라매기 후보가 없습니다.
          </div>
        ) : viewType === 'card' ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {filteredAndSorted.map((item, idx) => {
              const a = item.analysis;
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
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${gradeClass[a.grade]}`}>
                      {a.grade} · {a.qScore}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <div>
                      <div className="text-xs text-slate-500">Setup</div>
                      <div className="mt-1 text-sm font-semibold text-slate-100">{setupLabel[a.primarySetup]}</div>
                    </div>
                    <BarChart3 className="h-5 w-5 text-emerald-300" />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <Metric label="현재가" value={formatPrice(a.currentPrice, item.exchange)} />
                    <Metric label="피벗" value={formatPrice(a.pivotPrice, item.exchange)} />
                    <Metric label="트리거" value={formatPrice(a.entryTrigger, item.exchange)} />
                    <Metric label="손절폭" value={`${formatNumber(a.stopPct)}%`} />
                    <Metric label="3M" value={`${formatNumber(a.return3mPct)}%`} />
                    <Metric label="RVOL" value={`${formatNumber(a.rvol20)}x`} />
                  </div>

                  <div className="mt-4 space-y-2">
                    {a.evidence.slice(0, 4).map((line) => (
                      <div key={line} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
                        {line}
                      </div>
                    ))}
                  </div>

                  {a.warnings.length > 0 && (
                    <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/80">
                      {a.warnings[0]}
                    </div>
                  )}

                  <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-end">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setModalItem({
                        ticker: item.ticker,
                        exchange: item.exchange,
                        snapshotId: a.evidenceRef?.snapshotId ?? null,
                      })}
                      className="w-full flex items-center justify-center gap-1.5 text-xs text-sky-400 hover:text-sky-300"
                    >
                      <BarChart2 className="h-3.5 w-3.5" />
                      근거 차트 보기
                    </Button>
                  </div>
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
                  <th className="px-6 py-4 font-semibold">셋업</th>
                  <th className="px-6 py-4 font-semibold text-right">Q-Score</th>
                  <th className="px-6 py-4 font-semibold text-right">피벗</th>
                  <th className="px-6 py-4 font-semibold text-right">손절폭</th>
                  <th className="px-6 py-4 font-semibold text-right">3개월</th>
                  <th className="px-6 py-4 font-semibold text-right">RVOL</th>
                  <th className="px-6 py-4 font-semibold text-center">차트</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredAndSorted.map((item) => {
                  const a = item.analysis;
                  return (
                    <tr key={item.ticker} className="hover:bg-slate-800/50">
                      <td className="px-6 py-4 font-bold text-white">{item.ticker}</td>
                      <td className="px-6 py-4">{setupLabel[a.primarySetup]}</td>
                      <td className="px-6 py-4 text-right font-bold">{a.qScore}</td>
                      <td className="px-6 py-4 text-right">{formatPrice(a.pivotPrice, item.exchange)}</td>
                      <td className="px-6 py-4 text-right">{formatNumber(a.stopPct)}%</td>
                      <td className="px-6 py-4 text-right">{formatNumber(a.return3mPct)}%</td>
                      <td className="px-6 py-4 text-right">{formatNumber(a.rvol20)}x</td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => setModalItem({
                            ticker: item.ticker,
                            exchange: item.exchange,
                            snapshotId: a.evidenceRef?.snapshotId ?? null,
                          })}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-sky-400 transition-colors"
                          title="근거 차트 보기"
                        >
                          <BarChart2 className="h-4 w-4" />
                        </button>
                      </td>
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

      {modalItem && (
        <QullamaggieEvidenceModal
          isOpen={Boolean(modalItem)}
          onClose={() => setModalItem(null)}
          ticker={modalItem.ticker}
          exchange={modalItem.exchange}
          snapshotId={modalItem.snapshotId}
        />
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
