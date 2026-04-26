'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clipboard,
  RefreshCw,
  Save,
  Star,
  Trophy,
  Users,
} from 'lucide-react';

// lucide-react@1.8.0 bundler resolution에서 일부 아이콘의 named export 타입 누락을 보완
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { BrainCircuit, Copy, Crown, Medal, Zap } = require('lucide-react') as {
  BrainCircuit: React.FC<React.SVGProps<SVGSVGElement>>;
  Copy: React.FC<React.SVGProps<SVGSVGElement>>;
  Crown: React.FC<React.SVGProps<SVGSVGElement>>;
  Medal: React.FC<React.SVGProps<SVGSVGElement>>;
  Zap: React.FC<React.SVGProps<SVGSVGElement>>;
};
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Button from '@/components/ui/Button';
import FlowCtaButton from '@/components/ui/FlowCtaButton';
import DataSourceBadge from '@/components/ui/DataSourceBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { CONTEST_RESPONSE_SCHEMA_VERSION, extractLlmSessionId } from '@/lib/contest';
import { getContestStructuredVerdict } from '@/lib/contest-presentation';
import { isContestPoolTier, recommendationSortValue } from '@/lib/scanner-recommendation';
import type {
  ApiSuccess,
  BeautyContestSession,
  ContestCandidate,
  ContestLlmOverall,
  ContestLlmRecommendation,
  ContestMarket,
  ContestPromptCandidate,
  ContestReview,
  DataSourceMeta,
  MasterFilterResponse,
  RecommendationTier,
  ScannerResult,
  ScannerUniverse,
  ScannerUniverseResponse,
} from '@/types';

const SNAPSHOT_PREFIX = 'mtn:scanner-snapshot:v3:';
const LATEST_SCAN_UNIVERSE_STORAGE_KEY = 'mtn:scanner:latest-scan-universe:v1';
const CONTEST_SELECTION_STORAGE_KEY = 'mtn:contest:selected:v1';
const UNIVERSES: ScannerUniverse[] = ['NASDAQ100', 'SP500', 'KOSPI200', 'KOSDAQ150'];
const MISTAKE_TAGS = ['시장 국면 무시', '가짜 돌파', '추격 매수', '매도 지연', '과도한 확신', '선정 기준 오류'];

interface StoredScannerSnapshot {
  savedAt: string;
  universeMeta: ScannerUniverseResponse;
  results: ScannerResult[];
}

interface TransferSelection {
  universe: ScannerUniverse;
  tickers: string[];
  savedAt: string;
}

interface ReviewDraft {
  review_price: string;
  user_review_note: string;
  mistake_tags: string[];
}

type ReviewDrafts = Record<string, ReviewDraft>;
type Horizon = 'W1' | 'M1';
type ContestStep = 'selection' | 'analyzing' | 'result';

interface IbCandidateMeta {
  ticker: string;
  mtn_rank?: number;
  ib_rank?: number;
  ib_verdict?: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
  price_target_12m?: string | null;
  eps_growth_estimate?: string | null;
  revenue_growth_estimate?: string | null;
  moat_assessment?: 'WIDE' | 'NARROW' | 'NONE' | 'UNKNOWN';
  mtn_alignment?: 'CONFIRMS' | 'UPGRADES' | 'DOWNGRADES';
}

interface IbCommitteeAnalysis {
  schema_version?: string;
  session_id?: string;
  analysis_date?: string;
  committee_consensus?: {
    top3_tickers?: string[];
    mtn_alignment?: 'CONFIRMS' | 'PARTIAL_RERANK' | 'SIGNIFICANT_RERANK';
    regime_label?: string;
  };
  candidates?: IbCandidateMeta[];
  report_markdown?: string;
  generated_at?: string;
  prompt_version?: string;
  parse_failed?: boolean;
  raw_text?: string;
}

function parseUniverse(value: string | null): ScannerUniverse | null {
  if (value === 'NASDAQ100' || value === 'SP500' || value === 'KOSPI200' || value === 'KOSDAQ150') return value;
  // backward-compat: migrate old stored values
  if (value === 'KOSPI100') return 'KOSPI200';
  if (value === 'KOSDAQ100') return 'KOSDAQ150';
  return null;
}

function getInitialUniverse(): ScannerUniverse {
  if (typeof window === 'undefined') return 'NASDAQ100';
  
  // 1. 선택된 후보가 있는 유니버스 최우선 (v2 맵 전수조사)
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
    console.error('Failed to scan for initial universe selections:', e);
  }

  // 2. 최근 스캔 유니버스
  const storedLatest = parseUniverse(window.localStorage.getItem(LATEST_SCAN_UNIVERSE_STORAGE_KEY));
  if (storedLatest) return storedLatest;

  return 'NASDAQ100';
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
      if (selection && Array.isArray(selection.tickers)) {
        return selection as TransferSelection;
      }
    }

    // 하위 호환성: 기존 mtn:contest:selected:v1에서 시도
    const raw = window.localStorage.getItem(CONTEST_SELECTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    
    // 호환성: string[] 형태로 저장된 경우 (useContestSelection.ts 방식)
    if (Array.isArray(parsed)) {
      const storedUniverse = window.localStorage.getItem(LATEST_SCAN_UNIVERSE_STORAGE_KEY);
      const universe = parseUniverse(storedUniverse) || 'NASDAQ100';
      if (universe === targetUniverse) {
        return { universe, tickers: parsed, savedAt: new Date().toISOString() };
      }
      return null;
    }

    // 호환성: 기존 TransferSelection 포맷
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
    avg_dollar_volume: item.marketCap,
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

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function formatPrice(value: number | null | undefined, exchange?: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  const currency = exchange === 'KOSPI' || exchange === 'KOSDAQ' ? 'KRW' : 'USD';
  return new Intl.NumberFormat(currency === 'KRW' ? 'ko-KR' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'KRW' ? 0 : 2,
  }).format(value);
}

function tierClass(tier?: RecommendationTier | null) {
  if (tier === 'Recommended') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (tier === 'Partial') return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  if (tier === 'Error') return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
  return 'border-slate-700 text-slate-300';
}

function verdictOverallClass(value: ContestLlmOverall | null) {
  if (value === 'POSITIVE') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (value === 'NEGATIVE') return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
  if (value === 'NEUTRAL') return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  return 'border-slate-700 text-slate-400';
}

function verdictRecommendationClass(value: ContestLlmRecommendation | null) {
  if (value === 'PROCEED') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (value === 'SKIP') return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
  if (value === 'WATCH') return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  return 'border-slate-700 text-slate-400';
}

function reviewTone(review: ContestReview) {
  if (review.status === 'ERROR') return 'border-red-500/30 bg-red-500/10 text-red-100';
  if (review.status === 'UPDATED' || review.status === 'MANUAL') {
    return (review.return_pct || 0) >= 0
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
      : 'border-rose-500/30 bg-rose-500/10 text-rose-100';
  }
  return 'border-slate-800 bg-slate-950 text-slate-300';
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
  const selected = candidates.filter((candidate) => candidate.actual_invested).map((candidate) => reviewReturn(candidate, horizon)).filter((value): value is number => value !== null);
  const unselected = candidates.filter((candidate) => !candidate.actual_invested).map((candidate) => reviewReturn(candidate, horizon)).filter((value): value is number => value !== null);
  const selectedAvgReturn = average(selected);
  const unselectedAvgReturn = average(unselected);
  if (selectedAvgReturn === null || unselectedAvgReturn === null) {
    return { status: 'PENDING' as const, selectedAvgReturn, unselectedAvgReturn, relativeReturn: null };
  }
  const relativeReturn = Math.round((selectedAvgReturn - unselectedAvgReturn) * 100) / 100;
  return {
    status: relativeReturn >= 0 ? 'PASS' as const : 'FAIL' as const,
    selectedAvgReturn,
    unselectedAvgReturn,
    relativeReturn,
  };
}

export default function ContestPage() {
  const [universe, setUniverse] = useState<ScannerUniverse>(() => getInitialUniverse());
  const [snapshot, setSnapshot] = useState<StoredScannerSnapshot | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [transferInfo, setTransferInfo] = useState<TransferSelection | null>(null);
  const [sessions, setSessions] = useState<BeautyContestSession[]>([]);
  const [activeSession, setActiveSession] = useState<BeautyContestSession | null>(null);
  const [reviewDrafts, setReviewDrafts] = useState<ReviewDrafts>({});
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
    const transferTickers = transfer?.tickers || [];
    const validTickers = new Set(next.results.map((item) => item.ticker));
    const transferred = transferTickers.filter((ticker) => validTickers.has(ticker)).slice(0, 10);
    if (transferred.length > 0) {
      setSelected(transferred);
      setTransferInfo({ universe: nextUniverse, tickers: transferred, savedAt: transfer?.savedAt || new Date().toISOString() });
      return;
    }
    setTransferInfo(null);
    setSelected([]);
  }, []);

  const loadSessions = useCallback(async (preferredSessionId?: string | null) => {
    setError(null);
    const response = await fetch('/api/contest/sessions');
    const result = await parseResponse<BeautyContestSession[]>(response);
    setSessions(result.data);
    setMeta(result.meta);
    setActiveSession((current) => {
      const targetId = preferredSessionId || current?.id;
      return result.data.find((session) => session.id === targetId) || result.data[0] || null;
    });
  }, []);

  useEffect(() => {
    const initial = getInitialUniverse();
    setUniverse(initial);
    loadSnapshot(initial);
    loadSessions().catch((err: unknown) => setError(err instanceof Error ? err.message : '콘테스트 목록을 불러오지 못했습니다.'));
  }, [loadSessions, loadSnapshot]);

  useEffect(() => {
    fetchMarketContext(market).then(setMarketContext);
  }, [market]);

  useEffect(() => {
    if (activeSession?.ib_analysis && typeof activeSession.ib_analysis === 'object') {
      setIbAnalysis(activeSession.ib_analysis as IbCommitteeAnalysis);
    } else {
      setIbAnalysis(null);
    }
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
    return selected
      .map((ticker, index) => {
        const item = byTicker.get(ticker);
        return item ? candidateFromResult(item, index + 1) : null;
      })
      .filter((item): item is ContestPromptCandidate => Boolean(item));
  }, [rankedResults, selected]);

  const activeCandidates = orderedCandidates(activeSession);
  const w1Summary = performanceSummary(activeCandidates, 'W1');
  const m1Summary = performanceSummary(activeCandidates, 'M1');
  const finalPicks = useMemo(() => activeCandidates
    .filter((candidate) => candidate.actual_invested)
    .sort((a, b) => (a.final_pick_rank || 99) - (b.final_pick_rank || 99) || a.user_rank - b.user_rank), [activeCandidates]);

  const basePriceFor = (candidate: ContestCandidate) => {
    const reviewBase = candidate.reviews?.find((review) => review.base_price !== null && review.base_price !== undefined);
    return reviewBase?.base_price ?? candidate.entry_reference_price ?? null;
  };

  const baseSourceFor = (candidate: ContestCandidate) => {
    const reviewBase = candidate.reviews?.find((review) => review.base_price !== null && review.base_price !== undefined);
    const snapshot = candidate.snapshot as Partial<ContestPromptCandidate> | null;
    return reviewBase?.price_source || snapshot?.source || 'Contest base price';
  };

  const toggleCandidateSelection = (ticker: string) => {
    setSelected((prev) => {
      if (prev.includes(ticker)) return prev.filter((item) => item !== ticker);
      if (prev.length >= 10) return prev;
      return [...prev, ticker];
    });
  };

  const createSession = async (silent = false) => {
    if (!silent) setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const context = marketContext || await fetchMarketContext(market);
      const response = await fetch('/api/contest/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          market,
          universe,
          candidates: selectedCandidates,
          market_context: context,
          candidate_pool_snapshot: candidatePool.map((item, index) => candidateFromResult(item, index + 1)),
        }),
      });
      const result = await parseResponse<BeautyContestSession>(response);
      setActiveSession(result.data);
      if (!silent) {
        await navigator.clipboard.writeText(result.data.llm_prompt);
        setNotice('콘테스트 세션을 저장했고 LLM 프롬프트를 클립보드에 복사했습니다.');
      }
      await loadSessions(result.data.id);
      return result.data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '콘테스트 세션 저장에 실패했습니다.';
      setError(msg);
      throw new Error(msg);
    } finally {
      if (!silent) setBusy(false);
    }
  };

  const runAiAnalysis = async (sessionToAnalyze?: BeautyContestSession) => {
    const targetSession = sessionToAnalyze || activeSession;
    if (!targetSession) {
      setError('먼저 세션을 저장한 뒤 분석을 실행해 주세요.');
      return;
    }
    
    setBusy(true);
    setError(null);
    setNotice(null);
    setLlmSaveMessage('인앱 AI 분석 엔진 가동 중 (Gemini 1.5 Pro)...');

    try {
      const response = await fetch(`/api/contest/sessions/${targetSession.id}/analyze`, {
        method: 'POST'
      });
      const result = await response.json();
      
      if (result.success) {
        setNotice('인앱 AI 분석이 완료되었습니다. 결과가 자동으로 반영되었습니다.');
        setLlmSaveMessage(`분석 완료: ${result.data.candidates_updated}개 종목의 헤지펀드 등급 판정 완료.`);
        await loadSessions(targetSession.id);
        return true;
      } else {
        throw new Error(result.error || 'AI 분석 중 오류가 발생했습니다.');
      }
    } catch (err: any) {
      setError(err.message);
      setLlmSaveMessage(`분석 실패: ${err.message}`);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleStartAnalysis = async () => {
    setBusy(true);
    setStep('analyzing');
    try {
      const newSession = await createSession(true);
      const success = await runAiAnalysis(newSession);
      if (success) {
        setStep('result');
      } else {
        setStep('selection');
      }
    } catch (err) {
      setStep('selection');
    } finally {
      setBusy(false);
    }
  };

  const nextFinalPickRank = () => {
    const ranks = activeCandidates
      .filter((candidate) => candidate.actual_invested)
      .map((candidate) => candidate.final_pick_rank || 0);
    return Math.max(0, ...ranks) + 1;
  };

  const updateCandidate = async (candidate: ContestCandidate, actualInvested: boolean) => {
    setBusyId(candidate.id);
    setError(null);
    try {
      const response = await fetch(`/api/contest/candidates/${candidate.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          actual_invested: actualInvested,
          final_pick_rank: actualInvested ? candidate.final_pick_rank || nextFinalPickRank() : null,
        }),
      });
      await parseResponse<ContestCandidate>(response);
      await loadSessions(activeSession?.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '최종 선정 여부 저장에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  const getReviewDraft = (review: ContestReview): ReviewDraft => reviewDrafts[review.id] || {
    review_price: review.review_price ? String(review.review_price) : '',
    user_review_note: review.user_review_note || '',
    mistake_tags: review.mistake_tags || [],
  };

  const updateReviewDraft = (review: ContestReview, patch: Partial<ReviewDraft>) => {
    setReviewDrafts((prev) => ({
      ...prev,
      [review.id]: { ...getReviewDraft(review), ...patch },
    }));
  };

  const toggleReviewTag = (review: ContestReview, tag: string) => {
    const draft = getReviewDraft(review);
    updateReviewDraft(review, {
      mistake_tags: draft.mistake_tags.includes(tag)
        ? draft.mistake_tags.filter((item) => item !== tag)
        : [...draft.mistake_tags, tag],
    });
  };

  const saveManualReview = async (review: ContestReview) => {
    const draft = getReviewDraft(review);
    setBusyId(review.id);
    setError(null);
    try {
      const response = await fetch('/api/contest/reviews', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: review.id,
          review_price: draft.review_price,
          user_review_note: draft.user_review_note,
          mistake_tags: draft.mistake_tags,
          price_source: 'Manual review',
        }),
      });
      await parseResponse<ContestReview>(response);
      setNotice('복기 값을 저장했습니다.');
      await loadSessions(activeSession?.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '복기 저장에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  const copyIbPrompt = async () => {
    if (!activeSession) return;
    try {
      const response = await fetch(`/api/contest/sessions/${activeSession.id}/ib-validate`);
      const result = await response.json();
      if (result.success) {
        await navigator.clipboard.writeText(result.data.prompt);
        setIbPromptText(result.data.prompt);
        setNotice('IB 검증 프롬프트를 클립보드에 복사했습니다. 외부 LLM에 붙여넣어 사용하세요.');
      } else {
        throw new Error(result.error);
      }
    } catch (err: any) {
      setIbError(err.message);
    }
  };

  const runIbValidation = async () => {
    if (!activeSession) return;
    setIbBusy(true);
    setIbError(null);
    try {
      const response = await fetch(`/api/contest/sessions/${activeSession.id}/ib-validate`, {
        method: 'POST',
      });
      const result = await response.json();
      if (result.success) {
        setIbAnalysis(result.data.ib_analysis as IbCommitteeAnalysis);
        setNotice(`IB 검증 완료 (${result.data.provider} / ${result.data.model}). 위원회 분석이 반영되었습니다.`);
        await loadSessions(activeSession.id);
      } else {
        throw new Error(result.error || 'IB 검증 중 오류가 발생했습니다.');
      }
    } catch (err: any) {
      setIbError(err.message);
    } finally {
      setIbBusy(false);
    }
  };

  const summaryCard = (horizon: Horizon, summary: ReturnType<typeof performanceSummary>) => {
    const label = horizon === 'W1' ? '1주' : '1개월';
    const tone = summary.status === 'PASS'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
      : summary.status === 'FAIL'
        ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
        : 'border-slate-800 bg-slate-900/60 text-slate-300';
    const verdict = summary.status === 'PASS' ? '선정 기준 유효' : summary.status === 'FAIL' ? '실패 / 반성 필요' : '판정 보류';
    return (
      <div className={`rounded-lg border p-4 ${tone}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold">{label} 성과 판정</p>
            <p className="mt-1 text-xs opacity-80">{verdict}</p>
          </div>
          <BarChart3 className="h-5 w-5 opacity-80" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <span>선정 평균 {summary.selectedAvgReturn === null ? '-' : `${summary.selectedAvgReturn.toFixed(2)}%`}</span>
          <span>미선정 평균 {summary.unselectedAvgReturn === null ? '-' : `${summary.unselectedAvgReturn.toFixed(2)}%`}</span>
          <span>상대 {summary.relativeReturn === null ? '-' : `${summary.relativeReturn > 0 ? '+' : ''}${summary.relativeReturn.toFixed(2)}%`}</span>
        </div>
      </div>
    );
  };

  const renderProcessSteps = () => {
    const steps = [
      { num: 1, label: '후보 선정', active: step === 'selection' },
      { num: 2, label: '정량 분석', active: step === 'analyzing' || (step === 'result' && !ibAnalysis) },
      { num: 3, label: 'IB 검증', active: step === 'result' && !!ibAnalysis },
      { num: 4, label: '매매 계획', active: false },
    ];
    const currentStepNum = step === 'selection' ? 1 : step === 'analyzing' ? 2 : ibAnalysis ? 3 : 2;
    return (
      <div className="flex items-center gap-0 text-xs font-bold">
        {steps.map((s, i) => (
          <div key={s.num} className="flex items-center">
            <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all ${
              s.num === currentStepNum
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                : s.num < currentStepNum
                  ? 'bg-slate-800 text-emerald-400'
                  : 'bg-slate-900 text-slate-600'
            }`}>
              <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-black ${
                s.num < currentStepNum ? 'bg-emerald-500/20' : ''
              }`}>
                {s.num < currentStepNum ? '✓' : `${s.num}`}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-px w-4 lg:w-8 ${s.num < currentStepNum ? 'bg-emerald-500/40' : 'bg-slate-800'}`} />
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderHeader = () => (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">MTN Beauty Contest</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
          {step === 'selection' ? '분석 대상 종목 선정' : step === 'analyzing' ? 'AI 가치 평가 중' : 'AI 추천 및 상세 분석'}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          {step === 'selection'
            ? '스캐너에서 필터링된 후보 중 가장 유망한 10개를 선택해 AI 분석을 의뢰합니다.'
            : step === 'analyzing'
              ? '헤지펀드 스타일의 다각도 분석 엔진이 종목별 기술적/기본적 우위를 판정하고 있습니다.'
              : 'AI가 선정한 Top 3 종목과 상세 분석 리포트를 확인하고 최종 투자 계획을 수립하세요.'}
        </p>
      </div>
      <div className="flex flex-col items-end gap-3">
        {renderProcessSteps()}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => setStep('selection')}
            className={`text-xs ${step !== 'selection' ? 'text-slate-400' : 'hidden'}`}
          >
            새 분석 시작
          </Button>
          <DataSourceBadge meta={meta} />
        </div>
      </div>
    </div>
  );

  const renderSelection = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section className="rounded-2xl border border-slate-800 bg-slate-950/50 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500 text-xs font-black text-white shadow-lg shadow-emerald-500/30">1</div>
              분석 후보 선택
            </h2>
            <p className="text-sm text-slate-400">
              최대 10개까지 선택 가능합니다. 선택된 순서대로 AI에게 전달됩니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={universe}
              onChange={(event) => {
                const next = event.target.value as ScannerUniverse;
                setUniverse(next);
                loadSnapshot(next);
              }}
              className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
            >
              {UNIVERSES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <Button type="button" variant="ghost" onClick={() => loadSnapshot(universe)} className="gap-2 rounded-xl">
              <RefreshCw className="h-4 w-4" /> 리로드
            </Button>
          </div>
        </div>

        {!snapshot ? (
          <div className="mt-6 rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center text-slate-400">
            <p>저장된 스캔 결과가 없습니다.</p>
            <Link href="/scanner" className="mt-4 inline-block text-emerald-400 hover:underline">스캐너로 이동하기 &rarr;</Link>
          </div>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap items-center gap-4 text-xs font-medium text-slate-500">
              <span className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5">
                <div className={`h-2 w-2 rounded-full ${selected.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`} />
                {selected.length} / 10 선택됨
              </span>
              {marketContext && (
                <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1.5 text-indigo-300">
                  시장 국면: {marketContext.state} (P3: {marketContext.metrics.p3Score ?? '-'})
                </span>
              )}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleSelectionRows.map((item) => {
                const checked = selected.includes(item.ticker);
                return (
                  <button
                    key={item.ticker}
                    type="button"
                    onClick={() => toggleCandidateSelection(item.ticker)}
                    className={`group relative overflow-hidden rounded-2xl border p-5 text-left transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${
                      checked 
                        ? 'border-emerald-500/50 bg-emerald-500/5 shadow-[0_0_20px_rgba(16,185,129,0.1)]' 
                        : 'border-slate-800 bg-slate-900/40 hover:border-slate-600'
                    }`}
                  >
                    {checked && (
                      <div className="absolute right-3 top-3">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg">
                          <CheckCircle2 className="h-4 w-4" />
                        </div>
                      </div>
                    )}
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-mono text-xl font-black tracking-tight text-white group-hover:text-emerald-400 transition-colors">{item.ticker}</p>
                        <p className="mt-1 truncate text-xs text-slate-500 font-medium">{item.name}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                       <span className={`rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${tierClass(item.recommendationTier)}`}>
                        {item.recommendationTier}
                      </span>
                      {item.vcpScore && (
                        <span className="rounded-lg border border-slate-700 bg-slate-800/50 px-2 py-1 text-[10px] font-bold text-slate-300">
                          VCP {item.vcpScore}
                        </span>
                      )}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-800/50 pt-4 text-[11px]">
                      <div className="space-y-1">
                        <p className="text-slate-500">피벗 거리</p>
                        <p className={`font-mono font-bold ${Math.abs(item.distanceToPivotPct || 0) < 5 ? 'text-emerald-400' : 'text-white'}`}>
                          {item.distanceToPivotPct ?? '-'}%
                        </p>
                      </div>
                      <div className="space-y-1 text-right">
                        <p className="text-slate-500">SEPA 미충족</p>
                        <p className="font-mono font-bold text-white">{item.sepaMissingCount ?? '0'}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-10 flex justify-center">
              <Button 
                size="lg" 
                onClick={handleStartAnalysis} 
                disabled={busy || selected.length === 0}
                className="h-14 w-full max-w-md gap-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 font-bold text-lg shadow-xl hover:from-emerald-500 hover:to-teal-500 transition-all active:scale-95 disabled:opacity-50"
              >
                {busy ? <LoadingSpinner /> : <Zap className="h-6 w-6 fill-white" />}
                AI 분석 시작 (Gemini 1.5 Pro)
              </Button>
            </div>
          </>
        )}
      </section>

      {/* 히스토리 섹션 */}
      <div className="grid gap-6">
        <section className="rounded-2xl border border-slate-800 bg-slate-950/30 p-6">
          <h3 className="text-lg font-bold text-white mb-4">최근 콘테스트 세션</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.slice(0, 6).map((session) => (
              <button
                key={session.id}
                onClick={() => {
                  setActiveSession(session);
                  setStep('result');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="group flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4 hover:border-slate-600 transition-all text-left"
              >
                <div className="flex items-center justify-between">
                  <p className="font-bold text-white group-hover:text-emerald-400 transition-colors">
                    {session.universe}
                  </p>
                  <span className="text-[10px] text-slate-500">{formatDate(session.selected_at)}</span>
                </div>
                <div className="flex -space-x-2">
                  {orderedCandidates(session).slice(0, 5).map((c) => (
                    <div key={c.id} className="h-7 w-7 rounded-full border-2 border-slate-900 bg-slate-800 flex items-center justify-center text-[9px] font-bold text-white">
                      {c.ticker.slice(0, 2)}
                    </div>
                  ))}
                  {(session.candidates?.length || 0) > 5 && (
                    <div className="h-7 w-7 rounded-full border-2 border-slate-900 bg-slate-800 flex items-center justify-center text-[9px] font-bold text-slate-400">
                      +{(session.candidates?.length || 0) - 5}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );

  const renderAnalyzing = () => (
    <div className="flex flex-col items-center justify-center py-24 space-y-8 animate-in zoom-in-95 duration-500">
      <div className="relative">
        <div className="h-32 w-32 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Zap className="h-10 w-10 text-emerald-400 animate-pulse" />
        </div>
        <div className="absolute -top-4 -right-4 h-12 w-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center shadow-xl animate-bounce">
          <Crown className="h-6 w-6 text-amber-400" />
        </div>
      </div>
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-white">심층 분석 진행 중</h2>
        <p className="text-slate-400 max-w-sm mx-auto">
          {llmSaveMessage || '10여 개의 지표를 결합하여 최적의 투자 후보를 선별하고 있습니다. 잠시만 기다려 주세요.'}
        </p>
      </div>
      <div className="w-full max-w-md bg-slate-900 rounded-full h-1.5 overflow-hidden">
        <div className="bg-emerald-500 h-full animate-progress-indeterminate" />
      </div>
    </div>
  );

  const ibVerdictColor = (verdict: IbCandidateMeta['ib_verdict'] | undefined) => {
    if (verdict === 'STRONG_BUY') return 'text-emerald-300 bg-emerald-500/20 border-emerald-500/30';
    if (verdict === 'BUY') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (verdict === 'HOLD') return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    if (verdict === 'SELL') return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
    if (verdict === 'STRONG_SELL') return 'text-rose-300 bg-rose-500/20 border-rose-500/30';
    return 'text-slate-400 bg-slate-800 border-slate-700';
  };

  const ibAlignmentBadge = (align: IbCandidateMeta['mtn_alignment'] | undefined) => {
    if (align === 'CONFIRMS') return <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-black text-emerald-400">MTN 확인</span>;
    if (align === 'UPGRADES') return <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[9px] font-black text-sky-400">MTN 상향</span>;
    if (align === 'DOWNGRADES') return <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[9px] font-black text-rose-400">MTN 하향</span>;
    return null;
  };

  const renderIbSection = () => {
    const hasResult = ibAnalysis && !ibAnalysis.parse_failed && (ibAnalysis.report_markdown || (ibAnalysis.candidates?.length ?? 0) > 0);

    return (
      <section className="rounded-3xl border border-indigo-500/20 bg-indigo-950/20 overflow-hidden shadow-2xl shadow-indigo-500/5">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-indigo-500/20 bg-indigo-950/30 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 shadow-lg shadow-indigo-500/20">
              <Users className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">Step 3 — 외부 IB 검증</p>
              <h3 className="text-xl font-black text-white">글로벌 IB 투자 위원회</h3>
              <p className="mt-0.5 text-xs text-slate-400">
                Goldman Sachs / Morgan Stanley 수준 5인 전문가 패널의 독립 검증
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={copyIbPrompt}
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs font-bold text-slate-300 transition-all hover:border-slate-600 hover:text-white"
            >
              <Copy className="h-3.5 w-3.5" />
              프롬프트 복사
            </button>
            <button
              onClick={runIbValidation}
              disabled={ibBusy}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2.5 text-xs font-black text-white shadow-lg shadow-indigo-500/20 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-60"
            >
              {ibBusy ? (
                <>
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  분석 중…
                </>
              ) : (
                <>
                  <BrainCircuit className="h-3.5 w-3.5" />
                  {hasResult ? '재검증 실행' : '외부 LLM 검증 실행'}
                </>
              )}
            </button>
          </div>
        </div>

        {ibError && (
          <div className="mx-6 mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            {ibError}
          </div>
        )}

        {/* 프롬프트 미리보기 (토글) */}
        <div className="border-b border-indigo-500/10">
          <button
            onClick={() => setIbPromptOpen((v) => !v)}
            className="flex w-full items-center justify-between px-6 py-3 text-xs font-bold text-slate-500 hover:text-slate-300 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Clipboard className="h-3.5 w-3.5" />
              검증 프롬프트 미리보기 (외부 LLM에 직접 사용 가능)
            </span>
            {ibPromptOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {ibPromptOpen && ibPromptText && (
            <div className="px-6 pb-4">
              <pre className="max-h-64 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-4 text-[10px] leading-relaxed text-slate-400 whitespace-pre-wrap">
                {ibPromptText}
              </pre>
            </div>
          )}
          {ibPromptOpen && !ibPromptText && (
            <div className="px-6 pb-4 text-xs text-slate-500">"프롬프트 복사" 버튼을 먼저 클릭하면 여기에 내용이 표시됩니다.</div>
          )}
        </div>

        {/* 분석 결과 */}
        {!hasResult && !ibBusy && (
          <div className="p-12 text-center text-slate-500">
            <BrainCircuit className="mx-auto h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">외부 LLM 검증 결과가 아직 없습니다.</p>
            <p className="text-xs mt-1">위의 버튼으로 자동 실행하거나, 프롬프트를 복사해 직접 사용하세요.</p>
          </div>
        )}

        {ibBusy && (
          <div className="flex flex-col items-center gap-4 p-12 text-center">
            <div className="relative h-16 w-16">
              <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Users className="h-6 w-6 text-indigo-400 animate-pulse" />
              </div>
            </div>
            <div>
              <p className="font-bold text-white">위원회 토론 진행 중</p>
              <p className="mt-1 text-xs text-slate-400">글로벌 IB 5인 패널이 각 종목을 심도 있게 논의하고 있습니다...</p>
            </div>
          </div>
        )}

        {hasResult && ibAnalysis && (
          <div className="p-6 space-y-6">
            {/* 메타 카드: Top3 + 종목별 한 줄 메타 */}
            {ibAnalysis.committee_consensus && (
              <div className="rounded-2xl border border-indigo-500/20 bg-indigo-950/30 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 mb-3">위원회 합의 (Committee Consensus)</p>
                <div className="flex flex-wrap items-center gap-2">
                  {ibAnalysis.committee_consensus.top3_tickers?.map((t, i) => (
                    <span key={t} className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-black text-indigo-300">
                      IB #{i + 1} {t}
                    </span>
                  ))}
                  {ibAnalysis.committee_consensus.mtn_alignment && (
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${
                      ibAnalysis.committee_consensus.mtn_alignment === 'CONFIRMS'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {ibAnalysis.committee_consensus.mtn_alignment === 'CONFIRMS' ? 'MTN 순위 일치' :
                       ibAnalysis.committee_consensus.mtn_alignment === 'PARTIAL_RERANK' ? '부분 재순위' : '순위 재조정'}
                    </span>
                  )}
                  {ibAnalysis.committee_consensus.regime_label && (
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-bold text-slate-300">
                      국면: {ibAnalysis.committee_consensus.regime_label}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* 종목별 메타 미니 그리드 */}
            {ibAnalysis.candidates && ibAnalysis.candidates.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[...ibAnalysis.candidates].sort((a, b) => (a.ib_rank ?? 99) - (b.ib_rank ?? 99)).map((ca) => (
                  <div key={ca.ticker} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-500/20 text-[10px] font-black text-indigo-300">
                          #{ca.ib_rank ?? '-'}
                        </span>
                        <p className="font-mono text-sm font-black text-white truncate">{ca.ticker}</p>
                      </div>
                      <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-black ${ibVerdictColor(ca.ib_verdict)}`}>
                        {ca.ib_verdict?.replace('_', ' ') ?? '-'}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
                      {ca.price_target_12m && <span className="text-slate-300">12M <span className="font-bold text-white">{ca.price_target_12m}</span></span>}
                      {ca.eps_growth_estimate && <span className="text-slate-300">EPS <span className="font-bold text-emerald-400">{ca.eps_growth_estimate}</span></span>}
                      {ca.moat_assessment && ca.moat_assessment !== 'UNKNOWN' && (
                        <span className="text-slate-500">Moat <span className="font-bold text-slate-300">{ca.moat_assessment}</span></span>
                      )}
                      {ibAlignmentBadge(ca.mtn_alignment)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 마크다운 리포트 본문 */}
            {ibAnalysis.report_markdown && (
              <article className="rounded-2xl border border-slate-800 bg-slate-950/40 p-6 lg:p-8">
                <div className="ib-report text-slate-200">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {ibAnalysis.report_markdown}
                  </ReactMarkdown>
                </div>
              </article>
            )}

            {/* Provider badge */}
            {activeSession?.ib_provider && (
              <p className="text-center text-[10px] text-slate-600">
                분석 제공: {activeSession.ib_provider} · {ibAnalysis.generated_at ? new Date(ibAnalysis.generated_at).toLocaleString('ko-KR') : ''}
              </p>
            )}
          </div>
        )}

        {/* parse_failed 시 raw text 표시 */}
        {ibAnalysis?.parse_failed && ibAnalysis.raw_text && (
          <div className="p-6">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 mb-4 text-xs text-amber-200">
              메타데이터 블록 파싱에 실패했습니다. 원본 응답을 그대로 표시합니다.
            </div>
            <pre className="max-h-[600px] overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-4 text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap">
              {ibAnalysis.raw_text}
            </pre>
          </div>
        )}
      </section>
    );
  };

  const renderResult = () => {
    const top3 = activeCandidates.slice(0, 3);
    const others = activeCandidates.slice(3);

    return (
      <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {/* Step 2 Label */}
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500 text-xs font-black text-white shadow-lg shadow-emerald-500/30">2</div>
          <div>
            <p className="text-sm font-black text-white">내부 정량 분석 결과</p>
            <p className="text-xs text-slate-400">MTN Rule Engine · VCP/RS/SEPA 기반 종합 채점</p>
          </div>
        </div>

        {/* Top 3 Section */}
        <div className="grid gap-6 lg:grid-cols-3">
          {top3.map((candidate, idx) => {
            const verdict = getContestStructuredVerdict(candidate);
            const rankIcon = idx === 0 ? <Crown className="h-8 w-8 text-amber-400" /> : idx === 1 ? <Medal className="h-8 w-8 text-slate-300" /> : <Medal className="h-8 w-8 text-amber-700" />;
            const rankLabel = idx === 0 ? 'Best Choice' : idx === 1 ? 'Strong Buy' : 'Solid Pick';
            const bgClass = idx === 0 ? 'border-amber-500/50 bg-amber-500/[0.03] shadow-[0_0_40px_rgba(245,158,11,0.1)]' : 'border-slate-800 bg-slate-950/50';

            return (
              <div key={candidate.id} className={`relative flex flex-col rounded-3xl border p-8 transition-all hover:translate-y-[-4px] ${bgClass}`}>
                <div className="absolute -top-4 -right-4 h-12 w-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-xl">
                  <span className="text-xl font-black text-white">#{idx + 1}</span>
                </div>
                
                <div className="flex items-center gap-4 mb-6">
                  {rankIcon}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{rankLabel}</p>
                    <p className="text-3xl font-black tracking-tight text-white">{candidate.ticker}</p>
                  </div>
                </div>

                <div className="space-y-4 flex-1">
                  <div className="rounded-2xl bg-slate-900/80 p-5 space-y-3">
                    <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Investment Thesis</p>
                    <p className="text-sm leading-relaxed text-slate-200">
                      {verdict.keyStrength || candidate.llm_comment || '분석 요약 제공 불가'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                      <p className="text-[10px] text-slate-500 font-bold mb-1">Confidence</p>
                      <p className="text-lg font-black text-white">
                        {verdict.confidence !== null ? `${Math.round(verdict.confidence * 100)}%` : '-'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                      <p className="text-[10px] text-slate-500 font-bold mb-1">Verdict</p>
                      <p className={`text-sm font-black ${verdictRecommendationClass(verdict.recommendation)}`}>
                        {verdict.recommendation || '-'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-800/50">
                  <button
                    onClick={() => updateCandidate(candidate, !candidate.actual_invested)}
                    className={`w-full h-12 rounded-xl flex items-center justify-center gap-2 font-bold transition-all ${
                      candidate.actual_invested 
                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                        : 'border border-slate-700 text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    {busyId === candidate.id ? <LoadingSpinner size="sm" /> : candidate.actual_invested ? <CheckCircle2 className="h-5 w-5" /> : null}
                    {candidate.actual_invested ? '최종 선정됨' : '이 종목 선정하기'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Other Results Table */}
        <section className="rounded-3xl border border-slate-800 bg-slate-950/50 overflow-hidden">
          <div className="p-6 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-lg font-bold text-white">상세 분석 및 기타 후보</h3>
            <p className="text-xs text-slate-500 font-medium">{others.length + top3.length}개 분석 리포트</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-900/50 text-[10px] uppercase font-black tracking-widest text-slate-500">
                <tr>
                  <th className="px-6 py-4">순위</th>
                  <th className="px-6 py-4">종목</th>
                  <th className="px-6 py-4">AI 판정</th>
                  <th className="px-6 py-4">핵심 리스크</th>
                  <th className="px-6 py-4 text-right">최종 결정</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {activeCandidates.map((candidate) => {
                  const verdict = getContestStructuredVerdict(candidate);
                  return (
                    <tr key={candidate.id} className={`group transition-colors hover:bg-slate-900/40 ${candidate.actual_invested ? 'bg-emerald-500/[0.02]' : ''}`}>
                      <td className="px-6 py-4">
                        <span className={`flex h-8 w-8 items-center justify-center rounded-lg font-mono font-bold ${(candidate.llm_rank ?? 99) <= 3 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                          {candidate.llm_rank || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-white">{candidate.ticker}</p>
                        <p className="text-[10px] text-slate-500 uppercase">{candidate.name || candidate.exchange}</p>
                      </td>
                      <td className="px-6 py-4">
                         <div className="flex items-center gap-2">
                           <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${verdictRecommendationClass(verdict.recommendation)}`}>
                             {verdict.recommendation || '-'}
                           </span>
                           <span className="text-xs text-slate-400">{Math.round((verdict.confidence || 0) * 100)}%</span>
                         </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="max-w-xs truncate text-xs text-slate-400">{verdict.keyRisk || '-'}</p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => updateCandidate(candidate, !candidate.actual_invested)}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
                            candidate.actual_invested 
                              ? 'border-emerald-500 bg-emerald-500 text-white' 
                              : 'border-slate-700 text-slate-500 hover:border-slate-500'
                          }`}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Step 3: IB Validation Section */}
        <div className="flex items-center gap-3">
          <div className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-black text-white shadow-lg ${ibAnalysis ? 'bg-indigo-500 shadow-indigo-500/30' : 'bg-slate-700 shadow-transparent'}`}>3</div>
          <div>
            <p className="text-sm font-black text-white">외부 IB 검증</p>
            <p className="text-xs text-slate-400">글로벌 IB 위원회 5인 심층 분석 — 펀더멘털·뉴스·해자 보완</p>
          </div>
        </div>
        {renderIbSection()}

        {/* Step 4 Label */}
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-700 text-xs font-black text-white">4</div>
          <div>
            <p className="text-sm font-black text-white">최종 매매 계획 수립</p>
            <p className="text-xs text-slate-400">진입가 · 손절가 · 포지션 비중 확정</p>
          </div>
        </div>

        {/* Performance & History Section */}
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/30 p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">성과 판정 및 복기</h3>
              <div className="flex gap-2">
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-bold text-emerald-400">W1</span>
                <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-[10px] font-bold text-indigo-400">M1</span>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {summaryCard('W1', w1Summary)}
              {summaryCard('M1', m1Summary)}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/30 p-8 flex flex-col justify-center items-center text-center space-y-6 shadow-2xl shadow-indigo-500/5">
            <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <BarChart3 className="h-10 w-10 text-white" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-white">분석 완료 및 종목 확정</h3>
              <p className="text-sm text-slate-400 max-w-sm">
                최종 선정된 {finalPicks.length}개 종목에 대한 구체적인 매매 계획(진입가, 손절가, 비중)을 수립하러 이동하시겠습니까?
              </p>
            </div>
            <div className="flex flex-col w-full max-w-xs gap-3">
              <Link 
                href="/plan"
                className="inline-flex h-14 items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 font-black text-white shadow-xl shadow-indigo-600/20 hover:scale-[1.02] active:scale-95 transition-all"
              >
                매매 계획 수립하러 가기
              </Link>
              <Button 
                variant="ghost" 
                onClick={() => {
                  setStep('selection');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }} 
                className="text-slate-500 hover:text-slate-300"
              >
                다른 종목 추가 분석하기
              </Button>
            </div>
          </div>
        </section>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-12 px-4">
      {renderHeader()}

      {(error || notice) && (
        <div className="space-y-2 animate-in fade-in duration-300">
          {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100 flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-red-500" />
            {error}
          </div>}
          {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100 flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            {notice}
          </div>}
        </div>
      )}

      {step === 'selection' && renderSelection()}
      {step === 'analyzing' && renderAnalyzing()}
      {step === 'result' && renderResult()}
      
      {/* Footer / CTA is now integrated in result step or selection step */}
    </div>
  );
}
