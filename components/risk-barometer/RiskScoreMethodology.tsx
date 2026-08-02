'use client';

import type { RiskBarometerResponse } from '@/types';

const QUALITY_RULES = [
  { coverage: '10개 확인', quality: 'VALID', description: '위험 신호 합계를 그대로 사용' },
  { coverage: '8–9개 확인', quality: 'DEGRADED', description: '유효 지표 비율을 10점으로 환산' },
  { coverage: '0–7개 확인', quality: 'BLOCKED', description: '점수를 산출하지 않음' },
] as const;

const BAND_RULES = [
  { label: '낮음', range: '3점 미만', className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200' },
  { label: '주의', range: '3점 이상 7점 미만', className: 'border-amber-500/25 bg-amber-500/10 text-amber-200' },
  { label: '위험', range: '7점 이상', className: 'border-rose-500/25 bg-rose-500/10 text-rose-200' },
] as const;

export default function RiskScoreMethodology({ barometer }: { barometer: RiskBarometerResponse }) {
  const valid = barometer.coverage.valid;
  const triggered = barometer.rawScore;
  const safe = Math.max(0, valid - triggered);
  const unknown = barometer.coverage.total - valid;
  const formula = barometer.score === null
    ? `${valid}개 확인 < 최소 8개 → 점수 미산출`
    : `${triggered} ÷ ${valid} × 10 = ${barometer.score.toFixed(1)}`;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-5 shadow-[var(--panel-shadow)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">HOW IT IS CALCULATED</p>
          <h2 className="mt-1 text-base font-bold text-[var(--text-primary)]">점수 산출 방식</h2>
          <p className="mt-2 max-w-[720px] text-xs leading-5 text-[var(--text-secondary)]">
            10개 지표가 각 위험 기준을 넘으면 1점, 넘지 않으면 0점입니다. 미확인 지표는 안전한 0점으로 넣지 않습니다.
          </p>
        </div>
        <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-[10px] font-bold text-slate-300">
          현재 품질 {barometer.quality}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(260px,0.8fr)_minmax(420px,1.2fr)]">
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-300">현재 점수 계산</p>
          <p className="mt-2 font-mono text-2xl font-black tracking-tight text-amber-200">{formula}</p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-rose-500/10 px-2 py-2.5 text-rose-200">위험 신호 {triggered}개</div>
            <div className="rounded-lg bg-emerald-500/10 px-2 py-2.5 text-emerald-200">정상 {safe}개</div>
            <div className="rounded-lg bg-slate-800/70 px-2 py-2.5 text-slate-300">미확인 {unknown}개</div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {QUALITY_RULES.map((rule) => {
            const active = rule.quality === barometer.quality;
            return (
              <div
                key={rule.quality}
                className={`rounded-xl border p-3 ${active ? 'border-sky-400/45 bg-sky-500/10' : 'border-[var(--border)] bg-slate-950/25'}`}
              >
                <p className={`text-xs font-bold ${active ? 'text-sky-200' : 'text-slate-300'}`}>{rule.coverage}</p>
                <p className="mt-1 font-mono text-[10px] font-bold text-slate-500">{rule.quality}</p>
                <p className="mt-2 text-[10px] leading-4 text-slate-500">{rule.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3" aria-label="위험 점수 구간 기준">
        {BAND_RULES.map((rule) => (
          <div key={rule.label} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${rule.className}`}>
            <strong>{rule.label}</strong>
            <span>{rule.range}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
