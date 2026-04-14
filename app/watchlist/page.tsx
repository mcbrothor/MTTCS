'use client';

import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { WatchlistItem, WatchlistPriority } from '@/types';
import { Eye, Plus, Star, Trash2, X } from 'lucide-react';
import Link from 'next/link';

const PRIORITY_LABELS: Record<WatchlistPriority, { label: string; color: string; bg: string }> = {
  2: { label: '긴급', color: 'text-red-400', bg: 'bg-red-500/20 border-red-500/40' },
  1: { label: '높음', color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/40' },
  0: { label: '보통', color: 'text-slate-400', bg: 'bg-slate-500/20 border-slate-600' },
};

const EXCHANGE_OPTIONS = ['NAS', 'NYS', 'AMS'] as const;

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // 목록 조회
  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await axios.get('/api/watchlist');
      setItems(data.data || []);
      setError(null);
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message || err.message : '관심 종목을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // 삭제
  const handleDelete = async (id: string, ticker: string) => {
    if (!confirm(`${ticker}를 관심 종목에서 삭제할까요?`)) return;
    try {
      await axios.delete(`/api/watchlist?id=${id}`);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message : '삭제 실패');
    }
  };

  // 우선순위 변경
  const handlePriorityChange = async (id: string, priority: WatchlistPriority) => {
    try {
      const { data } = await axios.patch('/api/watchlist', { id, priority });
      setItems((prev) => prev.map((item) => item.id === id ? data.data : item));
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message : '수정 실패');
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">Watchlist</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">관심 종목</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            SEPA + VCP 분석 대상 종목을 관리합니다. 종목을 추가하고 신규 계획 화면에서 바로 분석할 수 있습니다.
          </p>
        </div>
        <Button
          className="mt-2 flex items-center gap-2 px-4 py-2"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          <span className="hidden sm:inline">{showAddForm ? '닫기' : '종목 추가'}</span>
        </Button>
      </div>

      {/* 에러 표시 */}
      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-100">{error}</p>
          <button type="button" onClick={() => setError(null)} className="ml-3 text-xs text-red-300 hover:text-red-100">닫기</button>
        </div>
      )}

      {/* 추가 폼 */}
      {showAddForm && (
        <AddWatchlistForm
          onAdded={(item) => {
            setItems((prev) => {
              // upsert이므로 기존 항목 교체 또는 추가
              const exists = prev.findIndex((i) => i.ticker === item.ticker);
              if (exists >= 0) {
                const next = [...prev];
                next[exists] = item;
                return next;
              }
              return [item, ...prev];
            });
            setShowAddForm(false);
          }}
          onError={setError}
        />
      )}

      {/* 로딩 */}
      {loading && (
        <div className="flex items-center justify-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-8 text-slate-300">
          <LoadingSpinner />
          관심 종목을 불러오는 중...
        </div>
      )}

      {/* 빈 상태 */}
      {!loading && items.length === 0 && (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Star className="mb-4 h-12 w-12 text-slate-600" />
            <p className="text-lg font-semibold text-slate-300">관심 종목이 없습니다</p>
            <p className="mt-2 text-sm text-slate-500">상단의 &quot;종목 추가&quot; 버튼으로 분석할 종목을 등록해 보세요.</p>
          </div>
        </Card>
      )}

      {/* 종목 목록 */}
      {!loading && items.length > 0 && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">등록 종목 {items.length}개</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm text-slate-300">
              <thead className="border-b border-slate-700 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-3">우선순위</th>
                  <th className="py-3 pr-3">티커</th>
                  <th className="py-3 pr-3">거래소</th>
                  <th className="py-3 pr-3">메모</th>
                  <th className="py-3 pr-3">태그</th>
                  <th className="py-3 pr-3">등록일</th>
                  <th className="py-3 text-right">작업</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const p = PRIORITY_LABELS[item.priority];
                  return (
                    <tr key={item.id} className="border-b border-slate-800 transition-colors hover:bg-slate-900/50">
                      {/* 우선순위 */}
                      <td className="py-3 pr-3">
                        <select
                          value={item.priority}
                          onChange={(e) => handlePriorityChange(item.id, Number(e.target.value) as WatchlistPriority)}
                          className={`rounded-md border px-2 py-1 text-xs font-semibold ${p.bg} ${p.color} bg-transparent cursor-pointer`}
                        >
                          <option value={2} className="bg-slate-900 text-red-400">긴급</option>
                          <option value={1} className="bg-slate-900 text-amber-400">높음</option>
                          <option value={0} className="bg-slate-900 text-slate-400">보통</option>
                        </select>
                      </td>
                      {/* 티커 */}
                      <td className="py-3 pr-3">
                        <span className="font-mono text-base font-bold text-white">{item.ticker}</span>
                      </td>
                      {/* 거래소 */}
                      <td className="py-3 pr-3 text-slate-400">{item.exchange}</td>
                      {/* 메모 */}
                      <td className="py-3 pr-3 max-w-[200px]">
                        <p className="truncate text-xs text-slate-400">{item.memo || '—'}</p>
                      </td>
                      {/* 태그 */}
                      <td className="py-3 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {item.tags.length > 0 ? item.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                              {tag}
                            </span>
                          )) : <span className="text-xs text-slate-600">—</span>}
                        </div>
                      </td>
                      {/* 등록일 */}
                      <td className="py-3 pr-3 text-xs text-slate-500">
                        {new Date(item.created_at).toLocaleDateString('ko-KR')}
                      </td>
                      {/* 작업 */}
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/plan?ticker=${item.ticker}&exchange=${item.exchange}`}
                            className="flex items-center gap-1 rounded-md bg-emerald-500/20 px-2.5 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/30"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            분석
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id, item.ticker)}
                            className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-red-500/20 hover:text-red-400"
                            title="삭제"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/** 관심 종목 추가 폼 */
function AddWatchlistForm({
  onAdded,
  onError,
}: {
  onAdded: (item: WatchlistItem) => void;
  onError: (msg: string) => void;
}) {
  const [ticker, setTicker] = useState('');
  const [exchange, setExchange] = useState('NAS');
  const [memo, setMemo] = useState('');
  const [tags, setTags] = useState('');
  const [priority, setPriority] = useState<WatchlistPriority>(0);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker.trim()) return;

    setSaving(true);
    try {
      const { data } = await axios.post('/api/watchlist', {
        ticker: ticker.trim().toUpperCase(),
        exchange,
        memo: memo.trim() || null,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        priority,
      });
      onAdded(data.data);
      setTicker('');
      setMemo('');
      setTags('');
    } catch (err) {
      onError(axios.isAxiosError(err) ? err.response?.data?.message || '추가 실패' : '추가 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <h3 className="mb-4 text-lg font-bold text-white">종목 추가</h3>
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* 티커 */}
        <div>
          <label htmlFor="wl-ticker" className="mb-1.5 block text-xs font-medium text-slate-400">티커 *</label>
          <input
            id="wl-ticker"
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="예: AAPL"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            required
          />
        </div>

        {/* 거래소 */}
        <div>
          <label htmlFor="wl-exchange" className="mb-1.5 block text-xs font-medium text-slate-400">거래소</label>
          <select
            id="wl-exchange"
            value={exchange}
            onChange={(e) => setExchange(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
          >
            {EXCHANGE_OPTIONS.map((ex) => (
              <option key={ex} value={ex}>{ex}</option>
            ))}
          </select>
        </div>

        {/* 우선순위 */}
        <div>
          <label htmlFor="wl-priority" className="mb-1.5 block text-xs font-medium text-slate-400">우선순위</label>
          <select
            id="wl-priority"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value) as WatchlistPriority)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
          >
            <option value={0}>보통</option>
            <option value={1}>높음</option>
            <option value={2}>긴급</option>
          </select>
        </div>

        {/* 메모 */}
        <div className="sm:col-span-2">
          <label htmlFor="wl-memo" className="mb-1.5 block text-xs font-medium text-slate-400">메모 (선택)</label>
          <input
            id="wl-memo"
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="왜 관심 종목인지 간단히 메모"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
            maxLength={500}
          />
        </div>

        {/* 태그 */}
        <div>
          <label htmlFor="wl-tags" className="mb-1.5 block text-xs font-medium text-slate-400">태그 (쉼표 구분)</label>
          <input
            id="wl-tags"
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="VCP후보, 실적발표전"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        {/* 저장 버튼 */}
        <div className="flex items-end sm:col-span-2 lg:col-span-3">
          <Button type="submit" className="px-6 py-2" disabled={saving || !ticker.trim()}>
            {saving ? '추가 중...' : '관심 종목 추가'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
