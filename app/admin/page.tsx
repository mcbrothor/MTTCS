'use client';

import { useState } from 'react';
import { Bot, RefreshCw, CheckCircle2, X, Trash2 } from 'lucide-react';

interface SyncResult {
  success: boolean;
  message?: string;
  error?: string;
  target_count?: number;
  matched_count?: number;
  unmatched_count?: number;
  yahoo_filled?: number;
  yahoo_failed?: number;
}

interface CacheResult {
  success: boolean;
  message?: string;
  error?: string;
  deleted?: number;
}

export default function AdminPage() {
  const [dartSyncing, setDartSyncing] = useState(false);
  const [dartResult, setDartResult] = useState<SyncResult | null>(null);

  const [cacheClearing, setCacheClearing] = useState(false);
  const [cacheResult, setCacheResult] = useState<CacheResult | null>(null);

  async function handleDartSync() {
    setDartSyncing(true);
    setDartResult(null);
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

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-10">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <Bot className="h-6 w-6 text-violet-400" />
          데이터 관리
        </h1>
        <p className="mt-1 text-sm text-slate-400">한국 시장 데이터 동기화 및 캐시 관리</p>
      </div>

      {/* DART 종목코드 동기화 */}
      <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-blue-400" />
            DART 종목코드 동기화
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            KOSPI200 + KOSDAQ150 전체 종목(약 350개)의 DART 고유번호를 DB에 저장합니다.
            한국 종목의 펀더멘털 데이터(EPS/매출/ROE) 조회에 필요합니다.
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
          <div className={`rounded-lg p-4 text-sm ${dartResult.success ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border border-red-500/30 text-red-300'}`}>
            <div className="flex items-center gap-2 font-semibold">
              {dartResult.success
                ? <><CheckCircle2 className="h-4 w-4" /> 동기화 완료</>
                : <><X className="h-4 w-4" /> 동기화 실패</>}
            </div>
            {dartResult.success && (
              <ul className="mt-2 space-y-1 text-slate-300">
                <li>대상 종목: <span className="font-semibold text-white">{dartResult.target_count ?? '—'}개</span></li>
                <li>DART 매칭: <span className="font-bold text-emerald-400">{dartResult.matched_count ?? '—'}개</span></li>
                {(dartResult.unmatched_count ?? 0) > 0 && (
                  <>
                    <li>미매칭: <span className="font-semibold text-amber-400">{dartResult.unmatched_count}개</span></li>
                    <li>
                      Yahoo 보강:{' '}
                      <span className="font-bold text-sky-400">{dartResult.yahoo_filled ?? 0}개 성공</span>
                      {(dartResult.yahoo_failed ?? 0) > 0 && (
                        <span className="ml-2 text-slate-500">{dartResult.yahoo_failed}개 실패</span>
                      )}
                    </li>
                  </>
                )}
                <li className="pt-1 text-slate-400">{dartResult.message}</li>
              </ul>
            )}
            {dartResult.error && <p className="mt-1">{dartResult.error}</p>}
          </div>
        )}
      </section>

      {/* 펀더멘털 캐시 초기화 */}
      <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-amber-400" />
            펀더멘털 캐시 초기화
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            저장된 펀더멘털 데이터(EPS/매출/ROE) 캐시를 삭제합니다.
            DART 동기화 후 최신 데이터를 즉시 반영하려면 실행하세요.
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
          <div className={`rounded-lg p-4 text-sm ${cacheResult.success ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border border-red-500/30 text-red-300'}`}>
            <div className="flex items-center gap-2 font-semibold">
              {cacheResult.success
                ? <><CheckCircle2 className="h-4 w-4" /> 초기화 완료</>
                : <><X className="h-4 w-4" /> 실패</>}
            </div>
            <p className="mt-1">{cacheResult.message ?? cacheResult.error}</p>
          </div>
        )}
      </section>
    </div>
  );
}
