'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import StatusBadge from '@/components/ui/StatusBadge';
import Card from '@/components/ui/Card';
import axios from 'axios';
import { Star, Trash2, TrendingUp } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type {
  EntryTargets,
  SepaEvidence,
  Trade,
  TradeExecution,
  TradeExecutionSide,
  TradeLegLabel,
  TradeStatus,
  TrailingStops,
} from '@/types';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

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
  plan_note: string;
  invalidation_note: string;
}

interface ExecutionDraft {
  side: TradeExecutionSide;
  leg_label: TradeLegLabel;
  executed_at: string;
  price: string;
  shares: string;
  fees: string;
  note: string;
}

interface ReviewDraft {
  final_discipline: string;
  setup_tags: string[];
  mistake_tags: string[];
  review_note: string;
  review_action: string;
}

type DetailTab = 'plan' | 'executions' | 'review';
type SecurityNameMap = Record<string, string | null>;

interface SecurityLookupResponse {
  name: string | null;
}

const statusOptions: TradeStatus[] = ['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'];
const setupTagOptions = ['VCP', 'SEPA', '돌파', '실적', '추세', '관심종목'];
const mistakeTagOptions = ['추격매수', '손절지연', '비중초과', '조기매도', '계획미준수', '진입지연'];

const isKorean = (ticker?: string) => ticker && /^\d{6}$/.test(ticker);

const currency = (value: number | null | undefined, ticker?: string) =>
  typeof value === 'number' && Number.isFinite(value)
    ? isKorean(ticker)
      ? new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(Math.round(value))
      : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
    : '-';

const numberText = (value: number | null | undefined, suffix = '') =>
  typeof value === 'number' && Number.isFinite(value) ? `${value.toLocaleString()}${suffix}` : '-';

const signedCurrency = (value: number | null | undefined, ticker?: string) =>
  typeof value === 'number' && Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${currency(value, ticker)}` : '-';

const dateInputValue = (date?: string | null) => {
  const source = date ? new Date(date) : new Date();
  return Number.isNaN(source.getTime()) ? new Date().toISOString().slice(0, 10) : source.toISOString().slice(0, 10);
};

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
  const [securityNames, setSecurityNames] = useState<SecurityNameMap>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTabs, setActiveTabs] = useState<Record<string, DetailTab>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setRows(trades);
  }, [trades]);

  const visibleRows = useMemo(() => (limit ? rows.slice(0, limit) : rows), [rows, limit]);

  useEffect(() => {
    const tickers = Array.from(new Set(visibleRows.map((trade) => trade.ticker).filter(Boolean)));
    const missing = tickers.filter((ticker) => securityNames[ticker] === undefined);
    if (missing.length === 0) return;

    let cancelled = false;

    Promise.allSettled(
      missing.map(async (ticker) => {
        const exchange = isKorean(ticker) ? 'KOSPI' : 'NAS';
        const response = await axios.get<SecurityLookupResponse>('/api/security-lookup', {
          params: { ticker, exchange },
        });
        return { ticker, name: response.data.name };
      })
    ).then((results) => {
      if (cancelled) return;

      setSecurityNames((prev) => {
        const next = { ...prev };
        for (let index = 0; index < results.length; index += 1) {
          const result = results[index];
          const ticker = missing[index];
          next[ticker] = result.status === 'fulfilled' ? result.value.name : null;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [securityNames, visibleRows]);

  const replaceRow = (trade: Trade) => {
    setRows((prev) => prev.map((item) => (item.id === trade.id ? trade : item)));
  };

  const setTab = (tradeId: string, tab: DetailTab) => {
    setActiveTabs((prev) => ({ ...prev, [tradeId]: tab }));
  };

  const startEdit = (trade: Trade) => {
    setExpandedId(trade.id);
    setTab(trade.id, 'plan');
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
      plan_note: trade.plan_note ?? '',
      invalidation_note: trade.invalidation_note ?? '',
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
          plan_note: draft.plan_note.trim() || null,
          invalidation_note: draft.invalidation_note.trim() || null,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '전략 수정에 실패했습니다.');

      replaceRow(result.data);
      setEditingId(null);
      setDraft(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '전략 수정 중 오류가 발생했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  const saveExecution = async (trade: Trade, executionDraft: ExecutionDraft) => {
    setBusyId(trade.id);
    setError(null);
    try {
      const response = await fetch('/api/trade-executions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          trade_id: trade.id,
          side: executionDraft.side,
          leg_label: executionDraft.leg_label,
          executed_at: executionDraft.executed_at,
          price: executionDraft.price,
          shares: executionDraft.shares,
          fees: executionDraft.fees,
          note: executionDraft.note,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '체결 기록 저장에 실패했습니다.');

      replaceRow(result.data);
      setSuccessMsg(`${trade.ticker} 체결이 기록되었습니다.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '체결 기록 저장 중 오류가 발생했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  const deleteExecution = async (trade: Trade, execution: TradeExecution) => {
    if (!window.confirm(`${trade.ticker} ${execution.side === 'ENTRY' ? '진입' : '청산'} 체결을 삭제할까요?`)) return;

    setBusyId(trade.id);
    setError(null);
    try {
      const response = await fetch(`/api/trade-executions?id=${encodeURIComponent(execution.id)}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '체결 기록 삭제에 실패했습니다.');

      replaceRow(result.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '체결 기록 삭제 중 오류가 발생했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  const saveReview = async (trade: Trade, reviewDraft: ReviewDraft) => {
    setBusyId(trade.id);
    setError(null);
    try {
      const response = await fetch('/api/trades', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: trade.id,
          final_discipline: toNumberOrNull(reviewDraft.final_discipline),
          setup_tags: reviewDraft.setup_tags,
          mistake_tags: reviewDraft.mistake_tags,
          review_note: reviewDraft.review_note.trim() || null,
          review_action: reviewDraft.review_action.trim() || null,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '복기 저장에 실패했습니다.');

      replaceRow(result.data);
      setSuccessMsg(`${trade.ticker} 복기가 저장되었습니다.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '복기 저장 중 오류가 발생했습니다.');
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

  const handleAddToWatchlist = async (ticker: string) => {
    setError(null);
    setSuccessMsg(null);
    try {
      await axios.post('/api/watchlist', {
        ticker,
        exchange: isKorean(ticker) ? 'KOSPI' : 'NAS',
        priority: 0,
        memo: '히스토리에서 추가됨',
        tags: ['History'],
      });
      setSuccessMsg(`${ticker}가 관심 종목에 추가되었습니다.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || '관심 종목 추가 실패');
      } else {
        setError('관심 종목 추가 중 오류가 발생했습니다.');
      }
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <p className="mt-1 text-sm text-slate-400">계획, 실제 체결, 복기를 한 거래 안에서 이어서 관리합니다.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100 flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-300 hover:text-red-100">&times;</button>
        </div>
      )}
      
      {successMsg && (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100 flex justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-300 hover:text-emerald-100">&times;</button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-left text-sm text-slate-300">
          <thead className="border-b border-slate-700 bg-slate-800 text-xs uppercase text-slate-400">
            <tr>
              <th scope="col" className="px-4 py-3">날짜</th>
              <th scope="col" className="px-4 py-3">종목</th>
              <th scope="col" className="px-4 py-3">상태</th>
              <th scope="col" className="px-4 py-3 text-right">R</th>
              <th scope="col" className="px-4 py-3 text-right">순보유</th>
              <th scope="col" className="px-4 py-3 text-right">평균 진입가</th>
              <th scope="col" className="px-4 py-3 text-right">손익</th>
              <th scope="col" className="px-4 py-3 text-right">규율</th>
              <th scope="col" className="px-4 py-3 text-right">관리</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  첫 진입 체결을 기록하면 평균 진입가와 현재 R이 자동 계산됩니다.
                </td>
              </tr>
            ) : (
              visibleRows.map((trade) => {
                const metrics = trade.metrics;
                const isExpanded = expandedId === trade.id;
                const isEditing = editingId === trade.id;
                const activeTab = activeTabs[trade.id] || 'plan';
                const realizedPnL = metrics?.realizedPnL ?? trade.result_amount;

                return (
                  <Fragment key={trade.id}>
                    <tr className="border-b border-slate-800 transition-colors hover:bg-slate-800/50">
                      <td className="whitespace-nowrap px-4 py-3">
                        {new Date(trade.created_at).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono font-medium text-white">{trade.ticker}</p>
                        <p className="mt-1 max-w-[180px] truncate text-xs text-slate-500">
                          {securityNames[trade.ticker] === undefined ? '종목명 확인 중' : securityNames[trade.ticker] || '종목명 없음'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={trade.status} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        <div className="flex flex-col items-end">
                          <span>{typeof metrics?.rMultiple === 'number' ? `${metrics.rMultiple.toFixed(2)}R` : '-'}</span>
                          {typeof metrics?.unrealizedR === 'number' && metrics.unrealizedR !== 0 && (
                            <span className={`text-[10px] font-bold ${metrics.unrealizedR >= 0 ? 'text-emerald-400' : 'text-coral-red'}`}>
                              {metrics.unrealizedR >= 0 ? '+' : ''}{metrics.unrealizedR.toFixed(2)}R (Live)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{numberText(metrics?.netShares, '주')}</td>
                      <td className="px-4 py-3 text-right font-mono">{currency(metrics?.avgEntryPrice ?? trade.entry_price, trade.ticker)}</td>
                      <td className="px-4 py-3 text-right font-mono font-medium">
                        <div className="flex flex-col items-end">
                          <span className={(realizedPnL || 0) >= 0 ? 'text-emerald-500' : 'text-coral-red'}>
                            {signedCurrency(realizedPnL, trade.ticker)}
                          </span>
                          {typeof metrics?.unrealizedPnL === 'number' && metrics.unrealizedPnL !== 0 && (
                            <span className={`text-[10px] ${metrics.unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-coral-red'}`}>
                              ({signedCurrency(metrics.unrealizedPnL, trade.ticker)})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {trade.final_discipline !== null ? (
                          <span className={`font-bold ${(trade.final_discipline || 0) >= 80 ? 'text-emerald-500' : 'text-orange-400'}`}>
                            {trade.final_discipline}pt
                          </span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleAddToWatchlist(trade.ticker)}
                            title="관심 종목에 추가"
                            className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-2 text-yellow-500 transition-colors hover:bg-yellow-500/20"
                          >
                            <Star className="h-4 w-4" />
                          </button>
                          <ActionButton onClick={() => setExpandedId(isExpanded ? null : trade.id)}>
                            {isExpanded ? '접기' : '상세'}
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
                          <div className="mb-4 flex flex-wrap gap-2">
                            <TabButton active={activeTab === 'plan'} onClick={() => setTab(trade.id, 'plan')}>계획</TabButton>
                            <TabButton active={activeTab === 'executions'} onClick={() => setTab(trade.id, 'executions')}>체결</TabButton>
                            <TabButton active={activeTab === 'review'} onClick={() => setTab(trade.id, 'review')}>복기</TabButton>
                          </div>
                          {activeTab === 'plan' && (
                            isEditing && draft ? (
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
                            )
                          )}
                          {activeTab === 'executions' && (
                            <ExecutionsPanel
                              trade={trade}
                              busy={busyId === trade.id}
                              onSave={(executionDraft) => saveExecution(trade, executionDraft)}
                              onDelete={(execution) => deleteExecution(trade, execution)}
                            />
                          )}
                          {activeTab === 'review' && (
                            <ReviewPanel
                              trade={trade}
                              busy={busyId === trade.id}
                              onSave={(reviewDraft) => saveReview(trade, reviewDraft)}
                            />
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

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-4 py-2 text-xs font-semibold transition-colors ${
        active ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

function ExecutionsPanel({
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
          전량 청산
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-400">구분</span>
          <select
            value={draft.side}
            onChange={(event) => setDraft((prev) => ({ ...prev, side: event.target.value as TradeExecutionSide }))}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
          >
            <option value="ENTRY">진입</option>
            <option value="EXIT">청산</option>
          </select>
        </label>
        <TextInput label="체결일" type="date" value={draft.executed_at} onChange={(value) => setDraft((prev) => ({ ...prev, executed_at: value }))} />
        <TextInput label="가격" type="number" step="0.0001" value={draft.price} onChange={(value) => setDraft((prev) => ({ ...prev, price: value }))} />
        <TextInput label="수량" type="number" step="0.0001" value={draft.shares} onChange={(value) => setDraft((prev) => ({ ...prev, shares: value }))} />
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-400">단계</span>
          <select
            value={draft.leg_label}
            onChange={(event) => setDraft((prev) => ({ ...prev, leg_label: event.target.value as TradeLegLabel }))}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
          >
            <option value="E1">E1</option>
            <option value="E2">E2</option>
            <option value="E3">E3</option>
            <option value="MANUAL">MANUAL</option>
          </select>
        </label>
        <TextInput label="수수료" type="number" min="0" step="0.01" value={draft.fees} onChange={(value) => setDraft((prev) => ({ ...prev, fees: value }))} />
        <div className="md:col-span-2">
          <TextInput label="메모" value={draft.note} onChange={(value) => setDraft((prev) => ({ ...prev, note: value }))} />
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="submit"
          disabled={busy || !draft.price || !draft.shares}
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? '저장 중...' : draft.side === 'ENTRY' ? '진입 기록' : '청산 기록'}
        </button>
      </div>
    </form>
  );
}

function ReviewPanel({ trade, busy, onSave }: { trade: Trade; busy: boolean; onSave: (draft: ReviewDraft) => void }) {
  const [draft, setDraft] = useState<ReviewDraft>({
    final_discipline: toInput(trade.final_discipline),
    setup_tags: trade.setup_tags || [],
    mistake_tags: trade.mistake_tags || [],
    review_note: trade.review_note || '',
    review_action: trade.review_action || '',
  });

  const toggleTag = (field: 'setup_tags' | 'mistake_tags', tag: string) => {
    setDraft((prev) => {
      const current = prev[field];
      return {
        ...prev,
        [field]: current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
      };
    });
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <DetailMetric label="실현손익" value={signedCurrency(trade.metrics?.realizedPnL ?? trade.result_amount, trade.ticker)} />
        <DetailMetric label="최종 R" value={typeof trade.metrics?.rMultiple === 'number' ? `${trade.metrics.rMultiple.toFixed(2)}R` : '-'} />
        <DetailMetric label="슬리피지" value={typeof trade.metrics?.entrySlippagePct === 'number' ? `${trade.metrics.entrySlippagePct.toFixed(2)}%` : '-'} />
        <DetailMetric label="계획 실행률" value={`${(trade.metrics?.executionProgressPct || 0).toFixed(1)}%`} />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-slate-400">셋업 태그</p>
        <div className="flex flex-wrap gap-2">
          {setupTagOptions.map((tag) => (
            <TagChip key={tag} active={draft.setup_tags.includes(tag)} onClick={() => toggleTag('setup_tags', tag)}>
              {tag}
            </TagChip>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-slate-400">실수 태그</p>
        <div className="flex flex-wrap gap-2">
          {mistakeTagOptions.map((tag) => (
            <TagChip key={tag} active={draft.mistake_tags.includes(tag)} onClick={() => toggleTag('mistake_tags', tag)}>
              {tag}
            </TagChip>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <TextInput
          label="규율 점수"
          type="number"
          min="0"
          max="100"
          value={draft.final_discipline}
          onChange={(value) => setDraft((prev) => ({ ...prev, final_discipline: value }))}
        />
        <div className="md:col-span-2">
          <TextInput
            label="다음 개선 액션"
            value={draft.review_action}
            onChange={(value) => setDraft((prev) => ({ ...prev, review_action: value }))}
          />
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-slate-400">사후 복기 메모</span>
        <textarea
          value={draft.review_note}
          onChange={(event) => setDraft((prev) => ({ ...prev, review_note: event.target.value }))}
          rows={4}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
          placeholder="좋았던 점, 놓친 점, 다음에 반복하거나 줄일 행동을 적어두세요."
        />
      </label>

      <div className="flex justify-end">
        <ActionButton onClick={() => onSave(draft)} disabled={busy}>
          {busy ? '저장 중...' : '복기 저장'}
        </ActionButton>
      </div>
    </div>
  );
}

function TagChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

function NoteBox({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm leading-6 text-slate-300">
      <p className="mb-1 text-xs font-semibold text-slate-500">{title}</p>
      {text}
    </div>
  );
}

function StrategyDetail({ trade }: { trade: Trade }) {
  const targets = getEntryTargets(trade.entry_targets);
  const stops = getTrailingStops(trade.trailing_stops);
  const sepa = getSepaEvidence(trade.sepa_evidence);
  const riskPct = (getRiskPercent(trade) * 100).toFixed(1).replace('.0', '');
  const metrics = trade.metrics;
  const exchange = isKorean(trade.ticker) ? 'KOSPI' : 'NAS';

  return (
    <div className="space-y-6">
      {/* Price History Chart */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            주가 추이 리서치 <span className="text-[10px] font-normal text-slate-500">(최근 200거래일)</span>
          </h4>
        </div>
        <div className="h-[250px] w-full">
          <HistoryChart ticker={trade.ticker} exchange={exchange} stopPrice={trade.stoploss_price} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <DetailMetric label="총 자본" value={currency(trade.total_equity, trade.ticker)} />
        <DetailMetric label="허용 손실" value={`${riskPct}%`} />
        <DetailMetric label="ATR 참고" value={numberText(trade.atr_value)} />
        <DetailMetric label="진입가" value={currency(metrics?.avgEntryPrice ?? trade.entry_price, trade.ticker)} />
        <DetailMetric 
          label="현재가" 
          value={currency(metrics?.currentPrice, trade.ticker)} 
          highlight={!!metrics?.currentPrice}
          color={metrics?.unrealizedPnL && metrics.unrealizedPnL >= 0 ? 'emerald' : 'coral'}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <NoteBox title="진입 전 시나리오" text={trade.plan_note || '수정 버튼으로 계획의 핵심 시나리오를 기록하세요.'} />
        <NoteBox title="무효화 조건" text={trade.invalidation_note || '이 아이디어가 틀렸다고 판단할 조건을 짧게 적어두면 복기가 쉬워집니다.'} />
      </div>

      {targets && stops && (
        <div>
          <h4 className="mb-2 text-sm font-bold text-white">진입 및 스탑 계획</h4>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2">단계</th>
                  <th className="py-2 text-right">기준가</th>
                  <th className="py-2 text-right">수량</th>
                  <th className="py-2 text-right">계획 스탑</th>
                  <th className="py-2 text-right">현재가 대비</th>
                </tr>
              </thead>
              <tbody>
                {[targets.e1, targets.e2, targets.e3].map((leg, index) => {
                  const stop = index === 0 ? stops.initial : index === 1 ? stops.afterEntry2 : stops.afterEntry3;
                  const currentPrice = trade.metrics?.currentPrice;
                  const distToStop = currentPrice && stop ? ((stop - currentPrice) / currentPrice) * 100 : null;
                  
                  return (
                    <tr key={leg.label} className="border-b border-slate-900">
                      <td className="py-2 font-medium text-white">{leg.label}</td>
                      <td className="py-2 text-right font-mono">{currency(leg.price, trade.ticker)}</td>
                      <td className="py-2 text-right font-mono">{leg.shares > 0 ? `${leg.shares.toLocaleString()}주` : '수동'}</td>
                      <td className="py-2 text-right font-mono text-orange-300">{currency(stop, trade.ticker)}</td>
                      <td className="py-2 text-right font-mono">
                        {distToStop !== null ? (
                          <span className={distToStop > -2 ? 'text-coral-red font-bold' : 'text-slate-400'}>
                            {distToStop.toFixed(1)}%
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {trade.status === 'ACTIVE' && (
            <div className="mt-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3">
              <p className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                <Star className="h-3 w-3 fill-current" /> 트레일링 스탑 가이드 (고가 대비 하락폭 예시)
              </p>
              <p className="mt-1 text-xs text-slate-400 leading-5">
                현재가 {currency(trade.metrics?.currentPrice, trade.ticker)} 기준, 
                만약 현재가에서 <span className="text-orange-300">-5%</span> 하락 시 
                <span className="text-white ml-1">{currency((trade.metrics?.currentPrice || 0) * 0.95, trade.ticker)}</span>까지 스탑을 올리는 것을 고려하세요.
                (Minervini: "Give back no more than half of your peak gain")
              </p>
            </div>
          )}
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

function DetailMetric({ 
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
            onChange={(event) => onChange('status', event.target.value as TradeStatus)}
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
        <span className="mb-1 block text-xs font-semibold text-slate-400">진입 전 시나리오</span>
        <textarea
          value={draft.plan_note}
          onChange={(event) => onChange('plan_note', event.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-slate-400">무효화 조건</span>
        <textarea
          value={draft.invalidation_note}
          onChange={(event) => onChange('invalidation_note', event.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
        />
      </label>
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

function HistoryChart({ ticker, exchange, stopPrice }: { ticker: string; exchange: string; stopPrice: number | null }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const resp = await axios.get('/api/market-data', {
          params: { ticker, exchange, includeFundamentals: 'false' },
        });
        if (!cancelled) {
          setData(resp.data.priceData);
        }
      } catch (err) {
        console.error('Failed to fetch chart data', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [ticker, exchange]);

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-xs text-slate-500">
        <LoadingSpinner className="h-6 w-6" />
        <span className="animate-pulse">시장 데이터를 페칭 중...</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-600 italic">
        차트 데이터를 표시할 수 없습니다.
      </div>
    );
  }

  const minPrice = Math.min(...data.map(d => d.close)) * 0.95;
  const maxPrice = Math.max(...data.map(d => d.close)) * 1.05;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis 
          dataKey="date" 
          hide 
        />
        <YAxis 
          domain={[minPrice, maxPrice]} 
          orientation="right"
          tickSize={0}
          axisLine={false}
          tick={{ fontSize: 10, fill: '#64748b' }}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
          itemStyle={{ color: '#10b981', fontSize: '12px' }}
          labelStyle={{ color: '#64748b', fontSize: '10px' }}
          labelFormatter={(label) => `날짜: ${label}`}
        />
        <Area
          type="monotone"
          dataKey="close"
          stroke="#10b981"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorPrice)"
          animationDuration={1500}
        />
        {stopPrice && (
          <ReferenceLine
            y={stopPrice}
            stroke="#ef4444"
            strokeDasharray="5 5"
            label={{ 
              value: `손절가 ${stopPrice.toLocaleString()}`, 
              position: 'right', 
              fill: '#ef4444', 
              fontSize: 10,
              fontWeight: 'bold'
            }}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
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
