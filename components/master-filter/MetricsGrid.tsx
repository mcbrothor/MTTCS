'use client';

import { Info, ShieldAlert, ShieldCheck, TrendingUp } from 'lucide-react';
import { Area, AreaChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import Card from '@/components/ui/Card';
import { useMarket } from '@/contexts/MarketContext';
import type { MasterFilterMetricDetail, MasterFilterMetrics } from '@/types';

interface MetricCardProps {
  detail: MasterFilterMetricDetail;
  chartData?: { date: string; close: number }[];
  movingAverageData?: NonNullable<MasterFilterMetrics['movingAverageHistory']>;
  compact?: boolean;
}

function statusClass(status: MasterFilterMetricDetail['status']) {
  if (status === 'PASS') return 'border-emerald-500/40 bg-emerald-500/5 text-emerald-300';
  if (status === 'WARNING') return 'border-amber-500/40 bg-amber-500/5 text-amber-300';
  return 'border-rose-500/40 bg-rose-500/5 text-rose-300';
}

function MetricCard({ detail, chartData, movingAverageData, compact = false }: MetricCardProps) {
  const tone = statusClass(detail.status);
  return (
    <Card className={`border-2 ${tone} ${compact ? 'min-h-[190px]' : 'min-h-[260px]'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{detail.label}</p>
          <p className="mt-2 font-mono text-2xl font-black text-white">
            {detail.value}
            {detail.unit && <span className="ml-1 text-xs text-slate-500">{detail.unit}</span>}
          </p>
          <p className="mt-1 text-xs text-slate-500">기준: {detail.threshold}</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-current px-2 py-1 text-xs font-bold">
          {detail.status === 'PASS' ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
          {detail.status}
        </div>
      </div>

      {typeof detail.score === 'number' && typeof detail.weight === 'number' && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>가중 점수</span>
            <span>{detail.score}/{detail.weight}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-lg bg-slate-800">
            <div className="h-full bg-emerald-500" style={{ width: `${Math.min((detail.score / detail.weight) * 100, 100)}%` }} />
          </div>
        </div>
      )}

      {movingAverageData && !compact && (
        <div className="mt-4 h-24">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={movingAverageData}>
              <Line type="monotone" dataKey="ma50" name="50일선" stroke="#10b981" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="ma200" name="200일선" stroke="#38bdf8" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              {!isNaN(Number(detail.threshold)) && (
                <ReferenceLine
                  y={Number(detail.threshold)}
                  stroke="#f59e0b"
                  strokeDasharray="4 2"
                  label={{ value: '기준선', fill: '#f59e0b', fontSize: 10 }}
                />
              )}
              <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                labelStyle={{ color: '#94a3b8', fontSize: 11 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-1 flex gap-3 text-[10px] text-slate-500">
            <span className="text-emerald-300">50일선</span>
            <span className="text-sky-300">200일선</span>
          </div>
        </div>
      )}

      {chartData && !movingAverageData && !compact && (
        <div className="mt-4 h-24">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <Area type="monotone" dataKey="close" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
              {!isNaN(Number(detail.threshold)) && (
                <ReferenceLine
                  y={Number(detail.threshold)}
                  stroke="#f59e0b"
                  strokeDasharray="4 2"
                  label={{ value: '기준선', fill: '#f59e0b', fontSize: 10 }}
                />
              )}
              <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-4 border-t border-slate-800 pt-3">
        <div className="flex items-start gap-2 text-xs leading-5 text-slate-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" />
          <span>{detail.description}</span>
        </div>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-slate-600">{detail.source}</p>
      </div>
    </Card>
  );
}

function SectorTable({ rows }: { rows: NonNullable<MasterFilterMetrics['sectorRows']> }) {
  if (rows.length === 0) return null;

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
      <div className="mb-3 flex items-center gap-2 text-slate-300">
        <TrendingUp className="h-4 w-4 text-emerald-300" />
        <p className="text-sm font-bold">전체 섹터 로테이션</p>
      </div>
      <div className="md:hidden space-y-2">
        {rows.map((row) => (
          <div key={row.symbol} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
            <div>
              <p className="text-xs font-bold text-white">{row.name}</p>
              <p className="font-mono text-[10px] text-slate-500">{row.symbol}</p>
            </div>
            <div className="text-right">
              <p className={`font-mono text-sm font-bold ${row.return20 >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {row.return20 > 0 ? '+' : ''}{row.return20.toFixed(2)}%
              </p>
              <span className={`text-[10px] ${row.riskOn ? 'text-emerald-400' : 'text-slate-500'}`}>
                {row.riskOn ? 'Risk-on' : 'Defensive'}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm text-slate-300">
          <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2 pr-3">순위</th>
              <th className="py-2 pr-3">섹터</th>
              <th className="py-2 pr-3">심볼</th>
              <th className="py-2 pr-3 text-right">20일 수익률</th>
              <th className="py-2 pr-3">성격</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.symbol} className="border-b border-slate-900">
                <td className="py-2 pr-3 font-mono text-slate-400">{row.rank}</td>
                <td className="py-2 pr-3 font-semibold text-white">{row.name}</td>
                <td className="py-2 pr-3 font-mono">{row.symbol}</td>
                <td className={`py-2 pr-3 text-right font-mono ${row.return20 >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {row.return20 > 0 ? '+' : ''}{row.return20.toFixed(2)}%
                </td>
                <td className="py-2 pr-3">
                  <span className={`rounded-lg border px-2 py-1 text-xs ${row.riskOn ? 'border-emerald-500/30 text-emerald-300' : 'border-slate-700 text-slate-400'}`}>
                    {row.riskOn ? 'Risk-on' : 'Defensive/Neutral'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DistributionTable({ details }: { details: NonNullable<MasterFilterMetrics['distributionDetails']> }) {
  if (!details || details.length === 0) return null;

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-300">
          <ShieldAlert className="h-4 w-4 text-rose-400" />
          <p className="text-sm font-bold">기관 매도 (Distribution Days) 상세 내역</p>
        </div>
        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">최근 25거래일 기준</span>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2 pr-3">날짜</th>
              <th className="py-2 pr-3 text-right">종가</th>
              <th className="py-2 pr-3 text-right">등락률</th>
              <th className="py-2 pr-3 text-right">거래량</th>
            </tr>
          </thead>
          <tbody>
            {details.slice().reverse().map((row, idx) => (
              <tr key={idx} className="border-b border-slate-900 last:border-0 hover:bg-slate-900/50">
                <td className="py-2 pr-3 font-mono text-slate-400">
                  {new Date(row.date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                </td>
                <td className="py-2 pr-3 text-right font-mono">{row.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="py-2 pr-3 text-right font-mono text-rose-400">{row.pctChange}%</td>
                <td className="py-2 pr-3 text-right font-mono text-slate-300">{row.volume.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function MetricsGrid() {
  const { data, isLoading } = useMarket();

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((item) => (
          <Card key={item} className="h-64 animate-pulse border-slate-700/50 bg-slate-800/30">
            <div />
          </Card>
        ))}
      </div>
    );
  }

  const { metrics } = data;
  const p3Cards = [metrics.ftd, metrics.distribution, metrics.newHighLow, metrics.above200d, metrics.sectorRotation].filter(
    (item): item is MasterFilterMetricDetail => Boolean(item)
  );

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">
              {data.market === 'KR' ? 'KOSPI 200' : 'SPY'} Market Filter
            </p>
            <h2 className="mt-1 text-xl font-bold text-white">근거 기반 시장 점수</h2>
          </div>
          <div className="text-right">
            <p className="font-mono text-3xl font-black text-white">{metrics.p3Score ?? 0}/100</p>
            <p className="text-[10px] font-bold uppercase text-slate-500">Total P3 Confidence Score</p>
          </div>
        </div>

        <div className="mt-4 space-y-2 border-t border-slate-800 pt-4">
          {[metrics.trend, metrics.breadth, metrics.volatility, metrics.liquidity, 
            metrics.ftd, metrics.distribution, metrics.newHighLow].map((m) => m ? (
            <div key={m.label}>
              <div className="mb-1 flex justify-between text-[10px] text-slate-500">
                <span>{m.label}</span>
                <span className={m.status === 'PASS' ? 'text-emerald-400' : m.status === 'WARNING' ? 'text-amber-400' : 'text-rose-400'}>
                  {m.score ?? 0}/{m.weight ?? 0}점
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    m.status === 'PASS' ? 'bg-emerald-500' : m.status === 'WARNING' ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${m.weight ? Math.min(((m.score ?? 0) / m.weight) * 100, 100) : 0}%` }}
                />
              </div>
            </div>
          ) : null)}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
        <MetricCard detail={metrics.trend} movingAverageData={metrics.movingAverageHistory} />
        <MetricCard detail={metrics.breadth} chartData={metrics.mainHistory} />
        <MetricCard detail={metrics.volatility} chartData={metrics.vixHistory} />
        <MetricCard detail={metrics.liquidity} />
        {p3Cards.map((detail) => (
          <MetricCard key={detail.label} detail={detail} compact />
        ))}
        <MetricCard detail={metrics.leadership} compact />
      </div>

      <SectorTable rows={metrics.sectorRows || []} />
      <DistributionTable details={metrics.distributionDetails || []} />

      <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
        <div className="mb-3 flex items-center gap-2 text-slate-300">
          <TrendingUp className="h-4 w-4 text-emerald-300" />
          <p className="text-sm font-bold">판정 사용법</p>
        </div>
        <div className="grid gap-3 text-sm leading-6 text-slate-400 md:grid-cols-3">
          <p><strong className="text-emerald-300">GREEN</strong>: 돌파 후보를 적극 검토하되 피벗 근처 거래량을 확인합니다.</p>
          <p><strong className="text-amber-300">YELLOW</strong>: 신규 진입 크기를 줄이고 실패 돌파는 빠르게 정리합니다.</p>
          <p><strong className="text-rose-300">RED</strong>: 현금 비중과 기존 포지션 방어를 우선합니다.</p>
        </div>
      </section>
    </div>
  );
}
