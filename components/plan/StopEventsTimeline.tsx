'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Shield } from 'lucide-react';
import axios from 'axios';
import type { StopEvent } from '@/types';

// 손절 변경 소스별 라벨·색상
const SOURCE_META: Record<StopEvent['source'], { label: string; color: string }> = {
  INITIAL: { label: '초기 손절선', color: 'text-slate-300 border-slate-600' },
  TEN_WEEK_MA: { label: '10주 이동평균선', color: 'text-blue-300 border-blue-600/50' },
  HIGH_WATERMARK: { label: '고점 Trailing', color: 'text-emerald-300 border-emerald-600/50' },
  MANUAL: { label: '수동 조정', color: 'text-amber-300 border-amber-600/50' },
  PYRAMID: { label: '피라미딩 후 상향', color: 'text-purple-300 border-purple-600/50' },
};

type StopSource = StopEvent['source'];
const ALL_SOURCES: StopSource[] = ['INITIAL', 'TEN_WEEK_MA', 'HIGH_WATERMARK', 'MANUAL', 'PYRAMID'];

interface StopEventsTimelineProps {
  tradeId: string;
  /** 계획서의 초기 손절가 — 첫 Stop 자동 표시용 */
  initialStopPrice?: number | null;
}

/**
 * Trailing Stop 이력 타임라인 — 이미 완성된 /api/trade-stop-events API를 UI로 연결.
 * 손절가 변경 이력을 시간 순서로 시각화하고, 새 Stop 이벤트를 기록할 수 있다.
 */
export default function StopEventsTimeline({ tradeId, initialStopPrice }: StopEventsTimelineProps) {
  const [events, setEvents] = useState<StopEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState<{
    stop_price: string;
    source: StopSource;
    reason: string;
  }>({
    stop_price: '',
    source: 'MANUAL',
    reason: '',
  });

  // 이력 불러오기
  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get<{ data: StopEvent[] }>(`/api/trade-stop-events?trade_id=${tradeId}`);
      setEvents(res.data.data ?? []);
    } catch {
      setError('Trailing Stop 이력을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [tradeId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // 새 Stop 이벤트 저장
  const handleAdd = async () => {
    const stopPrice = parseFloat(form.stop_price);
    if (!Number.isFinite(stopPrice) || stopPrice <= 0) {
      setError('손절가를 올바른 숫자로 입력해 주세요.');
      return;
    }
    if (!form.reason.trim()) {
      setError('변경 사유를 입력해 주세요.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await axios.post<{ data: StopEvent }>('/api/trade-stop-events', {
        trade_id: tradeId,
        stop_price: stopPrice,
        source: form.source,
        reason: form.reason.trim(),
      });
      setEvents((prev) => [...prev, res.data.data]);
      setForm({ stop_price: '', source: 'MANUAL', reason: '' });
      setShowForm(false);
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.message ?? err.message
        : '저장 중 오류가 발생했습니다.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  // 날짜 포맷 — "4/21 13:45" 형태
  function fmtDate(iso: string) {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  // 현재 유효한 손절가 (가장 최근 이벤트 기준)
  const currentStop = events.length > 0
    ? events[events.length - 1].stop_price
    : initialStopPrice ?? null;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-white">Trailing Stop 이력</h3>
          {currentStop !== null && (
            <span className="rounded-md border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-xs font-mono font-bold text-blue-200">
              현재 {currentStop.toLocaleString()}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-400 transition-all hover:border-blue-500/50 hover:text-blue-300"
        >
          <Plus className="h-3 w-3" />
          Stop 추가
        </button>
      </div>

      {/* 오류 */}
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 text-xs">닫기</button>
        </div>
      )}

      {/* 타임라인 */}
      {loading ? (
        <p className="text-xs text-slate-500">불러오는 중...</p>
      ) : events.length === 0 ? (
        <p className="text-xs text-slate-600">
          {initialStopPrice
            ? `초기 손절가: ${initialStopPrice.toLocaleString()} — 변경 이력이 없습니다.`
            : '아직 기록된 Stop 이벤트가 없습니다.'}
        </p>
      ) : (
        <ol className="relative border-l border-slate-700 pl-4 space-y-3">
          {events.map((event, idx) => {
            const meta = SOURCE_META[event.source];
            const isLatest = idx === events.length - 1;
            return (
              <li key={event.id} className="relative">
                {/* 타임라인 점 */}
                <span
                  className={`absolute -left-[1.35rem] mt-0.5 h-2.5 w-2.5 rounded-full border-2 ${
                    isLatest ? 'border-blue-400 bg-blue-500' : 'border-slate-600 bg-slate-800'
                  }`}
                />
                <div className={`rounded-md border px-3 py-2 text-xs ${meta.color} bg-slate-900`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{meta.label}</span>
                    <span className="font-mono font-bold">{event.stop_price.toLocaleString()}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] opacity-70">
                    <span>{event.reason}</span>
                    <span>{fmtDate(event.created_at)}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* 새 이벤트 추가 폼 */}
      {showForm && (
        <div className="rounded-md border border-slate-700/60 bg-slate-900 p-3 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">손절가 변경 기록</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] text-slate-500">새 손절가</label>
              <input
                type="number"
                value={form.stop_price}
                onChange={(e) => setForm((f) => ({ ...f, stop_price: e.target.value }))}
                placeholder="예: 155.00"
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-500">변경 사유</label>
              <select
                value={form.source}
                onChange={(e) => setForm((f) => ({ ...f, source: e.target.value as StopSource }))}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
              >
                {ALL_SOURCES.map((s) => (
                  <option key={s} value={s}>{SOURCE_META[s].label}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-[11px] text-slate-500">상세 메모</label>
              <input
                type="text"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="예: 10주 이평선 상향 돌파 후 손절 상향 조정"
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving}
              className="flex-1 rounded-md bg-blue-500/20 border border-blue-500/40 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-500/30 disabled:opacity-50"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
