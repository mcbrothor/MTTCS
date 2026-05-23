import { useEffect, useState } from 'react';
import axios from 'axios';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { OHLCData } from '@/types';

export function HistoryChart({ ticker, exchange, stopPrice }: { ticker: string; exchange: string; stopPrice: number | null }) {
  const [data, setData] = useState<OHLCData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const resp = await axios.get<{ priceData: OHLCData[] }>('/api/market-data', {
          params: { ticker, exchange, includeFundamentals: 'false' },
        });
        if (!cancelled) {
          setData(resp.data.priceData);
        }
      } catch (err) {
        console.error('Failed to fetch chart data', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [ticker, exchange]);

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-xs text-slate-500">
        <LoadingSpinner className="h-6 w-6" />
        <span className="animate-pulse">시장 데이터를 페칭 중...</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-600 italic">
        차트 데이터를 표시할 수 없습니다.
      </div>
    );
  }

  const minPrice = Math.min(...data.map(d => d.close)) * 0.95;
  const maxPrice = Math.max(...data.map(d => d.close)) * 1.05;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis 
          dataKey="date" 
          hide 
        />
        <YAxis 
          domain={[minPrice, maxPrice]} 
          orientation="right"
          tickSize={0}
          axisLine={false}
          tick={{ fontSize: 10, fill: '#64748b' }}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
          itemStyle={{ color: '#10b981', fontSize: '12px' }}
          labelStyle={{ color: '#64748b', fontSize: '10px' }}
          labelFormatter={(label) => `날짜: ${label}`}
        />
        <Area
          type="monotone"
          dataKey="close"
          stroke="#10b981"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorPrice)"
          animationDuration={1500}
        />
        {stopPrice && (
          <ReferenceLine
            y={stopPrice}
            stroke="#ef4444"
            strokeDasharray="5 5"
            label={{ 
              value: `손절가 ${stopPrice.toLocaleString()}`, 
              position: 'right', 
              fill: '#ef4444', 
              fontSize: 10,
              fontWeight: 'bold'
            }}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
