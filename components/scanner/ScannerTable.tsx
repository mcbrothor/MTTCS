import { Check, Plus } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { getVolumeSignalTier, type VolumeSignalTier } from '@/lib/scanner-recommendation';
import type { ScannerResult, RecommendationTier } from '@/types';

function formatMarketCap(value: number | null, currency: ScannerResult['currency']) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  if (currency === 'KRW') {
    const jo = value / 1_000_000_000_000;
    if (jo >= 1) return `${jo.toFixed(2)}조원`;
    const eok = Math.round(value / 100_000_000);
    return `${eok.toLocaleString('ko-KR')}억`;
  }
  if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  return `$${(value / 1_000_000_000).toFixed(1)}B`;
}

function formatPrice(value: number | null, currency: ScannerResult['currency']) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat(currency === 'KRW' ? 'ko-KR' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'KRW' ? 0 : 2,
  }).format(value);
}

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

function volumeSignalDetail(result: ScannerResult) {
  const dryUp = result.volumeDryUpScore ?? '-';
  const pocket = result.pocketPivotScore ?? '-';
  const breakout = result.breakoutVolumeStatus || 'unknown';
  return `DU ${dryUp} / PP ${pocket} / ${breakout}`;
}

interface ScannerTableProps {
  results: ScannerResult[];
  selectedTickers: Set<string>;
  onToggleSelect: (ticker: string) => void;
  onRowClick: (result: ScannerResult) => void;
}

export default function ScannerTable({
  results,
  selectedTickers,
  onToggleSelect,
  onRowClick,
}: ScannerTableProps) {
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
    <div className="overflow-hidden rounded-lg border border-slate-800">
      <table className="w-full table-fixed divide-y divide-slate-800 text-xs">
        <colgroup>
          <col className="w-[4%]" />
          <col className="w-[17%]" />
          <col className="w-[8%]" />
          <col className="w-[8%]" />
          <col className="w-[7%]" />
          <col className="w-[9%]" />
          <col className="w-[6%]" />
          <col className="w-[9%]" />
          <col className="w-[9%]" />
          <col className="w-[10%]" />
          <col className="w-[7%]" />
          <col className="w-[6%]" />
        </colgroup>
        <thead className="bg-slate-950 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-2 py-3 text-left">#</th>
            <th className="px-2 py-3 text-left">종목</th>
            <th className="px-2 py-3 text-right">시총</th>
            <th className="px-2 py-3 text-right">현재가</th>
            <th className="px-2 py-3 text-left">SEPA</th>
            <th className="px-2 py-3 text-left">추천 등급</th>
            <th className="px-2 py-3 text-right">VCP</th>
            <th className="px-2 py-3 text-left">상대강도</th>
            <th className="px-2 py-3 text-left">패턴</th>
            <th className="px-2 py-3 text-left">거래량</th>
            <th className="px-2 py-3 text-right">피벗</th>
            <th className="px-2 py-3 text-center">후보</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 bg-slate-950/40">
          {results.map((result) => {
            const volumeTier = getVolumeSignalTier(result);
            return (
              <tr
                key={result.ticker}
                onClick={() => result.status === 'done' && onRowClick(result)}
                className={`cursor-pointer transition-colors hover:bg-slate-900 ${selectedTickers.has(result.ticker) ? 'bg-emerald-500/5' : ''}`}
              >
                <td className="px-2 py-3 font-mono text-slate-400">{result.rank}</td>
                <td className="px-2 py-3">
                  <p className="truncate font-mono font-bold text-white">{result.ticker}</p>
                  <p className="truncate text-[11px] text-slate-500">{result.name}</p>
                </td>
                <td className="px-2 py-3 text-right font-mono text-slate-300">{formatMarketCap(result.marketCap, result.currency)}</td>
                <td className="px-2 py-3 text-right font-mono text-slate-300">{formatPrice(result.currentPrice, result.currency)}</td>
                <td className="px-2 py-3">
                  <span className="text-slate-300">{sepaLabel(result)}</span>
                  {result.sepaMissingCount !== null && <p className="text-[10px] text-slate-500">미충족 {result.sepaMissingCount}</p>}
                </td>
                <td className="px-2 py-3">{tierBadge(result)}</td>
                <td className="px-2 py-3 text-right font-mono text-slate-300">
                  {result.status === 'running' ? <LoadingSpinner className="ml-auto h-3 w-3" /> : result.vcpScore ?? '-'}
                </td>
                <td className="px-2 py-3 font-mono text-slate-200">{formatRs(result)}</td>
                <td className="px-2 py-3 text-[11px] text-slate-300">
                  <p className="truncate">{baseTypeLabel(result)}</p>
                  {result.momentumBranch === 'EXTENDED' && <p className="text-[10px] text-amber-300">확장</p>}
                </td>
                <td className="px-2 py-3">
                  <span className={`inline-flex rounded-lg border px-2 py-1 text-[11px] font-bold ${volumeSignalClass(volumeTier)}`}>
                    {volumeTier}
                  </span>
                  <p className="mt-1 truncate text-[10px] text-slate-500">{volumeSignalDetail(result)}</p>
                </td>
                <td className="px-2 py-3 text-right font-mono text-slate-300">
                  {result.distanceToPivotPct !== null ? `${result.distanceToPivotPct > 0 ? '+' : ''}${result.distanceToPivotPct}%` : '-'}
                </td>
                <td className="px-2 py-3 text-center">{selectionColumn(result)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
