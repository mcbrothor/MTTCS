'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Target } from 'lucide-react';
import axios from 'axios';
import type { ExitRule } from '@/types';

// ===== 타입 =====
type TriggerType = 'R_MULTIPLE' | 'GAIN_PCT' | 'PRICE' | 'MANUAL';

const TRIGGER_LABELS: Record<TriggerType, { label: string; unit: string; placeholder: string }> = {
  R_MULTIPLE: { label: 'R 배수 도달', unit: 'R', placeholder: '예: 2 → 2R 목표' },
  GAIN_PCT: { label: '수익률 달성', unit: '%', placeholder: '예: 20 → 수익 20%' },
  PRICE: { label: '목표가 지정', unit: '$ / ₩', placeholder: '예: 180.50' },
  MANUAL: { label: '수동 판단', unit: '', placeholder: '조건 없이 직접 판단' },
};

// ===== 유틸 =====
function fractionLabel(fraction: number): string {
  if (fraction === 1) return '전량 청산';
  return `${Math.round(fraction * 100)}% 청산`;
}

// ===== 메인 컴포넌트 =====
interface ExitRulesPanelProps {
  /** 연결된 매매 계획 ID */
  tradeId: string;
}

/**
 * R-Target(목표가) 패널 — 이미 완성된 /api/trade-exit-rules API를 UI로 연결.
 * 트리거 조건(1R·2R·목표가·수익률)별 부분 청산 계획을 설정하고 저장한다.
 */
export default function ExitRulesPanel({ tradeId }: ExitRulesPanelProps) {
  const [rules, setRules] = useState<ExitRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 새 규칙 입력 폼 상태
  const [form, setForm] = useState<{
    trigger_type: TriggerType;
    trigger_value: string;
    exit_fraction: string;
    note: string;
  }>({
    trigger_type: 'R_MULTIPLE',
    trigger_value: '',
    exit_fraction: '0.5',
    note: '',
  });

  // 기존 규칙 목록 불러오기
  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get<{ data: ExitRule[] }>(`/api/trade-exit-rules?trade_id=${tradeId}`);
      setRules(res.data.data ?? []);
    } catch {
      setError('목표가 규칙을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [tradeId]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // 새 규칙 저장
  const handleAdd = async () => {
    const triggerValue = parseFloat(form.trigger_value);
    const exitFraction = parseFloat(form.exit_fraction);

    if (!Number.isFinite(triggerValue) && form.trigger_type !== 'MANUAL') {
      setError('트리거 값을 숫자로 입력해 주세요.');
      return;
    }
    if (!Number.isFinite(exitFraction) || exitFraction <= 0 || exitFraction > 1) {
      setError('청산 비율은 0 초과 1 이하로 입력해 주세요.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await axios.post<{ data: ExitRule }>('/api/trade-exit-rules', {
        trade_id: tradeId,
        trigger_type: form.trigger_type,
        trigger_value: form.trigger_type === 'MANUAL' ? 0 : triggerValue,
        exit_fraction: exitFraction,
        note: form.note || null,
      });
      setRules((prev) => [...prev, res.data.data]);
      // 폼 초기화
      setForm({ trigger_type: 'R_MULTIPLE', trigger_value: '', exit_fraction: '0.5', note: '' });
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.message ?? err.message
        : '저장 중 오류가 발생했습니다.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  // 규칙 삭제
  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/trade-exit-rules?id=${id}`);
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch {
      setError('삭제 중 오류가 발생했습니다.');
    }
  };

  // 규칙 실행 완료 토글
  const handleToggleExecuted = async (rule: ExitRule) => {
    try {
      const res = await axios.patch<{ data: ExitRule }>('/api/trade-exit-rules', {
        id: rule.id,
        executed: !rule.executed,
      });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? res.data.data : r)));
    } catch {
      setError('상태 변경 중 오류가 발생했습니다.');
    }
  };

  const triggerInfo = TRIGGER_LABELS[form.trigger_type];

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-white">R-Target (목표가 계획)</h3>
        <span className="text-xs text-slate-500">— 청산 트리거별 부분 청산 비율 설정</span>
      </div>

      {/* 오류 메시지 */}
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 text-xs text-red-400 hover:text-red-200">닫기</button>
        </div>
      )}

      {/* 기존 규칙 목록 */}
      {loading ? (
        <p className="text-xs text-slate-500">불러오는 중...</p>
      ) : rules.length === 0 ? (
        <p className="text-xs text-slate-600">아직 설정된 목표가 규칙이 없습니다. 아래에서 추가하세요.</p>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => {
            const info = TRIGGER_LABELS[rule.trigger_type as TriggerType];
            return (
              <div
                key={rule.id}
                className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs transition-all ${
                  rule.executed
                    ? 'border-slate-700/50 bg-slate-900/40 opacity-60'
                    : 'border-slate-700 bg-slate-900'
                }`}
              >
                {/* 트리거 정보 */}
                <div className="flex items-center gap-3">
                  {/* 실행 완료 체크 */}
                  <button
                    type="button"
                    onClick={() => handleToggleExecuted(rule)}
                    title={rule.executed ? '실행 완료 표시됨 — 클릭하여 취소' : '실행 완료로 표시'}
                    className={`h-4 w-4 rounded border-2 transition-colors ${
                      rule.executed ? 'border-emerald-500 bg-emerald-500' : 'border-slate-600 hover:border-emerald-500'
                    }`}
                  />
                  <div>
                    <span className="font-medium text-slate-200">
                      {info?.label ?? rule.trigger_type}
                      {rule.trigger_type !== 'MANUAL' && (
                        <span className="ml-1 text-amber-400">
                          {rule.trigger_value}{info?.unit}
                        </span>
                      )}
                    </span>
                    <span className="ml-2 text-slate-400">→ {fractionLabel(rule.exit_fraction)}</span>
                    {rule.note && <p className="mt-0.5 text-[10px] text-slate-500">{rule.note}</p>}
                  </div>
                </div>
                {/* 삭제 */}
                <button
                  type="button"
                  onClick={() => handleDelete(rule.id)}
                  className="text-slate-600 hover:text-red-400 transition-colors"
                  aria-label="규칙 삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 새 규칙 추가 폼 */}
      <div className="rounded-md border border-slate-700/60 bg-slate-900 p-3 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">새 목표 추가</p>

        <div className="grid grid-cols-2 gap-2">
          {/* 트리거 타입 선택 */}
          <div className="col-span-2">
            <label className="mb-1 block text-[11px] text-slate-500">트리거 조건</label>
            <select
              value={form.trigger_type}
              onChange={(e) => setForm((f) => ({ ...f, trigger_type: e.target.value as TriggerType }))}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white focus:border-amber-500 focus:outline-none"
            >
              {(Object.keys(TRIGGER_LABELS) as TriggerType[]).map((t) => (
                <option key={t} value={t}>{TRIGGER_LABELS[t].label}</option>
              ))}
            </select>
          </div>

          {/* 트리거 값 (MANUAL은 숨김) */}
          {form.trigger_type !== 'MANUAL' && (
            <div>
              <label className="mb-1 block text-[11px] text-slate-500">
                값 ({triggerInfo.unit})
              </label>
              <input
                type="number"
                value={form.trigger_value}
                onChange={(e) => setForm((f) => ({ ...f, trigger_value: e.target.value }))}
                placeholder={triggerInfo.placeholder}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white placeholder-slate-600 focus:border-amber-500 focus:outline-none"
              />
            </div>
          )}

          {/* 청산 비율 */}
          <div>
            <label className="mb-1 block text-[11px] text-slate-500">청산 비율</label>
            <select
              value={form.exit_fraction}
              onChange={(e) => setForm((f) => ({ ...f, exit_fraction: e.target.value }))}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white focus:border-amber-500 focus:outline-none"
            >
              <option value="0.25">25% 청산</option>
              <option value="0.33">33% 청산</option>
              <option value="0.5">50% 청산</option>
              <option value="0.67">67% 청산</option>
              <option value="0.75">75% 청산</option>
              <option value="1">전량 청산</option>
            </select>
          </div>

          {/* 메모 */}
          <div className="col-span-2">
            <label className="mb-1 block text-[11px] text-slate-500">메모 (선택)</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="예: 1R에서 절반 청산 후 나머지 홀딩"
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white placeholder-slate-600 focus:border-amber-500 focus:outline-none"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleAdd}
          disabled={saving}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-amber-500/20 border border-amber-500/40 py-2 text-xs font-medium text-amber-300 transition-all hover:bg-amber-500/30 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          {saving ? '저장 중...' : '목표 추가'}
        </button>
      </div>
    </div>
  );
}
