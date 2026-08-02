'use client';

import { useCallback, useEffect, useState } from 'react';
import { Database, RefreshCw, Save, ShieldAlert } from 'lucide-react';
import type { GoldMacroObservationRecord } from '@/lib/gold/repository';

interface ApiPayload<T> {
  data?: T;
  message?: string;
}

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

function formatApprovedAt(value: string | null | undefined) {
  if (!value) return '없음';
  return new Date(value).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSigned(value: number | null, suffix: string) {
  if (value === null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}${suffix}`;
}

export default function GoldMacroInputPanel() {
  const [latest, setLatest] = useState<GoldMacroObservationRecord | null>(null);
  const [period, setPeriod] = useState(currentPeriod);
  const [etfFlowUsdBillion, setEtfFlowUsdBillion] = useState('');
  const [holdingsChangeTonnes, setHoldingsChangeTonnes] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [centralBankDemandWeakening, setCentralBankDemandWeakening] = useState(false);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/gold/macro-inputs', {
        cache: 'no-store',
      });
      const payload = await response.json() as ApiPayload<GoldMacroObservationRecord | null>;
      if (!response.ok) {
        throw new Error(payload.message || '금 매크로 입력 조회에 실패했습니다.');
      }
      const observation = payload.data ?? null;
      setLatest(observation);
      if (observation) {
        setPeriod(observation.observationMonth.slice(0, 7));
        setEtfFlowUsdBillion(String(observation.etfNetFlowUsd / 1_000_000_000));
        setHoldingsChangeTonnes(
          observation.holdingsChangeTonnes === null
            ? ''
            : String(observation.holdingsChangeTonnes),
        );
        setSourceUrl(observation.sourceUrl);
        setCentralBankDemandWeakening(
          observation.centralBankDemandStatus === 'WEAKENING',
        );
        setNote(observation.sourceExcerpt ?? '');
      }
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : '금 매크로 입력 조회에 실패했습니다.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const response = await fetch('/api/admin/gold/macro-inputs', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          period,
          etfFlowUsdBillion: Number(etfFlowUsdBillion),
          holdingsChangeTonnes: Number(holdingsChangeTonnes),
          sourceUrl,
          centralBankDemandWeakening,
          note,
        }),
      });
      const payload = await response.json() as ApiPayload<GoldMacroObservationRecord>;
      if (!response.ok || !payload.data) {
        throw new Error(payload.message || '금 매크로 입력 저장에 실패했습니다.');
      }
      setLatest(payload.data);
      setSavedMessage(`${payload.data.observationMonth.slice(0, 7)} 집계치를 승인 저장했습니다.`);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : '금 매크로 입력 저장에 실패했습니다.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-5 rounded-xl border border-amber-500/25 bg-slate-900/60 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-white">
            <Database className="h-4 w-4 text-amber-300" />
            금 ETF 월간 매크로 입력
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            World Gold Council의 최신 월간 집계치를 확인한 뒤 매월 한 번 승인합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadLatest()}
          disabled={loading || saving}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-200">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          재배포 제한
        </p>
        <p className="mt-1 text-xs leading-5 text-amber-100/80">
          WGC 원문·표·전체 데이터는 복사하거나 저장하지 않습니다. 승인한 월간 순유입액,
          보유량 변화와 600자 이하의 짧은 근거만 저장하고 공식 출처 URL을 남기세요.
        </p>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          최근 승인 값
        </p>
        {loading ? (
          <p className="mt-3 text-sm text-slate-400">불러오는 중...</p>
        ) : latest ? (
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs text-slate-500">기준월</p>
              <p className="font-semibold text-white">
                {latest.observationMonth.slice(0, 7)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">승인 시각</p>
              <p className="font-semibold text-white">
                {formatApprovedAt(latest.approvedAt)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">ETF 순유입</p>
              <p className="font-semibold text-white">
                {formatSigned(latest.etfNetFlowUsd / 1_000_000_000, '십억 달러')}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">보유량 변화</p>
              <p className="font-semibold text-white">
                {formatSigned(latest.holdingsChangeTonnes, '톤')}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">ETF 흐름 판정</p>
              <p className="font-semibold text-white">{latest.etfFlowDirection}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">중앙은행 수요</p>
              <p className="font-semibold text-white">
                {latest.centralBankDemandStatus === 'WEAKENING' ? '약화' : '약화 아님'}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-slate-500">공식 출처</p>
              <a
                href={latest.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="break-all text-xs font-medium text-sky-300 hover:text-sky-200"
              >
                {latest.sourceUrl}
              </a>
            </div>
            {latest.sourceExcerpt && (
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-500">승인 근거</p>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-300">
                  {latest.sourceExcerpt}
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-400">아직 승인된 월간 입력이 없습니다.</p>
        )}
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm text-slate-300">
            <span>기준월</span>
            <input
              type="month"
              required
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-amber-400"
            />
          </label>
          <label className="space-y-1.5 text-sm text-slate-300">
            <span>ETF 순유입액 (십억 USD)</span>
            <input
              type="number"
              required
              step="0.01"
              value={etfFlowUsdBillion}
              onChange={(event) => setEtfFlowUsdBillion(event.target.value)}
              placeholder="-8.9"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-amber-400"
            />
          </label>
          <label className="space-y-1.5 text-sm text-slate-300">
            <span>보유량 변화 (톤)</span>
            <input
              type="number"
              required
              step="0.1"
              value={holdingsChangeTonnes}
              onChange={(event) => setHoldingsChangeTonnes(event.target.value)}
              placeholder="-74"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-amber-400"
            />
          </label>
          <label className="flex items-center gap-3 self-end rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={centralBankDemandWeakening}
              onChange={(event) => setCentralBankDemandWeakening(event.target.checked)}
              className="h-4 w-4 accent-amber-400"
            />
            중앙은행 수요 약화 확인
          </label>
        </div>

        <label className="block space-y-1.5 text-sm text-slate-300">
          <span>WGC 공식 출처 URL</span>
          <input
            type="url"
            required
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://www.gold.org/goldhub/research/..."
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-amber-400"
          />
        </label>

        <label className="block space-y-1.5 text-sm text-slate-300">
          <span>짧은 승인 근거 (선택, 최대 600자)</span>
          <textarea
            value={note}
            maxLength={600}
            rows={3}
            onChange={(event) => setNote(event.target.value)}
            placeholder="집계치 확인 방법과 특이사항만 기록"
            className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-amber-400"
          />
          <span className="block text-right text-xs text-slate-500">{note.length}/600</span>
        </label>

        {error && (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
            {error}
          </p>
        )}
        {savedMessage && (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            {savedMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={saving || loading}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? '승인 저장 중...' : '월간 집계치 승인 저장'}
        </button>
      </form>
    </section>
  );
}
