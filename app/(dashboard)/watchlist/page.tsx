'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { Eye, Plus, Save, Star, Trash2, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import AsyncStatePanel from '@/components/ui/AsyncStatePanel';
import { getVolumeSignalTier } from '@/lib/scanner-recommendation';
import type { InvestmentIdeaStatus, MarketAnalysisResponse, WatchlistItem, WatchlistPriority } from '@/types';

const PRIORITY_LABELS: Record<WatchlistPriority, { label: string; color: string; bg: string }> = {
  2: { label: '긴급', color: 'text-red-300', bg: 'bg-red-500/20 border-red-500/40' },
  1: { label: '높음', color: 'text-amber-300', bg: 'bg-amber-500/20 border-amber-500/40' },
  0: { label: '보통', color: 'text-slate-300', bg: 'bg-slate-500/20 border-slate-600' },
};

const EXCHANGE_OPTIONS = ['NAS', 'NYS', 'AMS', 'KOSPI', 'KOSDAQ'] as const;

function apiMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) ? error.response?.data?.message || error.message : fallback;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR');
}

function latestClose(analysis: MarketAnalysisResponse | null) {
  return analysis?.priceData.at(-1)?.close ?? null;
}

function formatPrice(value: number | null, exchange: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  const currency = exchange === 'KOSPI' || exchange === 'KOSDAQ' ? 'KRW' : 'USD';
  return new Intl.NumberFormat(currency === 'KRW' ? 'ko-KR' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'KRW' ? 0 : 2,
  }).format(value);
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedItem, setSelectedItem] = useState<WatchlistItem | null>(null);
  const [detailAnalysis, setDetailAnalysis] = useState<MarketAnalysisResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; ticker: string } | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await axios.get('/api/watchlist');
      setItems(data.data || []);
      setError(null);
    } catch (err) {
      setError(apiMessage(err, '관심종목을 불러오는 중 오류가 발생했습니다.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => {
    if (!selectedItem) {
      setDetailAnalysis(null);
      return;
    }

    const item = selectedItem;
    let mounted = true;
    const controller = new AbortController();

    async function fetchDetail() {
      setDetailLoading(true);
      setDetailAnalysis(null);
      try {
        const params = new URLSearchParams({
          ticker: item.ticker,
          exchange: item.exchange,
          totalEquity: '50000',
          riskPercent: '1',
          includeFundamentals: 'false',
        });
        const response = await fetch(`/api/market-data?${params.toString()}`, { signal: controller.signal });
        if (!response.ok) return;
        const payload = (await response.json()) as MarketAnalysisResponse;
        if (mounted) setDetailAnalysis(payload);
      } catch {
        if (mounted) setDetailAnalysis(null);
      } finally {
        if (mounted) setDetailLoading(false);
      }
    }

    fetchDetail();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [selectedItem]);

  const handleDeleteRequest = (id: string, ticker: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setItemToDelete({ id, ticker });
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await axios.delete(`/api/watchlist?id=${itemToDelete.id}`);
      setItems((prev) => prev.filter((item) => item.id !== itemToDelete.id));
      setSelectedItem((current) => (current?.id === itemToDelete.id ? null : current));
    } catch (err) {
      setError(apiMessage(err, '삭제에 실패했습니다.'));
    } finally {
      setItemToDelete(null);
    }
  };

  const handleUpdateItem = async (id: string, patch: Partial<Pick<WatchlistItem, 'exchange' | 'memo' | 'priority' | 'tags' | 'group_name' | 'sort_order' | 'thesis' | 'catalysts' | 'invalidation' | 'review_at' | 'idea_status' | 'source_refs'>>) => {
    try {
      const { data } = await axios.patch('/api/watchlist', { id, ...patch });
      const updated = data.data as WatchlistItem;
      setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
      setSelectedItem((current) => (current?.id === id ? updated : current));
      setError(null);
    } catch (err) {
      setError(apiMessage(err, '수정에 실패했습니다.'));
    }
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const form = new FormData();
      form.append('file', file);
      await axios.post('/api/watchlist/import', form);
      await fetchItems();
      setError(null);
    } catch (err) {
      setError(apiMessage(err, '투자 아이디어 가져오기에 실패했습니다.'));
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">


      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">Watchlist</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">관심종목</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            추적할 종목을 저장하고, 행을 눌러 최근 가격과 SEPA/VCP 요약을 빠르게 확인합니다.
          </p>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800">
            <Save className="h-4 w-4" />
            <span className="hidden sm:inline">CSV/XLSX 가져오기</span>
            <input type="file" accept=".csv,.xlsx" className="sr-only" onChange={(event) => { void handleImport(event.target.files?.[0]); event.target.value = ''; }} />
          </label>
          <Button className="flex items-center gap-2 px-4 py-2" onClick={() => setShowAddForm((value) => !value)}>
            {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            <span className="hidden sm:inline">{showAddForm ? '닫기' : '종목 추가'}</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-100">{error}</p>
          <div className="ml-3 flex items-center gap-2">
            <button type="button" onClick={fetchItems} className="text-xs font-semibold text-red-200 hover:text-red-100">다시 불러오기</button>
            <button type="button" onClick={() => setError(null)} className="text-xs text-red-300 hover:text-red-100">닫기</button>
          </div>
        </div>
      )}

      {showAddForm && (
        <AddWatchlistForm
          onAdded={(item) => {
            setItems((prev) => {
              const exists = prev.findIndex((current) => current.ticker === item.ticker);
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

      {loading && (
        <AsyncStatePanel
          state="loading"
          title="관심종목을 불러오는 중입니다"
          message="저장된 후보와 최근 분석 요약을 확인하고 있습니다."
          delayedTitle="관심종목을 불러오지 못하고 있습니다"
          delayedMessage="네트워크나 데이터 소스가 지연 중일 수 있습니다. 다시 시도하거나 종목을 직접 추가할 수 있습니다."
          onRetry={fetchItems}
          primaryAction={{ label: '직접 종목 추가', onClick: () => setShowAddForm(true) }}
        />
      )}

      {!loading && items.length === 0 && (
        <AsyncStatePanel
          state="empty"
          title="관심종목이 없습니다"
          message="스캐너에서 후보를 저장하거나 직접 종목을 추가해 추적을 시작하세요."
          primaryAction={{ label: '스캐너에서 후보 찾기', href: '/scanner' }}
          secondaryAction={{ label: '직접 종목 추가', variant: 'outline', onClick: () => setShowAddForm(true) }}
        >
          <Star className="h-5 w-5 text-slate-500" />
        </AsyncStatePanel>
      )}

      {!loading && items.length > 0 && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">등록 종목 {items.length}개</h2>
            <p className="text-xs text-slate-500">행을 클릭하면 상세 설정이 열립니다.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm text-slate-300">
              <thead className="border-b border-slate-700 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-3">우선순위</th>
                  <th className="py-3 pr-3">티커</th>
                  <th className="py-3 pr-3">거래소</th>
                  <th className="py-3 pr-3">아이디어</th>
                  <th className="py-3 pr-3">메모</th>
                  <th className="py-3 pr-3">태그</th>
                  <th className="py-3 pr-3">등록일</th>
                  <th className="py-3 text-right">작업</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const priority = PRIORITY_LABELS[item.priority];
                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className="cursor-pointer border-b border-slate-800 transition-colors hover:bg-slate-900/50"
                    >
                      <td className="py-3 pr-3">
                        <select
                          value={item.priority}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => handleUpdateItem(item.id, { priority: Number(event.target.value) as WatchlistPriority })}
                          className={`cursor-pointer rounded-md border px-2 py-1 text-xs font-semibold ${priority.bg} ${priority.color} bg-transparent`}
                        >
                          {Object.entries(PRIORITY_LABELS).map(([key, value]) => (
                            <option key={key} value={key} className="bg-slate-900 text-slate-200">{value.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 pr-3"><span className="font-mono text-base font-bold text-white">{item.ticker}</span></td>
                      <td className="py-3 pr-3 text-slate-400">{item.exchange}</td>
                      <td className="py-3 pr-3">
                        <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-[10px] font-bold text-violet-200">{item.idea_status || 'DRAFT'}</span>
                        {item.review_at && <p className="mt-1 text-[10px] text-slate-500">검토 {new Date(item.review_at).toLocaleDateString('ko-KR')}</p>}
                      </td>
                      <td className="max-w-[220px] py-3 pr-3"><p className="truncate text-xs text-slate-400">{item.memo || '-'}</p></td>
                      <td className="py-3 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {item.tags.length > 0 ? item.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">{tag}</span>
                          )) : <span className="text-xs text-slate-600">-</span>}
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-xs text-slate-500">{new Date(item.created_at).toLocaleDateString('ko-KR')}</td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/stock/${item.ticker}?exchange=${item.exchange}`}
                            onClick={(event) => event.stopPropagation()}
                            className="flex items-center gap-1 rounded-md border border-sky-500/30 px-2.5 py-1.5 text-xs font-medium text-sky-300 transition-colors hover:bg-sky-500/10"
                          >
                            360
                          </Link>
                          <Link
                            href={`/plan?ticker=${item.ticker}&exchange=${item.exchange}`}
                            onClick={(event) => event.stopPropagation()}
                            className="flex items-center gap-1 rounded-md bg-emerald-500/20 px-2.5 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/30"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            계획
                          </Link>
                          <button
                            type="button"
                            onClick={(event) => handleDeleteRequest(item.id, item.ticker, event)}
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

      {selectedItem && (
        <WatchlistDetailModal
          item={selectedItem}
          analysis={detailAnalysis}
          loading={detailLoading}
          onClose={() => setSelectedItem(null)}
          onSave={(patch) => handleUpdateItem(selectedItem.id, patch)}
          onDelete={() => handleDeleteRequest(selectedItem.id, selectedItem.ticker)}
        />
      )}

      {itemToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-bold text-white">종목 삭제</h3>
            <p className="mb-6 text-sm text-slate-400">
              정말로 <span className="font-mono font-bold text-amber-400">{itemToDelete.ticker}</span> 종목을 관심 목록에서 삭제하시겠습니까?
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setItemToDelete(null)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              >
                취소
              </button>
              <button
                onClick={handleConfirmDelete}
                className="rounded-lg bg-rose-500/10 px-4 py-2 text-sm font-bold text-rose-400 transition-colors hover:bg-rose-500/20"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
  const [groupName, setGroupName] = useState('기본');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ticker.trim()) return;

    setSaving(true);
    try {
      const { data } = await axios.post('/api/watchlist', {
        ticker: ticker.trim().toUpperCase(),
        exchange,
        memo: memo.trim() || null,
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        priority,
        group_name: groupName,
      });
      onAdded(data.data);
      setTicker('');
      setMemo('');
      setTags('');
    } catch (err) {
      onError(apiMessage(err, '추가에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <h3 className="mb-4 text-lg font-bold text-white">종목 추가</h3>
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">그룹</span>
          <input value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={40} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none" />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">티커 *</span>
          <input
            type="text"
            value={ticker}
            onChange={(event) => setTicker(event.target.value.toUpperCase())}
            placeholder="예: AAPL"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">거래소</span>
          <select
            value={exchange}
            onChange={(event) => setExchange(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
          >
            {EXCHANGE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">우선순위</span>
          <select
            value={priority}
            onChange={(event) => setPriority(Number(event.target.value) as WatchlistPriority)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
          >
            {Object.entries(PRIORITY_LABELS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">메모</span>
          <input
            type="text"
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            placeholder="관찰 이유를 간단히 남깁니다"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
            maxLength={500}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">태그</span>
          <input
            type="text"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="VCP, 실적, 뉴스"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <div className="flex items-end sm:col-span-2 lg:col-span-3">
          <Button type="submit" className="px-6 py-2" disabled={saving || !ticker.trim()}>
            {saving ? '추가 중...' : '관심종목 추가'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function WatchlistDetailModal({
  item,
  analysis,
  loading,
  onClose,
  onSave,
  onDelete,
}: {
  item: WatchlistItem;
  analysis: MarketAnalysisResponse | null;
  loading: boolean;
  onClose: () => void;
  onSave: (patch: Partial<Pick<WatchlistItem, 'exchange' | 'memo' | 'priority' | 'tags' | 'group_name' | 'thesis' | 'catalysts' | 'invalidation' | 'review_at' | 'idea_status' | 'source_refs'>>) => Promise<void>;
  onDelete: () => void;
}) {
  const [exchange, setExchange] = useState(item.exchange);
  const [priority, setPriority] = useState<WatchlistPriority>(item.priority);
  const [memo, setMemo] = useState(item.memo || '');
  const [tags, setTags] = useState(item.tags.join(', '));
  const [groupName, setGroupName] = useState(item.group_name || '기본');
  const [thesis, setThesis] = useState(item.thesis || '');
  const [catalysts, setCatalysts] = useState((item.catalysts || []).join('\n'));
  const [invalidation, setInvalidation] = useState(item.invalidation || '');
  const [reviewAt, setReviewAt] = useState(item.review_at?.slice(0, 10) || '');
  const [ideaStatus, setIdeaStatus] = useState<InvestmentIdeaStatus>(item.idea_status || 'DRAFT');
  const [sourceRefs, setSourceRefs] = useState((item.source_refs || []).map((source) => source.url).join('\n'));
  const [saving, setSaving] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  useEffect(() => {
    setExchange(item.exchange);
    setPriority(item.priority);
    setMemo(item.memo || '');
    setTags(item.tags.join(', '));
    setGroupName(item.group_name || '기본');
    setThesis(item.thesis || '');
    setCatalysts((item.catalysts || []).join('\n'));
    setInvalidation(item.invalidation || '');
    setReviewAt(item.review_at?.slice(0, 10) || '');
    setIdeaStatus(item.idea_status || 'DRAFT');
    setSourceRefs((item.source_refs || []).map((source) => source.url).join('\n'));
  }, [item]);

  const volumeTier = analysis
    ? getVolumeSignalTier({
        volumeDryUpScore: analysis.vcpAnalysis.volumeDryUpScore,
        pocketPivotScore: analysis.vcpAnalysis.pocketPivotScore,
        breakoutVolumeStatus: analysis.vcpAnalysis.breakoutVolumeStatus,
      })
    : 'Unknown';

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        exchange,
        priority,
        memo: memo.trim() || null,
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        group_name: groupName,
        thesis: thesis.trim() || null,
        catalysts: catalysts.split('\n').map((value) => value.trim()).filter(Boolean),
        invalidation: invalidation.trim() || null,
        review_at: reviewAt || null,
        idea_status: ideaStatus,
        source_refs: sourceRefs.split('\n').map((url) => url.trim()).filter(Boolean).map((url) => ({ url })),
      });
    } finally {
      setSaving(false);
    }
  };

  const createPivotAlert = async () => {
    const targetPrice = analysis?.vcpAnalysis.pivotPrice;
    if (!targetPrice) return setAlertMessage('확정된 피벗가가 없어 알림을 만들 수 없습니다.');
    try {
      await axios.post('/api/alert-rules', { name: `${item.ticker} 피벗 접근`, scope: 'SYMBOL', scope_id: item.ticker, event_type: 'PIVOT_NEAR', params: { targetPrice, thresholdPct: 5 }, channels: ['IN_APP'] });
      setAlertMessage(`피벗 ${targetPrice.toLocaleString()}의 5% 이내 접근 알림을 만들었습니다.`);
    } catch (error) { setAlertMessage(apiMessage(error, '알림 생성에 실패했습니다.')); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-800 bg-slate-950/95 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">Watchlist Detail</p>
            <h2 className="mt-1 font-mono text-2xl font-bold text-white">{item.ticker}</h2>
            <p className="text-sm text-slate-400">{item.exchange} · 생성 {formatDate(item.created_at)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-400">그룹</span>
                <input value={groupName} onChange={(event) => setGroupName(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-400">거래소</span>
                <select value={exchange} onChange={(event) => setExchange(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">
                  {EXCHANGE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-400">우선순위</span>
                <select value={priority} onChange={(event) => setPriority(Number(event.target.value) as WatchlistPriority)} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">
                  {Object.entries(PRIORITY_LABELS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-400">아이디어 상태</span>
                <select value={ideaStatus} onChange={(event) => setIdeaStatus(event.target.value as InvestmentIdeaStatus)} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">
                  {(['DRAFT', 'WATCHING', 'READY', 'INVALIDATED', 'ARCHIVED'] as const).map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-400">다음 검토일</span>
                <input type="date" value={reviewAt} onChange={(event) => setReviewAt(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-400">투자 논지</span>
              <textarea value={thesis} onChange={(event) => setThesis(event.target.value)} rows={4} placeholder="왜 이 종목을 보유/관찰해야 하는가" className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-400">촉매 · 한 줄에 하나</span>
              <textarea value={catalysts} onChange={(event) => setCatalysts(event.target.value)} rows={3} placeholder={'실적 발표\n신제품 출시'} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-400">무효화 조건</span>
              <textarea value={invalidation} onChange={(event) => setInvalidation(event.target.value)} rows={3} placeholder="이 논지가 틀렸다고 판단할 조건" className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-400">출처 URL · 한 줄에 하나</span>
              <textarea value={sourceRefs} onChange={(event) => setSourceRefs(event.target.value)} rows={2} placeholder="https://..." className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-400">메모</span>
              <textarea value={memo} onChange={(event) => setMemo(event.target.value)} rows={4} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-400">태그</span>
              <input value={tags} onChange={(event) => setTags(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={handleSave} disabled={saving} icon={<Save className="h-4 w-4" />}>
                {saving ? '저장 중...' : '설정 저장'}
              </Button>
              <Link href={`/plan?ticker=${item.ticker}&exchange=${exchange}`} className="inline-flex items-center rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800">
                계획으로 이동
              </Link>
              <button type="button" onClick={createPivotAlert} className="inline-flex items-center rounded-lg border border-amber-500/40 px-4 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-500/10">피벗 알림</button>
              <button type="button" onClick={onDelete} className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/10">
                <Trash2 className="h-4 w-4" />
                삭제
              </button>
            </div>
            {alertMessage && <p className="text-xs text-amber-200">{alertMessage}</p>}
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="text-sm font-bold text-white">시장 데이터 요약</h3>
            {loading ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
                <LoadingSpinner size="sm" />
                최근 데이터를 확인하는 중입니다.
              </div>
            ) : analysis ? (
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">최근가</span>
                  <span className="font-mono text-white">{formatPrice(latestClose(analysis), item.exchange)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">SEPA</span>
                  <span className="text-slate-200">{analysis.sepaEvidence.status} ({analysis.sepaEvidence.summary.passed}/{analysis.sepaEvidence.summary.total})</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">VCP</span>
                  <span className="text-slate-200">{analysis.vcpAnalysis.grade} · {analysis.vcpAnalysis.score}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">거래량 신호</span>
                  <span className="text-slate-200">{volumeTier}</span>
                </div>
                <p className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs leading-5 text-slate-400">
                  {analysis.vcpAnalysis.details.slice(0, 3).join(' ')}
                </p>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-slate-400">
                market-data 조회에 실패했지만 관심종목 설정은 정상적으로 확인하고 수정할 수 있습니다.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
