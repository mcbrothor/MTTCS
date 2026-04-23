'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import Card from '@/components/ui/Card';
import TradingViewWidget from '@/components/ui/TradingViewWidget';
import ExitRulesPanel from '@/components/plan/ExitRulesPanel';
import StopEventsTimeline from '@/components/plan/StopEventsTimeline';
import axios from 'axios';
import type { Trade, TradeExecution, ExitReason } from '@/types';
import { EditPanel, ExecutionsPanel, ReviewPanel, StrategyDetail, EditDraft, ExecutionDraft, ReviewDraft, currency, numberText, signedCurrency, toInput, toNumberOrNull, isKorean, getRiskPercent } from './panels';

type DetailTab = 'plan' | 'executions' | 'review' | 'rtarget' | 'stops';
type SecurityNameMap = Record<string, string | null>;

interface TradeHistoryTableProps {
  trades: Trade[];
  limit?: number;
  title?: string;
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

    const items = missing.map((ticker) => ({
      ticker,
      exchange: isKorean(ticker) ? 'KOSPI' : 'NAS',
    }));

    axios
      .post<{ nameMap: Record<string, string | null> }>('/api/security-lookup/batch', { items })
      .then((response) => {
        if (cancelled) return;

        setSecurityNames((prev) => {
          const next = { ...prev };
          missing.forEach((ticker) => {
            // response.data.nameMap에 없거나 실패한 경우 null 처리
            next[ticker] = response.data.nameMap[ticker] ?? null;
          });
          return next;
        });
      })
      .catch((error) => {
        console.error('Failed to batch lookup security names', error);
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
                          {/* 차트 버튼 — TradingView iframe 팝업 */}
                          <TradingViewWidget
                            ticker={trade.ticker}
                            exchange={isKorean(trade.ticker) ? 'KOSPI' : 'NAS'}
                            variant="icon"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddToWatchlist(trade.ticker)}
                            title="관심 종목에 추가"
                            className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-2 text-yellow-500 transition-colors hover:bg-yellow-500/20"
                          >
                            <Star className="h-4 w-4" />
                          </button>
                          <ActionLink href={`/history/${trade.id}?market=${isKorean(trade.ticker) ? 'KR' : 'US'}`}>
                            3-Layer
                          </ActionLink>
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
                        <td colSpan={10} className="px-4 py-5">
                          <div className="mb-4 flex flex-wrap gap-2">
                            <TabButton active={activeTab === 'plan'} onClick={() => setTab(trade.id, 'plan')}>계획</TabButton>
                            <TabButton active={activeTab === 'executions'} onClick={() => setTab(trade.id, 'executions')}>체결</TabButton>
                            <TabButton active={activeTab === 'review'} onClick={() => setTab(trade.id, 'review')}>복기</TabButton>
                            {/* 신규: R-Target과 Trailing Stop 탭 */}
                            <TabButton active={activeTab === 'rtarget'} onClick={() => setTab(trade.id, 'rtarget')}>R-Target</TabButton>
                            <TabButton active={activeTab === 'stops'} onClick={() => setTab(trade.id, 'stops')}>Stop 이력</TabButton>
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
                            <div className="space-y-4">
                              {/* 청산 사유 드롭다운 — 복기 탭에 통합 */}
                              <ExitReasonDropdown
                                tradeId={trade.id}
                                currentReason={trade.exit_reason}
                                onUpdated={(reason) => replaceRow({ ...trade, exit_reason: reason })}
                              />
                              <ReviewPanel
                                trade={trade}
                                busy={busyId === trade.id}
                                onSave={(reviewDraft) => saveReview(trade, reviewDraft)}
                              />
                            </div>
                          )}
                          {/* 신규: R-Target 패널 */}
                          {activeTab === 'rtarget' && (
                            <ExitRulesPanel tradeId={trade.id} />
                          )}
                          {/* 신규: Trailing Stop 이력 */}
                          {activeTab === 'stops' && (
                            <StopEventsTimeline tradeId={trade.id} initialStopPrice={trade.stoploss_price} />
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

function ActionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-sky-500/30 px-3 py-1.5 text-xs font-semibold text-sky-100 transition-colors hover:bg-sky-500/10"
    >
      {children}
    </Link>
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

// ===== 청산 사유 드롭다운 =====
// 왜: 복기 탭에 청산 이유를 구조화된 드롭다운으로 기록해야
//     나중에 유형별 승률·R 통계를 집계할 수 있다.
const EXIT_REASONS: ExitReason[] = ['손절', '목표가도달', '시장RED전환', '기술적이탈', '조기청산', '기타'];

function ExitReasonDropdown({
  tradeId,
  currentReason,
  onUpdated,
}: {
  tradeId: string;
  currentReason: ExitReason | null;
  onUpdated: (reason: ExitReason | null) => void;
}) {
  const [saving, setSaving] = useState(false);

  const handleChange = async (value: string) => {
    const reason = value === '' ? null : (value as ExitReason);
    setSaving(true);
    try {
      await axios.patch('/api/trades', { id: tradeId, exit_reason: reason });
      onUpdated(reason);
    } catch {
      // 저장 실패 시 조용히 처리 (다음 저장 시 재시도 가능)
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-md border border-slate-700 bg-slate-900 px-3 py-2">
      <span className="text-xs font-semibold text-slate-400 whitespace-nowrap">청산 사유</span>
      <select
        value={currentReason ?? ''}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white focus:border-amber-500 focus:outline-none disabled:opacity-50"
      >
        <option value="">— 선택 안 함 —</option>
        {EXIT_REASONS.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      {saving && <span className="text-xs text-slate-500">저장 중...</span>}
    </div>
  );
}
