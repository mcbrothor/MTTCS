'use client';

import { useState, useEffect } from 'react';
import {
  Bot,
  RefreshCw,
  CheckCircle2,
  X,
  Trash2,
  Globe,
  ChevronDown,
  ChevronUp,
  BarChart2,
} from 'lucide-react';

type Market = 'KR' | 'US';
type DartPhase = 'idle' | 'init' | 'fallback' | 'done' | 'error';

// ── DART 타입 ──────────────────────────────────────────────────────────────
interface DartInitResult {
  success: boolean;
  error?: string;
  message?: string;
  target_count?: number;
  matched_count?: number;
  code_matched_count?: number;
  name_matched_count?: number;
  unmatched_count?: number;
  unmatched_details?: Array<{ ticker: string; name: string; exchange: string }>;
}

interface DartFallbackBatchResult {
  success: boolean;
  error?: string;
  total_count: number;
  offset: number;
  processed: number;
  filled: number;
  failed: number;
  has_more: boolean;
}

interface DartFallbackProgress {
  totalCount: number;
  processedCount: number;
  filled: number;
  failed: number;
  batchIndex: number;
  totalBatches: number;
}

// ── US 타입 ───────────────────────────────────────────────────────────────
interface UsBatchResult {
  success: boolean;
  error?: string;
  total_count: number;
  offset: number;
  processed: number;
  filled: number;
  failed: number;
  has_more: boolean;
}

interface UsSyncProgress {
  totalCount: number;
  processedCount: number;
  filled: number;
  failed: number;
  batchIndex: number;
  totalBatches: number;
}

interface UsCacheStatus {
  count: number;
  lastUpdated: string | null;
}

// ── 공통 타입 ─────────────────────────────────────────────────────────────
interface CacheResult {
  success: boolean;
  message?: string;
  error?: string;
  deleted?: number;
}

function formatDate(iso: string | null) {
  if (!iso) return '없음';
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── 공통 프로그레스 바 컴포넌트 ────────────────────────────────────────────
function ProgressBar({
  batchIndex,
  totalBatches,
  processedCount,
  totalCount,
  filled,
  failed,
  color = 'violet',
}: {
  batchIndex: number;
  totalBatches: number;
  processedCount: number;
  totalCount: number;
  filled: number;
  failed: number;
  color?: 'blue' | 'violet';
}) {
  const pct = totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;
  const barColor = color === 'blue' ? 'bg-blue-500' : 'bg-violet-500';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>배치 {batchIndex} / {totalBatches}</span>
        <span>{processedCount} / {totalCount}개</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-700">
        <div
          className={`h-1.5 rounded-full ${barColor} transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-slate-500">
        성공 {filled}개 · 실패 {failed}개
      </p>
    </div>
  );
}

export default function AdminPage() {
  const [activeMarket, setActiveMarket] = useState<Market>('KR');

  // ── DART 상태 ───────────────────────────────────────────────────────────
  const [dartPhase, setDartPhase] = useState<DartPhase>('idle');
  const [dartInitResult, setDartInitResult] = useState<DartInitResult | null>(null);
  const [dartFallbackProgress, setDartFallbackProgress] = useState<DartFallbackProgress | null>(null);
  const [dartFallbackDone, setDartFallbackDone] = useState<{ filled: number; failed: number; total: number } | null>(null);
  const [dartError, setDartError] = useState<string | null>(null);
  const [showUnmatched, setShowUnmatched] = useState(false);

  // ── US 상태 ─────────────────────────────────────────────────────────────
  const [usSyncing, setUsSyncing] = useState(false);
  const [usSyncProgress, setUsSyncProgress] = useState<UsSyncProgress | null>(null);
  const [usSyncDone, setUsSyncDone] = useState<{ filled: number; failed: number; total: number } | null>(null);
  const [usSyncError, setUsSyncError] = useState<string | null>(null);
  const [usCacheStatus, setUsCacheStatus] = useState<UsCacheStatus | null>(null);
  const [usCacheLoading, setUsCacheLoading] = useState(false);

  // ── 캐시 초기화 상태 ────────────────────────────────────────────────────
  const [cacheClearing, setCacheClearing] = useState(false);
  const [cacheResult, setCacheResult] = useState<CacheResult | null>(null);

  useEffect(() => {
    fetchUsCacheStatus();
  }, []);

  async function fetchUsCacheStatus() {
    setUsCacheLoading(true);
    try {
      const res = await fetch('/api/admin/us/cache-status');
      if (res.ok) {
        const data = await res.json() as UsCacheStatus;
        setUsCacheStatus(data);
      }
    } catch {
      // ignore
    } finally {
      setUsCacheLoading(false);
    }
  }

  // ── DART 2단계 동기화 ───────────────────────────────────────────────────
  async function handleDartSync() {
    setDartPhase('init');
    setDartInitResult(null);
    setDartFallbackProgress(null);
    setDartFallbackDone(null);
    setDartError(null);
    setShowUnmatched(false);

    // Phase 1: DART XML 다운로드 + 매칭 + DB 저장
    let initData: DartInitResult;
    try {
      const res = await fetch('/api/admin/dart/sync');
      initData = await res.json() as DartInitResult;
    } catch {
      setDartError('네트워크 오류가 발생했습니다.');
      setDartPhase('error');
      return;
    }

    if (!initData.success) {
      setDartError(initData.error ?? '알 수 없는 오류');
      setDartPhase('error');
      return;
    }

    setDartInitResult(initData);
    const unmatchedCount = initData.unmatched_count ?? 0;

    if (unmatchedCount === 0) {
      setDartPhase('done');
      return;
    }

    // Phase 2: 미매칭 종목 Yahoo/Naver 폴백 (배치)
    setDartPhase('fallback');
    const BATCH_LIMIT = 10;
    let offset = 0;
    let totalFilled = 0;
    let totalFailed = 0;
    let batchIndex = 0;
    let errorMsg: string | null = null;

    try {
      while (true) {
        const res = await fetch(`/api/admin/dart/fallback?offset=${offset}&limit=${BATCH_LIMIT}`);
        const data = await res.json() as DartFallbackBatchResult;

        if (!data.success) {
          errorMsg = data.error ?? '미매칭 보강 중 오류 발생';
          setDartError(errorMsg);
          setDartPhase('error');
          break;
        }

        totalFilled += data.filled;
        totalFailed += data.failed;
        batchIndex++;
        offset += BATCH_LIMIT;

        const totalBatches = Math.ceil(data.total_count / BATCH_LIMIT);
        setDartFallbackProgress({
          totalCount: data.total_count,
          processedCount: Math.min(offset, data.total_count),
          filled: totalFilled,
          failed: totalFailed,
          batchIndex,
          totalBatches,
        });

        if (!data.has_more) break;
      }

      if (!errorMsg) {
        setDartFallbackDone({ filled: totalFilled, failed: totalFailed, total: unmatchedCount });
        setDartPhase('done');
      }
    } catch {
      setDartError('네트워크 오류가 발생했습니다.');
      setDartPhase('error');
    }
  }

  // ── US 동기화 ───────────────────────────────────────────────────────────
  async function handleUsSync() {
    const BATCH_LIMIT = 30;
    setUsSyncing(true);
    setUsSyncProgress(null);
    setUsSyncDone(null);
    setUsSyncError(null);

    let offset = 0;
    let totalCount = 0;
    let totalFilled = 0;
    let totalFailed = 0;
    let batchIndex = 0;
    let errorMsg: string | null = null;

    try {
      while (true) {
        const res = await fetch(`/api/admin/us/sync?offset=${offset}&limit=${BATCH_LIMIT}`);
        const data = await res.json() as UsBatchResult;

        if (!data.success) {
          errorMsg = data.error ?? '알 수 없는 오류가 발생했습니다.';
          setUsSyncError(errorMsg);
          break;
        }

        totalCount = data.total_count;
        totalFilled += data.filled;
        totalFailed += data.failed;
        batchIndex++;
        offset += BATCH_LIMIT;

        const totalBatches = Math.ceil(totalCount / BATCH_LIMIT);
        setUsSyncProgress({
          totalCount,
          processedCount: Math.min(offset, totalCount),
          filled: totalFilled,
          failed: totalFailed,
          batchIndex,
          totalBatches,
        });

        if (!data.has_more) break;
      }

      if (!errorMsg) {
        setUsSyncDone({ filled: totalFilled, failed: totalFailed, total: totalCount });
        await fetchUsCacheStatus();
      }
    } catch {
      setUsSyncError('네트워크 오류가 발생했습니다.');
    } finally {
      setUsSyncing(false);
      setUsSyncProgress(null);
    }
  }

  // ── 캐시 초기화 ─────────────────────────────────────────────────────────
  async function handleCacheClear() {
    setCacheClearing(true);
    setCacheResult(null);
    try {
      const res = await fetch('/api/admin/cache/clear', { method: 'POST' });
      const data = await res.json() as CacheResult;
      setCacheResult(data);
    } catch {
      setCacheResult({ success: false, error: '네트워크 오류가 발생했습니다.' });
    } finally {
      setCacheClearing(false);
    }
  }

  const dartSyncing = dartPhase === 'init' || dartPhase === 'fallback';

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-10">
      {/* 헤더 */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <Bot className="h-6 w-6 text-violet-400" />
          데이터 관리
        </h1>
        <p className="mt-1 text-sm text-slate-400">한국·미국 시장 데이터 동기화 및 캐시 관리</p>
      </div>

      {/* 시장 탭 선택 */}
      <div className="flex gap-3">
        <button
          onClick={() => setActiveMarket('KR')}
          className={`flex flex-1 items-center justify-center gap-2.5 rounded-xl border py-4 text-sm font-bold transition-all ${
            activeMarket === 'KR'
              ? 'border-blue-500 bg-blue-500/15 text-blue-300 shadow-[0_0_16px_-4px] shadow-blue-500/30'
              : 'border-slate-700 bg-slate-900/40 text-slate-400 hover:border-slate-600 hover:text-slate-200'
          }`}
        >
          <BarChart2 className="h-4 w-4" />
          <span>한국 시장</span>
          <span
            className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
              activeMarket === 'KR' ? 'bg-blue-500/30 text-blue-200' : 'bg-slate-700 text-slate-400'
            }`}
          >
            DART
          </span>
        </button>

        <button
          onClick={() => setActiveMarket('US')}
          className={`flex flex-1 items-center justify-center gap-2.5 rounded-xl border py-4 text-sm font-bold transition-all ${
            activeMarket === 'US'
              ? 'border-violet-500 bg-violet-500/15 text-violet-300 shadow-[0_0_16px_-4px] shadow-violet-500/30'
              : 'border-slate-700 bg-slate-900/40 text-slate-400 hover:border-slate-600 hover:text-slate-200'
          }`}
        >
          <Globe className="h-4 w-4" />
          <span>미국 시장</span>
          <span
            className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
              activeMarket === 'US' ? 'bg-violet-500/30 text-violet-200' : 'bg-slate-700 text-slate-400'
            }`}
          >
            EDGAR
          </span>
        </button>
      </div>

      {/* ── 한국 시장 패널 ─────────────────────────────────────────────── */}
      {activeMarket === 'KR' && (
        <section className="rounded-xl border border-blue-500/20 bg-slate-900/60 p-6 space-y-5">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-blue-400" />
              DART 종목코드 동기화
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              KOSPI200 + KOSDAQ150 전체 종목(약 350개)의 DART 고유번호를 DB에 저장합니다.
              미매칭 종목은 Yahoo Finance → Naver Finance 순으로 펀더멘탈을 보강합니다.
            </p>
          </div>

          <button
            onClick={handleDartSync}
            disabled={dartSyncing}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${dartSyncing ? 'animate-spin' : ''}`} />
            {dartSyncing ? '동기화 중...' : '한국 시장 동기화 (DART)'}
          </button>

          {/* Phase 1: DART 매칭 중 */}
          {dartPhase === 'init' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-blue-300">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span className="font-medium">1단계 · DART 데이터 수신 및 종목 매칭 중...</span>
              </div>
              <p className="text-xs text-slate-500">전체 종목코드 XML 다운로드 · 매칭 · DB 저장 (약 5~10초)</p>
            </div>
          )}

          {/* Phase 1 완료 표시 (fallback 진행 중이거나 done일 때) */}
          {dartInitResult && (dartPhase === 'fallback' || dartPhase === 'done') && (
            <div className="rounded-lg bg-slate-800/60 px-4 py-3 text-sm space-y-1">
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">1단계 완료 · DART 매칭</p>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-slate-300 text-xs">
                <span>
                  대상 <span className="font-semibold text-white">{dartInitResult.target_count}개</span>
                </span>
                <span>
                  매칭 <span className="font-semibold text-emerald-400">{dartInitResult.matched_count}개</span>
                </span>
                {(dartInitResult.unmatched_count ?? 0) > 0 && (
                  <span>
                    미매칭 <span className="font-semibold text-amber-400">{dartInitResult.unmatched_count}개</span>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Phase 2: 폴백 배치 진행 */}
          {dartPhase === 'fallback' && dartFallbackProgress && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-blue-300">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span className="font-medium">2단계 · 미매칭 종목 펀더멘탈 보강 중...</span>
              </div>
              <ProgressBar
                batchIndex={dartFallbackProgress.batchIndex}
                totalBatches={dartFallbackProgress.totalBatches}
                processedCount={dartFallbackProgress.processedCount}
                totalCount={dartFallbackProgress.totalCount}
                filled={dartFallbackProgress.filled}
                failed={dartFallbackProgress.failed}
                color="blue"
              />
            </div>
          )}

          {/* 최종 완료 결과 */}
          {dartPhase === 'done' && dartInitResult && (
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-4 text-sm text-emerald-300 space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4" /> 동기화 완료
              </div>
              <ul className="space-y-1 text-slate-300">
                <li>
                  대상 종목:{' '}
                  <span className="font-semibold text-white">{dartInitResult.target_count ?? '—'}개</span>
                </li>
                <li>
                  DART 매칭:{' '}
                  <span className="font-bold text-emerald-400">{dartInitResult.matched_count ?? '—'}개</span>
                  {(dartInitResult.code_matched_count !== undefined ||
                    dartInitResult.name_matched_count !== undefined) && (
                    <span className="ml-2 text-xs text-slate-500">
                      (코드 {dartInitResult.code_matched_count ?? 0}개 + 이름 {dartInitResult.name_matched_count ?? 0}개)
                    </span>
                  )}
                </li>
                {(dartInitResult.unmatched_count ?? 0) > 0 && dartFallbackDone && (
                  <>
                    <li>
                      미매칭 보강:{' '}
                      <span className="font-bold text-sky-400">{dartFallbackDone.filled}개 성공</span>
                      {dartFallbackDone.failed > 0 && (
                        <span className="ml-2 text-slate-500">{dartFallbackDone.failed}개 실패</span>
                      )}
                    </li>
                  </>
                )}
                {(dartInitResult.unmatched_count ?? 0) === 0 && (
                  <li className="text-emerald-400 font-semibold">전체 종목 100% DART 매칭 완료</li>
                )}
              </ul>

              {/* 미매칭 상세 토글 */}
              {(dartInitResult.unmatched_details?.length ?? 0) > 0 && (
                <div className="pt-1">
                  <button
                    onClick={() => setShowUnmatched((v) => !v)}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    {showUnmatched ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    미매칭 종목 상세 보기
                  </button>
                  {showUnmatched && (
                    <div className="mt-2 max-h-40 overflow-y-auto rounded border border-slate-700 bg-slate-800/60 p-2">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-500 border-b border-slate-700">
                            <th className="text-left pb-1 pr-3">코드</th>
                            <th className="text-left pb-1 pr-3">종목명</th>
                            <th className="text-left pb-1">거래소</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dartInitResult.unmatched_details!.map((d) => (
                            <tr key={d.ticker} className="border-b border-slate-700/50 last:border-0">
                              <td className="py-0.5 pr-3 font-mono text-slate-400">{d.ticker}</td>
                              <td className="py-0.5 pr-3 text-slate-300">{d.name}</td>
                              <td className="py-0.5 text-slate-500">{d.exchange}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 오류 */}
          {dartPhase === 'error' && dartError && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-300">
              <div className="flex items-center gap-2 font-semibold">
                <X className="h-4 w-4" /> 동기화 실패
              </div>
              <p className="mt-1">{dartError}</p>
            </div>
          )}
        </section>
      )}

      {/* ── 미국 시장 패널 ─────────────────────────────────────────────── */}
      {activeMarket === 'US' && (
        <section className="rounded-xl border border-violet-500/20 bg-slate-900/60 p-6 space-y-5">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-violet-400" />
              S&amp;P 500 + NASDAQ 100 펀더멘탈 동기화
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              S&amp;P 500 + NASDAQ 100 종목(중복 제외 약 560개)의 Yahoo Finance + SEC EDGAR
              펀더멘탈 데이터를 캐시에 적재합니다. 스캐너 실행 시 별도 API 호출 없이 즉시 로드됩니다.
            </p>
          </div>

          {/* 캐시 상태 */}
          <div className="rounded-lg bg-slate-800/60 px-4 py-3 text-sm flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-slate-400 text-xs">캐시된 종목 수</p>
              <p className="font-bold text-white">
                {usCacheLoading ? '—' : `${usCacheStatus?.count ?? 0}개`}
              </p>
            </div>
            <div className="space-y-0.5 text-right">
              <p className="text-slate-400 text-xs">마지막 업데이트</p>
              <p className="text-slate-300 text-xs">
                {usCacheLoading ? '—' : formatDate(usCacheStatus?.lastUpdated ?? null)}
              </p>
            </div>
          </div>

          <button
            onClick={handleUsSync}
            disabled={usSyncing}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${usSyncing ? 'animate-spin' : ''}`} />
            {usSyncing ? '동기화 중...' : '미국 시장 동기화 (EDGAR)'}
          </button>

          {/* 진행 상황 */}
          {usSyncing && usSyncProgress && (
            <ProgressBar
              batchIndex={usSyncProgress.batchIndex}
              totalBatches={usSyncProgress.totalBatches}
              processedCount={usSyncProgress.processedCount}
              totalCount={usSyncProgress.totalCount}
              filled={usSyncProgress.filled}
              failed={usSyncProgress.failed}
              color="violet"
            />
          )}

          {/* 완료 결과 */}
          {usSyncDone && (
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-4 text-sm text-emerald-300">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4" /> 동기화 완료
              </div>
              <ul className="mt-2 space-y-1 text-slate-300">
                <li>
                  전체: <span className="font-semibold text-white">{usSyncDone.total}개</span>
                </li>
                <li>
                  캐시 성공:{' '}
                  <span className="font-bold text-emerald-400">{usSyncDone.filled}개</span>
                </li>
                {usSyncDone.failed > 0 && (
                  <li>
                    실패: <span className="text-slate-500">{usSyncDone.failed}개</span>
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* 오류 */}
          {usSyncError && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-300">
              <div className="flex items-center gap-2 font-semibold">
                <X className="h-4 w-4" /> 실패
              </div>
              <p className="mt-1">{usSyncError}</p>
            </div>
          )}
        </section>
      )}

      {/* ── 펀더멘털 캐시 초기화 ─────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-amber-400" />
            펀더멘털 캐시 초기화
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            한국·미국 전체 펀더멘탈 데이터(EPS/매출/ROE) 캐시를 삭제합니다.
            동기화 후 최신 데이터를 즉시 반영하려면 실행하세요.
          </p>
        </div>

        <button
          onClick={handleCacheClear}
          disabled={cacheClearing}
          className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className={`h-4 w-4 ${cacheClearing ? 'opacity-50' : ''}`} />
          {cacheClearing ? '초기화 중...' : '캐시 초기화'}
        </button>

        {cacheResult && (
          <div
            className={`rounded-lg p-4 text-sm ${
              cacheResult.success
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border border-red-500/30 text-red-300'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {cacheResult.success ? (
                <><CheckCircle2 className="h-4 w-4" /> 초기화 완료</>
              ) : (
                <><X className="h-4 w-4" /> 실패</>
              )}
            </div>
            <p className="mt-1">{cacheResult.message ?? cacheResult.error}</p>
          </div>
        )}
      </section>
    </div>
  );
}
