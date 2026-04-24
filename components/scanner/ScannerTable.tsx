import { Check, Plus } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import TradingViewWidget from '@/components/ui/TradingViewWidget';
import { getVolumeSignalTier, type VolumeSignalTier } from '@/lib/scanner-recommendation';
import type { ScannerResult, RecommendationTier } from '@/types';

function formatMarketCap(value: number | null, currency: ScannerResult['currency'], ticker: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  
  const isKorean = currency === 'KRW' || /^\d{6}$/.test(ticker);
  
  if (isKorean) {
    const jo = value / 1_000_000_000_000;
    if (jo >= 1) return `₩${jo.toFixed(2)}조`;
    const eok = Math.round(value / 100_000_000);
    return `₩${eok.toLocaleString('ko-KR')}억`;
  }
  
  if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  return `$${(value / 1_000_000_000).toFixed(1)}B`;
}

function formatPrice(value: number | null, currency: ScannerResult['currency'], ticker: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  const isKorean = currency === 'KRW' || /^\d{6}$/.test(ticker);
  
  return new Intl.NumberFormat(isKorean ? 'ko-KR' : 'en-US', {
    style: 'currency',
    currency: isKorean ? 'KRW' : 'USD',
    maximumFractionDigits: isKorean ? 0 : 2,
  }).format(value);
}

function tierClass(tier: RecommendationTier) {
  if (tier === 'Recommended') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (tier === 'Partial') return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  if (tier === 'Error') return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
  return 'border-slate-700 bg-slate-900 text-slate-300';
}

function sepaLabel(result: ScannerResult) {
  const corePassed = result.sepaEvidence?.summary.corePassed;
  const coreTotal = result.sepaEvidence?.summary.coreTotal ?? 7;
  if (result.status === 'error') return 'Error';
  if (result.status !== 'done') return 'Pending';
  if (result.sepaStatus === 'pass' && corePassed === coreTotal) return 'Pass';
  if (typeof corePassed === 'number' && corePassed >= coreTotal - 1) return 'Partial';
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

function RsSourceBadge({ source }: { source: ScannerResult['rsSource'] }) {
  if (source === 'DB_BATCH') return <span className="ml-1 rounded px-1 py-0.5 text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">DB</span>;
  if (source === 'BENCHMARK_PROXY') return <span className="ml-1 rounded px-1 py-0.5 text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">Proxy</span>;
  if (source === 'UNIVERSE') return <span className="ml-1 rounded px-1 py-0.5 text-[9px] font-bold bg-slate-700/60 text-slate-400 border border-slate-600/40">Rank</span>;
  return null;
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
          <col className="w-[3%]" />
          <col className="w-[13%]" />
          <col className="w-[7%]" />
          <col className="w-[7%]" />
          <col className="w-[5%]" />
          <col className="w-[8%]" />
          <col className="w-[5%]" />
          <col className="w-[8%]" />
          <col className="w-[7%]" />
          <col className="w-[9%]" />
          <col className="w-[6%]" />
          {/* 새 컬럼: RS신고가, PP점수, 차트 */}
          <col className="w-[6%]" />
          <col className="w-[5%]" />
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
            {/* 신규: RS신고가·PP는 드릴다운 없이 테이블에서 바로 확인 */}
            <th className="px-2 py-3 text-center" title="RS Line 신고가 여부">RS↑</th>
            <th className="px-2 py-3 text-right" title="Pocket Pivot Score">PP</th>
            <th className="px-2 py-3 text-center">차트/후보</th>
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
                <td className="px-2 py-3 text-right font-mono text-slate-300">{formatMarketCap(result.marketCap, result.currency, result.ticker)}</td>
                <td className="px-2 py-3 text-right font-mono text-slate-300">{formatPrice(result.currentPrice, result.currency, result.ticker)}</td>
                <td className="px-2 py-3">
                  <span className="text-slate-300">{sepaLabel(result)}</span>
                  {result.sepaEvidence?.summary.corePassed !== undefined && (
                    <p className="text-[10px] text-slate-500">
                      Core {result.sepaEvidence.summary.corePassed}/{result.sepaEvidence.summary.coreTotal}
                    </p>
                  )}
                </td>
                <td className="px-2 py-3">{tierBadge(result)}</td>
                <td className="px-2 py-3 text-right font-mono text-slate-300">
                  {result.status === 'running' ? <LoadingSpinner className="ml-auto h-3 w-3" /> : result.vcpScore ?? '-'}
                </td>
                <td className="px-2 py-3 font-mono text-slate-200">
                  <span className="flex items-center">
                    {formatRs(result)}
                    <RsSourceBadge source={result.rsSource} />
                  </span>
                </td>
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
                {/* RS Line 신고가 — 이미 계산된 데이터를 테이블에 표시 */}
                <td className="px-2 py-3 text-center">
                  {result.rsLineNewHigh === true ? (
                    <span title="RS Line 신고가" className="text-emerald-400 text-sm">✦</span>
                  ) : result.rsLineNearHigh === true ? (
                    <span title="RS Line 신고가 근접" className="text-amber-400 text-sm">△</span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
                {/* Pocket Pivot Score — 이미 계산된 데이터를 테이블에 표시 */}
                <td className="px-2 py-3 text-right font-mono">
                  {typeof result.pocketPivotScore === 'number' ? (
                    <span className={result.pocketPivotScore >= 50 ? 'text-emerald-400' : 'text-slate-400'}>
                      {result.pocketPivotScore}
                    </span>
                  ) : <span className="text-slate-600">—</span>}
                </td>
                {/* 차트 버튼 + 콘테스트 후보 선택 버튼 */}
                <td className="px-2 py-3">
                  <div className="flex items-center justify-center gap-1">
                    <TradingViewWidget 
                      ticker={result.ticker} 
                      exchange={result.exchange ?? 'NAS'} 
                      pivotPrice={result.pivotPrice}
                      stopLossPrice={(result as any).canslimResult?.stopLossPrice}
                      variant="icon" 
                    />
                    {selectionColumn(result)}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
