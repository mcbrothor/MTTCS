'use client';

import { useState, useEffect } from 'react';
import { Bot, RefreshCw, CheckCircle2, X, Trash2, Globe, ChevronDown, ChevronUp } from 'lucide-react';

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

interface UsSyncResult {
  success: boolean;
  message?: string;
  error?: string;
  target_count?: number;
  filled?: number;
  failed?: number;
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
  const [dartSyncing, setDartSyncing] = useState(false);
  const [dartResult, setDartResult] = useState<SyncResult | null>(null);
  const [showUnmatched, setShowUnmatched] = useState(false);

  const [cacheClearing, setCacheClearing] = useState(false);
  const [cacheResult, setCacheResult] = useState<CacheResult | null>(null);

  const [usSyncing, setUsSyncing] = useState(false);
  const [usSyncResult, setUsSyncResult] = useState<UsSyncResult | null>(null);
  const [usCacheStatus, setUsCacheStatus] = useState<UsCacheStatus | null>(null);
  const [usCacheLoading, setUsCacheLoading] = useState(false);

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
    setUsSyncing(true);
    setUsSyncResult(null);
    try {
      const res = await fetch('/api/admin/us/sync');
      const data = await res.json() as UsSyncResult;
      setUsSyncResult(data);
      if (data.success) await fetchUsCacheStatus();
    } catch {
      setUsSyncResult({ success: false, error: '네트워크 오류가 발생했습니다.' });
    } finally {
      setUsSyncing(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-10">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <Bot className="h-6 w-6 text-violet-400" />
          데이터 관리
        </h1>
        <p className="mt-1 text-sm text-slate-400">한국·미국 시장 데이터 동기화 및 캐시 관리</p>
      </div>

      {/* ── 한국: DART 종목코드 동기화 ─────────────────────────────────── */}
      <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-blue-400" />
            DART 종목코드 동기화 (한국)
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            KOSPI200 + KOSDAQ150 전체 종목(약 350개)의 DART 고유번호를 DB에 저장합니다.
            미매칭 종목은 Yahoo Finance → Naver Finance 순으로 펀더멘탈을 보강합니다.
          </p>
        </div>

        <button
          onClick={handleDartSync}
          disabled={dartSyncing}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${dartSyncing ? 'animate-spin' : ''}`} />
          {dartSyncing ? '동기화 중...' : 'DART 동기화 실행'}
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
                      (코드 {dartResult.code_matched_count ?? 0}개 + 이름 {dartResult.name_matched_count ?? 0}개)
                    </span>
                  )}
                </li>
                {(dartResult.unmatched_count ?? 0) > 0 && (
                  <>
                    <li>
                      미매칭:{' '}
                      <span className="font-semibold text-amber-400">{dartResult.unmatched_count}개</span>
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

      {/* ── 미국: S&P 500 펀더멘탈 캐시 ─────────────────────────────────── */}
      <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Globe className="h-4 w-4 text-violet-400" />
            S&amp;P 500 펀더멘탈 캐시 (미국)
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
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${usSyncing ? 'animate-spin' : ''}`} />
          {usSyncing ? '캐시 구축 중... (수 분 소요)' : 'S&P 500 캐시 구축'}
        </button>

        {usSyncing && (
          <p className="text-xs text-slate-500">
            500개 종목 × Yahoo + EDGAR 조회 중입니다. 완료까지 2~5분 소요될 수 있습니다.
          </p>
        )}

        {usSyncResult && (
          <div
            className={`rounded-lg p-4 text-sm ${
              usSyncResult.success
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border border-red-500/30 text-red-300'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {usSyncResult.success ? (
                <>
                  <CheckCircle2 className="h-4 w-4" /> 캐시 구축 완료
                </>
              ) : (
                <>
                  <X className="h-4 w-4" /> 실패
                </>
              )}
            </div>
            {usSyncResult.success && (
              <ul className="mt-2 space-y-1 text-slate-300">
                <li>
                  대상:{' '}
                  <span className="font-semibold text-white">{usSyncResult.target_count ?? '—'}개</span>
                </li>
                <li>
                  캐시 성공:{' '}
                  <span className="font-bold text-emerald-400">{usSyncResult.filled ?? 0}개</span>
                </li>
                {(usSyncResult.failed ?? 0) > 0 && (
                  <li>
                    실패:{' '}
                    <span className="text-slate-500">{usSyncResult.failed}개</span>
                  </li>
                )}
                <li className="pt-1 text-slate-400">{usSyncResult.message}</li>
              </ul>
            )}
            {usSyncResult.error && <p className="mt-1">{usSyncResult.error}</p>}
          </div>
        )}
      </section>

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
