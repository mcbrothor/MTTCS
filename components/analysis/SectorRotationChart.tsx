'use client';

import React, { useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  Legend
} from 'recharts';
import type { ScannerResult } from '@/types';

interface SectorRotationChartProps {
  results: ScannerResult[];
}

export default function SectorRotationChart({ results }: SectorRotationChartProps) {
  const data = useMemo(() => {
    const doneResults = results.filter(r => r.status === 'done');
    const sectorMap: Record<string, { name: string; count: number; totalRs: number }> = {};

    doneResults.forEach(r => {
      const sector = r.fundamentals?.sector || 'Unknown';
      if (!sectorMap[sector]) {
        sectorMap[sector] = { name: sector, count: 0, totalRs: 0 };
      }
      sectorMap[sector].count += 1;
      sectorMap[sector].totalRs += r.rsRating || r.benchmarkRelativeScore || 0;
    });

    return Object.values(sectorMap)
      .map(s => ({
        name: s.name,
        count: s.count,
        avgRs: Math.round(s.totalRs / s.count),
      }))
      .sort((a, b) => b.avgRs - a.avgRs);
  }, [results]);

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/50">
        <p className="text-sm text-slate-500 font-medium">분석된 섹터 데이터가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-black tracking-tight text-white uppercase">Sector Rotation</h3>
          <p className="text-xs text-slate-500 font-medium">섹터별 평균 RS 점수 및 종목 수 분포</p>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-slate-400">Avg RS</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-slate-700" />
            <span className="text-slate-400">Count</span>
          </div>
        </div>
      </div>

      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            barSize={20}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
            <XAxis 
              type="number" 
              hide 
            />
            <YAxis 
              dataKey="name" 
              type="category" 
              tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
              width={100}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ 
                backgroundColor: '#0f172a', 
                border: '1px solid #1e293b',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: 700
              }}
              itemStyle={{ color: '#f8fafc' }}
              cursor={{ fill: '#1e293b', opacity: 0.4 }}
            />
            <Bar 
              dataKey="avgRs" 
              name="평균 RS" 
              radius={[0, 4, 4, 0]}
            >
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.avgRs >= 80 ? '#10b981' : entry.avgRs >= 60 ? '#3b82f6' : '#64748b'} 
                />
              ))}
            </Bar>
            <Bar 
              dataKey="count" 
              name="종목 수" 
              fill="#1e293b" 
              radius={[0, 4, 4, 0]} 
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      <div className="mt-4 grid grid-cols-3 gap-3">
        {data.slice(0, 3).map((s, i) => (
          <div key={s.name} className="rounded-lg bg-slate-950/50 p-3 border border-slate-800/50">
            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 truncate">TOP {i+1} Sector</div>
            <div className="text-xs font-bold text-white truncate">{s.name}</div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[10px] font-mono text-emerald-400">RS {s.avgRs}</span>
              <span className="text-[10px] text-slate-600">{s.count} Stocks</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
