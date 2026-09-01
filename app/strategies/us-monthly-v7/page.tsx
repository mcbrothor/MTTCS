'use client';
import { useEffect, useState } from 'react';
import StrategyShell from '@/components/strategy/StrategyShell';

interface ApiResponse { version?: string; asOf?: string; breadth?: number; drawdownPct?: number; nasdaqDominance?: boolean; regime?: { regime: string; weight: number } }

const REGIME_LABELS: Record<string, string> = {
  BROAD_TREND: '초광범위 강세', SELECTIVE_TREND: '선택적 강세', NON_TREND: '비추세',
  RECOVERY: '회복', CRASH_100: '깊은 약세 3단계', CRASH_75: '깊은 약세 2단계',
  CRASH_50: '깊은 약세 1단계', CASH: '현금 대기',
};

export default function UsMonthlyV7Page() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/strategies/us-monthly-v7').then(async r => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || 'fetch failed');
      setData(j.data);
    }).catch(e => setErr(e.message));
  }, []);

  return (
    <StrategyShell
      title="US 월간 리밸런싱 V7"
      source="미국시장_V7_월간리밸런싱_전략과_백테스트_깨달음.xlsx"
      modelVersion="us-monthly-v7-2026.08-v1"
      asOf={data?.asOf ?? null}
      description="업종지수 120일선 Breadth로 5개 국면을 분류하는 Regime Switching 시스템 — 초광범위 강세(지수 100%), 선택적 강세(RS Top3), 비추세(가변), 회복(리더 눌림목), 깊은 약세(S&P500 역추세 3단계) + NASDAQ 독주·금속 Overlay."
      loading={!data && !err}
      error={err}
      signals={[]}
      extraSection={data?.regime ? (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
          <p className="text-xs font-bold text-[var(--text-primary)]">현재 판정</p>
          <p className="mt-2 text-sm font-semibold text-amber-300">{REGIME_LABELS[data.regime.regime] || data.regime.regime}</p>
          <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">
            Breadth {data.breadth?.toFixed(1) ?? '—'}% · S&amp;P500 고점 대비 {data.drawdownPct?.toFixed(1) ?? '—'}% · 권장 투자비중 {data.regime.weight}% · NASDAQ 독주 {data.nasdaqDominance ? '예' : '아니오'}
          </p>
        </section>
      ) : null}
      footerNote="엔진 lib/strategy/us-monthly-v7/engine.ts · 3M/6M RS 국면 전환 · 거래비용 편도 0.10% 반영 기준"
    />
  );
}
