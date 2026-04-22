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

interface SyncResult {
  success: boolean;
  message?: string;
  error?: string;
  target_count?: number;
  matched_count?: number;
  code_matched_count?: number;
  name_matched_count?: number;
  unmatched_count?: number;
  yahoo_filled?: number;
  yahoo_failed?: number;
  naver_filled?: number;
  naver_failed?: number;
  unmatched_details?: Array<{ ticker: string; name: string; exchange: string }>;
}

interface CacheResult {
  success: boolean;
  message?: string;
  error?: string;
  deleted?: number;
}

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

export default function AdminPage() {
  const [activeMarket, setActiveMarket] = useState<Market>('KR');

  // KR state
  const [dartSyncing, setDartSyncing] = useState(false);
  const [dartResult, setDartResult] = useState<SyncResult | null>(null);
  const [showUnmatched, setShowUnmatched] = useState(false);

  // US state
  const [usSyncing, setUsSyncing] = useState(false);
  const [usSyncProgress, setUsSyncProgress] = useState<UsSyncProgress | null>(null);
  const [usSyncDone, setUsSyncDone] = useState<{ filled: number; failed: number; total: number } | null>(null);
  const [usSyncError, setUsSyncError] = useState<string | null>(null);
  const [usCacheStatus, setUsCacheStatus] = useState<UsCacheStatus | null>(null);
  const [usCacheLoading, setUsCacheLoading] = useState(false);

  // Cache clear state
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

  async function handleDartSync() {
    setDartSyncing(true);
    setDartResult(null);
    setShowUnmatched(false);
    try {
      const res = await fetch('/api/admin/dart/sync');
      const data = await res.json() as SyncResult;
      setDartResult(data);
    } catch {
      setDartResult({ success: false, error: '네트워크 오류가 발생했습니다.' });
    } finally {
      setDartSyncing(false);
    }
  }

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
          <div className="flex items-start justify-between">
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
          </div>

          <button
            onClick={handleDartSync}
            disabled={dartSyncing}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${dartSyncing ? 'animate-spin' : ''}`} />
            {dartSyncing ? '동기화 중...' : '한국 시장 동기화 (DART)'}
          </button>

          {dartResult && (
            <div
              className={`rounded-lg p-4 text-sm ${
                dartResult.success
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/10 border border-red-500/30 text-red-300'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                {dartResult.success ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> 동기화 완료
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4" /> 동기화 실패
                  </>
                )}
              </div>
              {dartResult.success && (
                <ul className="mt-2 space-y-1 text-slate-300">
                  <li>
                    대상 종목:{' '}
                    <span className="font-semibold text-white">{dartResult.target_count ?? '—'}개</span>
                  </li>
                  <li>
                    DART 매칭:{' '}
                    <span className="font-bold text-emerald-400">{dartResult.matched_count ?? '—'}개</span>
                    {(dartResult.code_matched_count !== undefined ||
                      dartResult.name_matched_count !== undefined) && (
                      <span className="ml-2 text-xs text-slate-500">
                        (코드 {dartResult.code_matched_count ?? 0}개 + 이름{' '}
                        {dartResult.name_matched_count ?? 0}개)
                      </span>
                    )}
                  </li>
                  {(dartResult.unmatched_count ?? 0) > 0 && (
                    <>
                      <li>
                        미매칭:{' '}
                        <span className="font-semibold text-amber-400">
                          {dartResult.unmatched_count}개
                        </span>
                      </li>
                      <li>
                        Yahoo 보강:{' '}
                        <span className="font-bold text-sky-400">
                          {dartResult.yahoo_filled ?? 0}개 성공
                        </span>
                        {(dartResult.yahoo_failed ?? 0) > 0 && (
                          <span className="ml-2 text-slate-500">
                            {dartResult.yahoo_failed}개 실패
                          </span>
                        )}
                      </li>
                      {((dartResult.naver_filled ?? 0) > 0 ||
                        (dartResult.naver_failed ?? 0) > 0) && (
                        <li>
                          Naver 보강:{' '}
                          <span className="font-bold text-green-400">
                            {dartResult.naver_filled ?? 0}개 성공
                          </span>
                          {(dartResult.naver_failed ?? 0) > 0 && (
                            <span className="ml-2 text-slate-500">
                              {dartResult.naver_failed}개 실패
                            </span>
                          )}
                        </li>
                      )}
                      {(dartResult.unmatched_details?.length ?? 0) > 0 && (
                        <li className="pt-1">
                          <button
                            onClick={() => setShowUnmatched((v) => !v)}
                            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                          >
                            {showUnmatched ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
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
                                  {dartResult.unmatched_details!.map((d) => (
                                    <tr
                                      key={d.ticker}
                                      className="border-b border-slate-700/50 last:border-0"
                                    >
                                      <td className="py-0.5 pr-3 font-mono text-slate-400">
                                        {d.ticker}
                                      </td>
                                      <td className="py-0.5 pr-3 text-slate-300">{d.name}</td>
                                      <td className="py-0.5 text-slate-500">{d.exchange}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </li>
                      )}
                    </>
                  )}
                  <li className="pt-1 text-slate-400">{dartResult.message}</li>
                </ul>
              )}
              {dartResult.error && <p className="mt-1">{dartResult.error}</p>}
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
              S&amp;P 500 펀더멘탈 동기화
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              S&amp;P 500 종목의 Yahoo Finance + SEC EDGAR 펀더멘탈 데이터를 캐시에 적재합니다.
              스캐너 실행 시 별도 API 호출 없이 즉시 로드됩니다.
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
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  배치 {usSyncProgress.batchIndex} / {usSyncProgress.totalBatches}
                </span>
                <span>
                  {usSyncProgress.processedCount} / {usSyncProgress.totalCount}개
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-700">
                <div
                  className="h-1.5 rounded-full bg-violet-500 transition-all duration-300"
                  style={{
                    width: `${Math.round(
                      (usSyncProgress.processedCount / usSyncProgress.totalCount) * 100,
                    )}%`,
                  }}
                />
              </div>
              <p className="text-xs text-slate-500">
                성공 {usSyncProgress.filled}개 · 실패 {usSyncProgress.failed}개
              </p>
            </div>
          )}

          {/* 완료 결과 */}
          {usSyncDone && (
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-4 text-sm text-emerald-300">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4" /> 동기화 완료
              </div>
              <ul className="mt-2 space-y-1 text-slate-300">
                <li>
                  전체:{' '}
                  <span className="font-semibold text-white">{usSyncDone.total}개</span>
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
                <>
                  <CheckCircle2 className="h-4 w-4" /> 초기화 완료
                </>
              ) : (
                <>
                  <X className="h-4 w-4" /> 실패
                </>
              )}
            </div>
            <p className="mt-1">{cacheResult.message ?? cacheResult.error}</p>
          </div>
        )}
      </section>
    </div>
  );
}
