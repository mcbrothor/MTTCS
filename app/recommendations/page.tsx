'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import * as Tooltip from '@radix-ui/react-tooltip';
import { AlertTriangle, BarChart3, CalendarDays, Database, Info, Search } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

type Market = 'US' | 'KR';
type Category = 'NASDAQ100' | 'SP500' | 'KOSPI200' | 'KOSDAQ150';
type View = 'history' | 'metrics' | 'diagnostics';

interface PerformanceRow {
  horizon: string;
  status: string;
  session_count: number;
  entry_date: string | null;
  entry_price: number | null;
  evaluation_date: string | null;
  evaluation_price: number | null;
  return_pct: number | null;
  benchmark_return_pct: number | null;
  excess_return_pct: number | null;
  mfe_pct: number | null;
  mae_pct: number | null;
  quality_status: string;
}

interface Pick {
  id: string;
  rank: number;
  ticker: string;
  exchange: string;
  name: string | null;
  universe: string;
  source: string;
  score: number;
  confidence: number;
  reason: string;
  risk: string | null;
  sector: string | null;
  recommendation_performance: PerformanceRow[];
}

interface Publication {
  id: string;
  run_date: string;
  market: Market;
  category: Category | null;
  generated_at: string;
  first_tradable_date: string | null;
  engine_version: string;
  llm_provider: string | null;
  llm_model: string | null;
  telegram_status: string;
  recommendation_picks: Pick[];
}

interface MetricSummary {
  horizon: string;
  sampleSize: number;
  positiveHitRate: number | null;
  benchmarkWinRate: number | null;
  averageReturnPct: number | null;
  medianReturnPct: number | null;
  averageExcessReturnPct: number | null;
  averageMfePct: number | null;
  averageMaePct: number | null;
}

interface DiagnosticFinding {
  id: string;
  cause_code: string;
  finding_status: string;
  severity: string;
  horizon: string;
  summary_ko: string;
  sample_size: number;
  confidence: number;
  evidence: Record<string, unknown>;
  analyzed_at: string;
}

interface FrequentPick {
  ticker: string;
  name: string | null;
  recommendationCount: number;
  averageRank: number;
  latestRunDate: string;
}

const CAUSE_LABEL: Record<string, string> = {
  MARKET_REGIME: '시장 환경',
  SELECTION: '종목 선택',
  ENTRY_TIMING: '진입 시점',
  SIGNAL_SOURCE: '신호 소스',
  CONCENTRATION: '집중도',
  DATA_QUALITY: '데이터 품질',
};

const HORIZON_SESSIONS = { D5: 5, D20: 20, D60: 60 } as const;
const CATEGORY_ITEMS: [Category, string][] = [
  ['NASDAQ100', '나스닥'],
  ['SP500', 'S&P500'],
  ['KOSPI200', '코스피'],
  ['KOSDAQ150', '코스닥'],
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORY_ITEMS) as Record<Category, string>;

function pct(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '-';
  const numeric = Number(value);
  return `${numeric > 0 ? '+' : ''}${numeric.toFixed(2)}%`;
}

function price(value: number | null | undefined, market: Market) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '-';
  return new Intl.NumberFormat(market === 'KR' ? 'ko-KR' : 'en-US', {
    style: 'currency',
    currency: market === 'KR' ? 'KRW' : 'USD',
    minimumFractionDigits: market === 'KR' ? 0 : 2,
    maximumFractionDigits: market === 'KR' ? 0 : 2,
  }).format(Number(value));
}

function performance(pick: Pick, horizon: string) {
  return pick.recommendation_performance?.find((row) => row.horizon === horizon) || null;
}

function horizonValue(row: PerformanceRow | null, horizon: keyof typeof HORIZON_SESSIONS) {
  if (row?.status === 'MATURED') return pct(row.return_pct);
  if (row?.status === 'EXCLUDED') return '제외';
  const target = HORIZON_SESSIONS[horizon];
  return `대기 ${Math.min(row?.session_count || 0, target)}/${target}`;
}

function tone(value: number | null | undefined) {
  if (value === null || value === undefined) return 'text-slate-500';
  return Number(value) > 0 ? 'text-emerald-300' : Number(value) < 0 ? 'text-rose-300' : 'text-slate-300';
}

function MetricHeaderTooltip({ label, ariaLabel, children }: { label: string; ariaLabel: string; children: React.ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button type="button" aria-label={ariaLabel} className="inline-flex cursor-help items-center gap-1 py-2 text-left hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70">
            {label}<Info className="h-3 w-3" aria-hidden="true" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content sideOffset={6} className="z-[100] max-w-[360px] rounded-xl border border-slate-700 bg-slate-900/95 p-4 text-left text-[11px] leading-5 text-slate-300 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95">
            {children}
            <Tooltip.Arrow className="fill-slate-700" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

function RecommendationsContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const categoryParam = (searchParams.get('category') || '').toUpperCase();
  const legacyMarket = searchParams.get('market') === 'KR' ? 'KR' : 'US';
  const category: Category = CATEGORY_ITEMS.some(([key]) => key === categoryParam)
    ? categoryParam as Category
    : legacyMarket === 'KR' ? 'KOSPI200' : 'NASDAQ100';
  const viewParam = searchParams.get('view');
  const view: View = viewParam === 'metrics' || viewParam === 'diagnostics' ? viewParam : 'history';
  const dateParam = searchParams.get('date') || '';
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : '';
  const dateRange = selectedDate ? `&from=${selectedDate}&to=${selectedDate}` : '';
  const endpoint = view === 'history'
    ? `/api/recommendations?category=${category}&limit=30${dateRange}`
    : `/api/recommendations/${view}?category=${category}${view === 'metrics' ? dateRange : ''}`;
  const summaryEndpoint = `/api/recommendations/summary?category=${category}`;
  const [requestState, setRequestState] = useState<{ endpoint: string | null; data: unknown; error: string | null }>({
    endpoint: null,
    data: null,
    error: null,
  });
  const loading = requestState.endpoint !== endpoint;
  const data = loading ? null : requestState.data;
  const error = loading ? null : requestState.error;
  const [summaryState, setSummaryState] = useState<{ endpoint: string | null; data: unknown; error: string | null }>({
    endpoint: null,
    data: null,
    error: null,
  });
  const summaryLoading = summaryState.endpoint !== summaryEndpoint;

  const hrefFor = (next: { category?: Category; view?: View; date?: string | null }) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('category', next.category || category);
    params.delete('market');
    const nextView = next.view || view;
    if (nextView === 'history') params.delete('view');
    else params.set('view', nextView);
    if (next.date === null) params.delete('date');
    else if (next.date !== undefined) params.set('date', next.date);
    return `${pathname}?${params.toString()}`;
  };

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || '추천 성과 데이터를 불러오지 못했습니다.');
        setRequestState({ endpoint, data: payload?.data || null, error: null });
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setRequestState({ endpoint, data: null, error: requestError instanceof Error ? requestError.message : '추천 성과 데이터를 불러오지 못했습니다.' });
      });
    return () => controller.abort();
  }, [endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(summaryEndpoint, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || '추천 빈도 요약을 불러오지 못했습니다.');
        setSummaryState({ endpoint: summaryEndpoint, data: payload?.data || null, error: null });
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setSummaryState({ endpoint: summaryEndpoint, data: null, error: requestError instanceof Error ? requestError.message : '추천 빈도 요약을 불러오지 못했습니다.' });
      });
    return () => controller.abort();
  }, [summaryEndpoint]);

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">Recommendation Review</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">추천 성과·원인 분석</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            실제 매매와 분리해 첫 거래 가능 시가부터 D5·D20·D60 성과를 측정하고, 부진 원인을 근거와 함께 복기합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Segmented items={CATEGORY_ITEMS} active={category} getHref={(key) => hrefFor({ category: key as Category })} />
          <Segmented items={[['history', '추천 이력'], ['metrics', '성과 분석'], ['diagnostics', '원인 분석']]} active={view} getHref={(key) => hrefFor({ view: key as View })} />
        </div>
      </header>

      <div className="rounded-xl border border-sky-500/25 bg-sky-500/8 px-4 py-3 text-xs leading-5 text-sky-100/80">
        가격수익률 기준이며 배당·세금·수수료·슬리피지는 포함하지 않습니다. 현재 성과는 가장 최근 거래일 종가 기준이며, D5·D20·D60은 진입일 이후 해당 거래일 수가 모두 경과해야 확정됩니다. 미성숙 기간과 품질 검증 실패 데이터는 성공률 분모에서 제외됩니다.
        <span className="mt-1 block text-sky-200/70">초과수익 = 종목 수익률 - 같은 진입일·평가일의 벤치마크 수익률입니다. NASDAQ100은 ^NDX, S&amp;P500은 ^GSPC, KOSPI200은 ^KS200, KOSDAQ150은 ^KQ150을 사용합니다.</span>
      </div>

      <FrequentPicksSummary
        data={summaryLoading ? null : summaryState.data as { from?: string; to?: string; picks?: FrequentPick[] } | null}
        loading={summaryLoading}
        error={summaryLoading ? null : summaryState.error}
      />

      {view === 'history' && (
        <section aria-label="추천일 필터" className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <label htmlFor="recommendation-date" className="text-xs font-semibold text-slate-300">추천일 선택</label>
            <p className="mt-1 text-xs text-slate-500">특정 발행일의 {CATEGORY_LABEL[category]} Top10과 기간별 성과만 확인합니다.</p>
          </div>
          <form method="get" action={pathname} className="flex items-center gap-2">
            <input type="hidden" name="category" value={category} />
            <input
              id="recommendation-date"
              aria-label="추천일 선택"
              type="date"
              name="date"
              defaultValue={selectedDate}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:border-emerald-400 hover:text-white"
            >
              조회
            </button>
            {selectedDate ? <a href={hrefFor({ date: null })} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-slate-500 hover:text-white">전체 보기</a> : <span aria-disabled="true" className="cursor-not-allowed rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 opacity-40">전체 보기</span>}
          </form>
        </section>
      )}

      {loading ? (
        <div className="flex min-h-64 items-center justify-center"><LoadingSpinner size="lg" /></div>
      ) : error ? (
        <div role="alert" className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-5 text-sm text-rose-200">
          <AlertTriangle className="mb-3 h-5 w-5" />{error}
        </div>
      ) : view === 'history' ? (
        <HistoryView publications={(data as { publications?: Publication[] } | null)?.publications || []} />
      ) : view === 'metrics' ? (
        <MetricsView data={data as { horizons?: MetricSummary[]; segments?: Array<MetricSummary & { source: string }>; cohorts?: Array<MetricSummary & { runDate: string }>; dataAsOf?: string | null } | null} />
      ) : (
        <DiagnosticsView data={data as { findings?: DiagnosticFinding[]; causeSummary?: Array<{ causeCode: string; count: number; critical: number; confirmed: number }> } | null} />
      )}
    </div>
  );
}

function FrequentPicksSummary({ data, loading, error }: {
  data: { from?: string; to?: string; picks?: FrequentPick[] } | null;
  loading: boolean;
  error: string | null;
}) {
  const picks = data?.picks || [];
  return (
    <section aria-labelledby="frequent-picks-title" className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50">
      <div className="border-b border-slate-800 px-4 py-3">
        <h2 id="frequent-picks-title" className="font-bold text-white">최근 2주 추천 빈도 Top 5</h2>
        <p className="mt-1 text-xs text-slate-500">{data?.from && data?.to ? `${data.from} ~ ${data.to} 공식 추천 기준` : '카테고리별 공식 추천 기준'}</p>
      </div>
      {loading ? (
        <div className="flex min-h-28 items-center justify-center"><LoadingSpinner size="sm" /></div>
      ) : error ? (
        <p role="alert" className="px-4 py-5 text-sm text-rose-300">{error}</p>
      ) : picks.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-slate-900/70 text-slate-500"><tr><th className="px-4 py-3">순위</th><th>종목</th><th>추천 횟수</th><th>평균 추천 순위</th><th>최근 추천일</th></tr></thead>
            <tbody className="divide-y divide-slate-800/70">
              {picks.map((pick, index) => <tr key={pick.ticker} className="text-slate-300"><td className="px-4 py-3 font-mono text-slate-500">{index + 1}</td><td className="py-3"><span className="font-bold text-white">{pick.ticker}</span><span className="ml-2 text-slate-500">{pick.name || '-'}</span></td><td className="py-3 font-mono font-semibold text-emerald-300">{pick.recommendationCount}회</td><td className="py-3 font-mono">{pick.averageRank.toFixed(1)}위</td><td className="py-3 font-mono text-slate-400">{pick.latestRunDate}</td></tr>)}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-5 text-sm text-slate-500">최근 2주간 저장된 공식 추천이 없습니다.</p>
      )}
    </section>
  );
}

function HistoryView({ publications }: { publications: Publication[] }) {
  if (!publications.length) return <EmptyState icon={CalendarDays} title="저장된 공식 추천이 없습니다" message="다음 Daily Top10 발행 또는 백필 이후 이력과 성과가 표시됩니다." />;
  return (
    <div className="space-y-5">
      {publications.map((publication) => (
        <section key={publication.id} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <div>
              <h2 className="font-bold text-white">{publication.run_date} {publication.category ? CATEGORY_LABEL[publication.category] : publication.market} Top10</h2>
              <p className="mt-1 text-xs text-slate-500">{publication.llm_provider || 'MTN'} · {publication.llm_model || publication.engine_version} · 진입일 {publication.first_tradable_date || '대기'}</p>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${publication.telegram_status === 'SENT' ? 'border-emerald-500/30 text-emerald-300' : 'border-amber-500/30 text-amber-300'}`}>
              Telegram {publication.telegram_status}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] text-left text-xs">
              <thead className="bg-slate-900/70 text-slate-500"><tr><th className="px-4 py-3">순위·종목</th><th>근거</th><th>진입 시가</th><th>현재가</th><th>현재 수익</th><th>D5</th><th>D20</th><th>D60</th><th><MetricHeaderTooltip label="초과수익" ariaLabel="초과수익 계산 기준"><p className="font-semibold text-emerald-300">종목 수익률 - 동일 기간 벤치마크 수익률</p><p className="mt-1">종목과 지수 모두 첫 거래 가능일 시가부터 같은 평가일 종가까지 계산합니다.</p><p className="mt-1 text-slate-400">NASDAQ100: ^NDX · S&amp;P500: ^GSPC<br />KOSPI200: ^KS200 · KOSDAQ150: ^KQ150</p></MetricHeaderTooltip></th><th><MetricHeaderTooltip label="MFE / MAE" ariaLabel="MFE / MAE 계산 기준"><p className="font-semibold text-emerald-300">MFE는 진입 후 가장 높았던 수익률, MAE는 가장 낮았던 수익률입니다.</p><p className="mt-1">MFE = (평가구간 최고가 ÷ 진입가 - 1) × 100</p><p>MAE = (평가구간 최저가 ÷ 진입가 - 1) × 100</p><p className="mt-1 text-slate-400">현재 표시된 최신 성숙 평가기간과 같은 구간을 사용합니다.</p></MetricHeaderTooltip></th></tr></thead>
              <tbody className="divide-y divide-slate-800/70">
                {publication.recommendation_picks.map((pick) => {
                  const d5 = performance(pick, 'D5');
                  const d20 = performance(pick, 'D20');
                  const d60 = performance(pick, 'D60');
                  const live = performance(pick, 'LIVE');
                  const latest = d60?.status === 'MATURED'
                    ? d60
                    : d20?.status === 'MATURED'
                      ? d20
                      : d5?.status === 'MATURED'
                        ? d5
                        : live?.status === 'MATURED' ? live : null;
                  const entry = [live, d5, d20, d60].find((row) => row?.entry_price !== null && row?.entry_price !== undefined) || null;
                  const current = live?.evaluation_price !== null && live?.evaluation_price !== undefined ? live : latest;
                  return (
                    <tr key={pick.id} className="align-top text-slate-300">
                      <td className="px-4 py-3">
                        <p className="font-bold text-white">{pick.rank}. {pick.ticker}</p>
                        <p className="mt-1 text-slate-500">{pick.name || pick.universe} · {pick.source}</p>
                        <a
                          href={`/stock/${encodeURIComponent(pick.ticker)}?exchange=${encodeURIComponent(pick.exchange || (publication.market === 'KR' ? 'KOSPI' : 'NAS'))}`}
                          className="mt-2 inline-flex rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-200 hover:border-sky-300 hover:text-white"
                        >
                          패턴 차트
                        </a>
                      </td>
                      <td className="max-w-sm py-3 pr-4"><p className="line-clamp-2">{pick.reason}</p>{pick.risk && <p className="mt-1 line-clamp-1 text-rose-300/70">위험: {pick.risk}</p>}</td>
                      <td className="py-3 pr-4 font-mono"><p className="font-semibold text-slate-200">{price(entry?.entry_price, publication.market)}</p><p className="mt-1 text-[10px] text-slate-500">{entry?.entry_date || '진입 대기'}</p></td>
                      <td className="py-3 pr-4 font-mono"><p className="font-semibold text-slate-200">{price(current?.evaluation_price, publication.market)}</p><p className="mt-1 text-[10px] text-slate-500">{current?.evaluation_date || '가격 대기'}</p></td>
                      <td className={`py-3 pr-4 font-mono font-semibold ${tone(live?.return_pct)}`}>{live?.status === 'MATURED' ? pct(live.return_pct) : live?.status === 'EXCLUDED' ? '제외' : '대기'}</td>
                      <td className={`py-3 pr-4 font-mono font-semibold ${tone(d5?.return_pct)}`}>{horizonValue(d5, 'D5')}</td>
                      <td className={`py-3 pr-4 font-mono font-semibold ${tone(d20?.return_pct)}`}>{horizonValue(d20, 'D20')}</td>
                      <td className={`py-3 pr-4 font-mono font-semibold ${tone(d60?.return_pct)}`}>{horizonValue(d60, 'D60')}</td>
                      <td className={`py-3 pr-4 font-mono ${tone(latest?.excess_return_pct)}`}>{pct(latest?.excess_return_pct)}</td>
                      <td className="py-3 pr-4 font-mono text-slate-400">{pct(latest?.mfe_pct)} / {pct(latest?.mae_pct)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function MetricsView({ data }: { data: { horizons?: MetricSummary[]; segments?: Array<MetricSummary & { source: string }>; cohorts?: Array<MetricSummary & { runDate: string }>; dataAsOf?: string | null } | null }) {
  const horizons = data?.horizons || [];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {horizons.map((row) => (
          <div key={row.horizon} className="rounded-xl border border-slate-800 bg-slate-950/50 p-5">
            <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-white">{row.horizon}</h2><span className="text-xs text-slate-500">n={row.sampleSize}</span></div>
            <div className="mt-5 grid grid-cols-2 gap-4"><Metric label="플러스 성공률" value={pct(row.positiveHitRate)} /><Metric label="시장 초과 성공률" value={pct(row.benchmarkWinRate)} /><Metric label="평균 수익률" value={pct(row.averageReturnPct)} toneValue={row.averageReturnPct} /><Metric label="평균 초과수익" value={pct(row.averageExcessReturnPct)} toneValue={row.averageExcessReturnPct} /></div>
            <p className="mt-4 text-xs text-slate-500">중앙값 {pct(row.medianReturnPct)} · MFE {pct(row.averageMfePct)} · MAE {pct(row.averageMaePct)}</p>
          </div>
        ))}
      </div>
      {!horizons.some((row) => row.sampleSize > 0) && <EmptyState icon={BarChart3} title="성숙한 추천 표본이 없습니다" message="각 평가기간이 경과하면 성공률과 벤치마크 초과 성과가 계산됩니다." />}
      {(data?.segments?.length || 0) > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-950/50 p-5">
          <h2 className="font-bold text-white">신호 소스별 성과</h2>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[700px] text-xs"><thead className="text-left text-slate-500"><tr><th className="py-2">기간</th><th>소스</th><th>표본</th><th>플러스</th><th>시장 초과</th><th>평균 초과수익</th></tr></thead><tbody className="divide-y divide-slate-800">{data?.segments?.map((row) => <tr key={`${row.horizon}:${row.source}`}><td className="py-3 text-white">{row.horizon}</td><td>{row.source}</td><td>{row.sampleSize}</td><td>{pct(row.positiveHitRate)}</td><td>{pct(row.benchmarkWinRate)}</td><td className={tone(row.averageExcessReturnPct)}>{pct(row.averageExcessReturnPct)}</td></tr>)}</tbody></table></div>
        </section>
      )}
    </div>
  );
}

function DiagnosticsView({ data }: { data: { findings?: DiagnosticFinding[]; causeSummary?: Array<{ causeCode: string; count: number; critical: number; confirmed: number }> } | null }) {
  const findings = data?.findings || [];
  if (!findings.length) return <EmptyState icon={Search} title="현재 원인 분석 결과가 없습니다" message="성과 배치가 실행되고 부진 또는 데이터 품질 조건이 발견되면 근거가 표시됩니다." />;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data?.causeSummary?.map((row) => <div key={row.causeCode} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"><p className="text-xs text-slate-500">{CAUSE_LABEL[row.causeCode] || row.causeCode}</p><p className="mt-2 text-2xl font-bold text-white">{row.count}</p><p className="mt-1 text-xs text-slate-500">확정 {row.confirmed} · 심각 {row.critical}</p></div>)}</div>
      <div className="space-y-3">{findings.map((finding) => <article key={finding.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-5"><div className="flex flex-wrap items-center gap-2"><span className="rounded border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-xs font-bold text-sky-200">{CAUSE_LABEL[finding.cause_code] || finding.cause_code}</span><span className={`rounded border px-2 py-1 text-[10px] font-semibold ${finding.finding_status === 'CONFIRMED' ? 'border-rose-500/30 text-rose-300' : 'border-amber-500/30 text-amber-300'}`}>{finding.finding_status === 'CONFIRMED' ? '반복 원인' : '가설'}</span><span className="text-xs text-slate-500">{finding.horizon} · n={finding.sample_size} · 신뢰도 {(Number(finding.confidence) * 100).toFixed(0)}%</span></div><p className="mt-3 text-sm leading-6 text-slate-200">{finding.summary_ko}</p><details className="mt-3 text-xs text-slate-500"><summary className="cursor-pointer hover:text-slate-300">근거 수치 보기</summary><pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3">{JSON.stringify(finding.evidence, null, 2)}</pre></details></article>)}</div>
    </div>
  );
}

function Metric({ label, value, toneValue }: { label: string; value: string; toneValue?: number | null }) {
  return <div><p className="text-[11px] text-slate-500">{label}</p><p className={`mt-1 font-mono text-lg font-bold ${toneValue === undefined ? 'text-white' : tone(toneValue)}`}>{value}</p></div>;
}

function EmptyState({ icon: Icon, title, message }: { icon: typeof Database; title: string; message: string }) {
  return <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-950/30 px-6 text-center"><Icon className="h-8 w-8 text-slate-600" /><h2 className="mt-4 font-bold text-slate-200">{title}</h2><p className="mt-2 max-w-lg text-sm text-slate-500">{message}</p></div>;
}

function Segmented({ items, active, getHref }: { items: string[][]; active: string; getHref: (key: string) => string }) {
  return <nav className="flex rounded-lg border border-slate-800 bg-slate-900 p-1">{items.map(([key, label]) => <a key={key} href={getHref(key)} aria-current={active === key ? 'page' : undefined} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${active === key ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>{label}</a>)}</nav>;
}

export default function RecommendationsPage() {
  return <Suspense fallback={<div className="flex h-[70vh] items-center justify-center"><LoadingSpinner size="lg" /></div>}><RecommendationsContent /></Suspense>;
}
