'use client';
import { useEffect, useState } from 'react';
import StrategyShell from '@/components/strategy/StrategyShell';

interface ApiResponse { version?: string; note?: string }

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
      asOf={null}
      description="업종지수 120일선 Breadth로 5개 국면을 분류하는 Regime Switching 시스템 — 초광범위 강세(지수 100%), 선택적 강세(RS Top3), 비추세(가변), 회복(리더 눌림목), 깊은 약세(S&P500 역추세 3단계) + NASDAQ 독주·금속 Overlay."
      loading={!data && !err}
      error={err}
      signals={[]}
      extraSection={(
        <section className="rounded-2xl border border-amber-400/25 bg-amber-500/5 p-4">
          <p className="text-xs font-bold text-amber-300">엔진 데이터 연동 예정</p>
          <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">
            미국 업종지수 120MA Breadth와 NASDAQ 독주 판정 파이프라인 연결 후 국면 판정이 표시됩니다.
            {data?.note ? ` (${data.note})` : ''}
          </p>
        </section>
      )}
      footerNote="엔진 lib/strategy/us-monthly-v7/engine.ts · 3M/6M RS 국면 전환 · 거래비용 편도 0.10% 반영 기준"
    />
  );
}
