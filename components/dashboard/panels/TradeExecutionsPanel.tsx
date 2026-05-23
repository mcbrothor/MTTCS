import { useState } from 'react';
import type { Trade, TradeExecution, TradeLegLabel } from '@/types';
import { ExecutionDraft, currency, numberText, signedCurrency, dateInputValue, getEntryTargets } from './shared';
import { Trash2 } from 'lucide-react';
import PositionLifecycleCard from '@/components/plan/PositionLifecycleCard';

export function DetailMetric({ 
  label, 
  value, 
  highlight = false,
  color = 'slate'
}: { 
  label: string; 
  value: string;
  highlight?: boolean;
  color?: 'slate' | 'emerald' | 'coral' | 'sky';
}) {
  const colorClasses = {
    slate: 'border-slate-800 bg-slate-950',
    emerald: 'border-emerald-500/20 bg-emerald-500/5',
    coral: 'border-coral-red/20 bg-coral-red/5',
    sky: 'border-sky-500/20 bg-sky-500/5',
  };

  const textClasses = {
    slate: 'text-white',
    emerald: 'text-emerald-400',
    coral: 'text-coral-red',
    sky: 'text-sky-400',
  };

  return (
    <div className={`rounded-lg border p-3 transition-all ${colorClasses[color]} ${highlight ? 'ring-1 ring-emerald-500/30' : ''}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 font-mono font-bold ${textClasses[color]}`}>{value}</p>
    </div>
  );
}

function ExecutionForm({ trade, busy, onSave }: { trade: Trade; busy: boolean; onSave: (draft: ExecutionDraft) => void }) {
  const targets = getEntryTargets(trade.entry_targets);
  const [draft, setDraft] = useState<ExecutionDraft>({
    side: 'ENTRY',
    leg_label: 'E1',
    executed_at: dateInputValue(),
    price: '',
    shares: '',
    fees: '0',
    note: '',
  });

  const fillLeg = (leg: TradeLegLabel) => {
    if (!targets || leg === 'MANUAL') return;
    const target = leg === 'E1' ? targets.e1 : leg === 'E2' ? targets.e2 : targets.e3;
    setDraft((prev) => ({
      ...prev,
      side: 'ENTRY',
      leg_label: leg,
      price: String(target.price),
      shares: target.shares > 0 ? String(target.shares) : '',
    }));
  };

  const fillFullExit = () => {
    setDraft((prev) => ({
      ...prev,
      side: 'EXIT',
      leg_label: 'MANUAL',
      shares: String(trade.metrics?.netShares || ''),
      price: '',
    }));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSave(draft);
    setDraft({
      side: draft.side,
      leg_label: draft.side === 'ENTRY' ? 'E1' : 'MANUAL',
      executed_at: dateInputValue(),
      price: '',
      shares: '',
      fees: '0',
      note: '',
    });
  };

  return (
    <form onSubmit={submit} className="rounded-lg border border-slate-800 bg-slate-950 p-4">
      <div className="mb-3 flex flex-wrap gap-2">
        {(['E1', 'E2', 'E3'] as TradeLegLabel[]).map((leg) => (
          <button
            key={leg}
            type="button"
            disabled={!targets || busy}
            onClick={() => fillLeg(leg)}
            className="rounded-lg border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {leg} 계획 불러오기
          </button>
        ))}
        <button
          type="button"
          disabled={busy || !trade.metrics?.netShares}
          onClick={fillFullExit}
          className="rounded-lg border border-sky-500/30 px-3 py-1.5 text-xs font-semibold text-sky-200 transition-colors hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          전량 매도 불러오기
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-7">
        <label className="block md:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-slate-400">일자</span>
          <input
            type="date"
            required
            value={draft.executed_at}
            onChange={(e) => setDraft({ ...draft, executed_at: e.target.value })}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-400">명시적 단계</span>
          <select
            value={draft.leg_label}
            onChange={(e) => setDraft({ ...draft, leg_label: e.target.value as TradeLegLabel })}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            <option value="E1">E1</option>
            <option value="E2">E2</option>
            <option value="E3">E3</option>
            <option value="MANUAL">수동</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-400">종류</span>
          <select
            value={draft.side}
            onChange={(e) => setDraft({ ...draft, side: e.target.value as 'ENTRY' | 'EXIT', leg_label: e.target.value === 'EXIT' ? 'MANUAL' : 'E1' })}
            className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold ${draft.side === 'ENTRY' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : 'border-sky-500/50 bg-sky-500/10 text-sky-300'}`}
          >
            <option value="ENTRY">매수</option>
            <option value="EXIT">매도</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-400">수량 (주)</span>
          <input
            type="number"
            min="1"
            required
            value={draft.shares}
            onChange={(e) => setDraft({ ...draft, shares: e.target.value })}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-400">가격</span>
          <input
            type="number"
            min="0"
            step="any"
            required
            value={draft.price}
            onChange={(e) => setDraft({ ...draft, price: e.target.value })}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="mt-5 rounded-lg border border-emerald-500 bg-emerald-600 px-4 py-2 text-sm font-semibold tracking-wide text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
        >
          + 추가
        </button>
      </div>
    </form>
  );
}

export function ExecutionsPanel({
  trade,
  busy,
  onSave,
  onDelete,
}: {
  trade: Trade;
  busy: boolean;
  onSave: (draft: ExecutionDraft) => void;
  onDelete: (execution: TradeExecution) => void;
}) {
  const metrics = trade.metrics;
  const executions = [...(trade.executions || [])].sort((a, b) => a.executed_at.localeCompare(b.executed_at));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <DetailMetric label="평균 진입가" value={currency(metrics?.avgEntryPrice, trade.ticker)} />
        <DetailMetric label="현재가" value={currency(metrics?.currentPrice, trade.ticker)} highlight={!!metrics?.currentPrice} />
        <DetailMetric label="순보유" value={numberText(metrics?.netShares, '주')} />
        <DetailMetric 
          label="미실현 손익" 
          value={signedCurrency(metrics?.unrealizedPnL, trade.ticker)}
          color={metrics?.unrealizedPnL && metrics.unrealizedPnL >= 0 ? 'emerald' : 'coral'}
        />
        <DetailMetric 
          label="미실현 R" 
          value={typeof metrics?.unrealizedR === 'number' ? `${metrics.unrealizedR.toFixed(2)}R` : '-'}
          color={metrics?.unrealizedR && metrics.unrealizedR >= 0 ? 'emerald' : 'coral'}
        />
      </div>

      <PositionLifecycleCard trade={trade} />

      <ExecutionForm trade={trade} busy={busy} onSave={onSave} />

      {executions.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-5 text-center text-sm text-slate-500">
          첫 진입 체결을 기록하면 평균 진입가, 순보유 수량, 현재 R이 자동 계산됩니다.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">일자</th>
                <th className="py-2">구분</th>
                <th className="py-2">단계</th>
                <th className="py-2 text-right">가격</th>
                <th className="py-2 text-right">수량</th>
                <th className="py-2 text-right">수수료</th>
                <th className="py-2">메모</th>
                <th className="py-2 text-right">삭제</th>
              </tr>
            </thead>
            <tbody>
              {executions.map((execution) => (
                <tr key={execution.id} className="border-b border-slate-900">
                  <td className="py-2">{new Date(execution.executed_at).toLocaleDateString('ko-KR')}</td>
                  <td className={execution.side === 'ENTRY' ? 'py-2 text-emerald-300' : 'py-2 text-sky-300'}>
                    {execution.side === 'ENTRY' ? '진입' : '청산'}
                  </td>
                  <td className="py-2 font-mono">{execution.leg_label}</td>
                  <td className="py-2 text-right font-mono">{currency(execution.price, trade.ticker)}</td>
                  <td className="py-2 text-right font-mono">{execution.shares.toLocaleString()}주</td>
                  <td className="py-2 text-right font-mono">{currency(execution.fees, trade.ticker)}</td>
                  <td className="py-2 text-slate-400">{execution.note || '-'}</td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onDelete(execution)}
                      className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-red-500/20 hover:text-red-400 disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
