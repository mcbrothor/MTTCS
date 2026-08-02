'use client';

import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import StableResponsiveContainer from '@/components/ui/StableResponsiveContainer';
import type { RiskBarometerHistoryPoint } from '@/types';

interface ChartPoint extends RiskBarometerHistoryPoint {
  dateLabel: string;
}

function dateLabel(date: string) {
  const [, month = '', day = ''] = date.split('-');
  return `${month}.${day}`;
}

function scoreLabel(value: number | null) {
  return value === null ? '—' : value.toFixed(1);
}

export default function RiskHistoryChart({ items }: { items: RiskBarometerHistoryPoint[] }) {
  const chartItems: ChartPoint[] = items.map((item) => ({ ...item, dateLabel: dateLabel(item.date) }));
  const scored = chartItems.filter((item): item is ChartPoint & { score: number } => item.score !== null);
  const first = scored[0];
  const latest = scored.at(-1);
  const change = first && latest ? latest.score - first.score : null;
  const showPointLabels = scored.length > 0 && scored.length <= 8;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-5 shadow-[var(--panel-shadow)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">30 DAY TREND</p>
          <h2 className="mt-1 text-base font-bold text-[var(--text-primary)]">위험 점수 추이</h2>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          {latest && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-bold text-amber-200">
              최신 {latest.score.toFixed(1)}
            </span>
          )}
          <span className="rounded-full border border-slate-700 bg-slate-900/70 px-2.5 py-1 text-slate-300">
            {scored.length}개 관측
          </span>
        </div>
      </div>

      {scored.length === 0 ? (
        <div className="mt-5 flex h-[260px] items-center justify-center rounded-xl border border-dashed border-slate-700 text-xs text-slate-500">
          첫 스냅샷부터 추이가 쌓입니다.
        </div>
      ) : (
        <>
          <div
            role="img"
            aria-label="최근 30일 AI/FOMO 위험 점수 추이"
            className="mt-4 h-[260px] w-full sm:h-[300px]"
          >
            <StableResponsiveContainer width="100%" height="100%" initialHeight={300}>
              <LineChart data={chartItems} margin={{ top: 24, right: 18, left: -10, bottom: 4 }}>
                <ReferenceArea y1={0} y2={3} fill="#22c55e" fillOpacity={0.08} />
                <ReferenceArea y1={3} y2={7} fill="#f59e0b" fillOpacity={0.08} />
                <ReferenceArea y1={7} y2={10} fill="#ef4444" fillOpacity={0.08} />
                <CartesianGrid stroke="#263449" strokeDasharray="3 5" vertical={false} />
                <XAxis
                  dataKey="dateLabel"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={28}
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  tickMargin={10}
                />
                <YAxis
                  domain={[0, 10]}
                  ticks={[0, 3, 7, 10]}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                />
                <ReferenceLine y={3} stroke="#22c55e" strokeOpacity={0.55} strokeDasharray="4 4" />
                <ReferenceLine y={7} stroke="#ef4444" strokeOpacity={0.55} strokeDasharray="4 4" />
                <Tooltip
                  cursor={{ stroke: '#64748b', strokeDasharray: '3 3' }}
                  contentStyle={{
                    backgroundColor: '#020617',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
                  }}
                  labelStyle={{ color: '#94a3b8', fontSize: 10 }}
                  itemStyle={{ color: '#fef3c7', fontSize: 12, fontWeight: 700 }}
                  labelFormatter={(label) => `관측일 ${String(label)}`}
                  formatter={(value) => [
                    typeof value === 'number' ? `${value.toFixed(1)} / 10` : '—',
                    '위험 점수',
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  name="위험 점수"
                  stroke="#fbbf24"
                  strokeWidth={3}
                  connectNulls={false}
                  isAnimationActive={false}
                  dot={{ r: 4, fill: '#f8fafc', stroke: '#f59e0b', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: '#fbbf24', stroke: '#f8fafc', strokeWidth: 2 }}
                >
                  {showPointLabels && (
                    <LabelList
                      dataKey="score"
                      position="top"
                      fill="#fef3c7"
                      fontSize={10}
                      fontWeight={700}
                      formatter={(value: unknown) => typeof value === 'number' ? value.toFixed(1) : ''}
                    />
                  )}
                </Line>
              </LineChart>
            </StableResponsiveContainer>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px]">
            <div className="flex flex-wrap gap-2">
              <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-emerald-200">낮음 0–3 미만</span>
              <span className="rounded border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-amber-200">주의 3–7 미만</span>
              <span className="rounded border border-rose-500/25 bg-rose-500/10 px-2 py-1 text-rose-200">위험 7–10</span>
            </div>
            {change !== null && scored.length > 1 && (
              <span className={`font-mono font-bold ${change > 0 ? 'text-rose-300' : change < 0 ? 'text-emerald-300' : 'text-slate-400'}`}>
                첫 관측 대비 {change > 0 ? '+' : ''}{change.toFixed(1)}
              </span>
            )}
          </div>
          <p className="mt-3 text-[10px] leading-4 text-slate-500">
            점은 실제 저장된 스냅샷만 표시합니다. 점수가 차단된 날은 선으로 연결하지 않습니다.
          </p>

          <ul className="sr-only">
            {scored.map((item) => (
              <li key={item.date}>{item.date}: {scoreLabel(item.score)}점, {item.coverage}/10개 확인</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
