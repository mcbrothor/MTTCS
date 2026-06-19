'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, BarChart3, CalendarDays, Database, Search } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

type Market = 'US' | 'KR';
type View = 'history' | 'metrics' | 'diagnostics';

interface PerformanceRow {
  horizon: string;
  status: string;
  session_count: number;
  entry_date: string | null;
  entry_price: number | null;
  evaluation_date: string | null;
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

const CAUSE_LABEL: Record<string, string> = {
  MARKET_REGIME: '시장 환경',
  SELECTION: '종목 선택',
  ENTRY_TIMING: '진입 시점',
  SIGNAL_SOURCE: '신호 소스',
  CONCENTRATION: '집중도',
  DATA_QUALITY: '데이터 품질',
};

function pct(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '-';
  const numeric = Number(value);
  return `${numeric > 0 ? '+' : ''}${numeric.toFixed(2)}%`;
}

function performance(pick: Pick, horizon: string) {
  return pick.recommendation_performance?.find((row) => row.horizon === horizon) || null;
}

function tone(value: number | null | undefined) {
  if (value === null || value === undefined) return 'text-slate-500';
  return Number(value) > 0 ? 'text-emerald-300' : Number(value) < 0 ? 'text-rose-300' : 'text-slate-300';
}

function RecommendationsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const market = searchParams.get('market') === 'KR' ? 'KR' : 'US';
  const viewParam = searchParams.get('view');
  const view: View = viewParam === 'metrics' || viewParam === 'diagnostics' ? viewParam : 'history';
  const endpoint = view === 'history'
    ? `/api/recommendations?market=${market}&limit=30`
    : `/api/recommendations/${view}?market=${market}`;
  const [requestState, setRequestState] = useState<{ endpoint: string | null; data: unknown; error: string | null }>({
    endpoint: null,
    data: null,
    error: null,
  });
  const loading = requestState.endpoint !== endpoint;
  const data = loading ? null : requestState.data;
  const error = loading ? null : requestState.error;

  const update = (next: { market?: Market; view?: View }) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('market', next.market || market);
    const nextView = next.view || view;
    if (nextView === 'history') params.delete('view');
    else params.set('view', nextView);
    router.replace(`${pathname}?${params.toString()}`);
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
          <Segmented items={[['US', '미국'], ['KR', '한국']]} active={market} onChange={(key) => update({ market: key as Market })} />
          <Segmented items={[['history', '추천 이력'], ['metrics', '성과 분석'], ['diagnostics', '원인 분석']]} active={view} onChange={(key) => update({ view: key as View })} />
        </div>
      </header>

      <div className="rounded-xl border border-sky-500/25 bg-sky-500/8 px-4 py-3 text-xs leading-5 text-sky-100/80">
        가격수익률 기준이며 배당·세금·수수료·슬리피지는 포함하지 않습니다. 미성숙 기간과 품질 검증 실패 데이터는 성공률 분모에서 제외됩니다.
      </div>

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

function HistoryView({ publications }: { publications: Publication[] }) {
  if (!publications.length) return <EmptyState icon={CalendarDays} title="저장된 공식 추천이 없습니다" message="다음 Daily Top10 발행 또는 백필 이후 이력과 성과가 표시됩니다." />;
  return (
    <div className="space-y-5">
      {publications.map((publication) => (
        <section key={publication.id} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <div>
              <h2 className="font-bold text-white">{publication.run_date} Top10</h2>
              <p className="mt-1 text-xs text-slate-500">{publication.llm_provider || 'MTN'} · {publication.llm_model || publication.engine_version} · 진입일 {publication.first_tradable_date || '대기'}</p>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${publication.telegram_status === 'SENT' ? 'border-emerald-500/30 text-emerald-300' : 'border-amber-500/30 text-amber-300'}`}>
              Telegram {publication.telegram_status}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className="bg-slate-900/70 text-slate-500"><tr><th className="px-4 py-3">순위·종목</th><th>근거</th><th>D5</th><th>D20</th><th>D60</th><th>초과수익</th><th>MFE / MAE</th></tr></thead>
              <tbody className="divide-y divide-slate-800/70">
                {publication.recommendation_picks.map((pick) => {
                  const d5 = performance(pick, 'D5');
                  const d20 = performance(pick, 'D20');
                  const d60 = performance(pick, 'D60');
                  const latest = d60?.status === 'MATURED' ? d60 : d20?.status === 'MATURED' ? d20 : d5;
                  return (
                    <tr key={pick.id} className="align-top text-slate-300">
                      <td className="px-4 py-3"><p className="font-bold text-white">{pick.rank}. {pick.ticker}</p><p className="mt-1 text-slate-500">{pick.name || pick.universe} · {pick.source}</p></td>
                      <td className="max-w-sm py-3 pr-4"><p className="line-clamp-2">{pick.reason}</p>{pick.risk && <p className="mt-1 line-clamp-1 text-rose-300/70">위험: {pick.risk}</p>}</td>
                      {[d5, d20, d60].map((row, index) => <td key={index} className={`py-3 pr-4 font-mono font-semibold ${tone(row?.return_pct)}`}>{row?.status === 'MATURED' ? pct(row.return_pct) : row?.status === 'EXCLUDED' ? '제외' : '대기'}</td>)}
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

function Segmented({ items, active, onChange }: { items: string[][]; active: string; onChange: (key: string) => void }) {
  return <div className="flex rounded-lg border border-slate-800 bg-slate-900 p-1">{items.map(([key, label]) => <button key={key} type="button" onClick={() => onChange(key)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${active === key ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>{label}</button>)}</div>;
}

export default function RecommendationsPage() {
  return <Suspense fallback={<div className="flex h-[70vh] items-center justify-center"><LoadingSpinner size="lg" /></div>}><RecommendationsContent /></Suspense>;
}
