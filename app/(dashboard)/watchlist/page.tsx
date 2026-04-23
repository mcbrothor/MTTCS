'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { Eye, Plus, Save, Star, Trash2, X } from 'lucide-react';
import FlowBanner from '@/components/layout/FlowBanner';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { getVolumeSignalTier } from '@/lib/scanner-recommendation';
import type { MarketAnalysisResponse, WatchlistItem, WatchlistPriority } from '@/types';

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

  const handleDelete = async (id: string, ticker: string) => {
    if (!confirm(`${ticker}를 관심종목에서 삭제할까요?`)) return;
    try {
      await axios.delete(`/api/watchlist?id=${id}`);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setSelectedItem((current) => (current?.id === id ? null : current));
    } catch (err) {
      setError(apiMessage(err, '삭제에 실패했습니다.'));
    }
  };

  const handleUpdateItem = async (id: string, patch: Partial<Pick<WatchlistItem, 'exchange' | 'memo' | 'priority' | 'tags'>>) => {
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

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <FlowBanner currentKey="watchlist" />

      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">Watchlist</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">관심종목</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            추적할 종목을 저장하고, 행을 눌러 최근 가격과 SEPA/VCP 요약을 빠르게 확인합니다.
          </p>
        </div>
        <Button className="mt-2 flex items-center gap-2 px-4 py-2" onClick={() => setShowAddForm((value) => !value)}>
          {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          <span className="hidden sm:inline">{showAddForm ? '닫기' : '종목 추가'}</span>
        </Button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-100">{error}</p>
          <button type="button" onClick={() => setError(null)} className="ml-3 text-xs text-red-300 hover:text-red-100">닫기</button>
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
        <div className="flex items-center justify-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-8 text-slate-300">
          <LoadingSpinner />
          관심종목을 불러오는 중입니다.
        </div>
      )}

      {!loading && items.length === 0 && (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Star className="mb-4 h-12 w-12 text-slate-600" />
            <p className="text-lg font-semibold text-slate-300">관심종목이 없습니다</p>
            <p className="mt-2 text-sm text-slate-500">상단의 종목 추가 버튼으로 추적할 종목을 등록하세요.</p>
          </div>
        </Card>
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
                            href={`/plan?ticker=${item.ticker}&exchange=${item.exchange}`}
                            onClick={(event) => event.stopPropagation()}
                            className="flex items-center gap-1 rounded-md bg-emerald-500/20 px-2.5 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/30"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            계획
                          </Link>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDelete(item.id, item.ticker);
                            }}
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
          onDelete={() => handleDelete(selectedItem.id, selectedItem.ticker)}
        />
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
  onSave: (patch: Partial<Pick<WatchlistItem, 'exchange' | 'memo' | 'priority' | 'tags'>>) => Promise<void>;
  onDelete: () => void;
}) {
  const [exchange, setExchange] = useState(item.exchange);
  const [priority, setPriority] = useState<WatchlistPriority>(item.priority);
  const [memo, setMemo] = useState(item.memo || '');
  const [tags, setTags] = useState(item.tags.join(', '));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setExchange(item.exchange);
    setPriority(item.priority);
    setMemo(item.memo || '');
    setTags(item.tags.join(', '));
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
      });
    } finally {
      setSaving(false);
    }
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
            </div>

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
              <button type="button" onClick={onDelete} className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/10">
                <Trash2 className="h-4 w-4" />
                삭제
              </button>
            </div>
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
