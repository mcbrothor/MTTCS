'use client';

import Link from 'next/link';
import { Activity, ArrowUpRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ApiSuccess, RiskBarometerResponse } from '@/types';

const COLORS = {
  LOW: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  CAUTION: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  HIGH: 'text-rose-300 bg-rose-500/10 border-rose-500/30',
  UNAVAILABLE: 'text-slate-400 bg-slate-800/60 border-slate-700',
} as const;

export default function RiskBarometerCompactWidget() {
  const [data, setData] = useState<RiskBarometerResponse | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/risk-barometer?market=US')
      .then(async (response) => {
        const payload = await response.json() as ApiSuccess<RiskBarometerResponse>;
        if (response.ok && payload.data) setData(payload.data);
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  return (
    <Link
      href="/market-barometer"
      aria-label="미국 AI/FOMO 과열 바로미터 상세로 이동"
      className="block rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-4 transition-colors hover:bg-[var(--surface-strong)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-2 text-amber-300">
            <Activity className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">미국 AI/FOMO 위험</p>
            {!loaded ? (
              <p className="mt-1 text-xs text-slate-500">점수 확인 중</p>
            ) : (
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {data ? `${data.coverage.valid}/10개 확인` : '데이터 확인 필요'} · 높을수록 위험
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded border px-2.5 py-1 font-mono text-lg font-black ${COLORS[data?.band ?? 'UNAVAILABLE']}`}>
            {data?.score === null || data?.score === undefined ? '—/10' : `${data.score}/10`}
          </span>
          <ArrowUpRight className="h-3.5 w-3.5 text-slate-500" />
        </div>
      </div>
    </Link>
  );
}
