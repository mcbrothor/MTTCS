'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';
import { supabase } from '@/lib/supabase/client';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface HistoricalScoreChartProps {
  ticker: string;
  market: string;
}

interface MetricPoint {
  calc_date: string;
  rs_rating: number;
}

export default function HistoricalScoreChart({ ticker, market }: HistoricalScoreChartProps) {
  const [data, setData] = useState<MetricPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      // const supabase = createClient(); // 기존 잘못된 코드 제거
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

      try {
        const { data: metrics, error: supabaseError } = await supabase
          .from('stock_metrics')
          .select('calc_date, rs_rating')
          .eq('ticker', ticker)
          .eq('market', market)
          .gte('calc_date', dateStr)
          .order('calc_date', { ascending: true });

        if (supabaseError) throw supabaseError;
        setData(metrics || []);
      } catch (err: any) {
        console.error('Failed to fetch historical metrics:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (ticker && market) {
      fetchData();
    }
  }, [ticker, market]);

  const trend = useMemo(() => {
    if (data.length < 2) return { direction: 'NEUTRAL', diff: 0 };
    const first = data[0].rs_rating;
    const last = data[data.length - 1].rs_rating;
    const diff = last - first;
    return {
      direction: diff > 0 ? 'UP' : diff < 0 ? 'DOWN' : 'NEUTRAL',
      diff: Math.abs(diff)
    };
  }, [data]);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/40">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (data.length < 2) {
    return (
      <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-center">
        <Minus className="mb-2 h-6 w-6 text-slate-700" />
        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Insufficient Data</p>
        <p className="mt-1 text-[10px] text-slate-600">누적된 RS 히스토리가 부족합니다 (최소 2회 이상 스캔 필요)</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-xl">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex flex-col">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">RS Strength History</h3>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xl font-black text-white tracking-tightest">{data[data.length - 1].rs_rating}</span>
            <div className={`flex items-center gap-0.5 rounded-lg px-1.5 py-0.5 text-[10px] font-black ${
              trend.direction === 'UP' ? 'bg-emerald-500/20 text-emerald-400' :
              trend.direction === 'DOWN' ? 'bg-rose-500/20 text-rose-400' :
              'bg-slate-800 text-slate-500'
            }`}>
              {trend.direction === 'UP' ? <TrendingUp className="h-3 w-3" /> : 
               trend.direction === 'DOWN' ? <TrendingDown className="h-3 w-3" /> : 
               <Minus className="h-3 w-3" />}
              {trend.diff > 0 && <span>{trend.diff}pts</span>}
            </div>
          </div>
        </div>
        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tighter">Last 30 Days</span>
      </div>

      <div className="h-32 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="rsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis 
              dataKey="calc_date" 
              hide 
            />
            <YAxis 
              domain={['dataMin - 5', 'dataMax + 5']} 
              hide 
            />
            <Tooltip
              contentStyle={{ 
                backgroundColor: '#0f172a', 
                border: '1px solid #1e293b',
                borderRadius: '8px',
                fontSize: '10px',
                fontWeight: 700
              }}
              itemStyle={{ color: '#10b981' }}
              labelStyle={{ color: '#64748b', marginBottom: '4px' }}
            />
            <Area
              type="monotone"
              dataKey="rs_rating"
              stroke="#10b981"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#rsGradient)"
              animationDuration={1500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
