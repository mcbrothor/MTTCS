import type { Trade } from '@/types';
import { buildTradePositionLifecycle } from '@/lib/finance/core/position-lifecycle';
import { currency, numberText, signedCurrency } from '@/components/dashboard/panels/shared';

function toneClass(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'text-slate-200';
  return value >= 0 ? 'text-emerald-300' : 'text-rose-300';
}

function actionLabel(action: ReturnType<typeof buildTradePositionLifecycle>['events'][number]['action']) {
  switch (action) {
    case 'INITIAL_ENTRY':
      return '초기 진입';
    case 'PYRAMID':
      return '피라미딩';
    case 'PARTIAL_EXIT':
      return '부분 매도';
    case 'FULL_EXIT':
      return '전량 청산';
    case 'MANUAL_EXIT':
      return '수동 청산';
    default:
      return '검토';
  }
}

function actionClasses(action: ReturnType<typeof buildTradePositionLifecycle>['events'][number]['action']) {
  if (action === 'INITIAL_ENTRY' || action === 'PYRAMID') {
    return 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100';
  }
  if (action === 'PARTIAL_EXIT') {
    return 'border-amber-400/25 bg-amber-500/10 text-amber-100';
  }
  return 'border-sky-400/25 bg-sky-500/10 text-sky-100';
}

export default function PositionLifecycleCard({ trade }: { trade: Trade }) {
  const metrics = trade.metrics;
  const lifecycle = buildTradePositionLifecycle(trade);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Position Lifecycle</p>
          <h4 className="mt-1 text-sm font-bold text-white">포지션 흐름과 실시간 손익</h4>
        </div>
        <p className="text-xs text-slate-400">
          진입 {lifecycle.entryCount}회 / 피라미딩 {lifecycle.pyramidCount}회 / 부분 매도 {lifecycle.partialExitCount}회
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Metric label="평균 진입가" value={currency(metrics?.avgEntryPrice, trade.ticker)} />
        <Metric label="현재가" value={currency(metrics?.currentPrice, trade.ticker)} />
        <Metric label="순보유 수량" value={numberText(metrics?.netShares, '주')} />
        <Metric label="평가손익" value={signedCurrency(metrics?.unrealizedPnL, trade.ticker)} accent={toneClass(metrics?.unrealizedPnL)} />
        <Metric label="평가 R" value={typeof metrics?.unrealizedR === 'number' ? `${metrics.unrealizedR.toFixed(2)}R` : '-'} accent={toneClass(metrics?.unrealizedR)} />
        <Metric label="오픈 리스크" value={currency(metrics?.openRisk, trade.ticker)} />
      </div>

      {lifecycle.events.length > 0 ? (
        <div className="mt-5 space-y-3">
          {lifecycle.events.map((event) => (
            <div key={event.id} className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${actionClasses(event.action)}`}>
                    {actionLabel(event.action)}
                  </span>
                  <span className="text-xs font-mono text-slate-500">{event.legLabel}</span>
                  <span className="text-xs text-slate-500">{new Date(event.executedAt).toLocaleDateString('ko-KR')}</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-white">
                  {event.side === 'ENTRY' ? '매수' : '매도'} {numberText(event.shares, '주')} @ {currency(event.price, trade.ticker)}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  체결 후 잔량 {numberText(event.positionAfter, '주')} / 체결 후 평균단가 {currency(event.averageCostAfter, trade.ticker)}
                </p>
              </div>

              <div className="flex flex-wrap gap-3 text-sm lg:justify-end">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">수수료</p>
                  <p className="mt-1 font-mono text-slate-200">{currency(event.fees, trade.ticker)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">실현손익 변화</p>
                  <p className={`mt-1 font-mono ${toneClass(event.realizedPnLDelta)}`}>
                    {signedCurrency(event.realizedPnLDelta, trade.ticker)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-lg border border-dashed border-slate-700 px-4 py-5 text-sm text-slate-500">
          아직 체결 이력이 없습니다. 진입과 부분 매도가 기록되면 포지션 흐름이 여기에 표시됩니다.
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, accent = 'text-white' }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 font-mono font-bold ${accent}`}>{value}</p>
    </div>
  );
}
