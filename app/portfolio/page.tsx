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
      setError(err instanceof Error ? err.message : 'Failed to load portfolio risk.');
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
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">총 노출도와 오픈 리스크</h1>
          <p className="mt-3 text-sm text-slate-400">활성 포지션 수, 섹터 집중도, 시드 규모별 최대 보유 수를 점검합니다.</p>
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
            {item}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center"><LoadingSpinner size="lg" /></div>
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
            <Metric label="Total equity" value={money(summary.totalEquity, market)} />
            <Metric label="Invested" value={money(summary.investedCapital, market)} />
            <Metric label="Cash" value={`${money(summary.cash, market)} (${summary.cashPct}%)`} />
            <Metric label="Open risk" value={`${money(summary.totalOpenRisk, market)} (${summary.openRiskPct}%)`} />
            <Metric label="Positions" value={`${summary.activePositions}/${summary.maxPositions}`} />
          </div>

          <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-5">
            <h2 className="text-lg font-bold text-white">Sector exposure</h2>
            <div className="mt-4 space-y-3">
              {summary.sectorExposure.length === 0 ? (
                <p className="text-sm text-slate-400">활성 포지션이 없습니다.</p>
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
        </>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 font-mono text-xl font-bold text-white">{value}</p>
    </div>
  );
}
