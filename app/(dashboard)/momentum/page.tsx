'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Play,
  Square,
  Activity,
  Flame
} from 'lucide-react';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ScannerTabNav from '@/components/scanner/ScannerTabNav';
import type { ScannerUniverse } from '@/types';
import { SurgeGrade, SurgeMetrics } from '@/lib/finance/engines/surge-score';

type FilterKey = 'all' | 'explosive' | 'breakout' | 'warm';
type SortKey = 'rvol' | 'roc';
type ViewType = 'card' | 'table';

interface SurgeResult {
  ticker: string;
  exchange: string;
  metrics: SurgeMetrics;
  currentPrice: number | null;
}

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

function gradeLabel(grade: SurgeGrade) {
  if (grade === 'EXPLOSIVE') return { emoji: '🌋', label: 'Explosive', color: 'rose' };
  if (grade === 'BREAKOUT') return { emoji: '🔥', label: 'Breakout', color: 'orange' };
  if (grade === 'WARM') return { emoji: '♨️', label: 'Warm', color: 'amber' };
  return { emoji: '📉', label: 'None', color: 'slate' };
}

export default function MomentumScannerPage() {
  const [universe, setUniverse] = useState<ScannerUniverse>('NASDAQ100');
  const [isScanning, setIsScanning] = useState(false);
  const [scanStage, setScanStage] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  
  const [results, setResults] = useState<SurgeResult[]>([]);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('rvol');
  const [viewType, setViewType] = useState<ViewType>('card');
  
  const abortRef = useRef<AbortController | null>(null);

  const startScan = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setProgress({ current: 0, total: 0 });
    setScanStage('유니버스 로딩 중');

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const resp = await fetch(`/api/scanner/universe?universe=${universe}`, { signal: abort.signal });
      if (!resp.ok) throw new Error(`유니버스 로딩 실패 (${resp.status})`);
      const { symbols } = await resp.json();

      setScanStage('모멘텀 엔진 가동 중');
      setProgress({ current: 0, total: symbols.length });

      const batchSize = 20;
      let allResults: SurgeResult[] = [];

      for (let i = 0; i < symbols.length; i += batchSize) {
        if (abort.signal.aborted) break;
        const batch = symbols.slice(i, i + batchSize);
        
        const payload = batch.map((sym: string) => ({
          ticker: sym.split('.')[0],
          exchange: universe.includes('KOS') ? (universe.includes('KOSPI') ? 'KOSPI' : 'KOSDAQ') : 'US',
        }));

        const scanResp = await fetch('/api/scanner/momentum', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: payload }),
          signal: abort.signal,
        });

        if (scanResp.ok) {
          const json = await scanResp.json();
          if (json.results) {
             const successBatch = json.results
                .filter((r: any) => r.success && r.data)
                .map((r: any) => ({
                    ticker: r.ticker,
                    exchange: payload.find((p: any) => p.ticker === r.ticker)?.exchange || 'US',
                    metrics: {
                       rvol: r.data.rvol,
                       roc: r.data.roc,
                       avgVolume20d: r.data.avgVolume20d,
                       currentVolume: r.data.currentVolume,
                       grade: r.data.grade,
                    },
                    currentPrice: r.data.currentPrice,
                }));
             allResults = [...allResults, ...successBatch];
          }
        }
        setProgress((prev) => ({ ...prev, current: Math.min(i + batchSize, symbols.length) }));
      }

      setResults(allResults);
      setScanStage('완료');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        alert(`스캔 실패: ${err.message}`);
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

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <Flame className="w-8 h-8 text-rose-500" /> Momentum Scanner
          </h1>
          <p className="text-slate-400 mt-1">상대 거래량(RVOL)과 등락률(ROC) 기반의 모멘텀 돌파/급등 포착 스캐너</p>
        </div>
      </header>

      <ScannerTabNav />

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
          {filteredAndSorted.length === 0 ? (
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
                      className={`relative p-5 rounded-2xl border bg-slate-900 overflow-hidden group hover:border-${gl.color}-500/50 transition-colors border-slate-800`}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            {item.ticker}
                          </h3>
                          <span className={`inline-flex mt-1 items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-${gl.color}-500/10 text-${gl.color}-400 border border-${gl.color}-500/20`}>
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
                             <div className="text-lg font-bold text-slate-200">{item.metrics.rvol.toFixed(1)}x</div>
                         </div>
                         <div>
                             <div className="text-xs font-medium text-slate-500 mb-1">오늘 거래량</div>
                             <div className="text-lg font-bold text-slate-200">{(item.metrics.currentVolume / 1000000).toFixed(1)}M</div>
                         </div>
                         <div className="col-span-2 relative h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                             <div 
                               className={`absolute top-0 left-0 h-full rounded-full bg-${gl.color}-500 transition-all`}
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
                        <tr key={item.ticker} className="hover:bg-slate-800/50 transition-colors">
                          <td className="px-6 py-4 font-bold text-white">{item.ticker}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-${gl.color}-500/10 text-${gl.color}-400 border border-${gl.color}-500/20`}>
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
                            {item.metrics.rvol.toFixed(2)}x
                          </td>
                          <td className="px-6 py-4 text-right text-slate-400">
                            {(item.metrics.currentVolume / 1000000).toFixed(1)}M
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
    </div>
  );
}
