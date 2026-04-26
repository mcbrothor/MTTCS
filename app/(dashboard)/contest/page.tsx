'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
} from 'lucide-react';

// lucide-react@1.8.0 bundler resolution 이슈 대응
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Zap } = require('lucide-react') as {
  Zap: React.FC<React.SVGProps<SVGSVGElement>>;
};

import DataSourceBadge from '@/components/ui/DataSourceBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Button from '@/components/ui/Button';

// Components
import AnalyzingView from './components/AnalyzingView';
import IbAnalysisPanel from './components/IbAnalysisPanel';
import SessionHistory from './components/SessionHistory';
import TopCandidateCard from './components/TopCandidateCard';
import CandidateResultTable from './components/CandidateResultTable';
import UniverseSelectionSection from './components/UniverseSelectionSection';

// Utils & Types
import { getContestStructuredVerdict } from '@/lib/contest-presentation';
import { isContestPoolTier, recommendationSortValue } from '@/lib/scanner-recommendation';
import { formatDate, verdictRecommendationClass } from '@/lib/contest-ui-utils';

import type {
  ApiSuccess,
  BeautyContestSession,
  ContestCandidate,
  ContestMarket,
  ContestPromptCandidate,
  DataSourceMeta,
  MasterFilterResponse,
  ScannerResult,
  ScannerUniverse,
  ScannerUniverseResponse,
  StoredScannerSnapshot,
} from '@/types';

const SNAPSHOT_PREFIX = 'mtn:scanner-snapshot:v3:';
const LATEST_SCAN_UNIVERSE_STORAGE_KEY = 'mtn:scanner:latest-scan-universe:v1';
const LAST_UNIVERSE_STORAGE_KEY = 'mtn:scanner:last-universe:v1';
const CONTEST_SELECTION_STORAGE_KEY = 'mtn:contest:selected:v1';
const UNIVERSES: ScannerUniverse[] = ['NASDAQ100', 'SP500', 'KOSPI200', 'KOSDAQ150'];

interface TransferSelection {
  universe: ScannerUniverse;
  tickers: string[];
  savedAt: string;
}

interface IbCandidateMeta {
  ticker: string;
  ib_rank?: number;
  ib_verdict?: string;
  mtn_alignment?: string;
}

interface IbCommitteeAnalysis {
  committee_consensus?: {
    top3_tickers?: string[];
    mtn_alignment?: string;
    regime_label?: string;
  };
  candidates?: IbCandidateMeta[];
  report_markdown?: string;
  generated_at?: string;
  parse_failed?: boolean;
  raw_text?: string;
}

type Horizon = 'W1' | 'M1';
type ContestStep = 'selection' | 'analyzing' | 'result';

// --- Pure Helpers ---

function parseUniverse(value: string | null): ScannerUniverse | null {
  if (value === 'NASDAQ100' || value === 'SP500' || value === 'KOSPI200' || value === 'KOSDAQ150') return value;
  if (value === 'KOSPI100') return 'KOSPI200';
  if (value === 'KOSDAQ100') return 'KOSDAQ150';
  return null;
}

function getInitialUniverse(): ScannerUniverse {
  if (typeof window === 'undefined') return 'NASDAQ100';
  try {
    const CONTEST_SELECTIONS_MAP_KEY = 'mtn:contest:selections:v2';
    const mapRaw = window.localStorage.getItem(CONTEST_SELECTIONS_MAP_KEY);
    if (mapRaw) {
      const map = JSON.parse(mapRaw);
      const universes: ScannerUniverse[] = ['NASDAQ100', 'SP500', 'KOSPI200', 'KOSDAQ150'];
      for (const u of universes) {
        if (map[u]?.tickers?.length > 0) return u;
      }
    }
  } catch (e) {
    console.error('Failed to scan initial selections:', e);
  }
  const lastSelected = window.localStorage.getItem(LAST_UNIVERSE_STORAGE_KEY);
  const storedLatest = window.localStorage.getItem(LATEST_SCAN_UNIVERSE_STORAGE_KEY);
  return parseUniverse(lastSelected) || parseUniverse(storedLatest) || 'NASDAQ100';
}

function readSnapshot(universe: ScannerUniverse): StoredScannerSnapshot | null {
  try {
    const raw = window.localStorage.getItem(`${SNAPSHOT_PREFIX}${universe}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredScannerSnapshot;
    return Array.isArray(parsed.results) ? parsed : null;
  } catch {
    return null;
  }
}

function readTransferSelection(targetUniverse: ScannerUniverse): TransferSelection | null {
  try {
    const CONTEST_SELECTIONS_MAP_KEY = 'mtn:contest:selections:v2';
    const mapRaw = window.localStorage.getItem(CONTEST_SELECTIONS_MAP_KEY);
    if (mapRaw) {
      const map = JSON.parse(mapRaw);
      const selection = map[targetUniverse];
      if (selection && Array.isArray(selection.tickers)) return selection as TransferSelection;
    }
    const raw = window.localStorage.getItem(CONTEST_SELECTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const storedUniverse = window.localStorage.getItem(LATEST_SCAN_UNIVERSE_STORAGE_KEY);
      const universe = parseUniverse(storedUniverse) || 'NASDAQ100';
      if (universe === targetUniverse) return { universe, tickers: parsed, savedAt: new Date().toISOString() };
      return null;
    }
    if (!parseUniverse(parsed.universe) || !Array.isArray(parsed.tickers)) return null;
    if (parsed.universe !== targetUniverse) return null;
    return parsed as TransferSelection;
  } catch {
    return null;
  }
}

function candidateFromResult(item: ScannerResult, rank: number): ContestPromptCandidate {
  return {
    ticker: item.ticker,
    exchange: item.exchange,
    name: item.name || item.ticker,
    user_rank: rank,
    recommendation_tier: item.recommendationTier,
    recommendation_reason: item.recommendationReason,
    exception_signals: item.exceptionSignals || [],
    rs_rating: item.rsRating ?? null,
    internal_rs_rating: item.internalRsRating ?? null,
    external_rs_rating: item.externalRsRating ?? null,
    rs_rank: item.rsRank ?? null,
    rs_universe_size: item.rsUniverseSize ?? null,
    rs_percentile: item.rsPercentile ?? null,
    weighted_momentum_score: item.weightedMomentumScore ?? null,
    ibd_proxy_score: item.ibdProxyScore ?? null,
    mansfield_rs_flag: item.mansfieldRsFlag ?? null,
    mansfield_rs_score: item.mansfieldRsScore ?? null,
    rs_data_quality: item.rsDataQuality ?? 'NA',
    macro_action_level: item.macroActionLevel ?? null,
    benchmark_relative_score: item.benchmarkRelativeScore ?? null,
    rs_line_new_high: item.rsLineNewHigh ?? null,
    rs_line_near_high: item.rsLineNearHigh ?? null,
    tennis_ball_count: item.tennisBallCount ?? null,
    tennis_ball_score: item.tennisBallScore ?? null,
    return_3m: item.return3m ?? null,
    return_6m: item.return6m ?? null,
    return_9m: item.return9m ?? null,
    return_12m: item.return12m ?? null,
    base_type: item.baseType ?? null,
    momentum_branch: item.momentumBranch ?? null,
    eight_week_return_pct: item.eightWeekReturnPct ?? null,
    distance_from_ma50_pct: item.distanceFromMa50Pct ?? null,
    low_52_week_advance_pct: item.low52WeekAdvancePct ?? null,
    high_tight_flag: item.highTightFlag ?? null,
    sepa_status: item.sepaStatus,
    sepa_passed: item.sepaPassed,
    sepa_failed: item.sepaFailed,
    vcp_status: item.vcpGrade,
    vcp_score: item.vcpScore,
    contraction_score: item.contractionScore ?? null,
    volume_dry_up_score: item.volumeDryUpScore ?? null,
    bb_squeeze_score: item.bbSqueezeScore ?? null,
    pocket_pivot_score: item.pocketPivotScore ?? null,
    pivot_price: item.pivotPrice,
    distance_to_pivot_pct: item.distanceToPivotPct,
    avg_dollar_volume: item.sepaEvidence?.metrics.avgDollarVolume20 || null,
    price: item.currentPrice,
    price_as_of: item.priceAsOf,
    source: item.priceSource || 'MTN scanner',
    provider_attempts: item.providerAttempts || [],
  };
}

async function parseResponse<T>(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || body.error || `Request failed (${response.status})`);
  return body as ApiSuccess<T>;
}

async function fetchMarketContext(market: ContestMarket): Promise<MasterFilterResponse | null> {
  try {
    const response = await fetch(`/api/master-filter?market=${market}`);
    if (!response.ok) return null;
    return await response.json() as MasterFilterResponse;
  } catch {
    return null;
  }
}

function orderedCandidates(session: BeautyContestSession | null) {
  return [...(session?.candidates || [])].sort((a, b) =>
    (a.llm_rank || 99) - (b.llm_rank || 99) || a.user_rank - b.user_rank
  );
}

function sortScannerPool(rows: ScannerResult[]) {
  return [...rows]
    .filter((item) => item.status === 'done')
    .sort((a, b) =>
      recommendationSortValue(a.recommendationTier) - recommendationSortValue(b.recommendationTier)
      || (b.vcpScore || 0) - (a.vcpScore || 0)
      || Math.abs(a.distanceToPivotPct ?? 999) - Math.abs(b.distanceToPivotPct ?? 999)
    );
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function reviewReturn(candidate: ContestCandidate, horizon: Horizon) {
  const review = candidate.reviews?.find((item) => item.horizon === horizon);
  if (!review || (review.status !== 'UPDATED' && review.status !== 'MANUAL')) return null;
  return typeof review.return_pct === 'number' ? review.return_pct : null;
}

function performanceSummary(candidates: ContestCandidate[], horizon: Horizon) {
  const selected = candidates.filter((candidate) => candidate.actual_invested).map((candidate) => reviewReturn(candidate, horizon)).filter((v): v is number => v !== null);
  const unselected = candidates.filter((candidate) => !candidate.actual_invested).map((candidate) => reviewReturn(candidate, horizon)).filter((v): v is number => v !== null);
  const selectedAvgReturn = average(selected);
  const unselectedAvgReturn = average(unselected);
  if (selectedAvgReturn === null || unselectedAvgReturn === null) return { status: 'PENDING' as const, selectedAvgReturn, unselectedAvgReturn, relativeReturn: null };
  const relativeReturn = Math.round((selectedAvgReturn - unselectedAvgReturn) * 100) / 100;
  return { status: relativeReturn >= 0 ? 'PASS' as const : 'FAIL' as const, selectedAvgReturn, unselectedAvgReturn, relativeReturn };
}

// --- Main Page Component ---

export default function ContestPage() {
  const [universe, setUniverse] = useState<ScannerUniverse>(() => getInitialUniverse());
  const [snapshot, setSnapshot] = useState<StoredScannerSnapshot | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [transferInfo, setTransferInfo] = useState<TransferSelection | null>(null);
  const [sessions, setSessions] = useState<BeautyContestSession[]>([]);
  const [activeSession, setActiveSession] = useState<BeautyContestSession | null>(null);
  const [meta, setMeta] = useState<DataSourceMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [llmSaveMessage, setLlmSaveMessage] = useState<string | null>(null);
  const [marketContext, setMarketContext] = useState<MasterFilterResponse | null>(null);
  const [step, setStep] = useState<ContestStep>('selection');
  const [ibBusy, setIbBusy] = useState(false);
  const [ibError, setIbError] = useState<string | null>(null);
  const [ibAnalysis, setIbAnalysis] = useState<IbCommitteeAnalysis | null>(null);
  const [ibPromptOpen, setIbPromptOpen] = useState(false);
  const [ibPromptText, setIbPromptText] = useState<string | null>(null);

  const market: ContestMarket = universe === 'KOSPI200' || universe === 'KOSDAQ150' ? 'KR' : 'US';

  const loadSnapshot = useCallback((nextUniverse: ScannerUniverse) => {
    const next = readSnapshot(nextUniverse);
    setSnapshot(next);
    if (!next) {
      setSelected([]);
      setTransferInfo(null);
      return;
    }
    const transfer = readTransferSelection(nextUniverse);
    const validTickers = new Set(next.results.map((item) => item.ticker));
    const transferred = (transfer?.tickers || []).filter((ticker) => validTickers.has(ticker)).slice(0, 10);
    if (transferred.length > 0) {
      setSelected(transferred);
      setTransferInfo({ universe: nextUniverse, tickers: transferred, savedAt: transfer?.savedAt || new Date().toISOString() });
    } else {
      setTransferInfo(null);
      setSelected([]);
    }
  }, []);

  const loadSessions = useCallback(async (preferredSessionId?: string | null) => {
    setError(null);
    const response = await fetch('/api/contest/sessions');
    const result = await parseResponse<BeautyContestSession[]>(response);
    setSessions(result.data);
    setMeta(result.meta);
    setActiveSession((current) => {
      const targetId = preferredSessionId || current?.id;
      return result.data.find((s) => s.id === targetId) || result.data[0] || null;
    });
  }, []);

  useEffect(() => {
    const initial = getInitialUniverse();
    setUniverse(initial);
    loadSnapshot(initial);
    loadSessions().catch((err: unknown) => setError(err instanceof Error ? err.message : '불러오기 실패'));
  }, [loadSessions, loadSnapshot]);

  useEffect(() => { fetchMarketContext(market).then(setMarketContext); }, [market]);

  useEffect(() => {
    if (activeSession?.ib_analysis && typeof activeSession.ib_analysis === 'object') setIbAnalysis(activeSession.ib_analysis as IbCommitteeAnalysis);
    else setIbAnalysis(null);
  }, [activeSession?.id]);

  const rankedResults = useMemo(() => sortScannerPool(snapshot?.results || []), [snapshot]);
  const candidatePool = useMemo(() => rankedResults.filter((item) => isContestPoolTier(item.recommendationTier)), [rankedResults]);
  const visibleSelectionRows = useMemo(() => {
    if (!transferInfo || transferInfo.tickers.length === 0) return [];
    const transferred = new Set(transferInfo.tickers);
    return rankedResults.filter((item) => transferred.has(item.ticker));
  }, [rankedResults, transferInfo]);

  const selectedCandidates = useMemo(() => {
    const byTicker = new Map(rankedResults.map((item) => [item.ticker, item]));
    return selected.map((t, i) => {
      const item = byTicker.get(t);
      return item ? candidateFromResult(item, i + 1) : null;
    }).filter((v): v is ContestPromptCandidate => !!v);
  }, [rankedResults, selected]);

  const activeCandidates = useMemo(() => orderedCandidates(activeSession), [activeSession]);
  const w1Summary = useMemo(() => performanceSummary(activeCandidates, 'W1'), [activeCandidates]);
  const m1Summary = useMemo(() => performanceSummary(activeCandidates, 'M1'), [activeCandidates]);
  const finalPicks = useMemo(() => activeCandidates.filter((c) => c.actual_invested).sort((a, b) => (a.final_pick_rank || 99) - (b.final_pick_rank || 99)), [activeCandidates]);

  const toggleCandidateSelection = (ticker: string) => {
    setSelected((prev) => prev.includes(ticker) ? prev.filter((t) => t !== ticker) : prev.length >= 10 ? prev : [...prev, ticker]);
  };

  const createSession = async (silent = false) => {
    if (!silent) setBusy(true);
    setError(null);
    try {
      const context = marketContext || await fetchMarketContext(market);
      const response = await fetch('/api/contest/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ market, universe, candidates: selectedCandidates, market_context: context, candidate_pool_snapshot: candidatePool.map((it, i) => candidateFromResult(it, i + 1)) }),
      });
      const result = await parseResponse<BeautyContestSession>(response);
      setActiveSession(result.data);
      if (!silent) {
        await navigator.clipboard.writeText(result.data.llm_prompt);
        setNotice('세션 저장 및 프롬프트 복사 완료');
      }
      await loadSessions(result.data.id);
      return result.data;
    } catch (err: any) { setError(err.message); throw err; } finally { if (!silent) setBusy(false); }
  };

  const runAiAnalysis = async (sessionToAnalyze?: BeautyContestSession) => {
    const target = sessionToAnalyze || activeSession;
    if (!target) return;
    setBusy(true);
    setLlmSaveMessage('AI 분석 중...');
    try {
      const response = await fetch(`/api/contest/sessions/${target.id}/analyze`, { method: 'POST' });
      const result = await response.json();
      if (result.success) {
        setNotice('분석 완료');
        await loadSessions(target.id);
        return true;
      }
      throw new Error(result.error);
    } catch (err: any) { setError(err.message); return false; } finally { setBusy(false); }
  };

  const handleStartAnalysis = async () => {
    setBusy(true); setStep('analyzing');
    try {
      const newSession = await createSession(true);
      if (await runAiAnalysis(newSession)) setStep('result');
      else setStep('selection');
    } catch { setStep('selection'); } finally { setBusy(false); }
  };

  const updateCandidate = useCallback(async (candidate: ContestCandidate, actualInvested: boolean) => {
    setBusyId(candidate.id);
    try {
      await fetch(`/api/contest/candidates/${candidate.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actual_invested: actualInvested, final_pick_rank: actualInvested ? (activeCandidates.filter(c => c.actual_invested).length + 1) : null }),
      });
      await loadSessions(activeSession?.id);
    } catch (err: any) { setError(err.message); } finally { setBusyId(null); }
  }, [activeCandidates.length, activeSession?.id, loadSessions]);

  const copyIbPrompt = async () => {
    if (!activeSession) return;
    try {
      const response = await fetch(`/api/contest/sessions/${activeSession.id}/ib-validate`);
      const result = await response.json();
      if (result.success) { await navigator.clipboard.writeText(result.data.prompt); setIbPromptText(result.data.prompt); setNotice('IB 프롬프트 복사됨'); }
      else throw new Error(result.error);
    } catch (err: any) { setIbError(err.message); }
  };

  const runIbValidation = async () => {
    if (!activeSession) return;
    setIbBusy(true);
    try {
      const response = await fetch(`/api/contest/sessions/${activeSession.id}/ib-validate`, { method: 'POST' });
      const result = await response.json();
      if (result.success) { setIbAnalysis(result.data.ib_analysis); setNotice('IB 검증 완료'); await loadSessions(activeSession.id); }
      else throw new Error(result.error);
    } catch (err: any) { setIbError(err.message); } finally { setIbBusy(false); }
  };

  const summaryCard = (horizon: Horizon, summary: ReturnType<typeof performanceSummary>) => (
    <div className={`rounded-lg border p-4 ${summary.status === 'PASS' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : summary.status === 'FAIL' ? 'border-rose-500/30 bg-rose-500/10 text-rose-100' : 'border-slate-800 bg-slate-900/60 text-slate-300'}`}>
      <div className="flex items-center justify-between gap-3">
        <div><p className="text-sm font-bold">{horizon === 'W1' ? '1주' : '1개월'} 성과 판정</p><p className="mt-1 text-xs opacity-80">{summary.status === 'PASS' ? '선정 기준 유효' : summary.status === 'FAIL' ? '실패 / 반성 필요' : '판정 보류'}</p></div>
        <BarChart3 className="h-5 w-5 opacity-80" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <span>선정 {summary.selectedAvgReturn === null ? '-' : `${summary.selectedAvgReturn.toFixed(2)}%`}</span>
        <span>미선정 {summary.unselectedAvgReturn === null ? '-' : `${summary.unselectedAvgReturn.toFixed(2)}%`}</span>
        <span>상대 {summary.relativeReturn === null ? '-' : `${summary.relativeReturn > 0 ? '+' : ''}${summary.relativeReturn.toFixed(2)}%`}</span>
      </div>
    </div>
  );

  const renderHeader = () => (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">MTN Beauty Contest</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">{step === 'selection' ? '분석 대상 종목 선정' : step === 'analyzing' ? '1차 정량 평가 중' : '1차 평가 및 상세 투자 검토'}</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-400">
          {step === 'selection' ? '상세 투자 검토에 올릴 10개를 선택합니다.' : step === 'analyzing' ? 'Rule Engine이 정량 평가를 진행 중입니다.' : '1차 정량 평가와 외부 LLM 검토를 확인하세요.'}
        </p>
      </div>
      <div className="flex flex-col items-end gap-3">
        <div className="flex items-center gap-2">
          {step !== 'selection' && <Button variant="ghost" onClick={() => setStep('selection')} className="text-xs text-slate-400">새 분석</Button>}
          <DataSourceBadge meta={meta} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-12 px-4">
      {renderHeader()}
      {(error || notice) && (
        <div className="space-y-2">
          {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>}
          {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">{notice}</div>}
        </div>
      )}

      {step === 'selection' && (
        <div className="space-y-6">
          <UniverseSelectionSection
            universe={universe} setUniverse={setUniverse} snapshot={snapshot} loadSnapshot={loadSnapshot}
            selected={selected} marketContext={marketContext} visibleSelectionRows={visibleSelectionRows}
            toggleCandidateSelection={toggleCandidateSelection} handleStartAnalysis={handleStartAnalysis}
            busy={busy} UNIVERSES={UNIVERSES}
          />
          <SessionHistory 
            sessions={sessions} 
            activeSessionId={activeSession?.id || null}
            onSessionSelect={(s) => { setActiveSession(s); setStep('result'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} 
            formatDate={formatDate}
            orderedCandidates={orderedCandidates}
          />
        </div>
      )}
      {step === 'analyzing' && <AnalyzingView llmSaveMessage={llmSaveMessage} />}
      {step === 'result' && (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="grid gap-6 lg:grid-cols-3">
            {activeCandidates.slice(0, 3).map((c, i) => (
              <TopCandidateCard key={c.id} candidate={c} idx={i} verdict={getContestStructuredVerdict(c)} busyId={busyId} updateCandidate={updateCandidate} />
            ))}
          </div>
          <CandidateResultTable candidates={activeCandidates} busyId={busyId} updateCandidate={updateCandidate} getContestStructuredVerdict={getContestStructuredVerdict} />
          <IbAnalysisPanel ibAnalysis={ibAnalysis} ibBusy={ibBusy} ibError={ibError} ibPromptOpen={ibPromptOpen} ibPromptText={ibPromptText} activeSession={activeSession} copyIbPrompt={copyIbPrompt} runIbValidation={runIbValidation} setIbPromptOpen={setIbPromptOpen} />
          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-800 bg-slate-950/30 p-6 space-y-6">
              <h3 className="text-lg font-bold text-white">성과 판정 및 복기</h3>
              <div className="grid gap-4 sm:grid-cols-2">{summaryCard('W1', w1Summary)}{summaryCard('M1', m1Summary)}</div>
            </div>
            <div className="rounded-3xl border border-slate-800 bg-slate-950/30 p-8 flex flex-col justify-center items-center text-center space-y-6">
              <div className="h-20 w-20 rounded-3xl bg-indigo-500 flex items-center justify-center"><BarChart3 className="h-10 w-10 text-white" /></div>
              <div className="space-y-2"><h3 className="text-2xl font-black text-white">분석 완료</h3><p className="text-sm text-slate-400">최종 선정된 {finalPicks.length}개 종목의 매매 계획을 수립하세요.</p></div>
              <div className="flex flex-col w-full max-w-xs gap-3">
                <Link href="/plan" className="inline-flex h-14 items-center justify-center rounded-2xl bg-indigo-600 font-black text-white shadow-xl">매매 계획 수립</Link>
                <Button variant="ghost" onClick={() => { setStep('selection'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-slate-500">다른 종목 분석</Button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
