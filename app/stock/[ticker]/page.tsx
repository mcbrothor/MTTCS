'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import AnalysisChartContainer from '@/components/analysis/AnalysisChartContainer';
import FreshnessBadge from '@/components/ui/FreshnessBadge';
import type { ChartPatternOverlay, DataSourceMeta, MarketAnalysisResponse, SecurityEvent } from '@/types';

function patternTone(pattern: ChartPatternOverlay) {
  if (pattern.status === 'CONFIRMED') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (pattern.status === 'FORMING') return 'border-sky-500/30 bg-sky-500/10 text-sky-200';
  return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
}

function compactEvidence(value: unknown) {
  if (Array.isArray(value)) return value.slice(0, 4).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value).slice(0, 80);
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

export default function Stock360Page() {
  const { ticker } = useParams<{ ticker: string }>();
  const search = useSearchParams();
  const exchange = search.get('exchange') || 'NAS';

  return <Stock360Content key={`${ticker}:${exchange}`} ticker={ticker} exchange={exchange} />;
}

function Stock360Content({ ticker, exchange }: { ticker: string; exchange: string }) {
  const [analysis, setAnalysis] = useState<MarketAnalysisResponse | null>(null);
  const [meta, setMeta] = useState<DataSourceMeta | null>(null);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [error, setError] = useState('');
  const [focusedPatternId, setFocusedPatternId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/market-data?ticker=${encodeURIComponent(ticker)}&exchange=${exchange}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message);
        setAnalysis(payload.data || payload);
        setMeta(payload.meta || null);
        setError('');
      })
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : String(requestError)));

    fetch(`/api/security-events?ticker=${encodeURIComponent(ticker)}&exchange=${exchange}`)
      .then((response) => response.json())
      .then((payload) => setEvents(payload.data || []))
      .catch(() => setEvents([]));
  }, [ticker, exchange]);

  const latest = analysis?.priceData?.at(-1);
  const rs = analysis?.sepaEvidence?.metrics?.rsRating;
  const vcp = analysis?.vcpAnalysis;
  const patterns = analysis?.chartPatterns ?? [];

  return (
    <div className="space-y-5 pb-12">
      <section className="panel-grid p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">Stock 360</p>
            <h1 className="mt-1 text-3xl font-black">{ticker}</h1>
            <p className="text-sm text-[var(--text-secondary)]">{exchange} · 가격, 추세, 리스크, 공시를 한 화면에서 확인합니다.</p>
          </div>
          {meta ? <FreshnessBadge meta={meta} /> : null}
        </div>
        {error ? <p className="mt-5 text-rose-300">{error}</p> : null}
      </section>

      {analysis ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['현재가', latest?.close?.toLocaleString() || '-'],
              ['RS Rating', rs ?? '-'],
              ['VCP', `${vcp?.grade || '-'} / ${vcp?.score ?? '-'}`],
              ['패턴', `${patterns.length}개`],
            ].map(([label, value]) => (
              <div key={String(label)} className="panel-grid p-5">
                <p className="text-xs text-[var(--text-tertiary)]">{label}</p>
                <p className="mt-2 font-mono text-2xl font-bold">{value}</p>
              </div>
            ))}
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3">
              <h2 className="font-bold text-white">MTN Pro 패턴 차트</h2>
              <div className="flex max-w-full flex-wrap gap-2">
                {patterns.slice(0, 5).map((pattern) => (
                  <button
                    key={pattern.id}
                    type="button"
                    onClick={() => setFocusedPatternId((current) => current === pattern.id ? null : pattern.id)}
                    aria-pressed={focusedPatternId === pattern.id}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${patternTone(pattern)} ${
                      focusedPatternId === pattern.id ? 'ring-1 ring-white/70' : 'hover:brightness-125'
                    }`}
                  >
                    {pattern.label} {(pattern.confidence * 100).toFixed(0)}%
                  </button>
                ))}
              </div>
            </div>
            <div className="h-[620px]">
              <AnalysisChartContainer
                ticker={ticker}
                exchange={exchange}
                pivotPrice={analysis.vcpAnalysis.pivotPrice}
                stopLossPrice={analysis.riskPlan.selectedStopPrice ?? analysis.riskPlan.stopLossPrice}
                targetPrice={analysis.riskPlan.targetPrice}
                chartPatterns={patterns}
                focusedPatternId={focusedPatternId}
                onPatternFocusChange={setFocusedPatternId}
                initialData={analysis.priceData.map((bar) => ({
                  time: bar.date,
                  open: bar.open,
                  high: bar.high,
                  low: bar.low,
                  close: bar.close,
                  volume: bar.volume,
                }))}
                initialSource="mtn"
              />
            </div>
          </section>

          {patterns.length > 0 ? (
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {patterns.slice(0, 6).map((pattern) => (
                <article key={pattern.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-white">{pattern.label}</h3>
                      <p className="mt-1 text-xs text-slate-500">{pattern.type} · {pattern.status}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${patternTone(pattern)}`}>
                      {(pattern.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <p className="rounded-lg bg-slate-900/70 p-2 text-slate-400">
                      <span className="block text-slate-500">기간</span>
                      {pattern.dateRange.start} → {pattern.dateRange.end}
                    </p>
                    <p className="rounded-lg bg-slate-900/70 p-2 text-slate-400">
                      <span className="block text-slate-500">가격대</span>
                      {pattern.priceRange.low.toLocaleString()} ~ {pattern.priceRange.high.toLocaleString()}
                    </p>
                  </div>
                  <dl className="mt-3 space-y-1 text-xs text-slate-400">
                    {Object.entries(pattern.evidence).slice(0, 4).map(([key, value]) => (
                      <div key={key} className="flex justify-between gap-3 border-t border-slate-800/70 pt-1">
                        <dt className="text-slate-500">{key}</dt>
                        <dd className="max-w-[65%] truncate text-right">{compactEvidence(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </section>
          ) : null}

          <section className="panel-grid p-5">
            <h2 className="font-bold">투자 체크</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <p>SEPA <b>{analysis.sepaEvidence?.status}</b></p>
              <p>손절가 <b>{analysis.riskPlan?.stopLossPrice?.toLocaleString() || '-'}</b></p>
              <p>진입가 <b>{analysis.riskPlan?.entryPrice?.toLocaleString() || '-'}</b></p>
            </div>
            {analysis.warnings?.length > 0 ? (
              <ul className="mt-4 text-xs text-amber-200">
                {analysis.warnings.map((warning) => <li key={warning}>· {warning}</li>)}
              </ul>
            ) : null}
          </section>
        </>
      ) : null}

      <section className="panel-grid p-5">
        <h2 className="font-bold">공시·실적 이벤트 리스크</h2>
        {events.length ? (
          <div className="mt-3 space-y-2">
            {events.map((event) => (
              <a
                key={event.external_id}
                href={event.source_url || '#'}
                target="_blank"
                rel="noreferrer"
                className="block rounded-xl border border-[var(--border)] p-3 hover:border-emerald-400/30"
              >
                <span className="text-xs text-amber-200">{event.source} · {new Date(event.occurred_at).toLocaleDateString('ko-KR')}</span>
                <p className="mt-1 text-sm">{event.title}</p>
              </a>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--text-tertiary)]">최근 중요 이벤트가 없거나 원천 API가 설정되지 않았습니다.</p>
        )}
      </section>
    </div>
  );
}
