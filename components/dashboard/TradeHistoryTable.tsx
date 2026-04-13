'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import StatusBadge from '@/components/ui/StatusBadge';
import Card from '@/components/ui/Card';
import type { EntryTargets, SepaEvidence, Trade, TradeStatus, TrailingStops } from '@/types';

interface TradeHistoryTableProps {
  trades: Trade[];
  limit?: number;
  title?: string;
}

interface EditDraft {
  ticker: string;
  status: TradeStatus;
  total_equity: string;
  planned_risk: string;
  risk_percent: string;
  entry_price: string;
  stoploss_price: string;
  total_shares: string;
  result_amount: string;
  final_discipline: string;
  emotion_note: string;
}

const statusOptions: TradeStatus[] = ['PLANNED', 'COMPLETED', 'CANCELLED'];

const currency = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
    : '-';

const numberText = (value: number | null | undefined, suffix = '') =>
  typeof value === 'number' && Number.isFinite(value) ? `${value.toLocaleString()}${suffix}` : '-';

const toInput = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : '';

const toNumberOrNull = (value: string) => {
  if (value.trim() === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

function getRiskPercent(trade: Trade) {
  if (typeof trade.risk_percent === 'number' && Number.isFinite(trade.risk_percent)) return trade.risk_percent;
  if (trade.total_equity && trade.planned_risk) return trade.planned_risk / trade.total_equity;
  return 0.03;
}

function getEntryTargets(value: EntryTargets | string | null): EntryTargets | null {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as EntryTargets;
  } catch {
    return null;
  }
}

function getTrailingStops(value: TrailingStops | string | null): TrailingStops | null {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as TrailingStops;
  } catch {
    return null;
  }
}

function getSepaEvidence(value: SepaEvidence | string | null): SepaEvidence | null {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as SepaEvidence;
  } catch {
    return null;
  }
}

export default function TradeHistoryTable({ trades, limit, title = '매매 히스토리' }: TradeHistoryTableProps) {
  const [rows, setRows] = useState<Trade[]>(trades);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(trades);
  }, [trades]);

  const visibleRows = useMemo(() => (limit ? rows.slice(0, limit) : rows), [rows, limit]);

  const startEdit = (trade: Trade) => {
    setExpandedId(trade.id);
    setEditingId(trade.id);
    setError(null);
    setDraft({
      ticker: trade.ticker,
      status: trade.status,
      total_equity: toInput(trade.total_equity),
      planned_risk: toInput(trade.planned_risk),
      risk_percent: (getRiskPercent(trade) * 100).toFixed(1).replace('.0', ''),
      entry_price: toInput(trade.entry_price),
      stoploss_price: toInput(trade.stoploss_price),
      total_shares: toInput(trade.total_shares ?? trade.position_size),
      result_amount: toInput(trade.result_amount),
      final_discipline: toInput(trade.final_discipline),
      emotion_note: trade.emotion_note ?? '',
    });
  };

  const updateDraft = (field: keyof EditDraft, value: string) => {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const saveEdit = async (trade: Trade) => {
    if (!draft) return;

    setBusyId(trade.id);
    setError(null);
    try {
      const response = await fetch('/api/trades', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: trade.id,
          ticker: draft.ticker,
          status: draft.status,
          total_equity: toNumberOrNull(draft.total_equity),
          planned_risk: toNumberOrNull(draft.planned_risk),
          risk_percent: Number(draft.risk_percent) / 100,
          entry_price: toNumberOrNull(draft.entry_price),
          stoploss_price: toNumberOrNull(draft.stoploss_price),
          total_shares: toNumberOrNull(draft.total_shares),
          result_amount: toNumberOrNull(draft.result_amount),
          final_discipline: toNumberOrNull(draft.final_discipline),
          emotion_note: draft.emotion_note.trim() || null,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '전략 수정에 실패했습니다.');

      setRows((prev) => prev.map((item) => (item.id === trade.id ? result.data : item)));
      setEditingId(null);
      setDraft(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '전략 수정 중 오류가 발생했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  const deleteTrade = async (trade: Trade) => {
    if (!window.confirm(`${trade.ticker} 매매 전략을 삭제할까요?`)) return;

    setBusyId(trade.id);
    setError(null);
    try {
      const response = await fetch(`/api/trades?id=${encodeURIComponent(trade.id)}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '전략 삭제에 실패했습니다.');

      setRows((prev) => prev.filter((item) => item.id !== trade.id));
      if (expandedId === trade.id) setExpandedId(null);
      if (editingId === trade.id) setEditingId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '전략 삭제 중 오류가 발생했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <p className="mt-1 text-sm text-slate-400">각 행에서 전략 근거를 확인하고 핵심 값을 수정하거나 삭제할 수 있습니다.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm text-slate-300">
          <thead className="border-b border-slate-700 bg-slate-800 text-xs uppercase text-slate-400">
            <tr>
              <th scope="col" className="px-4 py-3">날짜</th>
              <th scope="col" className="px-4 py-3">티커</th>
              <th scope="col" className="px-4 py-3">상태</th>
              <th scope="col" className="px-4 py-3 text-right">SEPA</th>
              <th scope="col" className="px-4 py-3 text-right">허용 손실</th>
              <th scope="col" className="px-4 py-3 text-right">계획 리스크</th>
              <th scope="col" className="px-4 py-3 text-right">손익</th>
              <th scope="col" className="px-4 py-3 text-right">규율</th>
              <th scope="col" className="px-4 py-3 text-right">관리</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  아직 매매 기록이 없습니다.
                </td>
              </tr>
            ) : (
              visibleRows.map((trade) => {
                const sepaPassed = trade.chk_sepa ?? trade.chk_market;
                const riskPct = (getRiskPercent(trade) * 100).toFixed(1).replace('.0', '');
                const isExpanded = expandedId === trade.id;
                const isEditing = editingId === trade.id;

                return (
                  <Fragment key={trade.id}>
                    <tr className="border-b border-slate-800 transition-colors hover:bg-slate-800/50">
                      <td className="whitespace-nowrap px-4 py-3">
                        {new Date(trade.created_at).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-white">{trade.ticker}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={trade.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={sepaPassed ? 'text-emerald-300' : 'text-slate-500'}>
                          {sepaPassed ? 'Pass' : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{riskPct}%</td>
                      <td className="px-4 py-3 text-right font-mono">{currency(trade.planned_risk)}</td>
                      <td className="px-4 py-3 text-right font-mono font-medium">
                        {trade.status === 'COMPLETED' ? (
                          <span className={(trade.result_amount || 0) >= 0 ? 'text-emerald-500' : 'text-coral-red'}>
                            {(trade.result_amount || 0) >= 0 ? '+' : ''}{currency(trade.result_amount || 0)}
                          </span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {trade.status === 'COMPLETED' ? (
                          <span className={`font-bold ${(trade.final_discipline || 0) >= 80 ? 'text-emerald-500' : 'text-orange-400'}`}>
                            {trade.final_discipline}pt
                          </span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <ActionButton onClick={() => setExpandedId(isExpanded ? null : trade.id)}>
                            {isExpanded ? '접기' : '전략 보기'}
                          </ActionButton>
                          <ActionButton onClick={() => startEdit(trade)}>수정</ActionButton>
                          <ActionButton danger onClick={() => deleteTrade(trade)} disabled={busyId === trade.id}>
                            삭제
                          </ActionButton>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-slate-800 bg-slate-950/50">
                        <td colSpan={9} className="px-4 py-5">
                          {isEditing && draft ? (
                            <EditPanel
                              draft={draft}
                              busy={busyId === trade.id}
                              onChange={updateDraft}
                              onCancel={() => {
                                setEditingId(null);
                                setDraft(null);
                              }}
                              onSave={() => saveEdit(trade)}
                            />
                          ) : (
                            <StrategyDetail trade={trade} />
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ActionButton({
  children,
  onClick,
  danger = false,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? 'border-red-500/40 text-red-200 hover:bg-red-500/10'
          : 'border-slate-600 text-slate-200 hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  );
}

function StrategyDetail({ trade }: { trade: Trade }) {
  const targets = getEntryTargets(trade.entry_targets);
  const stops = getTrailingStops(trade.trailing_stops);
  const sepa = getSepaEvidence(trade.sepa_evidence);
  const riskPct = (getRiskPercent(trade) * 100).toFixed(1).replace('.0', '');

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <DetailMetric label="총 자본" value={currency(trade.total_equity)} />
        <DetailMetric label="허용 손실" value={`${riskPct}%`} />
        <DetailMetric label="ATR" value={numberText(trade.atr_value)} />
        <DetailMetric label="진입가" value={currency(trade.entry_price)} />
        <DetailMetric label="초기 손절가" value={currency(trade.stoploss_price)} />
      </div>

      {targets && stops && (
        <div>
          <h4 className="mb-2 text-sm font-bold text-white">피라미딩 계획</h4>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2">단계</th>
                  <th className="py-2 text-right">목표가</th>
                  <th className="py-2 text-right">수량</th>
                  <th className="py-2 text-right">스탑</th>
                </tr>
              </thead>
              <tbody>
                {[targets.e1, targets.e2, targets.e3].map((leg, index) => {
                  const stop = index === 0 ? stops.initial : index === 1 ? stops.afterEntry2 : stops.afterEntry3;
                  return (
                    <tr key={leg.label} className="border-b border-slate-900">
                      <td className="py-2 font-medium text-white">{leg.label}</td>
                      <td className="py-2 text-right font-mono">{currency(leg.price)}</td>
                      <td className="py-2 text-right font-mono">{leg.shares.toLocaleString()}주</td>
                      <td className="py-2 text-right font-mono text-orange-300">{currency(stop)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sepa && (
        <div>
          <h4 className="mb-2 text-sm font-bold text-white">SEPA 판정 근거</h4>
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-lg border border-emerald-500/30 px-2 py-1 text-emerald-300">통과 {sepa.summary.passed}</span>
            <span className="rounded-lg border border-red-500/30 px-2 py-1 text-red-300">실패 {sepa.summary.failed}</span>
            <span className="rounded-lg border border-sky-500/30 px-2 py-1 text-sky-300">정보 {sepa.summary.info}</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {sepa.criteria.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-white">{item.label}</p>
                  <span className={item.status === 'pass' ? 'text-emerald-300' : item.status === 'fail' ? 'text-red-300' : 'text-sky-300'}>
                    {item.status === 'pass' ? 'Pass' : item.status === 'fail' ? 'Fail' : 'Info'}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-slate-400">{item.actual ?? '-'}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {trade.emotion_note && (
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm leading-6 text-slate-300">
          {trade.emotion_note}
        </div>
      )}
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-mono font-bold text-white">{value}</p>
    </div>
  );
}

function EditPanel({
  draft,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  draft: EditDraft;
  busy: boolean;
  onChange: (field: keyof EditDraft, value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <TextInput label="티커" value={draft.ticker} onChange={(value) => onChange('ticker', value.toUpperCase())} />
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-400">상태</span>
          <select
            value={draft.status}
            onChange={(event) => onChange('status', event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <TextInput label="허용 손실 %" type="number" min="0.1" max="10" step="0.1" value={draft.risk_percent} onChange={(value) => onChange('risk_percent', value)} />
        <TextInput label="총 자본" type="number" value={draft.total_equity} onChange={(value) => onChange('total_equity', value)} />
        <TextInput label="계획 리스크" type="number" value={draft.planned_risk} onChange={(value) => onChange('planned_risk', value)} />
        <TextInput label="총 수량" type="number" value={draft.total_shares} onChange={(value) => onChange('total_shares', value)} />
        <TextInput label="진입가" type="number" value={draft.entry_price} onChange={(value) => onChange('entry_price', value)} />
        <TextInput label="손절가" type="number" value={draft.stoploss_price} onChange={(value) => onChange('stoploss_price', value)} />
        <TextInput label="실현 손익" type="number" value={draft.result_amount} onChange={(value) => onChange('result_amount', value)} />
        <TextInput label="규율 점수" type="number" min="0" max="100" value={draft.final_discipline} onChange={(value) => onChange('final_discipline', value)} />
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-slate-400">메모</span>
        <textarea
          value={draft.emotion_note}
          onChange={(event) => onChange('emotion_note', event.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
        />
      </label>

      <div className="flex justify-end gap-2">
        <ActionButton onClick={onCancel} disabled={busy}>취소</ActionButton>
        <ActionButton onClick={onSave} disabled={busy}>{busy ? '저장 중...' : '저장'}</ActionButton>
      </div>
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = 'text',
  min,
  max,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  max?: string;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-400">{label}</span>
      <input
        type={type}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
      />
    </label>
  );
}
