'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowUpRight,
  BarChart3,
  Star,
} from 'lucide-react';

import DataSourceBadge from '@/components/ui/DataSourceBadge';
import Button from '@/components/ui/Button';
import { copyTextToClipboard } from '@/lib/browser/clipboard';

// Components
import AnalyzingView from './components/AnalyzingView';
import IbAnalysisPanel from './components/IbAnalysisPanel';
import SessionHistory from './components/SessionHistory';
import TopCandidateCard from './components/TopCandidateCard';
import CandidateResultTable from './components/CandidateResultTable';
import UniverseSelectionSection from './components/UniverseSelectionSection';

// Utils & Types
import { getContestStructuredVerdict } from '@/lib/contest-presentation';
import {
  CONTEST_PLAN_QUEUE_STORAGE_KEY,
  contestCandidatePlanHref,
  contestFollowUpCopy,
  contestPlanQueue,
  contestPlanQueueHref,
  contestWatchlistPriority,
} from '@/lib/contest-followup';
import { isContestPoolTier, recommendationSortValue } from '@/lib/scanner-recommendation';
import { formatDate, verdictRecommendationClass } from '@/lib/contest-ui-utils';
import { canslimCandidateFromResult, minerviniCandidateFromResult } from '@/lib/contest-candidates';
import {
  CANSLIM_LATEST_UNIVERSE_STORAGE_KEY,
  CANSLIM_SNAPSHOT_PREFIX,
  CONTEST_SELECTIONS_MAP_KEY,
  CONTEST_SELECTIONS_SOURCE_MAP_KEY,
  CONTEST_SELECTION_STORAGE_KEY,
  CONTEST_SOURCE_STORAGE_KEY,
  DEFAULT_CONTEST_SOURCE,
  MAX_CONTEST_CANDIDATES,
  contestSourceLabel,
  parseContestSource,
  sourceUniverseKey,
  type ContestScreenerSource,
  type ContestTransferSelection,
} from '@/lib/contest-sources';

import type {
  ApiSuccess,
  BeautyContestSession,
  ContestCandidate,
  ContestMarket,
  ContestPromptCandidate,
  DataSourceMeta,
  MasterFilterResponse,
  CanslimScannerResult,
  ScannerResult,
  ScannerUniverse,
  StoredScannerSnapshot,
} from '@/types';
import { readScannerSnapshot } from '@/hooks/scanner/storage';

const LATEST_SCAN_UNIVERSE_STORAGE_KEY = 'mtn:scanner:latest-scan-universe:v1';
const LAST_UNIVERSE_STORAGE_KEY = 'mtn:scanner:last-universe:v1';
const UNIVERSES: ScannerUniverse[] = ['NASDAQ100', 'SP500', 'KOSPI200', 'KOSDAQ150'];

type TransferSelection = ContestTransferSelection;

function isTransferSelection(value: unknown): value is TransferSelection {
  if (!value || typeof value !== 'object') return false;
  const selection = value as Partial<TransferSelection>;
  return Boolean(
    parseContestSource(selection.source)
    && parseUniverse(selection.universe ?? null)
    && Array.isArray(selection.tickers)
    && selection.tickers.length > 0
    && typeof selection.savedAt === 'string',
  );
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

function getInitialSource(): ContestScreenerSource {
  if (typeof window === 'undefined') return DEFAULT_CONTEST_SOURCE;
  const urlSource = parseContestSource(new URLSearchParams(window.location.search).get('source'));
  return urlSource || parseContestSource(window.localStorage.getItem(CONTEST_SOURCE_STORAGE_KEY)) || DEFAULT_CONTEST_SOURCE;
}

function getInitialUniverse(source: ContestScreenerSource = getInitialSource()): ScannerUniverse {
  if (typeof window === 'undefined') return 'NASDAQ100';
  
  const lastSelected = window.localStorage.getItem(LAST_UNIVERSE_STORAGE_KEY);
  const storedLatest = window.localStorage.getItem(
    source === 'canslim' ? CANSLIM_LATEST_UNIVERSE_STORAGE_KEY : LATEST_SCAN_UNIVERSE_STORAGE_KEY,
  );
  const preferred = parseUniverse(lastSelected) || parseUniverse(storedLatest);

  try {
    const sourceMapRaw = window.localStorage.getItem(CONTEST_SELECTIONS_SOURCE_MAP_KEY);
    if (sourceMapRaw) {
      const sourceMap = JSON.parse(sourceMapRaw);
      const selections = Object.values(sourceMap)
        .filter(isTransferSelection)
        .filter((selection) => selection.source === source)
        .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
      if (preferred && sourceMap[sourceUniverseKey(source, preferred)]?.tickers?.length > 0) return preferred;
      if (selections.length > 0) {
        const u = parseUniverse(selections[0].universe);
        if (u) return u;
      }
    }

    const mapRaw = source === DEFAULT_CONTEST_SOURCE ? window.localStorage.getItem(CONTEST_SELECTIONS_MAP_KEY) : null;
    if (mapRaw) {
      const map = JSON.parse(mapRaw);
      // 1. Prefer the most recently used universe if it has selections
      if (preferred && map[preferred]?.tickers?.length > 0) {
        return preferred;
      }
      
      // 2. Otherwise find any universe with selections (most recently saved first)
      const selections = Object.values(map)
        .filter(isTransferSelection)
        .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());

        
      if (selections.length > 0) {
        const u = parseUniverse(selections[0].universe);
        if (u) return u;
      }
    }
  } catch (e) {
    console.error('Failed to scan initial selections:', e);
  }
  
  return preferred || 'NASDAQ100';
}

// Removed readSnapshot as we use readScannerSnapshot from storage

function readTransferSelection(source: ContestScreenerSource, targetUniverse: ScannerUniverse): TransferSelection | null {
  try {
    const sourceMapRaw = window.localStorage.getItem(CONTEST_SELECTIONS_SOURCE_MAP_KEY);
    if (sourceMapRaw) {
      const sourceMap = JSON.parse(sourceMapRaw);
      const selection = sourceMap[sourceUniverseKey(source, targetUniverse)];
      if (selection && Array.isArray(selection.tickers)) return selection as TransferSelection;
    }

    const mapRaw = window.localStorage.getItem(CONTEST_SELECTIONS_MAP_KEY);
    if (source === DEFAULT_CONTEST_SOURCE && mapRaw) {
      const map = JSON.parse(mapRaw);
      const selection = map[targetUniverse];
      if (selection && Array.isArray(selection.tickers)) return { source, ...selection } as TransferSelection;
    }
    const raw = window.localStorage.getItem(CONTEST_SELECTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const storedUniverse = window.localStorage.getItem(LATEST_SCAN_UNIVERSE_STORAGE_KEY);
      const universe = parseUniverse(storedUniverse) || 'NASDAQ100';
      if (source === DEFAULT_CONTEST_SOURCE && universe === targetUniverse) return { source, universe, tickers: parsed, savedAt: new Date().toISOString() };
      return null;
    }
    if ((parsed.source || DEFAULT_CONTEST_SOURCE) !== source) return null;
    if (!parseUniverse(parsed.universe) || !Array.isArray(parsed.tickers)) return null;
    if (parsed.universe !== targetUniverse) return null;
    return parsed as TransferSelection;
  } catch {
    return null;
  }
}

function candidateFromResult(item: ScannerResult, rank: number): ContestPromptCandidate {
  return minerviniCandidateFromResult(item, rank);
}

async function parseResponse<T>(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || body.error || `Request failed (${response.status})`);
  return body as ApiSuccess<T>;
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
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

interface StoredCanslimSnapshot {
  savedAt: string;
  universe: ScannerUniverse;
  results: CanslimScannerResult[];
  macro: unknown | null;
}

function readCanslimSnapshot(universe: ScannerUniverse): StoredCanslimSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${CANSLIM_SNAPSHOT_PREFIX}${universe}`);
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as StoredCanslimSnapshot;
    if (snapshot.universe !== universe || !Array.isArray(snapshot.results)) return null;
    return snapshot;
  } catch {
    return null;
  }
}

function scannerLikeFromCanslimResult(item: CanslimScannerResult): ScannerResult {
  const candidate = canslimCandidateFromResult(item, 1);
  return {
    rank: 0,
    ticker: item.ticker,
    exchange: item.exchange,
    name: item.name,
    marketCap: item.marketCap,
    currency: item.currency,
    currentPrice: item.currentPrice,
    priceAsOf: item.analyzedAt,
    priceSource: "MTN O'Neil CANSLIM scanner",
    status: item.status,
    recommendationTier: candidate.recommendation_tier || 'Low Priority',
    recommendationReason: candidate.recommendation_reason || null,
    sepaMissingCount: candidate.sepa_failed,
    exceptionSignals: item.dataWarnings || [],
    providerAttempts: [],
    sepaStatus: candidate.sepa_status,
    sepaPassed: candidate.sepa_passed,
    sepaFailed: candidate.sepa_failed,
    sepaCriteria: null,
    sepaEvidence: null,
    vcpScore: item.vcpScore,
    vcpGrade: item.vcpGrade,
    contractionScore: null,
    volumeDryUpScore: null,
    bbSqueezeScore: null,
    pocketPivotScore: null,
    vcpDetails: null,
    fundamentals: item.sector ? { sector: item.sector, source: "MTN O'Neil CANSLIM scanner", epsGrowthPct: null, revenueGrowthPct: null, roePct: null, debtToEquityPct: null } : null,
    pivotPrice: candidate.pivot_price,
    pivotDate: null,
    pivotAgeDays: null,
    pivotKind: candidate.pivot_kind,
    referenceHighPrice: null,
    referenceHighDate: null,
    recommendedEntry: candidate.pivot_price,
    entrySource: candidate.pivot_price ? 'VCP_PIVOT' : null,
    distanceToPivotPct: candidate.distance_to_pivot_pct,
    breakoutVolumeStatus: null,
    baseType: candidate.base_type ?? null,
    momentumBranch: null,
    eightWeekReturnPct: null,
    distanceFromMa50Pct: null,
    low52WeekAdvancePct: null,
    highTightFlag: null,
    rsRating: item.rsRating,
    rsSource: item.rsSource ?? null,
    internalRsRating: null,
    externalRsRating: item.rsSource === 'DB_BATCH' ? item.rsRating : null,
    rsRank: null,
    rsUniverseSize: null,
    rsPercentile: null,
    weightedMomentumScore: null,
    benchmarkRelativeScore: item.benchmarkRelativeScore ?? null,
    rsLineNewHigh: null,
    rsLineNearHigh: null,
    tennisBallCount: null,
    tennisBallScore: null,
    return3m: null,
    return6m: null,
    return9m: null,
    return12m: null,
    changePercent: null,
    adrPct: null,
    analyzedAt: item.analyzedAt,
    errorMessage: item.errorMessage,
    dataWarnings: item.dataWarnings,
  } as ScannerResult;
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

function ContestPageContent() {
  const searchParams = useSearchParams();
  const searchSource = parseContestSource(searchParams.get('source'));
  const initialSource = searchSource || getInitialSource();
  const [contestSource, setContestSource] = useState<ContestScreenerSource>(() => initialSource);
  const [universe, setUniverse] = useState<ScannerUniverse>(() => getInitialUniverse(initialSource));
  const [snapshot, setSnapshot] = useState<StoredScannerSnapshot | null>(null);
  const [canslimSnapshot, setCanslimSnapshot] = useState<StoredCanslimSnapshot | null>(null);
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
  const [watchlistBusyId, setWatchlistBusyId] = useState<string | null>(null);
  const [savedWatchlistIds, setSavedWatchlistIds] = useState<Set<string>>(new Set());

  const market: ContestMarket = universe === 'KOSPI200' || universe === 'KOSDAQ150' ? 'KR' : 'US';

  const loadSnapshot = useCallback(async (nextUniverse: ScannerUniverse, sourceOverride?: ContestScreenerSource) => {
    const source = sourceOverride || contestSource;
    window.localStorage.setItem(CONTEST_SOURCE_STORAGE_KEY, source);

    const nextCanslim = source === 'canslim' ? readCanslimSnapshot(nextUniverse) : null;
    const next = source === 'minervini' ? await readScannerSnapshot(nextUniverse) : null;
    setCanslimSnapshot(nextCanslim);
    setSnapshot(next);
    const rows = source === 'canslim' ? (nextCanslim?.results || []).map(scannerLikeFromCanslimResult) : (next?.results || []);
    if (rows.length === 0) {
      setSelected([]);
      setTransferInfo(null);
      return;
    }
    const transfer = readTransferSelection(source, nextUniverse);
    const validTickers = new Set(rows.map((item) => item.ticker));
    const transferred = (transfer?.tickers || []).filter((ticker) => validTickers.has(ticker)).slice(0, MAX_CONTEST_CANDIDATES);
    if (transferred.length > 0) {
      setSelected(transferred);
      setTransferInfo({ source, universe: nextUniverse, tickers: transferred, savedAt: transfer?.savedAt || new Date().toISOString() });
    } else {
      setTransferInfo(null);
      setSelected([]);
    }
  }, [contestSource]);

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
    const source = searchSource || getInitialSource();
    setContestSource(source);
    const initial = getInitialUniverse(source);
    setUniverse(initial);
    loadSnapshot(initial, source);
    loadSessions().catch((err: unknown) => setError(err instanceof Error ? err.message : '불러오기 실패'));
  }, [loadSessions, loadSnapshot, searchSource]);

  useEffect(() => { fetchMarketContext(market).then(setMarketContext); }, [market]);

  useEffect(() => {
    if (activeSession?.ib_analysis && typeof activeSession.ib_analysis === 'object') setIbAnalysis(activeSession.ib_analysis as IbCommitteeAnalysis);
    else setIbAnalysis(null);
  }, [activeSession?.id, activeSession?.ib_analysis]);

  const rankedResults = useMemo(() => (
    contestSource === 'canslim'
      ? (canslimSnapshot?.results || []).map(scannerLikeFromCanslimResult)
      : sortScannerPool(snapshot?.results || [])
  ), [canslimSnapshot, contestSource, snapshot]);
  const candidatePool = useMemo(() => rankedResults.filter((item) => (
    contestSource === 'canslim' ? item.recommendationTier !== 'Low Priority' : isContestPoolTier(item.recommendationTier)
  )), [contestSource, rankedResults]);
  const visibleSelectionRows = useMemo(() => {
    if (!transferInfo || transferInfo.tickers.length === 0) return [];
    const transferred = new Set(transferInfo.tickers);
    return rankedResults.filter((item) => transferred.has(item.ticker));
  }, [rankedResults, transferInfo]);
  const selectionSnapshot = useMemo(() => {
    if (snapshot) return snapshot;
    if (!canslimSnapshot) return null;
    return {
      savedAt: canslimSnapshot.savedAt,
      universeMeta: {
        universe: canslimSnapshot.universe,
        label: universe,
        asOf: canslimSnapshot.savedAt,
        source: "MTN O'Neil CANSLIM scanner",
        delayNote: null,
        items: rankedResults,
        warnings: [],
      },
      results: rankedResults,
    } as StoredScannerSnapshot;
  }, [canslimSnapshot, rankedResults, snapshot, universe]);

  const selectedCandidates = useMemo(() => {
    if (contestSource === 'canslim') {
      const byTicker = new Map((canslimSnapshot?.results || []).map((item) => [item.ticker, item]));
      return selected.map((ticker, index) => {
        const item = byTicker.get(ticker);
        return item ? canslimCandidateFromResult(item, index + 1) : null;
      }).filter((v): v is ContestPromptCandidate => !!v);
    }
    const byTicker = new Map(rankedResults.map((item) => [item.ticker, item]));
    return selected.map((t, i) => {
      const item = byTicker.get(t);
      return item ? candidateFromResult(item, i + 1) : null;
    }).filter((v): v is ContestPromptCandidate => !!v);
  }, [canslimSnapshot, contestSource, rankedResults, selected]);

  const activeCandidates = useMemo(() => orderedCandidates(activeSession), [activeSession]);
  const w1Summary = useMemo(() => performanceSummary(activeCandidates, 'W1'), [activeCandidates]);
  const m1Summary = useMemo(() => performanceSummary(activeCandidates, 'M1'), [activeCandidates]);
  const finalPicks = useMemo(() => activeCandidates.filter((c) => c.actual_invested).sort((a, b) => (a.final_pick_rank || 99) - (b.final_pick_rank || 99)), [activeCandidates]);
  const followUpCopy = useMemo(() => contestFollowUpCopy(finalPicks.length), [finalPicks.length]);
  const followUpCandidates = finalPicks.length > 0 ? finalPicks : activeCandidates.slice(0, 5);
  const planQueueCandidates = finalPicks.length > 0 ? finalPicks : followUpCandidates;
  const planQueueHref = useMemo(() => contestPlanQueueHref(planQueueCandidates), [planQueueCandidates]);

  const persistPlanQueue = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      CONTEST_PLAN_QUEUE_STORAGE_KEY,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        source: 'contest',
        sessionId: activeSession?.id ?? null,
        candidates: contestPlanQueue(planQueueCandidates),
      }),
    );
  }, [activeSession?.id, planQueueCandidates]);

  const toggleCandidateSelection = (ticker: string) => {
    setSelected((prev) => prev.includes(ticker) ? prev.filter((t) => t !== ticker) : prev.length >= 15 ? prev : [...prev, ticker]);
  };

  const createSession = async (silent = false) => {
    if (!silent) setBusy(true);
    setError(null);
    try {
      const context = marketContext || await fetchMarketContext(market);
      const response = await fetch('/api/contest/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: contestSource,
          market,
          universe,
          candidates: selectedCandidates,
          market_context: context,
          candidate_pool_snapshot: contestSource === 'canslim'
            ? (canslimSnapshot?.results || []).map((it, i) => canslimCandidateFromResult(it, i + 1))
            : candidatePool.map((it, i) => candidateFromResult(it, i + 1)),
        }),
      });
      const result = await parseResponse<BeautyContestSession>(response);
      setActiveSession(result.data);
      if (!silent) {
        await copyTextToClipboard(result.data.llm_prompt);
        setNotice('세션 저장 및 프롬프트 복사 완료');
      }
      await loadSessions(result.data.id);
      return result.data;
    } catch (err: unknown) { setError(errorMessage(err, 'Failed to create contest session')); throw err; } finally { if (!silent) setBusy(false); }
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
    } catch (err: unknown) { setError(errorMessage(err, 'Failed to run AI analysis')); return false; } finally { setBusy(false); }
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
    } catch (err: unknown) { setError(errorMessage(err, 'Failed to update candidate')); } finally { setBusyId(null); }
  }, [activeCandidates, activeSession?.id, loadSessions]);

  const addCandidateToWatchlist = useCallback(async (candidate: ContestCandidate) => {
    const verdict = getContestStructuredVerdict(candidate);
    setWatchlistBusyId(candidate.id);
    setError(null);
    try {
      const response = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ticker: candidate.ticker,
          exchange: candidate.exchange,
          priority: contestWatchlistPriority(verdict.recommendation),
          tags: ['contest', verdict.recommendation || 'manual-follow-up'],
          memo: `Contest follow-up: ${verdict.comment || verdict.recommendation || 'manual selection'}`,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '관심종목 등록에 실패했습니다.');
      setSavedWatchlistIds((prev) => new Set(prev).add(candidate.id));
      setNotice(`${candidate.ticker} 관심종목 등록 완료. 매매 계획으로 이어갈 수 있습니다.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '관심종목 등록 중 오류가 발생했습니다.');
    } finally {
      setWatchlistBusyId(null);
    }
  }, []);

  const copyIbPrompt = async () => {
    if (!activeSession) return;
    setIbError(null);
    try {
      const response = await fetch(`/api/contest/sessions/${activeSession.id}/ib-validate`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error);

      setIbPromptText(result.data.prompt);
      const method = await copyTextToClipboard(result.data.prompt);
      setNotice(method === 'exec-command' ? 'IB 프롬프트 복사 완료 (fallback)' : 'IB 프롬프트 복사 완료');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '프롬프트 복사 중 오류가 발생했습니다.';
      setIbError(`프롬프트를 화면에 열어두었습니다. 브라우저 포커스를 앱으로 둔 뒤 다시 복사하세요. (${message})`);
      setIbPromptOpen(true);
    }
  };

  const runIbValidation = async () => {
    if (!activeSession) return;
    setIbBusy(true);
    try {
      const response = await fetch(`/api/contest/sessions/${activeSession.id}/ib-validate`, { method: 'POST' });
      const result = await response.json();
      if (result.success) { setIbAnalysis(result.data.ib_analysis); setNotice('IB 검증 완료'); await loadSessions(activeSession.id); }
      else throw new Error(result.error);
    } catch (err: unknown) { setIbError(errorMessage(err, 'Failed to run IB validation')); } finally { setIbBusy(false); }
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

  const renderFollowUpPanel = () => (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-5 text-left">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Next Flow</p>
          <h3 className="mt-2 text-lg font-bold text-white">{followUpCopy.title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">{followUpCopy.description}</p>
        </div>
        <Link
          href="/watchlist"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:border-emerald-500/60 hover:text-emerald-200"
        >
          관심종목 보기 <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-4 space-y-3">
        {followUpCandidates.map((candidate) => {
          const verdict = getContestStructuredVerdict(candidate);
          const isSaved = savedWatchlistIds.has(candidate.id);
          const isSelected = candidate.actual_invested;

          return (
            <div key={candidate.id} className={`rounded-lg border p-3 ${isSelected ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/50'}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-black text-white">{candidate.ticker}</span>
                    <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${verdictRecommendationClass(verdict.recommendation)}`}>
                      {verdict.recommendation || 'MANUAL'}
                    </span>
                    {isSelected && <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-200">후속 선택됨</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{candidate.name || candidate.exchange}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!isSelected && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateCandidate(candidate, true)}
                      disabled={busyId === candidate.id}
                      className="text-xs"
                    >
                      {busyId === candidate.id ? '선택 중...' : '이 종목으로 진행'}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={isSaved ? 'secondary' : 'primary'}
                    onClick={() => addCandidateToWatchlist(candidate)}
                    disabled={watchlistBusyId === candidate.id}
                    icon={<Star className="h-3.5 w-3.5" />}
                    className="text-xs"
                  >
                    {watchlistBusyId === candidate.id ? '등록 중...' : isSaved ? '등록 완료' : '관심종목 등록'}
                  </Button>
                  <Link
                    href={contestCandidatePlanHref(candidate)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500"
                  >
                    매매 계획 <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
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
            universe={universe} setUniverse={setUniverse} snapshot={selectionSnapshot} loadSnapshot={loadSnapshot}
            selected={selected} marketContext={marketContext} visibleSelectionRows={visibleSelectionRows}
            toggleCandidateSelection={toggleCandidateSelection} handleStartAnalysis={handleStartAnalysis}
            busy={busy} UNIVERSES={UNIVERSES} sourceLabel={contestSourceLabel(contestSource)}
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              <div className="w-full">
                {renderFollowUpPanel()}
              </div>
              <div className="flex flex-col w-full max-w-xs gap-3">
                <Link
                  href={planQueueHref}
                  onClick={persistPlanQueue}
                  className="inline-flex h-14 items-center justify-center rounded-2xl bg-indigo-600 font-black text-white shadow-xl"
                >
                  매매 계획 수립
                </Link>
                <Button variant="ghost" onClick={() => { setStep('selection'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-slate-500">다른 종목 분석</Button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default function ContestPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-7xl px-4 py-10 text-sm text-slate-400">Loading contest...</div>}>
      <ContestPageContent />
    </Suspense>
  );
}
