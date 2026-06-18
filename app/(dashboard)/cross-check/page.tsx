'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Eye, ScanSearch } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { get } from 'idb-keyval';
import type { ScannerUniverse } from '@/types';

const UNIVERSES: Record<ScannerUniverse, { label: string; desc: string }> = {
  NASDAQ100: { label: 'NASDAQ 100', desc: '미국 테크주' },
  SP500: { label: 'S&P 500', desc: '미국 대형주' },
  KOSPI200: { label: 'KOSPI 200', desc: '한국 대형주' },
  KOSDAQ150: { label: 'KOSDAQ 150', desc: '한국 벤처주' },
};

type ScannerSource = 'minervini' | 'canslim' | 'leader' | 'momentum' | 'qullamaggie';

interface CrossCheckResult {
  ticker: string;
  name: string;
  exchange: string;
  marketCap: number | null;
  currentPrice: number | null;
  hits: ScannerSource[];
}

interface CrossCheckSnapshotRow {
  ticker?: string;
  name?: string;
  exchange?: string;
  marketCap?: number | null;
  currentPrice?: number | null;
  status?: string;
  leaderGrade?: string;
  sepaPassRate?: number;
}

const SOURCES: { key: ScannerSource; label: string; tone: string }[] = [
  { key: 'minervini', label: '미너비니', tone: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20' },
  { key: 'canslim', label: 'CAN SLIM', tone: 'bg-rose-500/10 text-rose-300 border-rose-500/20' },
  { key: 'leader', label: '주도주', tone: 'bg-amber-500/10 text-amber-300 border-amber-500/20' },
  { key: 'momentum', label: '모멘텀', tone: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' },
  { key: 'qullamaggie', label: '쿨라매기', tone: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20' },
];

function formatPrice(value: number | null, exchange: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  const currency = exchange === 'KOSPI' || exchange === 'KOSDAQ' ? 'KRW' : 'USD';
  return new Intl.NumberFormat(currency === 'KRW' ? 'ko-KR' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'KRW' ? 0 : 2,
  }).format(value);
}

export default function CrossCheckPage() {
  const [universe, setUniverse] = useState<ScannerUniverse>('NASDAQ100');
  const [results, setResults] = useState<CrossCheckResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSnapshots() {
      setLoading(true);
      try {
        const aggregated = new Map<string, CrossCheckResult>();

        const readScanner = async (source: ScannerSource, key: string) => {
          const raw = await get(key);
          if (!raw) return;
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (!parsed?.results || !Array.isArray(parsed.results)) return;

          parsed.results.forEach((r: CrossCheckSnapshotRow) => {
            // 필터링: 성공한 항목 중 의미있는 결과만. (예: leaderGrade !== 'LAGGARD')
            if (!r.ticker) return;
            if (r.status === 'error') return;
            if (source === 'leader' && r.leaderGrade === 'LAGGARD') return;
            if (source === 'canslim' && r.sepaPassRate && r.sepaPassRate < 60) return;
            // 간단하게 각 스캐너의 "통과" 기준을 정의하거나 그냥 다 넣습니다. (스캐너 자체적으로 필터링된다고 가정)

            const existing = aggregated.get(r.ticker) || {
              ticker: r.ticker,
              name: r.name ?? '',
              exchange: r.exchange ?? 'NAS',
              marketCap: r.marketCap ?? null,
              currentPrice: r.currentPrice ?? null,
              hits: [] as ScannerSource[],
            };

            if (!existing.hits.includes(source)) {
              existing.hits.push(source);
            }
            
            // 데이터 보강
            if (!existing.currentPrice && r.currentPrice) existing.currentPrice = r.currentPrice;
            if (!existing.name && r.name) existing.name = r.name;

            aggregated.set(r.ticker, existing);
          });
        };

        // 각 스캐너 스토리지 키 규칙 (로컬 스토리지 & idb-keyval 혼용될 수 있으나 idb-keyval 기준으로 시도)
        await Promise.all([
          readScanner('minervini', `mtn:scanner:v1:${universe}`),
          readScanner('canslim', `mtn:scanner:canslim:v1:${universe}`),
          readScanner('leader', `mtn:scanner:leader:v1:${universe}`),
          readScanner('momentum', `mtn:scanner:momentum:v1:${universe}`),
          readScanner('qullamaggie', `mtn:scanner:qullamaggie:v1:${universe}`),
        ]);

        const list = Array.from(aggregated.values())
          .filter(r => r.hits.length > 1) // 교차 검증: 최소 2개 이상의 스캐너에서 포착된 것만
          .sort((a, b) => b.hits.length - a.hits.length || a.ticker.localeCompare(b.ticker));

        setResults(list);
      } catch (err) {
        console.error('Failed to load cross-check data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadSnapshots();
  }, [universe]);

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center gap-3">
        {(Object.entries(UNIVERSES) as [ScannerUniverse, { label: string; desc: string }][]).map(([key, { label }]) => (
          <button
            key={key}
            onClick={() => setUniverse(key)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
              universe === key
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 shadow-md shadow-emerald-500/5'
                : 'border-slate-800 text-slate-400 hover:border-emerald-500/30 hover:text-emerald-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-200">
          <ScanSearch className="h-5 w-5 text-emerald-400" />
          교차 검증 결과 (최소 2개 이상의 스캐너에서 포착)
        </h2>

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : results.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="pb-3 pl-4 font-semibold">종목</th>
                  <th className="pb-3 px-4 font-semibold text-center">Hit Count</th>
                  <th className="pb-3 px-4 font-semibold">포착 스캐너</th>
                  <th className="pb-3 px-4 font-semibold text-right">현재가</th>
                  <th className="pb-3 pr-4 font-semibold text-right">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {results.map((r) => (
                  <tr key={r.ticker} className="transition-colors hover:bg-slate-800/30">
                    <td className="py-4 pl-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-white">{r.ticker}</span>
                        <span className="text-xs text-slate-500">{r.name || r.exchange}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-black text-emerald-400">
                        {r.hits.length}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-wrap gap-1.5">
                        {r.hits.map(h => {
                          const src = SOURCES.find(s => s.key === h);
                          return (
                            <span key={h} className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${src?.tone}`}>
                              {src?.label || h}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right font-mono text-slate-300">
                      {formatPrice(r.currentPrice, r.exchange)}
                    </td>
                    <td className="py-4 pr-4 text-right">
                      <Link
                        href={`/plan?ticker=${r.ticker}&exchange=${r.exchange}`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/20"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        계획
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex h-32 flex-col items-center justify-center text-slate-500 text-sm">
            <p>2개 이상 스캐너에서 동시 포착된 종목이 없습니다.</p>
            <p className="mt-1 text-xs text-slate-600">각 스캐너를 먼저 실행한 후 이 페이지를 확인해 주세요.</p>
          </div>
        )}
      </section>
    </div>
  );
}
