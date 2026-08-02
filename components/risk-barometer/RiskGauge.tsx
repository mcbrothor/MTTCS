'use client';

import { scoreToGaugeAngle } from '@/lib/risk-barometer/model';
import type { RiskBarometerBand, RiskBarometerQuality } from '@/types';

function polar(cx: number, cy: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function arcPath(startAngle: number, endAngle: number) {
  const start = polar(160, 150, 112, endAngle);
  const end = polar(160, 150, 112, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A 112 112 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

const BAND_LABEL: Record<RiskBarometerBand, string> = {
  LOW: '낮음',
  CAUTION: '주의',
  HIGH: '위험',
  UNAVAILABLE: '확인 불가',
};

const BAND_COLOR: Record<RiskBarometerBand, string> = {
  LOW: 'text-emerald-300',
  CAUTION: 'text-amber-300',
  HIGH: 'text-rose-300',
  UNAVAILABLE: 'text-slate-400',
};

export default function RiskGauge({
  score,
  band,
  quality,
  coverage,
}: {
  score: number | null;
  band: RiskBarometerBand;
  quality: RiskBarometerQuality;
  coverage: number;
}) {
  const angle = scoreToGaugeAngle(score);
  const valueText = score === null
    ? `점수 확인 불가, ${coverage}/10개 지표 확인`
    : `${score}/10, ${BAND_LABEL[band]}, ${quality}, ${coverage}/10개 지표 확인`;

  return (
    <div
      role="meter"
      aria-label="미국 AI/FOMO 위험 점수"
      aria-valuemin={0}
      aria-valuemax={10}
      aria-valuenow={score ?? undefined}
      aria-valuetext={valueText}
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-5 shadow-[var(--panel-shadow)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">AI/FOMO RISK</p>
          <h2 className="mt-1 text-base font-bold text-[var(--text-primary)]">미국 시장 과열 온도</h2>
        </div>
        <span className="rounded-full border border-slate-700 bg-slate-900/70 px-2.5 py-1 text-[10px] font-bold text-slate-300">
          {quality}
        </span>
      </div>

      <svg viewBox="0 0 320 190" className="mx-auto mt-1 block w-full max-w-[360px]" aria-hidden="true">
        <path d={arcPath(-90, -36)} fill="none" stroke="#22c55e" strokeWidth="38" />
        <path d={arcPath(-36, 36)} fill="none" stroke="#fbbf24" strokeWidth="38" />
        <path d={arcPath(36, 90)} fill="none" stroke="#ef4444" strokeWidth="38" />
        <path
          d="M 160 150 L 160 51"
          stroke={score === null ? '#64748b' : '#e2e8f0'}
          strokeWidth="7"
          strokeLinecap="round"
          transform={`rotate(${angle} 160 150)`}
          className="transition-transform duration-700"
        />
        <circle cx="160" cy="150" r="13" fill="#0f172a" stroke="#cbd5e1" strokeWidth="5" />
        <text x="27" y="178" fill="#94a3b8" fontSize="12">0</text>
        <text x="83" y="59" fill="#94a3b8" fontSize="12">3</text>
        <text x="227" y="59" fill="#94a3b8" fontSize="12">7</text>
        <text x="283" y="178" fill="#94a3b8" fontSize="12">10</text>
      </svg>

      <div className="-mt-7 text-center">
        <p className={`font-mono text-4xl font-black ${BAND_COLOR[band]}`}>
          {score === null ? '—/10' : `${score}/10`}
        </p>
        <p className={`mt-1 text-sm font-bold ${BAND_COLOR[band]}`}>{BAND_LABEL[band]}</p>
        <p className="mt-2 text-xs text-[var(--text-secondary)]">
          {coverage}/10개 확인 · 높을수록 위험
        </p>
      </div>
    </div>
  );
}
