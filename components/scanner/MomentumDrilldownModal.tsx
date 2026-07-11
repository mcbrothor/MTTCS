'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Activity, RefreshCw, ShieldCheck, Target, TrendingUp, X } from 'lucide-react';
import AnalysisChartContainer from '@/components/analysis/AnalysisChartContainer';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { SurgeMetrics } from '@/lib/finance/engines/surge-score';
import type { MarketAnalysisResponse } from '@/types';

export interface MomentumDrilldownResult {
  ticker: string;
  exchange: string;
  metrics: SurgeMetrics;
  currentPrice: number | null;
}

interface Props {
  result: MomentumDrilldownResult;
  onClose: () => void;
  onRecalculate: (result: MomentumDrilldownResult) => Promise<void>;
}

export default function MomentumDrilldownModal({ result, onClose, onRecalculate }: Props) {
  const [analysis, setAnalysis] = useState<MarketAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      ticker: result.ticker,
      exchange: result.exchange,
      includeFundamentals: 'true',
    });
    fetch(`/api/market-data?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { data?: MarketAnalysisResponse; message?: string } & Partial<MarketAnalysisResponse>;
        if (!response.ok) throw new Error(payload.message || `상세 분석 실패 (${response.status})`);
        setAnalysis(payload.data ?? payload as MarketAnalysisResponse);
      })
      .catch((fetchError: unknown) => {
        if (!(fetchError instanceof DOMException && fetchError.name === 'AbortError')) {
          setError(fetchError instanceof Error ? fetchError.message : '상세 분석을 불러오지 못했습니다.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [result.exchange, result.ticker]);

  const pivotPrice = analysis?.vcpAnalysis.pivotPrice ?? null;
  const stopLossPrice = analysis?.riskPlan.selectedStopPrice ?? analysis?.riskPlan.stopLossPrice ?? null;
  const planHref = `/plan?ticker=${encodeURIComponent(result.ticker)}&exchange=${encodeURIComponent(result.exchange)}&autoAnalyze=1`;

  const recalculate = async () => {
    setRecalculating(true);
    try {
      await onRecalculate(result);
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`${result.ticker} 모멘텀 상세 분석`}
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-rose-400" />
              <h2 className="text-xl font-black text-white">{result.ticker}</h2>
              <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-bold text-rose-300">
                {result.metrics.grade}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">실시간 모멘텀과 패턴·리스크를 한 화면에서 교차 확인합니다.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="상세 분석 닫기" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Metric label="현재가" value={result.currentPrice?.toLocaleString() ?? '-'} />
            <Metric label="RVOL" value={`${result.metrics.rvol.toFixed(2)}x`} />
            <Metric label="당일 ROC" value={`${result.metrics.roc > 0 ? '+' : ''}${result.metrics.roc.toFixed(2)}%`} />
            <Metric label="VCP" value={analysis ? `${analysis.vcpAnalysis.grade} · ${analysis.vcpAnalysis.score}` : '-'} />
            <Metric label="SEPA" value={analysis?.sepaEvidence.status?.toUpperCase() ?? '-'} />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="h-[500px] overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
              <AnalysisChartContainer
                ticker={result.ticker}
                exchange={result.exchange}
                pivotPrice={pivotPrice}
                stopLossPrice={stopLossPrice}
                chartPatterns={analysis?.chartPatterns ?? []}
                initialData={analysis?.priceData.map((bar) => ({
                  time: bar.date,
                  open: bar.open,
                  high: bar.high,
                  low: bar.low,
                  close: bar.close,
                  volume: bar.volume,
                })) ?? []}
                initialSource="mtn"
              />
            </div>

            <aside className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                <ShieldCheck className="h-4 w-4 text-emerald-400" /> 실행 기준
              </h3>
              {loading ? (
                <div className="flex min-h-40 items-center justify-center"><LoadingSpinner size="sm" /></div>
              ) : error ? (
                <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs leading-5 text-rose-200">{error}</p>
              ) : (
                <div className="space-y-3 text-sm">
                  <DecisionRow label="권장 진입" value={analysis?.vcpAnalysis.recommendedEntry} />
                  <DecisionRow label="피벗" value={pivotPrice} />
                  <DecisionRow label="손절" value={stopLossPrice} />
                  <DecisionRow label="ADR" value={analysis?.adrPct} suffix="%" />
                  <DecisionRow label="R:R" value={analysis?.riskPlan.rewardRiskRatio} suffix="R" />
                </div>
              )}

              <div className="space-y-2 border-t border-slate-800 pt-4">
                <Link href={planHref} className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600">
                  <Target className="h-4 w-4" /> 매매 계획 생성
                </Link>
                <Button
                  type="button"
                  variant="outline"
                  fullWidth
                  disabled={recalculating}
                  onClick={recalculate}
                  icon={recalculating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
                >
                  이 종목만 재계산
                </Button>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-lg font-black text-white">{value}</p>
    </div>
  );
}

function DecisionRow({ label, value, suffix = '' }: { label: string; value?: number | null; suffix?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono font-bold text-slate-200">{typeof value === 'number' ? `${value.toLocaleString()}${suffix}` : '-'}</span>
    </div>
  );
}
