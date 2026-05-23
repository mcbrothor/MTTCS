'use client';

import { useMemo } from 'react';
import type { Trade } from '@/types';
import Card from '@/components/ui/Card';
import { AlertCircle } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { buildReviewStatsSummary } from '@/lib/review-stats';

interface ReviewStatsDashboardProps {
  trades: Trade[];
  selectedMistakeTag?: string | null;
  onSelectMistakeTag?: (tag: string | null) => void;
}

function formatSignedR(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}R`;
}

export default function ReviewStatsDashboard({
  trades,
  selectedMistakeTag = null,
  onSelectMistakeTag,
}: ReviewStatsDashboardProps) {
  const stats = useMemo(() => buildReviewStatsSummary(trades), [trades]);

  if (stats.completedCount === 0) return null;

  const chartData = stats.mistakeTags.slice(0, 8).map((item) => ({
    ...item,
    shortTag: item.tag.length > 12 ? `${item.tag.slice(0, 12)}...` : item.tag,
  }));

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_1.35fr]">
      <Card className="flex flex-col">
        <div className="mb-4 flex items-center gap-2">
          <h3 className="text-lg font-bold text-white">청산 사유별 성과</h3>
        </div>
        <div className="flex-1 space-y-3">
          {stats.exitReasons.map((item) => {
            const isProfit = item.avgR >= 0;

            return (
              <div key={item.reason} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-slate-200">{item.reason}</span>
                  <span className="text-xs text-slate-500">{item.count}건 ({item.sharePct.toFixed(1)}%)</span>
                </div>
                <div className="text-right">
                  <div className={`font-mono font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {formatSignedR(item.avgR)}
                  </div>
                  <div className="text-[10px] text-slate-400">승률 {item.winRate.toFixed(1)}%</div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="flex flex-col">
        <div className="mb-4 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-amber-400" />
          <div>
            <h3 className="text-lg font-bold text-white">실수 태그 통계</h3>
            <p className="mt-1 text-sm text-slate-400">완료된 매매 기준으로 빈도와 평균 R을 함께 봅니다.</p>
          </div>
        </div>

        {stats.mistakeTags.length > 0 ? (
          <div className="flex flex-1 flex-col gap-5">
            <div className="h-[290px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 8, left: -22, bottom: 18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="shortTag"
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    angle={-18}
                    textAnchor="end"
                    height={52}
                  />
                  <YAxis yAxisId="count" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis yAxisId="avgR" orientation="right" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: '#1e293b' }}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.75rem' }}
                    formatter={(value, name) => {
                      if (name === 'Count') return [value, '빈도'];
                      return [formatSignedR(Number(value)), '평균 R'];
                    }}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.tag || label}
                  />
                  <Bar yAxisId="count" dataKey="count" name="Count" radius={[4, 4, 0, 0]} fill="#f59e0b" />
                  <Bar yAxisId="avgR" dataKey="avgR" name="Avg R" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry) => (
                      <Cell key={entry.tag} fill={entry.avgR >= 0 ? '#10b981' : '#f43f5e'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="flex flex-wrap gap-2">
              {stats.mistakeTags.map((item) => {
                const active = selectedMistakeTag === item.tag;
                return (
                  <button
                    key={item.tag}
                    type="button"
                    onClick={() => onSelectMistakeTag?.(active ? null : item.tag)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? 'border-amber-300/40 bg-amber-400/15 text-amber-100'
                        : 'border-amber-500/20 bg-amber-500/8 text-amber-50 hover:bg-amber-500/12'
                    }`}
                  >
                    {item.tag} / {item.count}
                  </button>
                );
              })}
              {selectedMistakeTag ? (
                <button
                  type="button"
                  onClick={() => onSelectMistakeTag?.(null)}
                  className="rounded-full border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800"
                >
                  필터 해제
                </button>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">세팅 태그</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {stats.setupTags.length > 0 ? (
                  stats.setupTags.slice(0, 8).map((item) => (
                    <span key={item.tag} className="rounded-full border border-sky-500/20 bg-sky-500/8 px-3 py-1 text-xs font-semibold text-sky-100">
                      {item.tag} / {item.count}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">기록된 세팅 태그가 아직 없습니다.</span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-slate-800 border-dashed p-6 text-slate-500">
            완료된 매매에 기록된 실수 태그가 아직 없습니다.
          </div>
        )}
      </Card>
    </div>
  );
}
