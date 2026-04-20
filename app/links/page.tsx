'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import axios from 'axios';
import { ExternalLink, Globe, Plus, Trash2, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { InvestmentResource } from '@/types';

const CATEGORY_OPTIONS = [
  { value: 'NEWS', label: '뉴스/시황' },
  { value: 'OFFICIAL', label: '공시/리서치' },
  { value: 'TOOL', label: '투자 도구' },
  { value: 'COMMUNITY', label: '커뮤니티' },
  { value: 'ETC', label: '기타' },
];

export default function LinkHubPage() {
  const [links, setLinks] = useState<InvestmentResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchLinks = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await axios.get('/api/resources');
      setLinks(data.data || []);
      setError(null);
    } catch (err) {
      console.error('Fetch Links Error:', err);
      setError('링크 정보를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`'${title}' 링크를 삭제할까요?`)) return;
    try {
      await axios.delete(`/api/resources?id=${id}`);
      setLinks((prev) => prev.filter((link) => link.id !== id));
    } catch (err) {
      console.error('Delete Link Error:', err);
      alert('삭제에 실패했습니다.');
    }
  };

  // 카테고리별 그룹화
  const groupedLinks = CATEGORY_OPTIONS.reduce((acc, cat) => {
    const items = links.filter((link) => link.category === cat.value);
    if (items.length > 0) {
      acc.push({ label: cat.label, items });
    }
    return acc;
  }, [] as { label: string; items: InvestmentResource[] }[]);

  // 카테고리에 정의되지 않은 항목들 (기타 포함)
  const otherItems = links.filter(link => !CATEGORY_OPTIONS.some(cat => cat.value === link.category));
  if (otherItems.length > 0) {
    groupedLinks.push({ label: '기타', items: otherItems });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">Resource Hub</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">링크 허브</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            주식 투자에 참고할만한 외부 웹사이트 주소를 관리합니다. 등록된 링크는 새 창으로 열립니다.
          </p>
        </div>
        <Button className="mt-2 flex items-center gap-2 px-4 py-2" onClick={() => setShowAddForm((v) => !v)}>
          {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          <span>{showAddForm ? '닫기' : '링크 추가'}</span>
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {showAddForm && (
        <AddLinkForm
          onAdded={(newLink) => {
            setLinks((prev) => [newLink, ...prev]);
            setShowAddForm(false);
          }}
          onError={setError}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner />
        </div>
      ) : links.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Globe className="mb-4 h-12 w-12 text-slate-700" />
            <p className="text-lg font-semibold text-slate-400">등록된 링크가 없습니다</p>
            <p className="mt-1 text-sm text-slate-500">우측 상단의 버튼을 눌러 유용한 사이트를 등록해 보세요.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-8">
          {groupedLinks.map((group) => (
            <section key={group.label}>
              <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500">
                <span className="h-px flex-1 bg-slate-800"></span>
                {group.label}
                <span className="h-px flex-1 bg-slate-800"></span>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((link) => (
                  <div
                    key={link.id}
                    className="group relative flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/40 p-5 transition-all hover:border-emerald-500/50 hover:bg-slate-900/60"
                  >
                    <div className="mb-4 min-w-0">
                      <h3 className="truncate text-base font-bold text-white group-hover:text-emerald-400">
                        {link.title}
                      </h3>
                      <p className="mt-1 truncate font-mono text-[11px] text-slate-500">
                        {link.url}
                      </p>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500 transition-colors hover:text-emerald-400"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        사이트 열기
                      </a>
                      
                      <button
                        onClick={() => handleDelete(link.id, link.title)}
                        className="rounded-md p-1.5 text-slate-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
                        title="삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function AddLinkForm({
  onAdded,
  onError,
}: {
  onAdded: (link: InvestmentResource) => void;
  onError: (msg: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('NEWS');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;

    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    setSaving(true);
    try {
      const { data } = await axios.post('/api/resources', {
        title: title.trim(),
        url: formattedUrl,
        category,
      });
      onAdded(data.data);
      setTitle('');
      setUrl('');
    } catch (err) {
      console.error('Save Link Error:', err);
      if (axios.isAxiosError(err) && err.response?.data?.message) {
        onError(`등록 실패: ${err.response.data.message}`);
      } else {
        onError('링크 등록에 실패했습니다. 네트워크 연결 상태를 확인해 주세요.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <h3 className="mb-4 text-lg font-bold text-white">참고 링크 등록</h3>
      <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <label className="block md:col-span-1">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">사이트 명칭 *</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 전자공시시스템(DART)"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
            required
          />
        </label>

        <label className="block md:col-span-2">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">웹사이트 주소 (URL) *</span>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="예: dart.fss.or.kr"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
            required
          />
        </label>

        <label className="block md:col-span-1">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">분류</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
          >
            {CATEGORY_OPTIONS.map((cat) => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
        </label>

        <div className="flex items-end md:col-span-4 mt-2">
          <Button type="submit" className="px-6 py-2" disabled={saving || !title.trim() || !url.trim()}>
            {saving ? '등록 중...' : '링크 등록'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
