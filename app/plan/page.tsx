'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import TickerInput from '@/components/plan/TickerInput';
import SepaAnalysis from '@/components/plan/SepaAnalysis';
import RiskCalculator from '@/components/plan/RiskCalculator';
import ChecklistForm from '@/components/plan/ChecklistForm';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useMarketData } from '@/hooks/useMarketData';

export default function PlanPage() {
  const router = useRouter();
  const { loading, error, analysis, fetchMarketData } = useMarketData();
  const [checklist, setChecklist] = useState<{
    chk_sepa: boolean;
    chk_risk: boolean;
    chk_entry: boolean;
    chk_stoploss: boolean;
    chk_exit: boolean;
    chk_psychology: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleAnalyze = (ticker: string, exchange: string, totalEquity: number, riskPercent: number) => {
    setChecklist(null);
    fetchMarketData(ticker, exchange, totalEquity, riskPercent);
  };

  const handleSavePlan = async () => {
    if (!analysis || !checklist) return;

    setSaving(true);
    try {
      await axios.post('/api/trades', {
        ticker: analysis.ticker,
        direction: 'LONG',
        ...checklist,
        chk_market: checklist.chk_sepa,
        sepa_evidence: analysis.sepaEvidence,
        total_equity: analysis.riskPlan.totalEquity,
        planned_risk: analysis.riskPlan.maxRisk,
        risk_percent: analysis.riskPlan.riskPercent,
        atr_value: analysis.riskPlan.atr,
        entry_price: analysis.riskPlan.entryPrice,
        stoploss_price: analysis.riskPlan.stopLossPrice,
        position_size: analysis.riskPlan.totalShares,
        total_shares: analysis.riskPlan.totalShares,
        entry_targets: analysis.riskPlan.entryTargets,
        trailing_stops: analysis.riskPlan.trailingStops,
      });
      router.push('/');
    } catch (err: unknown) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.message || err.response?.data?.error || err.message
        : err instanceof Error
          ? err.message
          : '매매 계획 저장 중 오류가 발생했습니다.';
      alert(message);
    } finally {
      setSaving(false);
    }
  };

  const saveBlocked =
    !analysis ||
    !checklist ||
    analysis.sepaEvidence.status === 'fail' ||
    analysis.riskPlan.totalShares <= 0 ||
    saving;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">New Trade Plan</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">신규 매매 계획</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          SEPA 후보 검증, 허용 손실 기반 수량 산출, 3분할 피라미딩, Centaur 체크리스트를 한 흐름으로 실행합니다.
        </p>
      </div>

      <TickerInput onAnalyze={handleAnalyze} loading={loading} />

      {loading && (
        <div className="flex items-center justify-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-6 text-slate-300">
          <LoadingSpinner />
          KIS 일봉과 Yahoo 보조 데이터를 모아 SEPA 조건을 분석하는 중입니다.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      )}

      {analysis && (
        <>
          <SepaAnalysis analysis={analysis} />
          <RiskCalculator riskPlan={analysis.riskPlan} />
          <ChecklistForm sepaStatus={analysis.sepaEvidence.status} onComplete={setChecklist} />

          <div className="flex flex-col gap-3 border-t border-slate-800 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-400">
              저장 시 SEPA 판정 근거, 허용 손실 비율, 피라미딩 가격과 단계별 스탑이 함께 기록됩니다.
            </p>
            <Button className="px-8 py-3" onClick={handleSavePlan} disabled={saveBlocked}>
              {saving ? '저장 중...' : '계획 저장'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
