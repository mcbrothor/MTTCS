'use client';

import { useEffect, useState } from 'react';
import type { AllocationRecommendation } from '@/types';

function money(value: number | null) {
  return value === null ? '—' : new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

export default function AllocationGuidance() {
  const [data, setData] = useState<AllocationRecommendation | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/portfolio/allocation', { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || '자산배분 제안을 불러오지 못했습니다.');
        setData(body.data);
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(reason instanceof Error ? reason.message : '자산배분 오류');
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-violet-300">Monthly HAA Allocation</p>
          <h2 className="mt-1 text-lg font-bold text-white">월간 자산배분 제안</h2>
          <p className="mt-1 text-xs text-slate-400">TIP 카나리와 1·3·6·12개월 모멘텀 기반 비중 제안이며 주문은 실행하지 않습니다.</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${data?.quality === 'FULL' ? 'border-emerald-500/30 text-emerald-300' : 'border-amber-500/30 text-amber-200'}`}>
          {data?.quality || (error ? 'ERROR' : 'LOADING')}
        </span>
      </div>
      {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : data ? (
        <>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <span className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-slate-200">국면 <b>{data.regime}</b></span>
            <span className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-slate-200">TIP <b>{data.canaryMomentum ?? '—'}%</b></span>
            <span className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-slate-200">다음 검토 <b>{data.nextReviewAt || '—'}</b></span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {data.targets.map((target) => (
              <div key={target.ticker} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <div className="flex justify-between"><b className="font-mono text-white">{target.ticker}</b><span className="text-xs text-violet-200">{target.targetWeightPct}%</span></div>
                <p className="mt-2 text-xs text-slate-400">모멘텀 {target.momentum ?? '—'}%</p>
                <p className="mt-1 text-xs text-slate-400">목표 {money(target.targetAmount)}</p>
                <p className="mt-1 text-xs text-slate-400">증감 {money(target.changeAmount)}</p>
              </div>
            ))}
          </div>
          {data.warnings.length > 0 && <p className="mt-3 text-xs text-amber-200">{data.warnings.join(' · ')}</p>}
        </>
      ) : <p className="mt-4 text-sm text-slate-400">월말 가격과 현재 포트폴리오를 비교하고 있습니다.</p>}
    </section>
  );
}
