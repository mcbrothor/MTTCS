'use client';

import { Activity, ArrowUpRight, CalendarDays, ExternalLink, Info, Star, TrendingUp, Waves, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import type { ScannerResult } from '@/types';
import Button from '@/components/ui/Button';
import { getVolumeSignalTier } from '@/lib/scanner-recommendation';

interface VcpDrilldownModalProps {
  result: ScannerResult | null;
  onClose: () => void;
  onAddToWatchlist: (item: ScannerResult) => Promise<void>;
  isSavingWatchlist: boolean;
}

const GRADE_THEMES = {
  strong: { border: 'border-emerald-500/50', bg: 'bg-emerald-500/10', text: 'text-emerald-300', accent: 'bg-emerald-500' },
  forming: { border: 'border-blue-500/50', bg: 'bg-blue-500/10', text: 'text-blue-300', accent: 'bg-blue-500' },
  weak: { border: 'border-amber-500/50', bg: 'bg-amber-500/10', text: 'text-amber-300', accent: 'bg-amber-500' },
  none: { border: 'border-slate-700', bg: 'bg-slate-800/50', text: 'text-slate-400', accent: 'bg-slate-600' },
};

function pct(value: number | null | undefined) {
  return typeof value === 'number' ? `${value > 0 ? '+' : ''}${value}%` : '-';
}

function valueOrDash(value: number | null | undefined) {
  return typeof value === 'number' ? value.toLocaleString() : '-';
}

export default function VcpDrilldownModal({
  result,
  onClose,
  onAddToWatchlist,
  isSavingWatchlist,
}: VcpDrilldownModalProps) {
  if (!result) return null;

  const theme = GRADE_THEMES[result.vcpGrade || 'none'];
  const metrics = [
    { label: 'Contraction', score: result.contractionScore, icon: <Waves className="h-4 w-4" /> },
    { label: 'Volume Dry-up', score: result.volumeDryUpScore, icon: <Activity className="h-4 w-4" /> },
    { label: 'BB Squeeze', score: result.bbSqueezeScore, icon: <TrendingUp className="h-4 w-4" /> },
    { label: 'Pocket Pivot', score: result.pocketPivotScore, icon: <ArrowUpRight className="h-4 w-4" /> },
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-3xl overflow-hidden rounded-lg border border-slate-800 bg-slate-900 shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-slate-800 p-6">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-2xl font-black tracking-tight text-white">{result.ticker}</h3>
                <span className={`rounded-lg border px-2.5 py-1 text-xs font-bold uppercase ${theme.border} ${theme.bg} ${theme.text}`}>
                  {result.baseType || `VCP ${result.vcpGrade?.toUpperCase() || 'NONE'}`}
                </span>
                <span className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-bold text-slate-300">
                  RS {result.rsRating ?? '-'}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-slate-400">{result.name} · {result.exchange}</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="max-h-[70vh] space-y-8 overflow-y-auto p-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatItem label="VCP Score" value={`${result.vcpScore ?? 0}`} highlight />
              <StatItem label="Pivot Gap" value={pct(result.distanceToPivotPct)} />
              <StatItem label="Base Type" value={result.baseType || '-'} />
              <StatItem label="Volume Signal" value={getVolumeSignalTier(result)} />
            </div>

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <InfoTile label="RS Rank" value={result.rsRank && result.rsUniverseSize ? `${result.rsRank}/${result.rsUniverseSize}` : '-'} />
              <InfoTile label="Weighted Momentum" value={pct(result.weightedMomentumScore)} />
              <InfoTile label="RS Line" value={result.rsLineNewHigh ? 'New high' : result.rsLineNearHigh ? 'Near high' : '-'} />
              <InfoTile label="Tennis Ball" value={`${result.tennisBallCount ?? 0} (${result.tennisBallScore ?? 0})`} />
              <InfoTile label="8W Return" value={pct(result.eightWeekReturnPct)} />
              <InfoTile label="MA50 Gap" value={pct(result.distanceFromMa50Pct)} />
              <InfoTile label="52W Low Advance" value={pct(result.low52WeekAdvancePct)} />
              <InfoTile label="Branch" value={result.momentumBranch || '-'} />
            </section>

            {result.highTightFlag && (
              <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-300">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  <span>High Tight Flag</span>
                </div>
                <div className="grid gap-3 text-xs sm:grid-cols-3">
                  <InfoTile label="Passed" value={result.highTightFlag.passed ? 'Yes' : 'No'} />
                  <InfoTile label="Base Days" value={`${result.highTightFlag.baseDays}`} />
                  <InfoTile label="Drawdown" value={pct(result.highTightFlag.maxDrawdownPct)} />
                  <InfoTile label="Right Volume" value={result.highTightFlag.rightSideVolumeRatio === null ? '-' : `${result.highTightFlag.rightSideVolumeRatio}x`} />
                  <InfoTile label="Tightness" value={`${result.highTightFlag.tightnessScore}/100`} />
                  <InfoTile label="Stop" value={valueOrDash(result.highTightFlag.stopPrice)} />
                </div>
                <ul className="mt-3 space-y-1 text-xs text-slate-400">
                  {result.highTightFlag.stopPlan.map((item) => <li key={item}>- {item}</li>)}
                </ul>
              </section>
            )}

            <section className="space-y-4">
              <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">Technical Scores</h4>
              <div className="grid gap-5">
                {metrics.map((metric) => (
                  <div key={metric.label} className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <div className="flex items-center gap-2 text-slate-300">
                        {metric.icon}
                        <span>{metric.label}</span>
                      </div>
                      <span className={theme.text}>{metric.score ?? 0} / 100</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${metric.score ?? 0}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className={`h-full ${theme.accent}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-300">
                <Activity className="h-4 w-4 text-emerald-400" />
                <span>Analysis Log</span>
              </div>
              <ul className="grid gap-2 text-sm leading-relaxed text-slate-400">
                {result.vcpDetails?.map((detail, index) => (
                  <li key={`${detail}-${index}`} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-700" />
                    {detail}
                  </li>
                )) || <li className="italic text-slate-600">No analysis details.</li>}
              </ul>
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-500">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span>Entry Reference</span>
                </div>
                <p className="text-sm leading-6 text-slate-300">
                  Entry {valueOrDash(result.recommendedEntry)} · Pivot {valueOrDash(result.pivotPrice)} · Current {valueOrDash(result.currentPrice)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-500">
                  <CalendarDays className="h-3.5 w-3.5" />
                  <span>Data</span>
                </div>
                <div className="space-y-1 text-xs text-slate-500">
                  <p>Analyzed: {result.analyzedAt ? new Date(result.analyzedAt).toLocaleString() : '-'}</p>
                  <p>Source: {result.priceSource}</p>
                  <p className="flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    RS is an MTN proxy, not the official IBD/MarketSmith rating.
                  </p>
                </div>
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-800 bg-slate-900/80 p-6 sm:flex-row">
            <Link
              href={`/plan?ticker=${encodeURIComponent(result.ticker)}&exchange=${encodeURIComponent(result.exchange)}`}
              className="flex-1"
            >
              <Button className="w-full gap-2 py-6 text-base font-bold">
                <ExternalLink className="h-5 w-5" />
                Create Plan
              </Button>
            </Link>
            <Button
              variant="outline"
              onClick={() => onAddToWatchlist(result)}
              disabled={isSavingWatchlist}
              className="gap-2 py-6 text-base font-bold sm:w-auto sm:px-8"
            >
              <Star className={`h-5 w-5 ${isSavingWatchlist ? 'animate-pulse' : ''}`} />
              {isSavingWatchlist ? 'Saving...' : 'Add Watchlist'}
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function StatItem({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 truncate font-mono text-lg font-black ${highlight ? 'text-emerald-400' : 'text-white'}`}>
        {value}
      </p>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-200">{value}</p>
    </div>
  );
}
