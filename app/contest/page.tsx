'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Clipboard, RefreshCw, Save, Trophy } from 'lucide-react';
import Button from '@/components/ui/Button';
import DataSourceBadge from '@/components/ui/DataSourceBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { extractLlmSessionId } from '@/lib/contest';
import { isContestPoolTier, recommendationSortValue } from '@/lib/scanner-recommendation';
import type {
  ApiSuccess,
  BeautyContestSession,
  ContestCandidate,
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
const UNIVERSES: ScannerUniverse[] = ['NASDAQ100', 'SP500', 'KOSPI100', 'KOSDAQ100'];
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

function parseUniverse(value: string | null): ScannerUniverse | null {
  if (value === 'NASDAQ100' || value === 'SP500' || value === 'KOSPI100' || value === 'KOSDAQ100') return value;
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
      const universes: ScannerUniverse[] = ['NASDAQ100', 'SP500', 'KOSPI100', 'KOSDAQ100'];
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
  const [llmJson, setLlmJson] = useState('');
  const [reviewDrafts, setReviewDrafts] = useState<ReviewDrafts>({});
  const [meta, setMeta] = useState<DataSourceMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [llmSaveMessage, setLlmSaveMessage] = useState<string | null>(null);
  const [marketContext, setMarketContext] = useState<MasterFilterResponse | null>(null);

  const market: ContestMarket = universe === 'KOSPI100' || universe === 'KOSDAQ100' ? 'KR' : 'US';

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
  const pastedResultSessionId = useMemo(() => extractLlmSessionId(llmJson), [llmJson]);
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

  const createSession = async () => {
    setBusy(true);
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
      await navigator.clipboard.writeText(result.data.llm_prompt);
      setNotice('콘테스트 세션을 저장했고 LLM 프롬프트를 클립보드에 복사했습니다.');
      await loadSessions(result.data.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '콘테스트 세션 저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const saveLlmResult = async () => {
    const pastedSessionId = pastedResultSessionId;
    const targetSessionId = pastedSessionId || activeSession?.id;
    if (!targetSessionId) {
      setError('LLM 결과를 저장할 콘테스트 세션을 찾지 못했습니다. 결과 JSON에 session_id가 포함되어 있는지 확인해 주세요.');
      setLlmSaveMessage('저장 실패: session_id 또는 활성 세션이 없습니다.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    setLlmSaveMessage('LLM 결과 저장 중...');
    try {
      const response = await fetch(`/api/contest/sessions/${targetSessionId}/llm-result`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ llm_raw_response: llmJson, llm_provider: 'external' }),
      });
      const result = await parseResponse<BeautyContestSession>(response);
      setActiveSession(result.data);
      setLlmJson('');
      const targetNote = pastedSessionId && activeSession?.id !== pastedSessionId
        ? `붙여넣은 session_id(${pastedSessionId}) 기준으로 저장했습니다.`
        : '현재 세션에 저장했습니다.';
      setNotice(`LLM 분석 결과를 저장했습니다. ${targetNote}`);
      setLlmSaveMessage(`저장 완료: ${result.data.candidates?.length || 0}개 후보의 LLM 순위와 분석을 반영했습니다.`);
      await loadSessions(result.data.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'LLM 결과 저장에 실패했습니다.';
      setError(message);
      setLlmSaveMessage(`저장 실패: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const copyPrompt = async () => {
    if (!activeSession) return;
    await navigator.clipboard.writeText(activeSession.llm_prompt);
    setNotice('프롬프트를 클립보드에 복사했습니다.');
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

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">Contest</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">스캐너 후보 비교와 성과 복기</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Recommended와 Partial 후보를 최대 10개까지 골라 외부 LLM에 분석시키고, 결과와 1주/1개월 상대 성과를 DB에 축적합니다.
          </p>
        </div>
        <DataSourceBadge meta={meta} />
      </div>

      {(error || notice) && (
        <div className="space-y-2">
          {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>}
          {notice && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">{notice}</div>}
        </div>
      )}

      <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">1. 스캐너 후보 풀에서 분석 대상 선택</h2>
            <p className="mt-1 text-sm text-slate-400">
              스캐너의 Recommended/Partial 후보를 우선 불러옵니다. Low Priority도 수동 선택할 수 있습니다.
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
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
            >
              {UNIVERSES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <Button type="button" variant="ghost" onClick={() => loadSnapshot(universe)} className="gap-2">
              <RefreshCw className="h-4 w-4" /> 새로고침
            </Button>
          </div>
        </div>

        {!snapshot ? (
          <div className="mt-5 rounded-lg border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400">
            저장된 스캔 결과가 없습니다. 스캐너에서 {universe} 스캔을 먼저 실행해 주세요.
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              {transferInfo && (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-200">
                  스캐너 전달 후보 {transferInfo.tickers.length}개 · {new Date(transferInfo.savedAt).toLocaleString('ko-KR')}
                </span>
              )}
              <span>스냅샷 {new Date(snapshot.savedAt).toLocaleString('ko-KR')}</span>
              <span>스캐너 풀 {candidatePool.length}</span>
              <span>선택 {selected.length}/10</span>
              {marketContext && <span>마스터 필터 {marketContext.state} · P3 {marketContext.metrics.p3Score ?? '-'}/100</span>}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleSelectionRows.map((item) => {
                const checked = selected.includes(item.ticker);
                return (
                  <button
                    key={item.ticker}
                    type="button"
                    onClick={() => toggleCandidateSelection(item.ticker)}
                    className={`rounded-lg border p-4 text-left transition-colors ${
                      checked ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-lg font-bold text-white">{item.ticker}</p>
                        <p className="mt-1 truncate text-sm text-slate-400">{item.name}</p>
                      </div>
                      <span className={`rounded-lg border px-2 py-1 text-xs font-bold ${tierClass(item.recommendationTier)}`}>
                        {item.recommendationTier}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-400">
                      <span>SEPA 미충족 {item.sepaMissingCount ?? '-'}</span>
                      <span>VCP {item.vcpScore ?? '-'}</span>
                      <span>피벗 {item.distanceToPivotPct ?? '-'}%</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-slate-500">{item.recommendationReason}</p>
                  </button>
                );
              })}
            </div>
            {visibleSelectionRows.length === 0 && (
              <div className="mt-5 rounded-lg border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400">
                스캐너에서 후보로 체크한 종목만 이 화면에 표시됩니다. 스캐너에서 후보를 선택한 뒤 콘테스트로 이동해 주세요.
              </div>
            )}
          </>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-5">
          <h2 className="text-lg font-bold text-white">2. LLM 프롬프트 생성</h2>
          <p className="mt-1 text-sm text-slate-400">
            세션 저장 후 후보 ID와 마스터 필터 컨텍스트가 포함된 한국어 프롬프트를 복사합니다.
          </p>
          <Button type="button" onClick={createSession} disabled={busy || selectedCandidates.length === 0 || selectedCandidates.length > 10} className="mt-4 gap-2">
            {busy ? <LoadingSpinner size="sm" /> : <Trophy className="h-4 w-4" />}
            세션 저장 및 프롬프트 복사
          </Button>

          {activeSession && (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-200">생성 프롬프트</p>
                <button type="button" onClick={copyPrompt} className="inline-flex items-center gap-1 text-xs text-emerald-300">
                  <Clipboard className="h-3.5 w-3.5" /> 복사
                </button>
              </div>
              <textarea
                readOnly
                value={activeSession.llm_prompt}
                rows={12}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-300"
              />
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-5">
          <h2 className="text-lg font-bold text-white">3. 외부 LLM 결과 등록</h2>
          <p className="mt-1 text-sm text-slate-400">
            JSON만 붙여넣어도 되고, LLM 리포트 전문을 붙여넣어도 MTN이 JSON 코드블록 또는 객체를 추출합니다.
          </p>
          <textarea
            value={llmJson}
            onChange={(event) => setLlmJson(event.target.value)}
            rows={12}
            placeholder='LLM 전체 리포트 또는 {"rankings":[...]} JSON을 붙여넣으세요.'
            className="mt-4 w-full rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-200 outline-none focus:border-emerald-400"
          />
          {pastedResultSessionId && activeSession?.id !== pastedResultSessionId && (
            <p className="mt-2 text-xs text-amber-300">
              붙여넣은 결과의 session_id가 현재 선택된 세션과 다릅니다. 저장 시 입력값의 session_id로 자동 저장합니다.
            </p>
          )}
          <Button type="button" onClick={saveLlmResult} disabled={!llmJson.trim() || busy || (!activeSession && !pastedResultSessionId)} className="mt-3 gap-2">
            <Save className="h-4 w-4" /> LLM 분석 저장
          </Button>
          {llmSaveMessage && (
            <div className={`mt-3 rounded-lg border p-3 text-sm ${
              llmSaveMessage.startsWith('저장 실패')
                ? 'border-red-500/30 bg-red-500/10 text-red-100'
                : llmSaveMessage.startsWith('저장 완료')
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                  : 'border-slate-700 bg-slate-900/60 text-slate-300'
            }`}>
              {llmSaveMessage}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-5">
        <h2 className="text-lg font-bold text-white">4. 최근 콘테스트</h2>
        <div className="mt-4 space-y-3">
          {sessions.length === 0 ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400">아직 저장된 콘테스트가 없습니다.</div>
          ) : sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => setActiveSession(session)}
              className={`w-full rounded-lg border p-4 text-left ${
                activeSession?.id === session.id ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/60'
              }`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-white">{session.market} | {session.universe} | {formatDate(session.selected_at)}</p>
                  <p className="mt-1 text-xs text-slate-400">{session.candidates?.length || 0} candidates | {session.status}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {orderedCandidates(session).slice(0, 10).map((candidate) => (
                    <span key={candidate.id} className="rounded-lg border border-slate-700 px-2 py-1 text-slate-300">
                      {candidate.llm_rank ? `${candidate.llm_rank}. ` : ''}{candidate.ticker}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {activeSession && (
        <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">5. 선정 종목 요약</h2>
              <p className="mt-1 text-sm text-slate-400">
                콘테스트에서 최종 선택한 종목과 선정일 기준 종가를 먼저 확인합니다.
              </p>
            </div>
            <span className="text-xs text-slate-500">최종 선택 {finalPicks.length}개</span>
          </div>

          {finalPicks.length === 0 ? (
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-400">
              아직 최종 선택된 종목이 없습니다. 아래 후보 목록에서 실제 투자 대상으로 표시하면 이 영역에 누적됩니다.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm text-slate-300">
                <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-3 pr-3">최종 순위</th>
                    <th className="py-3 pr-3">종목</th>
                    <th className="py-3 pr-3">선정일</th>
                    <th className="py-3 pr-3 text-right">선정일 기준 종가</th>
                    <th className="py-3 pr-3">가격 출처</th>
                    <th className="py-3 pr-3">LLM 순위</th>
                    <th className="py-3">코멘트</th>
                  </tr>
                </thead>
                <tbody>
                  {finalPicks.map((candidate) => (
                    <tr key={candidate.id} className="border-b border-slate-800">
                      <td className="py-3 pr-3 font-mono text-emerald-300">#{candidate.final_pick_rank || '-'}</td>
                      <td className="py-3 pr-3">
                        <p className="font-mono font-bold text-white">{candidate.ticker}</p>
                        <p className="text-xs text-slate-500">{candidate.name || candidate.exchange}</p>
                      </td>
                      <td className="py-3 pr-3 text-slate-400">{formatDate(activeSession.selected_at)}</td>
                      <td className="py-3 pr-3 text-right font-mono text-slate-200">{formatPrice(basePriceFor(candidate), candidate.exchange)}</td>
                      <td className="py-3 pr-3 text-xs text-slate-500">{baseSourceFor(candidate)}</td>
                      <td className="py-3 pr-3 font-mono text-slate-300">{candidate.llm_rank ? `#${candidate.llm_rank}` : '-'}</td>
                      <td className="py-3 text-xs text-slate-400">{candidate.llm_comment || candidate.final_pick_note || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeSession && (
        <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">6. 최종 선정과 1주/1개월 성과 판정</h2>
              <p className="mt-1 text-sm text-slate-400">
                실제 선정 종목 수에는 제한이 없습니다. 선택군 평균이 미선택군보다 낮으면 해당 사이클은 실패로 표시합니다.
              </p>
            </div>
            <p className="text-xs text-slate-500">선정 {activeCandidates.filter((item) => item.actual_invested).length} / 미선정 {activeCandidates.filter((item) => !item.actual_invested).length}</p>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {summaryCard('W1', w1Summary)}
            {summaryCard('M1', m1Summary)}
          </div>

          <div className="mt-5 space-y-4">
            {activeCandidates.map((candidate) => (
              <article key={candidate.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xl font-bold text-white">{candidate.ticker}</span>
                      <span className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300">사용자 #{candidate.user_rank}</span>
                      {candidate.llm_rank && <span className="rounded-lg border border-emerald-500/30 px-2 py-1 text-xs text-emerald-300">LLM #{candidate.llm_rank}</span>}
                      {candidate.final_pick_rank && <span className="rounded-lg border border-sky-500/30 px-2 py-1 text-xs text-sky-300">최종 #{candidate.final_pick_rank}</span>}
                      {candidate.recommendation_tier && <span className={`rounded-lg border px-2 py-1 text-xs ${tierClass(candidate.recommendation_tier)}`}>{candidate.recommendation_tier}</span>}
                      <span className={`rounded-lg border px-2 py-1 text-xs ${candidate.actual_invested ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 text-slate-400'}`}>
                        {candidate.actual_invested ? '선정' : '미선정'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-400">{candidate.name || candidate.exchange}</p>
                    {candidate.llm_comment && <p className="mt-2 text-sm leading-6 text-slate-300">{candidate.llm_comment}</p>}
                    {typeof candidate.llm_analysis?.investment_thesis === 'string' && (
                      <p className="mt-2 text-xs leading-5 text-slate-400">Thesis: {candidate.llm_analysis.investment_thesis}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={busyId === candidate.id}
                    onClick={() => updateCandidate(candidate, !candidate.actual_invested)}
                    className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800 disabled:opacity-50"
                  >
                    {busyId === candidate.id ? '저장 중...' : candidate.actual_invested ? '미선정으로 변경' : '최종 선정'}
                  </button>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {(candidate.reviews || []).sort((a, b) => a.horizon.localeCompare(b.horizon)).map((review) => {
                    const draft = getReviewDraft(review);
                    return (
                      <div key={review.id} className={`rounded-lg border p-4 ${reviewTone(review)}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{review.horizon === 'W1' ? '1주 복기' : '1개월 복기'}</p>
                            <p className="mt-1 text-xs opacity-80">예정일 {formatDate(review.due_date)} | {review.status}</p>
                          </div>
                          <div className="text-right font-mono text-sm">
                            <p>{review.return_pct === null ? '-' : `${review.return_pct > 0 ? '+' : ''}${review.return_pct}%`}</p>
                            <p className="mt-1 text-xs opacity-70">{formatPrice(review.review_price, candidate.exchange)}</p>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <label className="block">
                            <span className="mb-1 block text-xs font-semibold opacity-80">복기 가격</span>
                            <input
                              type="number"
                              min="0"
                              step="0.0001"
                              value={draft.review_price}
                              onChange={(event) => updateReviewDraft(review, { review_price: event.target.value })}
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                            />
                          </label>
                          <div>
                            <span className="mb-1 block text-xs font-semibold opacity-80">기준 가격</span>
                            <p className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300">
                              {formatPrice(review.base_price, candidate.exchange)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {MISTAKE_TAGS.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => toggleReviewTag(review, tag)}
                              className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                                draft.mistake_tags.includes(tag)
                                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                                  : 'border-slate-700 text-slate-400'
                              }`}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>

                        <textarea
                          value={draft.user_review_note}
                          onChange={(event) => updateReviewDraft(review, { user_review_note: event.target.value })}
                          rows={3}
                          placeholder="다음 콘테스트를 위한 교훈"
                          className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                        />

                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            disabled={busyId === review.id || !draft.review_price}
                            onClick={() => saveManualReview(review)}
                            className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800 disabled:opacity-50"
                          >
                            {busyId === review.id ? '저장 중...' : '수동 복기 저장'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
