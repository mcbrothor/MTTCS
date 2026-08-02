'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  IntelligenceFeedResponse,
  IntelligenceMarket,
  IntelligenceSeverity,
  StoredIntelligenceEvent,
} from '@/lib/intelligence/types';

const severityStyle: Record<IntelligenceSeverity, string> = {
  RISK: 'border-rose-400/40 bg-rose-500/10 text-rose-200',
  WATCH: 'border-amber-400/40 bg-amber-500/10 text-amber-100',
  INFO: 'border-sky-400/30 bg-sky-500/10 text-sky-200',
};

const readinessStyle = {
  READY: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100',
  CAUTION: 'border-amber-400/30 bg-amber-500/10 text-amber-100',
  BLOCKED: 'border-rose-400/30 bg-rose-500/10 text-rose-100',
};

const DASHBOARD_REFRESH_MS = 5 * 60 * 1000;

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function eventTypeLabel(event: StoredIntelligenceEvent) {
  const labels: Record<StoredIntelligenceEvent['eventType'], string> = {
    MACRO_RELEASE: '경제지표',
    CENTRAL_BANK: '중앙은행',
    REGULATORY: '규제·거래정지',
    FILING: '공시',
    EARNINGS: '실적',
    NEWS: '뉴스',
  };
  return labels[event.eventType];
}

export default function MarketIntelligencePage() {
  const [market, setMarket] = useState<IntelligenceMarket>('US');
  const [payload, setPayload] = useState<IntelligenceFeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [error, setError] = useState('');
  const activeRequest = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    try {
      const response = await fetch(`/api/market-intelligence?market=${market}&limit=120`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || '시장 인텔리전스를 불러오지 못했습니다.');
      setPayload(body.data);
      setError('');
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  }, [market]);

  const refreshOfficialSources = useCallback(async () => {
    setIngesting(true);
    try {
      const response = await fetch('/api/market-intelligence', {
        method: 'POST',
        cache: 'no-store',
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || '공식 원천을 갱신하지 못했습니다.');
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setIngesting(false);
    }
  }, [refresh]);

  useEffect(() => {
    setLoading(true);
    setPayload(null);
    setError('');
    void refresh();
    const interval = window.setInterval(() => void refresh(), DASHBOARD_REFRESH_MS);
    return () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
      window.clearInterval(interval);
    };
  }, [refresh]);

  const counts = useMemo(() => {
    const events = payload?.events || [];
    return {
      risk: events.filter((event) => event.severity === 'RISK').length,
      watch: events.filter((event) => event.severity === 'WATCH').length,
      primary: events.filter((event) => event.sourceTier === 'PRIMARY').length,
    };
  }, [payload]);

  const readiness = payload?.readiness;

  return (
    <div className="space-y-5 pb-12">
      <section className="panel-grid p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Official-source intelligence</p>
            <h1 className="mt-1 text-3xl font-black">준실시간 시장 인텔리전스</h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">
              연준·한국은행·SEC·BLS의 1차 출처를 수집해 게시시각과 최초 관측시각을 보존합니다.
              무료 인프라에서 30분 간격으로 확인하며, 중요도는 위험 확인 순서이지 매수·매도 방향 예측이 아닙니다.
            </p>
          </div>
          <div className="flex rounded-xl border border-[var(--border)] bg-black/20 p-1" aria-label="시장 선택">
            {(['US', 'KR'] as IntelligenceMarket[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMarket(value)}
                className={`rounded-lg px-4 py-2 text-sm font-bold ${market === value ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </section>

      {readiness ? (
        <section className={`rounded-2xl border p-5 ${readinessStyle[readiness.status]}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest">Decision readiness · {readiness.status}</p>
              <p className="mt-1 text-xl font-black">검토용 위험 배수 {readiness.advisoryRiskMultiplier.toFixed(2)}×</p>
            </div>
            <p className="text-xs opacity-80">마지막 수집 성공 {formatDate(readiness.lastSuccessfulIngestionAt)}</p>
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {readiness.reasons.map((reason) => <li key={reason}>· {reason}</li>)}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            {readiness.sourceHealth.map((source) => (
              <span key={source.source} className="rounded-full border border-current/20 px-2 py-1">
                {source.source} · {source.status}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs opacity-70">이 배수는 shadow advisory이며 검증 전에는 기존 포지션 크기를 자동 변경하지 않습니다.</p>
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ['고중요도', counts.risk, '원문 우선 확인'],
          ['주의', counts.watch, '6시간 변화 점검'],
          ['1차 출처', counts.primary, '공식 원천 이벤트'],
        ].map(([label, value, sub]) => (
          <div key={String(label)} className="panel-grid p-5">
            <p className="text-xs text-[var(--text-tertiary)]">{label}</p>
            <p className="mt-1 font-mono text-3xl font-black">{value}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{sub}</p>
          </div>
        ))}
      </section>

      {error ? (
        <section className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-5 text-sm text-rose-100">
          <p className="font-bold">수집 원장 조회 실패</p>
          <p className="mt-1">{error}</p>
          <p className="mt-2 text-xs opacity-80">신규 마이그레이션과 Supabase `market-intelligence` cron 적용 여부를 확인하세요.</p>
        </section>
      ) : null}

      <section className="panel-grid overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="font-bold">이벤트 원장</h2>
            <p className="text-xs text-[var(--text-tertiary)]">최근 7일 · 화면은 5분, 공식 원천은 30분마다 갱신</p>
          </div>
          <button
            type="button"
            onClick={() => void refreshOfficialSources()}
            disabled={ingesting}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold hover:border-emerald-400/40 disabled:cursor-wait disabled:opacity-50"
          >
            {ingesting ? '원천 확인 중…' : '공식 원천 갱신'}
          </button>
        </div>

        {loading && !payload ? <p className="p-6 text-sm text-slate-400">공식 원천을 확인하는 중입니다…</p> : null}
        {!loading && payload?.events.length === 0 ? (
          <p className="p-6 text-sm text-slate-400">최근 이벤트가 없습니다. 최초 Supabase Cron 수집 후 이곳에 표시됩니다.</p>
        ) : null}
        <div className="divide-y divide-[var(--border)]">
          {payload?.events.map((event) => (
            <article key={event.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className={`rounded-full border px-2 py-1 font-bold ${severityStyle[event.severity]}`}>{event.severity}</span>
                    <span className="rounded-full border border-slate-700 px-2 py-1 text-slate-300">{eventTypeLabel(event)}</span>
                    {event.isRevision ? <span className="rounded-full border border-violet-400/30 px-2 py-1 text-violet-200">정정</span> : null}
                    <span className="text-slate-500">{event.source} · 이벤트 {formatDate(event.publishedAt)} · 최초 관측 {formatDate(event.firstSeenAt)}</span>
                  </div>
                  <h3 className="mt-2 text-base font-bold text-white">{event.title}</h3>
                  {event.summary ? <p className="mt-2 text-sm leading-6 text-slate-300">{event.summary}</p> : null}
                  <p className="mt-3 rounded-lg bg-black/20 p-3 text-xs leading-5 text-slate-300">
                    <span className="font-bold text-emerald-200">왜 중요한가</span> · {event.analysis.whyItMatters}
                  </p>
                </div>
                {event.sourceUrl ? (
                  <a href={event.sourceUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold text-slate-300 hover:border-emerald-400/40 hover:text-white">
                    원문 확인
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
