'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import TickerInput from '@/components/plan/TickerInput';
import SepaAnalysis from '@/components/plan/SepaAnalysis';
import VcpAnalysisPanel from '@/components/plan/VcpAnalysisPanel';
import RiskCalculator from '@/components/plan/RiskCalculator';
import ChecklistForm from '@/components/plan/ChecklistForm';
import ScannerContextBanner from '@/components/plan/ScannerContextBanner';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useMarketData } from '@/hooks/useMarketData';

// useSearchParams는 Suspense 바운더리 내에서만 사용 가능 (Next.js 14+)
export default function PlanPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center p-12 text-slate-400"><LoadingSpinner /> 페이지 로드 중...</div>}>
      <PlanPageContent />
    </Suspense>
  );
}

function PlanPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTicker = searchParams.get('ticker') || '';
  const initialExchange = searchParams.get('exchange') || 'NAS';

  // 스캐너에서 전달받은 컨텍스트 데이터 — 계획서 수립 시 참고용
  const scannerContext = {
    ticker: initialTicker,
    pivot: searchParams.get('pivot'),
    entry: searchParams.get('entry'),
    rs: searchParams.get('rs'),
    vcpScore: searchParams.get('vcpScore'),
    vcpGrade: searchParams.get('vcpGrade'),
    rsNewHigh: searchParams.get('rsNewHigh'),
    pivotDist: searchParams.get('pivotDist'),
  };

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
  const [saveSuccess, setSaveSuccess] = useState(false);
  // C-6: alert() 대신 인라인 에러 상태
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleAnalyze = (ticker: string, exchange: string, totalEquity: number, riskPercent: number) => {
    setChecklist(null);
    setSaveError(null);
    fetchMarketData(ticker, exchange, totalEquity, riskPercent);
  };

  const handleSavePlan = async () => {
    if (!analysis || !checklist) return;

    setSaving(true);
    setSaveError(null);
    try {
      await axios.post('/api/trades', {
        ticker: analysis.ticker,
        direction: 'LONG',
        ...checklist,
        chk_market: checklist.chk_sepa,
        sepa_evidence: analysis.sepaEvidence,
        vcp_analysis: analysis.vcpAnalysis,
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
      setSaveSuccess(true);
    } catch (err: unknown) {
      // C-6: alert() 대신 인라인 에러 메시지로 교체
      const message = axios.isAxiosError(err)
        ? err.response?.data?.message || err.response?.data?.error || err.message
        : err instanceof Error
          ? err.message
          : '매매 계획 저장 중 오류가 발생했습니다.';
      setSaveError(message);
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
          SEPA 후보 검증 → VCP 피벗 분석 → 패턴 무효화 기반 수량 산출 → Centaur 체크리스트를 한 흐름으로 실행합니다.
        </p>
      </div>

      <TickerInput onAnalyze={handleAnalyze} loading={loading} initialTicker={initialTicker} initialExchange={initialExchange} />

      {/* 스캐너에서 넘어온 경우 컨텍스트 데이터 배너 표시 */}
      {(scannerContext.pivot || scannerContext.rs) && (
        <ScannerContextBanner {...scannerContext} />
      )}

      {loading && (
        <div className="flex items-center justify-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-6 text-slate-300">
          <LoadingSpinner />
          KIS 일봉과 Yahoo 보조 데이터를 모아 SEPA + VCP 조건을 분석하는 중입니다.
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

          {/* VCP 매수 타점 분석 — SEPA 다음, 리스크 계산 전에 배치 */}
          <VcpAnalysisPanel analysis={analysis.vcpAnalysis} />

          <RiskCalculator riskPlan={analysis.riskPlan} />
          <ChecklistForm sepaStatus={analysis.sepaEvidence.status} onComplete={setChecklist} />

          {/* C-6: 저장 에러 인라인 표시 */}
          {saveError && (
            <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <p className="text-sm text-red-100">{saveError}</p>
              <button
                type="button"
                onClick={() => setSaveError(null)}
                className="ml-3 rounded-md px-3 py-1 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20"
              >
                닫기
              </button>
            </div>
          )}

          {saveSuccess ? (
            <div className="flex items-center justify-between rounded-[16px] border border-sky-700/30 bg-sky-900/10 px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">✓ 계획 저장 완료</p>
                <p className="mt-1 text-sm text-slate-300">이 포지션이 내 포트폴리오 리스크에 주는 영향을 확인하세요.</p>
              </div>
              <div className="ml-4 flex shrink-0 gap-2">
                <Link
                  href="/portfolio"
                  className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400"
                >
                  포트폴리오 확인 →
                </Link>
                <button
                  type="button"
                  onClick={() => { setSaveSuccess(false); router.push('/'); }}
                  className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:bg-slate-800"
                >
                  대시보드
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 border-t border-slate-800 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-400">
                저장 시 SEPA 판정 근거, VCP 피벗, 허용 손실 비율, 무효화선과 진입 계획이 함께 기록됩니다.
              </p>
              <Button className="px-8 py-3" onClick={handleSavePlan} disabled={saveBlocked}>
                {saving ? '저장 중...' : '계획 저장'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
