'use client';
import { useEffect, useState } from 'react';
import StrategyShell from '@/components/strategy/StrategyShell';

interface ApiResponse { version?: string; breadth?: number; regime?: { regime: string; weight: number } }

const REGIME_LABELS: Record<string, string> = {
  TREND: '추세장 — 주식 100%',
  NON_TREND_STRONG: '비추세(강) — RS 강도 따라 100%',
  NON_TREND: '비추세 — 최대 50%',
  NON_TREND_WEAK: '비추세(약) — 25% 이하',
  RECOVERY: '회복구간 — 과거 리더 눌림목 50%',
  CRASH_100: '깊은 약세 — 역추세 3단계 100%',
  CRASH_75: '깊은 약세 — 역추세 75%',
  CRASH_50: '깊은 약세 — 역추세 50%',
  CASH: '현금 — 조건 대기',
};

export default function KospiMonthlyPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/strategies/kospi-monthly').then(async r => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || 'fetch failed');
      setData(j.data);
    }).catch(e => setErr(e.message));
  }, []);

  const regime = data?.regime;

  return (
    <StrategyShell
      title="KOSPI 월말 리밸런싱 V2.3"
      source="코스피 월말리밸런싱_V2.3_전략과_깨달음.xlsx"
      modelVersion="kospi-monthly-v2.3-2026.08-v1"
      asOf={null}
      description="업종지수 120일선 Breadth로 국면을 분류하고 국면별로 전략을 바꿉니다 — 강세 추세추종, 비추세 가변 비중, 극단적 하락에서 KOSPI 역추세 단계 매수."
      loading={!data && !err}
      error={err}
      signals={[]}
      extraSection={regime ? (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
          <p className="text-xs font-bold text-[var(--text-primary)]">현재 판정</p>
          <p className="mt-2 text-sm font-semibold text-amber-300">{REGIME_LABELS[regime.regime] || regime.regime}</p>
          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">Breadth {data?.breadth?.toFixed(1) ?? '—'}% · 권장 투자비중 {regime.weight}%</p>
        </section>
      ) : (
        <section className="rounded-2xl border border-amber-400/25 bg-amber-500/5 p-4">
          <p className="text-xs font-bold text-amber-300">엔진 데이터 연동 예정</p>
          <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">
            KIS 업종지수 120MA Breadth 파이프라인 연결 후 국면 판정이 표시됩니다. 전략 규칙은 원문 그대로 engine에 구현되어 있습니다.
          </p>
        </section>
      )}
      footerNote="엔진 lib/strategy/kospi-monthly/engine.ts · Top3 신규/Top5 유지 완충 · 거래비용 편도 0.10% 반영 기준"
    />
  );
}
