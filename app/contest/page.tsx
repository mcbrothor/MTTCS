'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clipboard, RefreshCw, Save, Trophy } from 'lucide-react';
import Button from '@/components/ui/Button';
import DataSourceBadge from '@/components/ui/DataSourceBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type {
  ApiSuccess,
  BeautyContestSession,
  ContestCandidate,
  ContestMarket,
  ContestPromptCandidate,
  ContestReview,
  DataSourceMeta,
  ScannerResult,
  ScannerUniverse,
  ScannerUniverseResponse,
} from '@/types';

const SNAPSHOT_PREFIX = 'mtn:scanner-snapshot:v2:';
const UNIVERSES: ScannerUniverse[] = ['NASDAQ100', 'SP500', 'KOSPI100', 'KOSDAQ100'];
const MISTAKE_TAGS = ['펀더멘탈 오판', '가짜 돌파', '매크로 무시', '추격 매수', '매도 지연', '놓친 주도주'];

interface StoredScannerSnapshot {
  savedAt: string;
  universeMeta: ScannerUniverseResponse;
  results: ScannerResult[];
}

interface ReviewDraft {
  review_price: string;
  user_review_note: string;
  mistake_tags: string[];
}

type ReviewDrafts = Record<string, ReviewDraft>;

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

function candidateFromResult(item: ScannerResult, rank: number): ContestPromptCandidate {
  return {
    ticker: item.ticker,
    exchange: item.exchange,
    name: item.name || item.ticker,
    user_rank: rank,
    rs_rating: null,
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
  };
}

async function parseResponse<T>(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || body.error || `Request failed (${response.status})`);
  return body as ApiSuccess<T>;
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

export default function ContestPage() {
  const [universe, setUniverse] = useState<ScannerUniverse>('NASDAQ100');
  const [snapshot, setSnapshot] = useState<StoredScannerSnapshot | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [sessions, setSessions] = useState<BeautyContestSession[]>([]);
  const [activeSession, setActiveSession] = useState<BeautyContestSession | null>(null);
  const [llmJson, setLlmJson] = useState('');
  const [reviewDrafts, setReviewDrafts] = useState<ReviewDrafts>({});
  const [meta, setMeta] = useState<DataSourceMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const market: ContestMarket = universe === 'KOSPI100' || universe === 'KOSDAQ100' ? 'KR' : 'US';

  const loadSnapshot = useCallback((nextUniverse: ScannerUniverse) => {
    const next = readSnapshot(nextUniverse);
    setSnapshot(next);
    setSelected(next ? next.results.filter((item) => item.status === 'done').slice(0, 10).map((item) => item.ticker) : []);
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
    loadSnapshot(universe);
    loadSessions().catch((err: unknown) => setError(err instanceof Error ? err.message : '콘테스트 목록을 불러오지 못했습니다.'));
  }, [loadSessions, loadSnapshot, universe]);

  const rankedResults = useMemo(() => {
    const rows = snapshot?.results || [];
    return [...rows]
      .filter((item) => item.status === 'done')
      .sort((a, b) => (b.vcpScore || 0) - (a.vcpScore || 0));
  }, [snapshot]);

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
      const response = await fetch('/api/contest/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ market, universe, candidates: selectedCandidates }),
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
    if (!activeSession) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/contest/sessions/${activeSession.id}/llm-result`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ llm_raw_response: llmJson, llm_provider: 'external' }),
      });
      const result = await parseResponse<BeautyContestSession>(response);
      setActiveSession(result.data);
      setLlmJson('');
      setNotice('LLM 순위를 저장했습니다.');
      await loadSessions(result.data.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'LLM 결과 저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const copyPrompt = async () => {
    if (!activeSession) return;
    await navigator.clipboard.writeText(activeSession.llm_prompt);
    setNotice('프롬프트를 클립보드에 복사했습니다.');
  };

  const updateCandidate = async (candidate: ContestCandidate, actualInvested: boolean) => {
    setBusyId(candidate.id);
    setError(null);
    try {
      const response = await fetch(`/api/contest/candidates/${candidate.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actual_invested: actualInvested }),
      });
      await parseResponse<ContestCandidate>(response);
      await loadSessions(activeSession?.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '투자 여부 저장에 실패했습니다.');
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

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">Beauty Contest</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">후보 10개 비교와 자동 복기</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            스캐너 결과에서 후보를 고르고, 외부 LLM 순위를 저장한 뒤 투자한 종목과 투자하지 않은 종목의 1주/1개월 결과를 비교합니다.
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
            <h2 className="text-lg font-bold text-white">1. 스캐너 스냅샷에서 후보 선택</h2>
            <p className="mt-1 text-sm text-slate-400">Scanner 페이지에서 스캔한 최근 결과를 불러와 최대 10개 후보를 고릅니다.</p>
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
            저장된 스캐너 결과가 없습니다. Scanner 페이지에서 {universe} 스캔을 먼저 실행하세요.
          </div>
        ) : (
          <>
            <p className="mt-4 text-xs text-slate-500">
              스냅샷 {new Date(snapshot.savedAt).toLocaleString('ko-KR')} | 선택 {selected.length}/10
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {rankedResults.slice(0, 30).map((item) => {
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
                      <span className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300">
                        VCP {item.vcpScore ?? '-'}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-400">
                      <span>SEPA {item.sepaStatus || '-'}</span>
                      <span>피벗 {item.distanceToPivotPct ?? '-'}%</span>
                      <span>{item.priceSource}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-5">
          <h2 className="text-lg font-bold text-white">2. LLM 프롬프트 생성</h2>
          <p className="mt-1 text-sm text-slate-400">저장하면 DB 세션과 1주/1개월 복기 항목이 함께 생성됩니다.</p>
          <Button type="button" onClick={createSession} disabled={busy || selectedCandidates.length === 0 || selectedCandidates.length > 10} className="mt-4 gap-2">
            {busy ? <LoadingSpinner size="sm" /> : <Trophy className="h-4 w-4" />}
            세션 저장 및 프롬프트 복사
          </Button>

          {activeSession && (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-200">활성 프롬프트</p>
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
          <p className="mt-1 text-sm text-slate-400">ChatGPT/Claude가 반환한 JSON만 붙여넣으세요.</p>
          <textarea
            value={llmJson}
            onChange={(event) => setLlmJson(event.target.value)}
            rows={12}
            placeholder='{"rankings":[{"ticker":"NVDA","rank":1,"comment":"..." }]}'
            className="mt-4 w-full rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-200 outline-none focus:border-emerald-400"
          />
          <Button type="button" onClick={saveLlmResult} disabled={!activeSession || !llmJson.trim() || busy} className="mt-3 gap-2">
            <Save className="h-4 w-4" /> LLM 순위 저장
          </Button>
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
              <h2 className="text-lg font-bold text-white">5. 투자 여부와 복기 대조</h2>
              <p className="mt-1 text-sm text-slate-400">실제로 투자한 종목을 표시하고, cron이 채운 결과 또는 수동 가격으로 복기를 저장합니다.</p>
            </div>
            <p className="text-xs text-slate-500">투자 {activeCandidates.filter((item) => item.actual_invested).length} / 비투자 {activeCandidates.filter((item) => !item.actual_invested).length}</p>
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
                      <span className={`rounded-lg border px-2 py-1 text-xs ${candidate.actual_invested ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 text-slate-400'}`}>
                        {candidate.actual_invested ? '투자함' : '비투자'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-400">{candidate.name || candidate.exchange}</p>
                    {candidate.llm_comment && <p className="mt-2 text-sm leading-6 text-slate-300">{candidate.llm_comment}</p>}
                  </div>
                  <button
                    type="button"
                    disabled={busyId === candidate.id}
                    onClick={() => updateCandidate(candidate, !candidate.actual_invested)}
                    className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800 disabled:opacity-50"
                  >
                    {busyId === candidate.id ? '저장 중...' : candidate.actual_invested ? '비투자로 변경' : '투자함 표시'}
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
                          placeholder="다음 매매를 위한 교훈"
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
