import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Check, Plus, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import GlossaryTooltip from '@/components/ui/GlossaryTooltip';
import { getVolumeSignalTier, isContestPoolTier } from '@/lib/scanner-recommendation';
import {
  formatScannerRs,
  getScannerBaseLabel,
  getScannerMomentumSeries,
  getScannerRsBand,
  getScannerSepaSummary,
  getScannerTrendDots,
  type RsBandTone,
} from '@/lib/scanner-presentation';
import type { RecommendationTier, ScannerResult } from '@/types';

function tierClass(tier: RecommendationTier) {
  if (tier === 'Recommended') return 'border-emerald-400/40 bg-emerald-500/12 text-emerald-100';
  if (tier === 'Partial') return 'border-amber-400/40 bg-amber-500/12 text-amber-100';
  if (tier === 'Error') return 'border-rose-400/40 bg-rose-500/12 text-rose-100';
  return 'border-slate-700/80 bg-slate-900/80 text-slate-300';
}

function rsBandClass(tone: RsBandTone) {
  if (tone === 'elite') return 'border-cyan-400/40 bg-cyan-400/12 text-cyan-100';
  if (tone === 'leader') return 'border-emerald-400/40 bg-emerald-500/12 text-emerald-100';
  if (tone === 'building') return 'border-amber-400/40 bg-amber-500/12 text-amber-100';
  return 'border-slate-700/80 bg-slate-900/80 text-slate-400';
}

function RsSourceBadge({ source }: { source: ScannerResult['rsSource'] }) {
  if (source === 'DB_BATCH') {
    return <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">DB</span>;
  }
  if (source === 'BENCHMARK_PROXY') {
    return <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200">Proxy</span>;
  }
  if (source === 'UNIVERSE') {
    return <span className="rounded-full border border-slate-600/50 bg-slate-800/70 px-2 py-0.5 text-[10px] font-semibold text-slate-300">Rank</span>;
  }
  return null;
}

function MetricStat({ label, value, accent, termKey }: { label: string; value: string; accent?: string; termKey?: string }) {
  const content = (
    <div className="rounded-2xl border border-slate-800/90 bg-slate-950/75 px-3 py-2 w-full">
      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${accent || 'text-slate-100'}`}>{value}</p>
    </div>
  );

  if (termKey) {
    return <GlossaryTooltip termKey={termKey}>{content}</GlossaryTooltip>;
  }
  return content;
}

function TrendDots({ result }: { result: ScannerResult }) {
  const dots = getScannerTrendDots(result);

  return (
    <div className="flex items-center gap-2">
      {dots.map((dot) => (
        <div key={dot.key} className="flex items-center gap-1.5 rounded-full border border-slate-800/90 bg-slate-950/80 px-2 py-1">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              dot.active ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.55)]' : 'bg-slate-700'
            }`}
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{dot.label}</span>
        </div>
      ))}
    </div>
  );
}

function MiniSparkline({ result }: { result: ScannerResult }) {
  const series = getScannerMomentumSeries(result);
  if (series.points.length < 2) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 px-3 py-3">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
          <TrendingUp className="h-3.5 w-3.5" />
          {series.label}
        </div>
        <p className="mt-2 text-xs text-slate-500">Not enough return history yet.</p>
      </div>
    );
  }

  const numericPoints = series.points.filter(
    (point): point is (typeof series.points)[number] & { value: number } =>
      typeof point.value === 'number' && Number.isFinite(point.value)
  );
  const values = numericPoints.map((point) => point.value);
  if (numericPoints.length < 2) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 px-3 py-3">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
          <TrendingUp className="h-3.5 w-3.5" />
          {series.label}
        </div>
        <p className="mt-2 text-xs text-slate-500">Not enough numeric return history yet.</p>
      </div>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 160;
  const height = 44;
  const points = numericPoints
    .map((point, index) => {
      const x = (index / (numericPoints.length - 1)) * width;
      const y = height - ((point.value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  const latest = numericPoints.at(-1)?.value ?? null;
  const accent = latest !== null && latest >= 0 ? 'text-emerald-200' : 'text-rose-200';

  return (
    <div className="rounded-2xl border border-slate-800/90 bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(2,6,23,0.9))] px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
          <TrendingUp className="h-3.5 w-3.5" />
          {series.label}
        </div>
        <span className={`text-xs font-semibold ${accent}`}>{latest === null ? '-' : `${latest > 0 ? '+' : ''}${latest.toFixed(1)}%`}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height + 8}`} className="mt-2 h-14 w-full overflow-visible">
        <polyline
          fill="none"
          stroke="rgba(148,163,184,0.16)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
        <polyline
          fill="none"
          stroke="rgba(45,212,191,0.88)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
      <div className="mt-1 flex items-center justify-between text-[9px] uppercase tracking-[0.14em] text-slate-600">
        {series.points.map((point) => (
          <span key={point.label}>{point.label}</span>
        ))}
      </div>
    </div>
  );
}

interface ScannerCardViewProps {
  results: ScannerResult[];
  selectedTickers: Set<string>;
  onToggleSelect: (ticker: string) => void;
  onCardClick: (result: ScannerResult) => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 260,
      damping: 20,
    },
  },
};

export default function ScannerCardView({
  results,
  selectedTickers,
  onToggleSelect,
  onCardClick,
}: ScannerCardViewProps) {
  const [expandedTickers, setExpandedTickers] = useState<Set<string>>(new Set());

  const toggleExpand = (ticker: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedTickers((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  };

  const selectionButton = (result: ScannerResult) => (
    <button
      type="button"
      disabled={result.status !== 'done'}
      onClick={(event) => {
        event.stopPropagation();
        onToggleSelect(result.ticker);
      }}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition-all ${
        selectedTickers.has(result.ticker)
          ? 'border-rose-500 bg-rose-500 text-white shadow-lg shadow-rose-500/20'
          : 'border-slate-700 bg-slate-950/80 text-slate-400 hover:border-rose-400/60 hover:text-rose-300'
      } disabled:opacity-20`}
    >
      {selectedTickers.has(result.ticker) ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
    </button>
  );

  const MotionDiv = motion.div as any;

  return (
    <MotionDiv
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
    >
      {results.map((result) => {
        const volumeTier = getVolumeSignalTier(result);
        const rsBand = getScannerRsBand(result);
        const sepa = getScannerSepaSummary(result);
        const isExpanded = expandedTickers.has(result.ticker);
        const pivotText = result.distanceToPivotPct === null
          ? '-'
          : `${result.distanceToPivotPct > 0 ? '+' : ''}${result.distanceToPivotPct.toFixed(1)}%`;

        return (
          <MotionDiv
            key={result.ticker}
            layout
            variants={itemVariants}
            whileHover={{ y: -3, scale: 1.01 }}
            onClick={() => result.status === 'done' && onCardClick(result)}
            className={`group relative overflow-hidden rounded-[24px] border p-4 transition-all ${
              isContestPoolTier(result.recommendationTier)
                ? 'border-emerald-400/25 bg-[linear-gradient(180deg,rgba(6,78,59,0.18),rgba(2,6,23,0.9))] hover:border-emerald-300/40'
                : 'border-slate-800/90 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.94))] hover:border-slate-700'
            } ${selectedTickers.has(result.ticker) ? 'ring-2 ring-emerald-500/60 shadow-[0_0_24px_rgba(16,185,129,0.18)]' : ''}`}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.16),transparent_52%)] opacity-80" />

            {result.status === 'done' && (
              <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
                <button
                  onClick={(e) => toggleExpand(result.ticker, e)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-900/80 text-slate-400 hover:text-white transition-colors"
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {selectionButton(result)}
              </div>
            )}

            <div className="relative flex min-h-[172px] flex-col">
              <div className="pr-10">
                <div className="flex flex-wrap items-start gap-2">
                  <h3 className="font-mono text-lg font-bold tracking-[0.08em] text-white">{result.ticker}</h3>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${tierClass(result.recommendationTier)}`}>
                    {result.recommendationTier}
                  </span>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${rsBandClass(rsBand.tone)}`}>
                    {rsBand.label}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm text-slate-400">{result.name}</p>
              </div>

              {result.status === 'done' && (
                <>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div>
                      <GlossaryTooltip termKey="RS">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">상대적 강도</p>
                      </GlossaryTooltip>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="font-mono text-base font-semibold text-slate-100">{formatScannerRs(result)}</span>
                        <RsSourceBadge source={result.rsSource} />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">추세 정렬</p>
                      <p className={`mt-1 text-xs font-semibold ${
                        result.rsLineNewHigh ? 'text-emerald-200' : result.rsLineNearHigh ? 'text-amber-200' : 'text-slate-400'
                      }`}>
                        {result.rsLineNewHigh ? '신고가 경신' : result.rsLineNearHigh ? '신고가 근접' : '보통'}
                      </p>
                    </div>
                  </div>

                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 border-t border-slate-800/50 pt-4 space-y-4">
                        <TrendDots result={result} />
                        <MiniSparkline result={result} />
                        
                        <div className="grid grid-cols-2 gap-2">
                          <MetricStat 
                            label="SEPA 핵심" 
                            value={sepa.label} 
                            accent={sepa.corePassed === sepa.coreTotal ? 'text-emerald-100' : 'text-slate-100'} 
                            termKey="SEPA"
                          />
                          <MetricStat 
                            label="변동성 축소" 
                            value={`${result.vcpGrade || '-'} · ${getScannerBaseLabel(result)}`} 
                            termKey="VCP"
                          />
                          <MetricStat 
                            label="거래량 강도" 
                            value={volumeTier === 'Strong' ? '강력' : volumeTier === 'Watch' ? '주의' : '보통'} 
                            accent={volumeTier === 'Strong' ? 'text-emerald-100' : volumeTier === 'Watch' ? 'text-amber-100' : 'text-slate-100'} 
                            termKey="VOLUME"
                          />
                          <MetricStat 
                            label="타점 이격" 
                            value={pivotText} 
                            accent={Math.abs(result.distanceToPivotPct || 99) <= 5 ? 'text-emerald-100' : 'text-slate-100'} 
                            termKey="PIVOT"
                          />
                        </div>

                        <div className="rounded-2xl border border-slate-800/90 bg-slate-950/75 px-3 py-3">
                          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                            <Activity className="h-3.5 w-3.5" />
                            투자 가이드 (Thesis)
                          </div>
                          <p className="mt-2 text-xs leading-5 text-slate-300">{result.recommendationReason}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </>
              )}

              {result.status === 'running' && (
                <div className="mt-6 flex items-center gap-2 text-xs text-emerald-300">
                  <LoadingSpinner className="h-3.5 w-3.5" />
                  Analyzing SEPA, VCP, and RS signals
                </div>
              )}

              {result.status === 'error' && (
                <div className="mt-6 rounded-2xl border border-rose-500/20 bg-rose-500/8 px-3 py-3">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-rose-300">
                    <Activity className="h-3.5 w-3.5" />
                    Scan Error
                  </div>
                  <p className="mt-2 text-xs leading-5 text-rose-200/90">{result.errorMessage}</p>
                </div>
              )}
            </div>
          </MotionDiv>
        );
      })}
    </MotionDiv>
  );
}
