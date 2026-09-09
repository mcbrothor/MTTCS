'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ScannerUniverseSelect } from '@/components/scanner/ScannerControls';
import Link from 'next/link';
import { Eye, ScanSearch } from 'lucide-react';
import AsyncStatePanel from '@/components/ui/AsyncStatePanel';
import TableSkeleton from '@/components/ui/TableSkeleton';
import { get } from 'idb-keyval';
import { CROSS_CHECK_STORAGE } from '@/lib/scanner/cross-check-storage';
import type { ScannerUniverse } from '@/types';

const UNIVERSES: Record<ScannerUniverse, { label: string; desc: string }> = {
  NASDAQ100: { label: 'NASDAQ 100', desc: '미국 테크주' },
  SP500: { label: 'S&P 500', desc: '미국 대형주' },
  KOSPI200: { label: 'KOSPI 200', desc: '한국 대형주' },
  KOSDAQ150: { label: 'KOSDAQ 150', desc: '한국 벤처주' },
};

type ScannerSource = 'minervini' | 'canslim' | 'leader' | 'momentum' | 'qullamaggie' | 'reversal';

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
  analysis?: { currentPrice?: number | null };
}

const SOURCES: { key: ScannerSource; label: string; tone: string }[] = [
  { key: 'minervini', label: '미너비니', tone: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20' },
  { key: 'canslim', label: 'CAN SLIM', tone: 'bg-rose-500/10 text-rose-300 border-rose-500/20' },
  { key: 'leader', label: '주도주', tone: 'bg-amber-500/10 text-amber-300 border-amber-500/20' },
  { key: 'momentum', label: '모멘텀', tone: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' },
  { key: 'qullamaggie', label: '쿨라매기', tone: 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/20' },
  { key: 'reversal', label: '전환 초입', tone: 'bg-teal-500/10 text-teal-300 border-teal-500/20' },
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

export default function CrossCheckView() {
  const router = useRouter();
  const search = useSearchParams();
  const requested = search.get('universe');
  const universe: ScannerUniverse = requested && Object.hasOwn(UNIVERSES, requested) ? requested as ScannerUniverse : 'NASDAQ100';
  const setUniverse = (value: ScannerUniverse) => router.replace(`/scanner?view=cross-check&universe=${value}`);
  const [revision, setRevision] = useState(0);
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CrossCheckResult[]>([]);

  useEffect(() => {
    let active = true;
    async function loadSnapshots() {
      setLoading(true);
      setError(null);
      try {
        const aggregated = new Map<string, CrossCheckResult>();
        const sourceStates: string[] = [];

        const readScanner = async (source: ScannerSource, key: string) => {
          const raw = await get(key);
          const label = SOURCES.find(s => s.key === source)?.label || source;
          if (!raw) { sourceStates.push(`${label}: 저장 결과 없음`); return; }
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (!parsed?.results || !Array.isArray(parsed.results)) { sourceStates.push(`${label}: 저장 형식 오류`); return; }
          const storedUniverse = parsed.universe ?? parsed.universeMeta?.universe;
          if (storedUniverse !== universe) { sourceStates.push(`${label}: 유니버스 불일치`); return; }
          const saved = typeof parsed.savedAt === 'string' && Number.isFinite(Date.parse(parsed.savedAt)) ? new Date(parsed.savedAt).toLocaleString('ko-KR') : '저장 시각 미확인';
          sourceStates.push(`${label}: ${saved}${parsed.failed ? ` · 실패 ${parsed.failed}건 제외` : ''}`);

          parsed.results.forEach((r: CrossCheckSnapshotRow) => {
            // 필터링: 성공한 항목 중 의미있는 결과만. (예: leaderGrade !== 'LAGGARD')
            if (!r || typeof r.ticker !== 'string' || !r.ticker) return;
            const exchange = r.exchange === 'NASDAQ' ? 'NAS' : r.exchange === 'NYSE' ? 'NYS' : r.exchange || (universe === 'KOSPI200' ? 'KOSPI' : universe === 'KOSDAQ150' ? 'KOSDAQ' : 'NAS');
            const identity = `${exchange}:${r.ticker}`;
            if (r.status === 'error') return;
            if (source === 'leader' && r.leaderGrade === 'LAGGARD') return;
            if (source === 'canslim' && r.sepaPassRate && r.sepaPassRate < 60) return;
            // 간단하게 각 스캐너의 "통과" 기준을 정의하거나 그냥 다 넣습니다. (스캐너 자체적으로 필터링된다고 가정)

            const existing = aggregated.get(identity) || {
              ticker: r.ticker,
              name: r.name ?? '',
              exchange,
              marketCap: r.marketCap ?? null,
              currentPrice: r.currentPrice ?? r.analysis?.currentPrice ?? null,
              hits: [] as ScannerSource[],
            };

            if (!existing.hits.includes(source)) {
              existing.hits.push(source);
            }
            
            // 데이터 보강
            if (!existing.currentPrice && r.currentPrice) existing.currentPrice = r.currentPrice;
            if (!existing.name && r.name) existing.name = r.name;

            aggregated.set(identity, existing);
          });
        };

        // 각 스캐너 스토리지 키 규칙 (로컬 스토리지 & idb-keyval 혼용될 수 있으나 idb-keyval 기준으로 시도)
        const reads = await Promise.allSettled(SOURCES.map(source => readScanner(source.key, `${CROSS_CHECK_STORAGE[source.key]}${universe}`)));

        reads.forEach((result, index) => { if (result.status === 'rejected') sourceStates.push(`${SOURCES[index].label}: 저장 결과를 읽지 못했습니다.`); });
        if (!active) return;
        setSources(sourceStates);
        const list = Array.from(aggregated.values())
          .filter(r => r.hits.length > 1) // 교차 검증: 최소 2개 이상의 스캐너에서 포착된 것만
          .sort((a, b) => b.hits.length - a.hits.length || a.ticker.localeCompare(b.ticker));

        setResults(list);
      } catch (err) {
        console.error('Failed to load cross-check data:', err);
        if (!active) return;
        setError(err instanceof Error ? err.message : '데이터 로딩 실패');
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadSnapshots();
    return () => { active = false; };
  }, [universe, revision]);

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ScannerUniverseSelect value={universe} onChange={setUniverse} options={UNIVERSES} />
        <button type="button" className="rounded-lg border border-slate-700 px-3 py-2 text-sm" onClick={() => setRevision(value => value + 1)}>저장 결과 다시 읽기</button>
      </div>
      <p className="text-sm text-slate-400">여섯 스캐너의 저장 결과 중 두 곳 이상에서 포착된 종목입니다. 실시간 재검색은 실행하지 않습니다.</p>
      <details className="rounded-lg border border-slate-800 p-3 text-xs text-slate-400">
        <summary className="cursor-pointer">데이터 출처·저장 시각·포함 기준</summary>
        <ul className="mt-2 space-y-1">{sources.map(source => <li key={source}>{source}</li>)}</ul>
        <p className="mt-2">오류 행과 주도주 LAGGARD는 제외합니다. CAN SLIM은 기존 저장 결과의 양수 SEPA 통과율이 60 미만이면 제외합니다. 포착 횟수는 매수 등급이 아닙니다. 가격은 저장된 스캐너 값이며 저장 시각이 서로 다를 수 있습니다.</p>
      </details>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-200">
          <ScanSearch className="h-5 w-5 text-emerald-400" />
          교차 검증 결과 (최소 2개 이상의 스캐너에서 포착)
        </h2>

        {error && (
          <AsyncStatePanel
            state="error"
            title="데이터 로딩 실패"
            message={error}
            onRetry={() => setRevision(value => value + 1)}
          />
        )}

        {loading && !error ? (
          <div className="overflow-visible rounded-xl border border-slate-800 bg-slate-950/40 shadow-xl">
            <TableSkeleton cols={5} rows={3} />
          </div>
        ) : results.length > 0 && !error ? (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="pb-3 pl-4 font-semibold">종목</th>
                  <th className="pb-3 px-4 font-semibold text-center">Hit Count</th>
                  <th className="pb-3 px-4 font-semibold">포착 스캐너</th>
                  <th className="pb-3 px-4 font-semibold text-right">저장 가격</th>
                  <th className="pb-3 pr-4 font-semibold text-right">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {results.map((r) => (
                  <tr key={`${r.exchange}:${r.ticker}`} className="transition-colors hover:bg-slate-800/30">
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
