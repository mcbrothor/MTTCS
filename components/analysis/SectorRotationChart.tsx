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
} from 'recharts';

/** ScannerResult 또는 CanslimScannerResult 공통 최소 타입 */
interface ScannerResultLike {
  status: string;
  rsRating?: number | null;
  benchmarkRelativeScore?: number | null;
  exchange?: string;
  /** ScannerResult: fundamentals.sector */
  fundamentals?: { sector?: string | null } | null;
  /** CanslimScannerResult: sector (직접 필드) */
  sector?: string | null;
}

interface SectorRotationChartProps {
  results: ScannerResultLike[];
}

function getSector(r: ScannerResultLike): string | null {
  return r.fundamentals?.sector || r.sector || null;
}

export default function SectorRotationChart({ results }: SectorRotationChartProps) {
  const data = useMemo(() => {
    const doneResults = results.filter(r => r.status === 'done');

    // 섹터 데이터가 없는 경우 거래소(exchange)별로 그룹화
    const hasSectorData = doneResults.some(r => getSector(r));
    const groupKey = (r: ScannerResultLike): string => {
      if (hasSectorData) {
        return getSector(r) || 'Unknown';
      }
      return r.exchange || 'Unknown';
    };

    const sectorMap: Record<string, { name: string; count: number; totalRs: number }> = {};
    doneResults.forEach(r => {
      const key = groupKey(r);
      if (!sectorMap[key]) {
        sectorMap[key] = { name: key, count: 0, totalRs: 0 };
      }
      sectorMap[key].count += 1;
      sectorMap[key].totalRs += r.rsRating ?? r.benchmarkRelativeScore ?? 0;
    });

    return Object.values(sectorMap)
      .map(s => ({
        name: s.name,
        count: s.count,
        avgRs: s.count > 0 ? Math.round(s.totalRs / s.count) : 0,
      }))
      .filter(s => s.count > 0)
      .sort((a, b) => b.avgRs - a.avgRs);
  }, [results]);

  const doneCount = results.filter(r => r.status === 'done').length;
  const hasSectorData = results.filter(r => r.status === 'done').some(r => getSector(r));
  const groupLabel = hasSectorData ? '섹터' : '거래소';

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/50">
        <p className="text-sm text-slate-500 font-medium">
          {doneCount === 0 ? '아직 분석 완료된 종목이 없습니다.' : '분석된 섹터 데이터가 없습니다.'}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-black tracking-tight text-white uppercase">Sector Rotation</h3>
          <p className="text-xs text-slate-500 font-medium">{groupLabel}별 평균 RS 점수 및 종목 수 분포</p>
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
            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 truncate">TOP {i+1} {groupLabel}</div>
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
