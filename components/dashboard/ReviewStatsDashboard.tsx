'use client';

import { useMemo } from 'react';
import type { Trade, ExitReason } from '@/types';
import Card from '@/components/ui/Card';
import { Target, TrendingUp, AlertCircle } from 'lucide-react';

interface ReviewStatsDashboardProps {
  trades: Trade[];
}

export default function ReviewStatsDashboard({ trades }: ReviewStatsDashboardProps) {
  const completedTrades = useMemo(() => trades.filter(t => t.status === 'COMPLETED'), [trades]);

  const stats = useMemo(() => {
    if (completedTrades.length === 0) return null;

    // 1. 청산 사유별 통계
    const exitReasonStats = completedTrades.reduce((acc, trade) => {
      const reason = trade.exit_reason || '미기재';
      if (!acc[reason]) {
        acc[reason] = { count: 0, wins: 0, totalR: 0 };
      }
      acc[reason].count += 1;
      
      const r = trade.metrics?.rMultiple || 0;
      acc[reason].totalR += r;
      if (r > 0) acc[reason].wins += 1;

      return acc;
    }, {} as Record<string, { count: number, wins: number, totalR: number }>);

    // 2. 실수 태그 빈도
    const mistakeTagStats = completedTrades.reduce((acc, trade) => {
      (trade.mistake_tags || []).forEach(tag => {
        acc[tag] = (acc[tag] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);

    return {
      exitReasonStats,
      mistakeTagStats,
    };
  }, [completedTrades]);

  if (!stats) return null;

  const totalCompleted = completedTrades.length;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* 청산 사유 분석 */}
      <Card className="flex flex-col">
        <div className="mb-4 flex items-center gap-2">
          <h3 className="text-lg font-bold text-white">청산 사유별 성과</h3>
        </div>
        <div className="flex-1 space-y-3">
          {Object.entries(stats.exitReasonStats)
            .sort((a, b) => b[1].count - a[1].count)
            .map(([reason, data]) => {
              const winRate = (data.wins / data.count) * 100;
              const avgR = data.totalR / data.count;
              const isProfit = avgR >= 0;
              
              return (
                <div key={reason} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-200">{reason}</span>
                    <span className="text-xs text-slate-500">{data.count}회 ({((data.count / totalCompleted) * 100).toFixed(1)}%)</span>
                  </div>
                  <div className="text-right">
                    <div className={`font-mono font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {avgR > 0 ? '+' : ''}{avgR.toFixed(2)}R
                    </div>
                    <div className="text-[10px] text-slate-400">승률 {winRate.toFixed(1)}%</div>
                  </div>
                </div>
              );
            })}
        </div>
      </Card>

      {/* 실수 및 피드백 태그 */}
      <Card className="flex flex-col">
        <div className="mb-4 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-amber-400" />
          <h3 className="text-lg font-bold text-white">가장 잦은 실수</h3>
        </div>
        
        {Object.keys(stats.mistakeTagStats).length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.mistakeTagStats)
              .sort((a, b) => b[1] - a[1])
              .map(([tag, count]) => (
                <div key={tag} className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100">
                  <span className="font-medium">{tag}</span>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-[10px] font-bold text-amber-300">
                    {count}
                  </span>
                </div>
              ))}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-slate-800 border-dashed p-6 text-slate-500">
            기록된 실수 태그가 없습니다.
          </div>
        )}
      </Card>
    </div>
  );
}
