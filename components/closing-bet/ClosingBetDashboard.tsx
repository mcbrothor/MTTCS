'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowUpRight, CalendarDays, ChevronDown, RefreshCw, ShieldAlert, Zap } from 'lucide-react';
import type { ClosingBar, ClosingCandidate, ClosingEvaluation, ClosingMarket, ClosingMode, ClosingSnapshot } from '../../lib/closing-bet/types';
import { CLOSING_DASHBOARD_TIMEOUT_MS, CLOSING_EXIT_RULE, CLOSING_LABELS, CLOSING_MARKETS } from '../../lib/closing-bet/config';
import { OpeningPerformancePanel } from './OpeningPerformancePanel';
export { OpeningPerformancePanel as ClosingEvaluationPanel } from './OpeningPerformancePanel';
import { closingExplanation, displayedClosingCandidates, safeClosingEvidenceUrl, selectClosingSnapshots } from './view-model';

interface ClosingResponse {
  data: { snapshots: ClosingSnapshot[]; evaluations: ClosingEvaluation[]; dates: string[] };
  meta?: Record<string, unknown>;
}
interface LoadedClosingData extends ClosingResponse { mode: ClosingMode; fallback: boolean }
type RequestedMode = ClosingMode | 'AUTO';

export async function fetchClosingDashboard(input: { date: string; mode: RequestedMode; signal?: AbortSignal; fetcher?: typeof fetch }): Promise<LoadedClosingData> {
  const fetcher = input.fetcher || fetch;
  const deadline = new AbortController();
  const signal = input.signal ? AbortSignal.any([input.signal, deadline.signal]) : deadline.signal;
  const timeout = setTimeout(() => deadline.abort(new Error('조회 시간이 초과되었습니다. 다시 불러와 주세요.')), CLOSING_DASHBOARD_TIMEOUT_MS);
  const read = async (mode: ClosingMode) => {
    const params = new URLSearchParams({ mode });
    if (input.date) params.set('date', input.date);
    const response = await fetcher(`/api/closing-bet?${params}`, { signal, cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || (typeof body.error === 'string' ? body.error : null) || '종가베팅 결과를 불러오지 못했습니다.');
    if (!Array.isArray(body.data?.snapshots) || !Array.isArray(body.data?.evaluations) || !Array.isArray(body.data?.dates)) {
      throw new Error('종가베팅 응답 형식을 확인할 수 없습니다. 다시 불러와 주세요.');
    }
    return body as ClosingResponse;
  };
  try {
    const mode = input.mode === 'AUTO' ? 'LIVE' : input.mode;
    const primary = await read(mode);
    if (input.mode === 'AUTO' && !primary.data.snapshots.some((snapshot) => snapshot.mode === 'LIVE')) {
      const replay = await read('REPLAY');
      if (replay.data.snapshots.length) return { ...replay, mode: 'REPLAY', fallback: true };
      return { ...primary, data: { ...primary.data, dates: [...new Set([...primary.data.dates, ...replay.data.dates])].sort().reverse() }, mode: 'LIVE', fallback: false };
    }
    return { ...primary, mode, fallback: false };
  } finally {
    clearTimeout(timeout);
  }
}

function numeric(value: number | null | undefined, digits = 0) {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toLocaleString('ko-KR', { maximumFractionDigits: digits });
}
function price(value: number | null) { return value === null || !Number.isFinite(value) ? '—' : `${numeric(value)}원`; }
function percent(value: number | null) { return value === null || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`; }
function turnover(value: number | null) { return value === null || !Number.isFinite(value) ? '—' : `${numeric(value / 100_000_000, 1)}억원`; }
function tone(value: number | null) { return value === null || value === 0 ? 'text-slate-300' : value > 0 ? 'text-rose-300' : 'text-sky-300'; }
function timestamp(value: string | null) {
  if (!value) return '시각 미확인';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '시각 미확인';
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}
const QUALITY_LABEL = { FULL: '정상', DEGRADED: '일부 데이터 제한', MISSING: '데이터 미확인' };
const REGIME_LABEL = { GREEN: '양호', YELLOW: '주의', RED: '위험', UNKNOWN: '미확인' };
const STATUS_LABEL = { READY: '선정 완료', DEGRADED: '데이터 제한', BLOCKED: '추천 보류' };
const SCORE_LABELS: Record<keyof ClosingCandidate['scores'], string> = { late: '장 후반 강도', liquidity: '거래대금', chart: '차트 구조', flow: '수급', catalyst: '재료', execution: '체결 여건', character: '종목 특성' };

export function ClosingMiniChart({ bars, name }: { bars: ClosingBar[]; name: string }) {
  const usable = bars.filter((bar) => Number.isFinite(bar.close) && bar.close > 0);
  if (usable.length < 2) return <p className="rounded-lg bg-slate-900/60 p-3 text-xs text-slate-500">분봉 차트 데이터가 부족합니다.</p>;
  const prices = usable.map((bar) => bar.close);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const span = high - low || 1;
  const points = prices.map((value, index) => `${12 + index / (prices.length - 1) * 376},${90 - (value - low) / span * 72}`).join(' ');
  const label = (bar: ClosingBar) => bar.time ? bar.time.slice(0, 5) : bar.date;
  return <figure className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
    <figcaption className="mb-2 flex justify-between gap-2 text-[11px] text-slate-400"><span>저장된 분봉 종가</span><span>{price(low)} ~ {price(high)}</span></figcaption>
    <svg viewBox="0 0 400 105" className="h-28 w-full" role="img" aria-label={`${name} 저장된 분봉 종가 추이`}>
      <line x1="12" y1="90" x2="388" y2="90" stroke="#1e293b" />
      <line x1="12" y1="18" x2="388" y2="18" stroke="#1e293b" strokeDasharray="3 5" />
      <polyline points={points} fill="none" stroke="#5eead4" strokeWidth="2" strokeLinejoin="round" />
    </svg>
    <div className="flex justify-between text-[10px] text-slate-500"><span>{label(usable[0])}</span><span>{label(usable[usable.length - 1])} KST</span></div>
  </figure>;
}

function FlowSummary({ flow }: { flow: ClosingCandidate['flow'] }) {
  const kind = flow.kind === 'ESTIMATE' ? '장중 가집계' : flow.kind === 'PREVIOUS_CONFIRMED' ? '전일 확정' : '수급 미확인';
  const unit = flow.unit === 'SHARES' ? '주' : '원';
  const flowValue = (value: number | null) => value === null ? '—' : `${value > 0 ? '+' : ''}${numeric(value)}${unit}`;
  return <div className="mt-3 rounded-lg bg-slate-900/60 px-3 py-2 text-[11px] leading-5">
    <p className="flex flex-wrap justify-between gap-x-3 text-slate-400"><span>{kind} · {flow.venue === 'KRX' ? 'KRX' : '거래소 미확인'}</span><span>{timestamp(flow.asOf)} KST</span></p>
    <p className="mt-1 flex flex-wrap gap-x-4 text-slate-300"><span>외국인 <span className={tone(flow.foreignNet)}>{flowValue(flow.foreignNet)}</span></span><span>기관 <span className={tone(flow.institutionNet)}>{flowValue(flow.institutionNet)}</span></span></p>
  </div>;
}

function CandidateCard({ candidate, index, replay, watch }: { candidate: ClosingCandidate; index: number; replay: boolean; watch: boolean }) {
  const pick = candidate;
  return <article className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/55 p-4" aria-label={`${index + 1}위 ${pick.name}`}>
    <div className="flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-400/10 font-mono text-sm font-bold text-teal-300">{index + 1}</span>
      <div className="min-w-0 flex-1">
        <Link href={`/stock/${encodeURIComponent(pick.ticker)}?exchange=${pick.market === 'KOSPI200' ? 'KOSPI' : 'KOSDAQ'}`} className="inline-flex max-w-full items-center gap-1 text-sm font-semibold text-slate-100 hover:text-teal-300">
          <span className="truncate">{pick.name}</span><ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden />
        </Link>
        <p className="mt-0.5 text-[10px] text-slate-500">{pick.ticker} · {pick.sector || '업종 미확인'}</p>
      </div>
      <div className="text-right"><p className="font-mono text-lg font-semibold text-teal-300">{numeric(pick.score, 1)}<span className="ml-1 text-[10px] text-slate-500">점</span></p><p className="text-[10px] text-slate-500">{replay ? '과거 검토' : watch ? '예비 관찰 · 정식 추천 아님' : '조건부 추천'}</p></div>
    </div>
    <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1"><span className="font-mono text-lg font-semibold text-slate-100">{price(pick.metrics.price)}</span><span className={`font-mono text-xs ${tone(pick.metrics.changePct)}`}>{percent(pick.metrics.changePct)}</span><span className="ml-auto text-[11px] text-slate-400">거래대금 {turnover(pick.metrics.turnover)}</span></div>
    <ul className="mt-3 space-y-1 text-xs leading-5 text-slate-300">{pick.reasons.slice(0, 3).map((reason, index) => <li key={index}>· {closingExplanation(reason)}</li>)}</ul>
    <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-slate-800 px-3 py-2 text-[11px]">
      <div><p className="text-slate-500">{replay ? '검토 진입 상한' : '진입 상한'}</p><p className="mt-1 font-mono font-semibold text-slate-200">{price(pick.plan.entryMax)}</p></div>
      <div><p className="text-slate-500">무효화 가격</p><p className="mt-1 font-mono font-semibold text-amber-200">{price(pick.plan.invalidation)}</p></div>
    </div>
    <FlowSummary flow={pick.flow} />
    <details className="group mt-3 border-t border-slate-800 pt-3">
      <summary className="flex cursor-pointer list-none items-center justify-between text-xs text-slate-400 hover:text-slate-200">차트·점수·진입 조건 확인<ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden /></summary>
      <div className="mt-3 space-y-3">
        <ClosingMiniChart bars={pick.chart} name={pick.name} />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">{Object.entries(SCORE_LABELS).map(([key, label]) => <div key={key} className="flex justify-between gap-2"><dt className="text-slate-500">{label}</dt><dd className="font-mono text-slate-200">{numeric(pick.scores[key as keyof typeof pick.scores], 1)}점</dd></div>)}</dl>
        <div className="rounded-lg bg-slate-900/60 p-3 text-[11px] leading-6 text-slate-400">
          <p>진입 구간 <span className="text-slate-200">{price(pick.plan.entryLow)} ~ {price(pick.plan.entryMax)}</span></p>
          <p>유효 시각 <span className="text-slate-200">{timestamp(pick.plan.expiresAt)} KST</span></p>
          <p>목표 참고값 <span className="text-slate-200">{price(pick.plan.target)}</span></p>
          <p>청산 규칙 <span className="text-slate-200">{CLOSING_EXIT_RULE}</span></p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400"><span>VWAP {price(pick.metrics.vwap)}</span><span>동시간 RVOL {numeric(pick.metrics.rvol, 2)}</span><span>스프레드 {numeric(pick.metrics.spreadBps, 1)}bp</span><span>데이터 {QUALITY_LABEL[pick.quality]}</span></div>
        {pick.evidence.length > 0 && <ul className="space-y-2 text-[11px]">{pick.evidence.map((evidence, index) => {
          const href = safeClosingEvidenceUrl(evidence.url);
          return <li key={index}><p>{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-sky-300 underline decoration-sky-300/30 underline-offset-2">{evidence.title} ↗</a> : <span className="text-slate-300">{evidence.title}</span>}</p><p className="mt-0.5 text-slate-500">{evidence.kind === 'RISK' ? '위험 근거' : '재료 근거'} · 확인 가능 시각 {timestamp(evidence.availableAt)} KST</p></li>;
        })}</ul>}
        {[...pick.exclusions, ...pick.warnings].length > 0 && <ul className="space-y-1 text-[11px] leading-5 text-amber-200/80">{[...new Set([...pick.exclusions, ...pick.warnings])].map((warning, index) => <li key={index}>· {closingExplanation(warning)}</li>)}</ul>}
      </div>
    </details>
  </article>;
}

export function ClosingMarketPanel({ market, snapshot, mode }: { market: ClosingMarket; snapshot?: ClosingSnapshot; mode: ClosingMode }) {
  const picks = snapshot ? displayedClosingCandidates(snapshot) : [];
  const coverage = snapshot && snapshot.coverage.total > 0 ? snapshot.coverage.collected / snapshot.coverage.total * 100 : null;
  const replay = mode === 'REPLAY';
  return <section className="min-w-0 space-y-3 rounded-2xl border border-slate-800 bg-slate-900/25 p-3 sm:p-4" aria-label={`${CLOSING_LABELS[market]} Top5`}>
    <header className="space-y-3 pb-1">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-bold text-slate-100">{CLOSING_LABELS[market]} <span className="ml-1 font-mono text-teal-300">Top5</span></h2><span className="rounded-md border border-slate-700 px-2 py-1 text-[10px] text-slate-400">{replay ? '검토 후보' : snapshot?.phase === 'WATCH' ? '예비 후보' : '선정'} {picks.length}/5</span></div>
      <p className="text-[11px] text-slate-500">{market === 'KOSPI200' ? '코스피 시가총액 상위 200' : '코스닥 시가총액 상위 150'} · KRX</p>
      {snapshot ? <>
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-950/60 p-3 text-[11px]">
          <div><p className="text-slate-500">시장 상태</p><p className={`mt-1 font-semibold ${snapshot.regime === 'GREEN' ? 'text-emerald-300' : snapshot.regime === 'RED' ? 'text-rose-300' : 'text-amber-200'}`}>{REGIME_LABEL[snapshot.regime]}</p></div>
          <div><p className="text-slate-500">수집률</p><p className="mt-1 font-mono text-slate-200">{coverage === null ? '—' : `${numeric(coverage, 1)}%`}</p></div>
          <div><p className="text-slate-500">선정 상태</p><p className="mt-1 text-slate-200">{STATUS_LABEL[snapshot.status]}</p></div>
        </div>
        <p className="text-[10px] leading-5 text-slate-500">기준 {timestamp(snapshot.asOf)} KST · {snapshot.phase === 'FINAL' ? '마감 전 최종' : '장중 관찰'} · 수집 {snapshot.coverage.collected}/{snapshot.coverage.total}, 실패 {snapshot.coverage.failed}</p>
        {snapshot.warnings.length > 0 && <details className="rounded-lg border border-amber-400/15 bg-amber-400/5 px-3 py-2"><summary className="cursor-pointer text-[11px] text-amber-200">데이터 확인 사항 {snapshot.warnings.length}건</summary><ul className="mt-2 space-y-1 text-[11px] leading-5 text-amber-200/75">{snapshot.warnings.map((warning, index) => <li key={index}>· {closingExplanation(warning)}</li>)}</ul></details>}
      </> : <p className="rounded-xl bg-slate-950/60 p-3 text-xs leading-6 text-slate-500">이 날짜의 {replay ? '과거 재현' : '실전'} 결과가 없습니다.</p>}
    </header>
    {picks.map((candidate, index) => <CandidateCard key={candidate.ticker} candidate={candidate} index={index} replay={replay} watch={snapshot?.phase === 'WATCH'} />)}
    {Array.from({ length: 5 - picks.length }, (_, index) => <div key={`empty-${index}`} className="flex items-center gap-3 rounded-xl border border-dashed border-slate-800 px-4 py-3 text-xs text-slate-500"><span className="w-8 text-center font-mono">{picks.length + index + 1}</span><span>미선정 <span className="ml-1 text-[10px] text-slate-600">{snapshot ? '조건을 충족한 추가 종목 없음' : '결과 대기'}</span></span></div>)}
  </section>;
}

export default function ClosingBetDashboard() {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date') || '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : '';
  const modeParam = searchParams.get('mode')?.toUpperCase();
  const requestedMode: RequestedMode = modeParam === 'LIVE' || modeParam === 'REPLAY' ? modeParam : 'AUTO';
  const [revision, setRevision] = useState(0);
  const requestKey = `${date}:${requestedMode}:${revision}`;
  const [result, setResult] = useState<(LoadedClosingData & { requestKey: string }) | null>(null);
  const [failure, setFailure] = useState<{ requestKey: string; message: string } | null>(null);
  const loaded = result?.requestKey === requestKey ? result : null;
  const error = failure?.requestKey === requestKey ? failure.message : null;
  const loading = !loaded && !error;

  useEffect(() => {
    const controller = new AbortController();
    fetchClosingDashboard({ date, mode: requestedMode, signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) { setResult({ ...result, requestKey }); setFailure(null); }
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) { setFailure({ requestKey, message: failure instanceof Error ? failure.message : '결과를 불러오지 못했습니다.' }); }
    });
    return () => controller.abort();
  }, [date, requestedMode, requestKey]);

  const updateQuery = (change: { date?: string; mode?: ClosingMode }) => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(change)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (params.toString() === new URLSearchParams(window.location.search).toString()) setRevision((previous) => previous + 1);
    // Filters are client data queries; a server page navigation can stall before the API request starts.
    else window.history.replaceState(null, '', `/strategies/kr-closing-bet${params.size ? `?${params}` : ''}`);
  };
  const mode = loaded?.mode || (requestedMode === 'AUTO' ? 'LIVE' : requestedMode);
  const selected = selectClosingSnapshots(loaded?.data.snapshots || [], mode, date);
  const snapshots = [...selected.latest.values()];
  const dates = [...new Set([...(result?.data.dates || []), ...(date ? [date] : [])])].sort().reverse();

  return <div className="min-w-0 space-y-5 pb-12">
    <header className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="mb-2 flex items-center gap-2 text-[10px] font-semibold tracking-widest text-teal-300"><Zap className="h-3.5 w-3.5" aria-hidden />국내 투자 전략 · KRX</p><h1 className="text-xl font-bold text-slate-100 sm:text-2xl">종가베팅 추천</h1><p className="mt-2 max-w-2xl text-xs leading-6 text-slate-400">장 후반 수급과 거래대금, 가격 흐름을 확인하고 코스피·코스닥에서 각각 최대 5종목을 선정합니다. 추천 조건과 익일 결과를 함께 확인하세요.</p></div>
        <div className="rounded-xl border border-teal-400/15 bg-teal-400/5 px-3 py-2 text-[11px] leading-6 text-teal-200"><p>코스피 시총 상위 200</p><p>코스닥 시총 상위 150</p></div>
      </div>
    </header>

    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label="결과 유형" className="flex rounded-xl border border-slate-800 bg-slate-950/60 p-1">{(['LIVE', 'REPLAY'] as const).map((value) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => updateQuery({ mode: value })} className={`rounded-lg px-4 py-2 text-xs font-medium transition-colors ${mode === value ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>{value === 'LIVE' ? '실전 스냅샷' : '과거 재현 · 검토'}</button>)}</div>
      <div className="flex flex-wrap items-center gap-2"><label htmlFor="closing-date" className="flex items-center gap-1.5 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" aria-hidden />기준일</label><select id="closing-date" value={date} onChange={(event) => updateQuery({ date: event.target.value })} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200"><option value="">최신 결과</option>{dates.map((day) => <option key={day} value={day}>{day}</option>)}</select><button type="button" onClick={() => { setRevision((previous) => previous + 1); }} disabled={loading} aria-label="결과 새로고침" className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:text-slate-100 disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden /></button></div>
    </div>

    {loading ? <div role="status" className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-8 text-sm text-slate-400"><RefreshCw className="h-4 w-4 animate-spin text-teal-300" aria-hidden />저장된 종가베팅 결과를 불러오고 있습니다.</div> : error ? <div role="alert" className="rounded-2xl border border-rose-400/25 bg-rose-400/5 p-5"><p className="text-sm font-medium text-rose-200">결과를 불러오지 못했습니다.</p><p className="mt-2 text-xs leading-6 text-rose-200/70">{error}</p><button type="button" onClick={() => { setRevision((previous) => previous + 1); }} className="mt-3 rounded-lg border border-rose-300/25 px-3 py-2 text-xs text-rose-200">다시 불러오기</button></div> : <>
      {mode === 'REPLAY' && <div className="flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-xs leading-6 text-amber-200"><ShieldAlert className="mt-1 h-4 w-4 shrink-0" aria-hidden /><div><p className="font-semibold">과거 재현 · 검토 전용</p><p className="text-amber-200/75">{loaded?.fallback ? '실전 스냅샷이 없어 저장된 과거 재현 결과를 표시합니다. ' : ''}아래 목록은 당시 자료로 재현한 검토 후보이며, 현재 유효한 매수 추천이 아닙니다.</p></div></div>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500"><span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" aria-hidden />{selected.tradeDate || '저장된 결과 없음'} · 모든 시각 KST</span><span>조건 미충족 시 5종목을 채우지 않습니다.</span></div>
      <OpeningPerformancePanel evaluations={loaded?.data.evaluations || []} snapshots={snapshots} />
      <div className="grid items-start gap-4 xl:grid-cols-2">{CLOSING_MARKETS.map((market) => <ClosingMarketPanel key={market} market={market} snapshot={selected.latest.get(market)} mode={mode} />)}</div>
    </>}
  </div>;
}
