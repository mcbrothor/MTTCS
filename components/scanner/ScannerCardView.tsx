import { Check, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { getVolumeSignalTier, isContestPoolTier, type VolumeSignalTier } from '@/lib/scanner-recommendation';
import type { ScannerResult, RecommendationTier } from '@/types';

function tierClass(tier: RecommendationTier) {
  if (tier === 'Recommended') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (tier === 'Partial') return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  if (tier === 'Error') return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
  return 'border-slate-700 bg-slate-900 text-slate-300';
}

function sepaLabel(result: ScannerResult) {
  if (result.status === 'error') return 'Error';
  if (result.status !== 'done') return 'Pending';
  if (result.sepaStatus === 'pass') return 'Pass';
  if ((result.sepaMissingCount ?? 99) <= 2) return 'Partial';
  return 'Weak';
}

function baseTypeLabel(result: ScannerResult) {
  if (result.baseType === 'High_Tight_Flag') return 'HTF';
  if (result.baseType === 'Standard_VCP') return 'Standard';
  if (result.momentumBranch === 'EXTENDED') return 'Extended';
  return '-';
}

function formatRs(result: ScannerResult) {
  if (typeof result.rsRating !== 'number') return '-';
  const rank = result.rsRank && result.rsUniverseSize ? ` #${result.rsRank}/${result.rsUniverseSize}` : '';
  return `${result.rsRating}${rank}`;
}

function volumeSignalClass(tier: VolumeSignalTier) {
  if (tier === 'Strong') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (tier === 'Watch') return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  if (tier === 'Weak') return 'border-slate-700 bg-slate-900 text-slate-300';
  return 'border-slate-800 bg-slate-950 text-slate-500';
}

interface ScannerCardViewProps {
  results: ScannerResult[];
  selectedTickers: Set<string>;
  onToggleSelect: (ticker: string) => void;
  onCardClick: (result: ScannerResult) => void;
}

export default function ScannerCardView({
  results,
  selectedTickers,
  onToggleSelect,
  onCardClick,
}: ScannerCardViewProps) {
  const selectionColumn = (result: ScannerResult) => (
    <button
      type="button"
      disabled={result.status !== 'done'}
      onClick={(event) => {
        event.stopPropagation();
        onToggleSelect(result.ticker);
      }}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition-all ${
        selectedTickers.has(result.ticker)
          ? 'border-rose-500 bg-rose-500 text-white shadow-lg shadow-rose-500/20'
          : 'border-slate-800 text-slate-500 hover:border-rose-500/50 hover:text-rose-400'
      } disabled:opacity-20`}
    >
      {selectedTickers.has(result.ticker) ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
    </button>
  );

  const tierBadge = (result: ScannerResult) => (
    <span className={`inline-flex rounded-lg border px-2 py-1 text-xs font-bold ${tierClass(result.recommendationTier)}`}>
      {result.recommendationTier}
    </span>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {results.map((result) => (
        <motion.div
          key={result.ticker}
          layout
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ scale: 1.02 }}
          onClick={() => result.status === 'done' && onCardClick(result)}
          className={`group relative cursor-pointer rounded-lg border p-4 transition-all ${
            isContestPoolTier(result.recommendationTier)
              ? 'border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50'
              : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
          } ${selectedTickers.has(result.ticker) ? 'ring-2 ring-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.2)]' : ''}`}
        >
          {result.status === 'done' && (
            <div className="absolute -left-2 -top-2 z-10">
              {selectionColumn(result)}
            </div>
          )}

          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-mono font-bold text-white">{result.ticker}</h3>
              <p className="truncate text-xs text-slate-500">{result.name}</p>
            </div>
            {tierBadge(result)}
          </div>

          {result.status === 'done' && (
            <div className="space-y-2">
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">SEPA</span>
                <span className="text-slate-300">{sepaLabel(result)}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">VCP</span>
                <span className="text-slate-300">{result.vcpGrade} ({result.vcpScore ?? '-'})</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">RS / Base</span>
                <span className="text-slate-300">{formatRs(result)} / {baseTypeLabel(result)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[10px]">
                <span className="text-slate-500">거래량</span>
                <span className={`rounded-lg border px-2 py-0.5 font-semibold ${volumeSignalClass(getVolumeSignalTier(result))}`}>
                  {getVolumeSignalTier(result)}
                </span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">피벗 거리</span>
                <span className={Math.abs(result.distanceToPivotPct || 0) <= 5 ? 'font-bold text-emerald-400' : 'text-slate-300'}>
                  {result.distanceToPivotPct !== null ? `${result.distanceToPivotPct > 0 ? '+' : ''}${result.distanceToPivotPct}%` : '-'}
                </span>
              </div>
              <p className="line-clamp-2 text-[10px] text-slate-500">{result.recommendationReason}</p>
            </div>
          )}

          {result.status === 'running' && (
            <div className="flex items-center gap-2 text-xs text-emerald-300">
              <LoadingSpinner className="h-3 w-3" /> KIS/Yahoo 데이터 분석 중
            </div>
          )}

          {result.status === 'error' && (
            <p className="truncate text-[10px] text-red-400">{result.errorMessage}</p>
          )}
        </motion.div>
      ))}
    </div>
  );
}
