'use client';

import { useCallback, useEffect, useState } from 'react';
import DataSourceBadge from '@/components/ui/DataSourceBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { ApiSuccess, DataSourceMeta, PortfolioRiskSummary } from '@/types';

async function parseResponse<T>(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || body.error || `Request failed (${response.status})`);
  return body as ApiSuccess<T>;
}

function money(value: number, market: 'US' | 'KR') {
  return new Intl.NumberFormat(market === 'KR' ? 'ko-KR' : 'en-US', {
    style: 'currency',
    currency: market === 'KR' ? 'KRW' : 'USD',
    maximumFractionDigits: market === 'KR' ? 0 : 2,
  }).format(value);
}

function signedMoney(value: number | null | undefined, market: 'US' | 'KR') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return `${value >= 0 ? '+' : ''}${money(value, market)}`;
}

function actionLabel(value: string | null | undefined) {
  if (value === 'INITIAL_ENTRY') return '초기 진입';
  if (value === 'PYRAMID') return '피라미딩';
  if (value === 'PARTIAL_EXIT') return '부분 매도';
  if (value === 'FULL_EXIT') return '전량 청산';
  if (value === 'MANUAL_EXIT') return '수동 청산';
  return value || '-';
}

export default function PortfolioPage() {
  const [market, setMarket] = useState<'US' | 'KR'>('US');
  const [summary, setSummary] = useState<PortfolioRiskSummary | null>(null);
  const [meta, setMeta] = useState<DataSourceMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextMarket: 'US' | 'KR') => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/portfolio/risk?market=${nextMarket}`);
      const result = await parseResponse<PortfolioRiskSummary>(response);
      setSummary(result.data);
      setMeta(result.meta);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '포트폴리오 리스크를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load('US');
  }, [load]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">Portfolio Risk</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">포트폴리오 리스크</h1>
          <p className="mt-3 text-sm text-slate-400">
            총 노출, 현금 비중, 오픈 리스크, 섹터 집중도와 개별 포지션 상태를 한 화면에서 점검합니다.
          </p>
        </div>
        <DataSourceBadge meta={meta} />
      </div>

      <div className="flex gap-2">
        {(['US', 'KR'] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setMarket(item);
              load(item);
            }}
            className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
              market === item ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200' : 'border-slate-800 bg-slate-900 text-slate-400'
            }`}
          >
            {item === 'US' ? '미국' : '한국'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>
      ) : summary ? (
        <>
          {summary.warnings.length > 0 && (
            <div className="space-y-2">
              {summary.warnings.map((warning) => (
                <div key={warning} className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                  {warning}
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Metric label="총 자산" value={money(summary.totalEquity, market)} />
            <Metric label="투입 금액" value={money(summary.investedCapital, market)} />
            <Metric label="현금" value={`${money(summary.cash, market)} (${summary.cashPct}%)`} />
            <Metric label="오픈 리스크" value={`${money(summary.totalOpenRisk, market)} (${summary.openRiskPct}%)`} />
            <Metric
              label="보유 포지션"
              value={`${summary.activePositions}/${summary.maxPositions}`}
              tooltip={
                market === 'KR'
                  ? '• 200만 이하: 최대 2개\n• 1000만 이하: 최대 5개\n• 1000만 초과: 최대 10개'
                  : '• $1,000 이하: 최대 2개\n• $10,000 이하: 최대 5개\n• $10,000 초과: 최대 10개'
              }
            />
          </div>

          <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-5">
            <h2 className="text-lg font-bold text-white">섹터 노출도</h2>
            <div className="mt-4 space-y-3">
              {summary.sectorExposure.length === 0 ? (
                <p className="text-sm text-slate-400">현재 노출된 섹터가 없습니다.</p>
              ) : summary.sectorExposure.map((row) => (
                <div key={row.sector}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-200">{row.sector} ({row.count})</span>
                    <span className="font-mono text-slate-400">{money(row.exposure, market)} | {row.exposurePct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-lg bg-slate-800">
                    <div className="h-full bg-emerald-500" style={{ width: `${Math.min(row.exposurePct, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-white">활성 포지션</h2>
              <p className="text-xs text-slate-400">실시간 손익과 피라미딩/부분매도 이력을 함께 표시합니다.</p>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {summary.positions && summary.positions.length > 0 ? summary.positions.map((position) => (
                <div key={position.ticker} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-lg font-bold text-white">{position.ticker}</p>
                      <p className="mt-1 text-xs text-slate-500">{position.sector}</p>
                    </div>
                    <div className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200">
                      {actionLabel(position.latestAction)}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <PositionMetric label="노출 금액" value={money(position.exposure, market)} />
                    <PositionMetric label="보유 수량" value={position.netShares.toLocaleString()} />
                    <PositionMetric label="평균 단가" value={position.avgEntryPrice === null ? '-' : money(position.avgEntryPrice, market)} />
                    <PositionMetric label="현재가" value={position.currentPrice === null ? '-' : money(position.currentPrice, market)} />
                    <PositionMetric
                      label="평가손익"
                      value={signedMoney(position.unrealizedPnL, market)}
                      accent={typeof position.unrealizedPnL === 'number' && position.unrealizedPnL >= 0 ? 'text-emerald-300' : 'text-rose-300'}
                    />
                    <PositionMetric
                      label="평가 R"
                      value={typeof position.unrealizedR === 'number' ? `${position.unrealizedR.toFixed(2)}R` : '-'}
                      accent={typeof position.unrealizedR === 'number' && position.unrealizedR >= 0 ? 'text-emerald-300' : 'text-rose-300'}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                      피라미딩 {position.pyramidCount}회
                    </span>
                    <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100">
                      부분 매도 {position.partialExitCount}회
                    </span>
                    <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-100">
                      오픈 리스크 {money(position.openRisk, market)}
                    </span>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-slate-400">현재 활성 포지션이 없습니다.</p>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Metric({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  return (
    <div className="group relative rounded-lg border border-slate-800 bg-slate-950/50 p-4 transition-colors hover:border-slate-700">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 font-mono text-xl font-bold text-white">{value}</p>
      {tooltip && (
        <div className="pointer-events-none absolute -top-2 left-1/2 z-50 w-max -translate-x-1/2 -translate-y-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 opacity-0 shadow-xl transition-all group-hover:top-0 group-hover:opacity-100">
          <p className="font-semibold text-emerald-400 mb-1">포지션 제한 규칙</p>
          <div className="whitespace-pre-line leading-relaxed">{tooltip}</div>
          <div className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 translate-y-1/2 rotate-45 border-b border-r border-slate-700 bg-slate-900" />
        </div>
      )}
    </div>
  );
}

function PositionMetric({ label, value, accent = 'text-white' }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 font-mono text-sm font-bold ${accent}`}>{value}</p>
    </div>
  );
}
