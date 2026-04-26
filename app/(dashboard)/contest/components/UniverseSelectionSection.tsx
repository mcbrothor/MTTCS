import React from 'react';
import Link from 'next/link';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { ScannerUniverse, StoredScannerSnapshot, MasterFilterResponse, ScannerResult } from '@/types';
import { tierClass } from '@/lib/contest-ui-utils';

// lucide-react@1.8.0 bundler resolution 이슈 대응
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Zap } = require('lucide-react') as {
  Zap: React.FC<React.SVGProps<SVGSVGElement>>;
};

interface UniverseSelectionSectionProps {
  universe: ScannerUniverse;
  setUniverse: (u: ScannerUniverse) => void;
  snapshot: StoredScannerSnapshot | null;
  loadSnapshot: (u: ScannerUniverse) => void;
  selected: string[];
  marketContext: MasterFilterResponse | null;
  visibleSelectionRows: ScannerResult[];
  toggleCandidateSelection: (ticker: string) => void;
  handleStartAnalysis: () => void;
  busy: boolean;
  UNIVERSES: ScannerUniverse[];
}

const UniverseSelectionSection: React.FC<UniverseSelectionSectionProps> = ({
  universe,
  setUniverse,
  snapshot,
  loadSnapshot,
  selected,
  marketContext,
  visibleSelectionRows,
  toggleCandidateSelection,
  handleStartAnalysis,
  busy,
  UNIVERSES,
}) => {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/50 p-6 shadow-2xl backdrop-blur-xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500 text-xs font-black text-white shadow-lg shadow-emerald-500/30">1</div>
            분석 후보 선택
          </h2>
          <p className="text-sm text-slate-400">최대 10개까지 선택 가능합니다. 선택된 순서대로 AI에게 전달됩니다.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={universe}
            onChange={(event) => {
              const next = event.target.value as ScannerUniverse;
              setUniverse(next);
              loadSnapshot(next);
            }}
            className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
          >
            {UNIVERSES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <Button type="button" variant="ghost" onClick={() => loadSnapshot(universe)} className="gap-2 rounded-xl">
            <RefreshCw className="h-4 w-4" /> 리로드
          </Button>
        </div>
      </div>

      {!snapshot ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center text-slate-400">
          <p>저장된 스캔 결과가 없습니다.</p>
          <Link href="/scanner" className="mt-4 inline-block text-emerald-400 hover:underline">스캐너로 이동하기 &rarr;</Link>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-xs font-medium text-slate-500">
            <span className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5">
              <div className={`h-2 w-2 rounded-full ${selected.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`} />
              {selected.length} / 10 선택됨
            </span>
            {marketContext && (
              <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1.5 text-indigo-300">
                시장 국면: {marketContext.state} (P3: {marketContext.metrics.p3Score ?? '-'})
              </span>
            )}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleSelectionRows.map((item) => {
              const checked = selected.includes(item.ticker);
              return (
                <button
                  key={item.ticker}
                  type="button"
                  onClick={() => toggleCandidateSelection(item.ticker)}
                  className={`group relative overflow-hidden rounded-2xl border p-5 text-left transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${
                    checked 
                      ? 'border-emerald-500/50 bg-emerald-500/5 shadow-[0_0_20px_rgba(16,185,129,0.1)]' 
                      : 'border-slate-800 bg-slate-900/40 hover:border-slate-600'
                  }`}
                >
                  {checked && (
                    <div className="absolute right-3 top-3">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                    </div>
                  )}
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-mono text-xl font-black tracking-tight text-white group-hover:text-emerald-400 transition-colors">{item.ticker}</p>
                      <p className="mt-1 truncate text-xs text-slate-500 font-medium">{item.name}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                     <span className={`rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${tierClass(item.recommendationTier)}`}>
                      {item.recommendationTier}
                    </span>
                    {item.vcpScore && (
                      <span className="rounded-lg border border-slate-700 bg-slate-800/50 px-2 py-1 text-[10px] font-bold text-slate-300">
                        VCP {item.vcpScore}
                      </span>
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-800/50 pt-4 text-[11px]">
                    <div className="space-y-1">
                      <p className="text-slate-500">피벗 거리</p>
                      <p className={`font-mono font-bold ${Math.abs(item.distanceToPivotPct || 0) < 5 ? 'text-emerald-400' : 'text-white'}`}>
                        {item.distanceToPivotPct ?? '-'}%
                      </p>
                    </div>
                    <div className="space-y-1 text-right">
                      <p className="text-slate-500">SEPA 미충족</p>
                      <p className="font-mono font-bold text-white">{item.sepaMissingCount ?? '0'}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-10 flex justify-center">
            <Button 
              size="lg" 
              onClick={handleStartAnalysis} 
              disabled={busy || selected.length === 0}
              className="h-14 w-full max-w-md gap-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 font-bold text-lg shadow-xl hover:from-emerald-500 hover:to-teal-500 transition-all active:scale-95 disabled:opacity-50"
            >
              {busy ? <LoadingSpinner /> : <Zap className="h-6 w-6 fill-white" />}
              AI 분석 시작 (Gemini 1.5 Pro)
            </Button>
          </div>
        </>
      )}
    </section>
  );
};

export default React.memo(UniverseSelectionSection);
