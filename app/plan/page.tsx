'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import TickerInput from '@/components/plan/TickerInput';
import SepaAnalysis from '@/components/plan/SepaAnalysis';
import dynamic from 'next/dynamic';
const VcpAnalysisPanel = dynamic(() => import('@/components/plan/VcpAnalysisPanel'), { ssr: false });
import RiskCalculator from '@/components/plan/RiskCalculator';
import ChecklistForm from '@/components/plan/ChecklistForm';
import ScannerContextBanner from '@/components/plan/ScannerContextBanner';
import ManualStrategyForm, { type ManualStrategyDraft } from '@/components/plan/ManualStrategyForm';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useMarketData } from '@/hooks/useMarketData';
import { useMarket } from '@/contexts/MarketContext';
import { CONTEST_PLAN_QUEUE_STORAGE_KEY, type ContestPlanQueueItem } from '@/lib/contest-followup';
import { buildCapitalSnapshot } from '@/lib/finance/core/capital-basis';
import type { ApiSuccess, CapitalSnapshot, PlanMode, PortfolioRiskSummary, RiskStrategy } from '@/types';

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
  const { market: contextMarket, setMarket: setContextMarket } = useMarket();
  const initialTicker = searchParams.get('ticker') || '';
  const initialExchange = searchParams.get('exchange') || 'NAS';
  const shouldAutoAnalyze = searchParams.get('autoAnalyze') === '1';
  const [planMode, setPlanMode] = useState<PlanMode>('SYSTEM_ANALYSIS');
  const [planMarket, setPlanMarket] = useState<'US' | 'KR'>(
    (initialExchange === 'KOSPI' || initialExchange === 'KOSDAQ' || searchParams.get('market') === 'KR')
      ? 'KR'
      : (searchParams.get('market') === 'US' ? 'US' : contextMarket || 'US')
  );

  useEffect(() => {
    if (contextMarket !== planMarket) {
      setContextMarket(planMarket);
    }
  }, [planMarket, contextMarket, setContextMarket]);

  const autoAnalyzeStarted = useRef(false);
  const [contestQueue, setContestQueue] = useState<ContestPlanQueueItem[]>([]);
  const [defaultTotalEquity, setDefaultTotalEquity] = useState(0);
  const [portfolioRisk, setPortfolioRisk] = useState<PortfolioRiskSummary | null>(null);
  const [capitalCapturedAt, setCapitalCapturedAt] = useState('');
  const [equityLoadError, setEquityLoadError] = useState<string | null>(null);

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
  const [manualDraft, setManualDraft] = useState<ManualStrategyDraft | null>(null);
  const [analysisCapitalSnapshot, setAnalysisCapitalSnapshot] = useState<CapitalSnapshot | null>(null);
  // C-6: alert() 대신 인라인 에러 상태
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleAnalyze = useCallback((ticker: string, exchange: string, totalEquity: number, riskPercent: number, riskStrategy: RiskStrategy = 'AUTO', capitalSnapshot?: CapitalSnapshot) => {
    if (!portfolioRisk || equityLoadError || !capitalSnapshot || capitalSnapshot.fallbackUsed) {
      setSaveError('검증된 계좌 자본을 불러온 뒤 다시 분석해 주세요. 대체 자본값은 실거래 계획에 사용할 수 없습니다.');
      return;
    }
    setChecklist(null);
    setSaveError(null);
    setAnalysisCapitalSnapshot(capitalSnapshot ?? null);
    fetchMarketData(ticker, exchange, totalEquity, riskPercent, riskStrategy);
  }, [equityLoadError, fetchMarketData, portfolioRisk]);

  const handleModeChange = (mode: PlanMode) => {
    setPlanMode(mode);
    setChecklist(null);
    setSaveError(null);
    setSaveSuccess(false);
  };

  const handleManualDraftChange = useCallback((draft: ManualStrategyDraft) => {
    setManualDraft(draft);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const raw = window.localStorage.getItem(CONTEST_PLAN_QUEUE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { candidates?: ContestPlanQueueItem[] };
      if (Array.isArray(parsed.candidates)) setContestQueue(parsed.candidates);
    } catch {
      setContestQueue([]);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setDefaultTotalEquity(0);
    setPortfolioRisk(null);
    setCapitalCapturedAt('');
    setEquityLoadError(null);

    const loadPortfolioEquity = async () => {
      try {
        const response = await fetch(`/api/portfolio/risk?market=${planMarket}&source=supabase`, {
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || body.error || `Request failed (${response.status})`);
        const result = body as ApiSuccess<PortfolioRiskSummary>;
        const totalEquity = Number(result.data.totalEquity);
        if (!Number.isFinite(totalEquity) || totalEquity <= 0) {
          throw new Error('서버에서 검증 가능한 계좌 자본을 반환하지 않았습니다.');
        }
        setDefaultTotalEquity(totalEquity);
        setPortfolioRisk(result.data);
        setCapitalCapturedAt(new Date().toISOString());
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setDefaultTotalEquity(0);
        setPortfolioRisk(null);
        setCapitalCapturedAt('');
        setEquityLoadError(err instanceof Error ? err.message : '포트폴리오 자본 기준을 불러오지 못했습니다.');
      }
    };

    loadPortfolioEquity();
    return () => controller.abort();
  }, [planMarket]);

  useEffect(() => {
    if (!shouldAutoAnalyze || autoAnalyzeStarted.current || !initialTicker || !portfolioRisk || equityLoadError || defaultTotalEquity <= 0) return;
    autoAnalyzeStarted.current = true;
    setPlanMode('SYSTEM_ANALYSIS');
    const snapshot = buildCapitalSnapshot({
      basis: 'CURRENT_ACCOUNT',
      market: planMarket,
      portfolio: portfolioRisk,
      fallbackEquity: defaultTotalEquity,
      manualAmount: defaultTotalEquity,
      scenarioPct: -10,
      capturedAt: capitalCapturedAt,
    });
    handleAnalyze(initialTicker, initialExchange, snapshot.amount, 1, 'AUTO', snapshot);
  }, [capitalCapturedAt, defaultTotalEquity, equityLoadError, handleAnalyze, shouldAutoAnalyze, initialTicker, initialExchange, planMarket, portfolioRisk]);

  const handleSavePlan = async () => {
    if (!checklist) return;

    const capitalSnapshot = planMode === 'MANUAL_STRATEGY'
      ? manualDraft?.capitalSnapshot
      : analysisCapitalSnapshot;
    if (
      !portfolioRisk ||
      equityLoadError ||
      !capitalSnapshot ||
      capitalSnapshot.fallbackUsed ||
      capitalSnapshot.market !== planMarket
    ) {
      setSaveError('현재 시장의 검증된 계좌 자본이 없습니다. 계좌 정보를 다시 불러오고 계획을 재분석해 주세요.');
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      if (planMode === 'MANUAL_STRATEGY') {
        if (!manualDraft) return;
        const riskPlan = manualDraft.riskPlan;
        await axios.post('/api/trades', {
          ticker: manualDraft.ticker,
          direction: manualDraft.direction,
          plan_mode: 'MANUAL_STRATEGY',
          ...checklist,
          chk_market: false,
          sepa_evidence: null,
          vcp_analysis: null,
          total_equity: riskPlan.totalEquity,
          planned_risk: riskPlan.maxRisk,
          risk_percent: riskPlan.riskPercent,
          atr_value: null,
          entry_price: riskPlan.entryPrice,
          stoploss_price: riskPlan.stopLossPrice,
          position_size: riskPlan.totalShares,
          total_shares: riskPlan.totalShares,
          entry_targets: riskPlan.entryTargets,
          trailing_stops: riskPlan.trailingStops,
          risk_strategy: 'MANUAL_FIXED_RISK',
          requested_risk_strategy: 'MANUAL_FIXED_RISK',
          risk_gate: riskPlan.riskGate,
          risk_policy_snapshot: riskPlan.riskPolicy,
          setup_tags: manualDraft.setupTags,
          plan_note: manualDraft.planNote,
          chart_plan: {
            entryPrice: riskPlan.entryPrice,
            stopPrice: riskPlan.stopLossPrice,
            targetPrice: riskPlan.targetPrice,
            direction: manualDraft.direction,
            rewardRiskRatio: riskPlan.rewardRiskRatio,
            riskPerShare: riskPlan.riskPerShare,
          },
          plan_answers: { checklist, capitalSnapshot: manualDraft.capitalSnapshot },
        });
      } else {
        if (!analysis) return;
        await axios.post('/api/trades', {
          ticker: analysis.ticker,
          direction: 'LONG',
          plan_mode: 'SYSTEM_ANALYSIS',
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
          risk_strategy: analysis.riskPlan.strategy,
          requested_risk_strategy: analysis.riskPlan.requestedStrategy,
          risk_gate: analysis.riskPlan.riskGate,
          risk_policy_snapshot: analysis.riskPlan.riskPolicy
            ? { ...analysis.riskPlan.riskPolicy, pyramidPlan: analysis.riskPlan.pyramidPlan ?? null }
            : null,
          plan_answers: { checklist, capitalSnapshot: analysisCapitalSnapshot },
        });
      }
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

  const manualRiskPlan = manualDraft?.riskPlan ?? null;
  const activeCapitalSnapshot = planMode === 'MANUAL_STRATEGY'
    ? manualDraft?.capitalSnapshot
    : analysisCapitalSnapshot;
  const riskContextUnavailable = Boolean(
    equityLoadError ||
    !portfolioRisk ||
    !activeCapitalSnapshot ||
    activeCapitalSnapshot.fallbackUsed ||
    activeCapitalSnapshot.market !== planMarket
  );
  const saveBlocked = planMode === 'MANUAL_STRATEGY'
    ? !manualDraft ||
      !manualDraft.ticker ||
      !checklist ||
      (manualRiskPlan?.totalShares ?? 0) <= 0 ||
      (manualRiskPlan?.riskPerShare ?? 0) <= 0 ||
      manualRiskPlan?.rewardRiskRatio === null ||
      manualRiskPlan?.riskGate?.status !== 'PASS' ||
      riskContextUnavailable ||
      saving
    : !analysis ||
      !checklist ||
      analysis.sepaEvidence.status === 'fail' ||
      analysis.riskPlan.totalShares <= 0 ||
      analysis.riskPlan.riskGate?.status !== 'PASS' ||
      riskContextUnavailable ||
      saving;
  const canShowSavePanel = planMode === 'MANUAL_STRATEGY'
    ? Boolean(manualDraft && manualRiskPlan && manualRiskPlan.totalShares > 0 && manualRiskPlan.riskPerShare > 0 && manualRiskPlan.rewardRiskRatio !== null)
    : Boolean(analysis);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">New Trade Plan</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">신규 매매 계획</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            SEPA 후보 검증 → VCP 피벗 분석 → 패턴 무효화 기반 수량 산출 → Centaur 체크리스트를 한 흐름으로 실행합니다.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-[7px] border border-slate-700 bg-slate-900 p-1">
          <button
            type="button"
            onClick={() => setPlanMarket('US')}
            className={`rounded-[5px] px-3.5 py-1.5 text-[11px] font-semibold transition-colors ${planMarket === 'US' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            🇺🇸 미국
          </button>
          <button
            type="button"
            onClick={() => setPlanMarket('KR')}
            className={`rounded-[5px] px-3.5 py-1.5 text-[11px] font-semibold transition-colors ${planMarket === 'KR' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            🇰🇷 한국
          </button>
        </div>
      </div>

      <div className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-semibold ${planMarket === 'US' ? 'border-blue-500/30 bg-blue-500/8 text-blue-300' : 'border-rose-500/30 bg-rose-500/8 text-rose-300'}`}>
        {planMarket === 'US' ? '🇺🇸 미국 계좌 — 통화: USD ($)' : '🇰🇷 한국 계좌 — 통화: KRW (₩)'}
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-800 bg-slate-950/70 p-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => handleModeChange('SYSTEM_ANALYSIS')}
          className={`rounded-md border px-4 py-3 text-left transition-colors ${planMode === 'SYSTEM_ANALYSIS' ? 'border-emerald-500/50 bg-emerald-500/10 text-white' : 'border-transparent text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}
        >
          <span className="block text-sm font-bold">자동 분석</span>
          <span className="mt-1 block text-xs">SEPA/VCP 기반으로 피벗, 손절, 수량을 자동 계산합니다.</span>
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('MANUAL_STRATEGY')}
          className={`rounded-md border px-4 py-3 text-left transition-colors ${planMode === 'MANUAL_STRATEGY' ? 'border-sky-500/50 bg-sky-500/10 text-white' : 'border-transparent text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}
        >
          <span className="block text-sm font-bold">수동 전략 산출</span>
          <span className="mt-1 block text-xs">내가 정한 entry, stop, target으로 R/R과 수량만 계산합니다.</span>
        </button>
      </div>

      {equityLoadError && (
        <div className="rounded-lg border-2 border-rose-500/50 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100">
          <span className="mr-2">⚠️</span>
          포트폴리오 자본 기준 조회 실패 — 안전을 위해 포지션 분석과 계획 저장을 차단했습니다.
          임의 기본값은 사용하지 않습니다.
          <p className="mt-1 text-xs text-rose-300/80">원인: {equityLoadError}</p>
        </div>
      )}

      {planMode === 'SYSTEM_ANALYSIS' && contestQueue.length > 0 && (
        <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-indigo-300">Contest Plan Queue</p>
              <p className="mt-1 text-sm text-slate-300">
                선별된 {contestQueue.length}개 종목 중 첫 번째 종목의 매매 계획 분석을 자동으로 시작했습니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {contestQueue.map((item) => (
                <Link
                  key={`${item.exchange}:${item.ticker}`}
                  href={`/plan?ticker=${encodeURIComponent(item.ticker)}&exchange=${encodeURIComponent(item.exchange)}&source=contest&autoAnalyze=1`}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${item.ticker === initialTicker ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-indigo-400/50'}`}
                >
                  <span className="font-mono">{item.ticker}</span>
                  {item.name ? <span className="ml-1 text-slate-500">{item.name}</span> : null}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {planMode === 'SYSTEM_ANALYSIS' ? (
        <TickerInput
          key={planMarket}
          onAnalyze={handleAnalyze}
          loading={loading}
          initialTicker={initialTicker}
          initialExchange={planMarket === 'KR' ? 'KOSPI' : initialExchange}
          initialTotalEquity={defaultTotalEquity}
          portfolioRisk={portfolioRisk}
          capitalCapturedAt={capitalCapturedAt}
        />
      ) : (
        <ManualStrategyForm
          key={planMarket}
          initialTicker={initialTicker}
          initialExchange={planMarket === 'KR' ? 'KOSPI' : initialExchange}
          initialTotalEquity={defaultTotalEquity}
          market={planMarket}
          portfolioRisk={portfolioRisk}
          capitalCapturedAt={capitalCapturedAt}
          onChange={handleManualDraftChange}
        />
      )}

      {/* 스캐너에서 넘어온 경우 컨텍스트 데이터 배너 표시 */}
      {planMode === 'SYSTEM_ANALYSIS' && (scannerContext.pivot || scannerContext.rs) && (
        <ScannerContextBanner {...scannerContext} />
      )}

      {planMode === 'SYSTEM_ANALYSIS' && loading && (
        <div className="flex items-center justify-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-6 text-slate-300">
          <LoadingSpinner />
          KIS 일봉과 Yahoo 보조 데이터를 모아 SEPA + VCP 조건을 분석하는 중입니다.
        </div>
      )}

      {planMode === 'SYSTEM_ANALYSIS' && error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      )}

      {planMode === 'SYSTEM_ANALYSIS' && analysis && (
        <>
          <SepaAnalysis analysis={analysis} />

          {/* VCP 매수 타점 분석 — SEPA 다음, 리스크 계산 전에 배치 */}
          <VcpAnalysisPanel analysis={analysis.vcpAnalysis} />

          <RiskCalculator riskPlan={analysis.riskPlan} />
          <ChecklistForm sepaStatus={analysis.sepaEvidence.status} onComplete={setChecklist} />
        </>
      )}

      {planMode === 'MANUAL_STRATEGY' && manualRiskPlan && manualRiskPlan.totalShares > 0 && manualRiskPlan.riskPerShare > 0 && manualRiskPlan.rewardRiskRatio !== null && (
        <>
          <RiskCalculator riskPlan={manualRiskPlan} />
          <ChecklistForm sepaStatus="pass" variant="manual" onComplete={setChecklist} />
        </>
      )}

      {canShowSavePanel && (
        <>
          {/* C-6: alert() 대신 인라인 에러 메시지로 교체 */}
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
                  href={`/portfolio?market=${planMarket}`}
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
                {planMode === 'MANUAL_STRATEGY'
                  ? '저장 시 수동 entry/stop/target, R/R, 선택한 자본 기준과 체크리스트가 함께 기록됩니다.'
                  : '저장 시 SEPA 판정 근거, VCP 피벗, 선택한 자본 기준, 무효화선과 진입 계획이 함께 기록됩니다.'}
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
