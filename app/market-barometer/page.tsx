'use client';

import Link from 'next/link';
import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import RiskGauge from '@/components/risk-barometer/RiskGauge';
import RiskHistoryChart from '@/components/risk-barometer/RiskHistoryChart';
import RiskIndicatorTable from '@/components/risk-barometer/RiskIndicatorTable';
import RiskScoreMethodology from '@/components/risk-barometer/RiskScoreMethodology';
import type {
  ApiSuccess,
  RiskBarometerHistoryPoint,
  RiskBarometerResponse,
} from '@/types';

interface HistoryPayload {
  items: RiskBarometerHistoryPoint[];
  days: number;
}

export default function MarketBarometerPage() {
  const [barometer, setBarometer] = useState<RiskBarometerResponse | null>(null);
  const [history, setHistory] = useState<RiskBarometerHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [currentResponse, historyResponse] = await Promise.all([
        fetch('/api/risk-barometer?market=US', { cache: 'no-store' }),
        fetch('/api/risk-barometer/history?days=30', { cache: 'no-store' }),
      ]);
      const current = await currentResponse.json() as ApiSuccess<RiskBarometerResponse> & { message?: string };
      const trend = await historyResponse.json() as ApiSuccess<HistoryPayload> & { message?: string };
      if (!currentResponse.ok || !current.data) {
        throw new Error(current.message || '바로미터를 불러오지 못했습니다.');
      }
      setBarometer(current.data);
      setHistory(historyResponse.ok ? trend.data?.items ?? [] : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '바로미터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-amber-400">
            STEP 01 · 시장 분석 / 과열 바로미터
          </p>
          <h1 className="text-[20px] font-extrabold leading-[1.2] text-[var(--text-primary)]">
            미국 AI/FOMO 리스크 바로미터
          </h1>
          <p className="mt-2 max-w-[720px] text-xs leading-[1.6] text-[var(--text-secondary)]">
            집중도·레버리지·밸류에이션·자금조달 과열을 10개 독립 신호로 확인합니다.
            0~10점은 높을수록 위험하며 기존 시장 밖 위험 0~100점과 합산하지 않습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </header>

      <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <p className="text-xs leading-5 text-amber-100/85">
          <strong className="text-amber-200">RESEARCH_ONLY · SHADOW</strong> — 이 점수는 과열 관찰용이며
          매매 판단, 비중 결정, 위험 게이트에 연결되지 않습니다. 최초 20거래일 검증 후에만 모델 상태를 재검토합니다.
        </p>
      </div>

      {loading && !barometer && (
        <div className="flex h-52 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-soft)]">
          <div className="text-center">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin text-amber-300" />
            <p className="mt-3 text-xs text-slate-500">10개 근거와 최근 추이를 확인 중입니다.</p>
          </div>
        </div>
      )}

      {error && !barometer && (
        <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-rose-200">
            <AlertTriangle className="h-4 w-4" /> 데이터 확인 필요
          </p>
          <p className="mt-2 text-xs leading-5 text-rose-100/80">
            {error} 점수를 0으로 간주하지 말고 파이프라인과 승인 입력을 확인하세요.
          </p>
        </div>
      )}

      {barometer && (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(300px,0.85fr)_minmax(360px,1.15fr)]">
            <RiskGauge
              score={barometer.score}
              band={barometer.band}
              quality={barometer.quality}
              coverage={barometer.coverage.valid}
            />
            <RiskHistoryChart items={history} />
          </div>

          <RiskScoreMethodology barometer={barometer} />

          {barometer.quality !== 'VALID' && (
            <div role="status" className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-xs leading-5 text-sky-100/85">
              {barometer.quality === 'DEGRADED'
                ? `${barometer.coverage.valid}/10개 지표로 10점 만점 환산했습니다. 미확인 지표는 0점으로 처리하지 않았습니다.`
                : `${barometer.coverage.valid}/10개만 확인되어 총점을 차단했습니다. 결측을 안전 신호로 해석하지 마세요.`}
            </div>
          )}

          <RiskIndicatorTable indicators={barometer.indicators} />

          <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3 text-[10px] text-slate-500">
            <span>
              기준 {new Date(barometer.asOf).toLocaleString('ko-KR')} · {barometer.modelVersion}
            </span>
            <Link href="/master-filter" className="font-semibold text-sky-300 hover:text-sky-200">
              오늘의 결론으로 돌아가기
            </Link>
          </footer>
        </>
      )}
    </div>
  );
}
