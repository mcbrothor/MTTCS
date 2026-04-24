'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Globe, ShieldAlert, TrendingDown, TrendingUp } from 'lucide-react';
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip } from 'recharts';
import { useMarket } from '@/contexts/MarketContext';

interface HistoryPoint {
  date: string;
  p3Score: number;
  state: 'GREEN' | 'YELLOW' | 'RED';
}

function ScoreSparkline({ history, currentScore }: { history: HistoryPoint[]; currentScore: number }) {
  if (history.length < 2) return null;

  const first = history[0].p3Score;
  const last = history.at(-1)!.p3Score;
  const delta = last - first;
  const isImproving = delta > 0;

  return (
    <div className="w-full mt-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">P3 Score 30일 추세</span>
        <span className={`flex items-center gap-1 text-xs font-bold ${isImproving ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
          {isImproving ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : null}
          {isImproving ? '+' : ''}{delta}pt ({first} → {currentScore})
        </span>
      </div>
      <div className="h-16">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
            <defs>
              <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <ReferenceLine y={75} stroke="#10b981" strokeDasharray="3 2" strokeOpacity={0.4} />
            <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="3 2" strokeOpacity={0.4} />
            <Area
              type="monotone"
              dataKey="p3Score"
              stroke="#10b981"
              strokeWidth={1.5}
              fill="url(#sparkGrad)"
              isAnimationActive={false}
              dot={false}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', fontSize: 10 }}
              formatter={(value) => [`P3: ${value ?? '-'}`, ''] as [string, string]}
              labelFormatter={(label) => String(label ?? '')}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-4 text-[9px] text-slate-600 mt-0.5 justify-center">
        <span className="text-emerald-600">── GREEN ≥75</span>
        <span className="text-amber-600">── YELLOW ≥50</span>
      </div>
    </div>
  );
}

export default function StatusCenter() {
  const { data, isLoading, error, isStale, market, macroRegime, conflictWarning } = useMarket();
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  useEffect(() => {
    if (!market) return;
    fetch(`/api/master-filter/history?market=${market}&days=30`)
      .then((r) => r.json())
      .then((j) => { if (Array.isArray(j.data)) setHistory(j.data); })
      .catch(() => {});
  }, [market]);

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-slate-800/50 bg-slate-900/50 backdrop-blur-md">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-xs font-medium uppercase tracking-widest text-slate-500">Master Filter 동기화 중</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const stateConfig = {
    GREEN: {
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      icon: <CheckCircle2 className="h-10 w-10 text-emerald-400" />,
      title: 'GREEN 구간',
      subtitle: '공격 가능한 상승장',
      description: '시장 추세와 내부 강도가 우호적입니다. SEPA/VCP 후보는 피벗 근처의 거래량과 리스크 금액을 확인한 뒤 계획대로 진입할 수 있습니다.',
      accent: 'bg-emerald-500/30',
    },
    YELLOW: {
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      icon: <AlertTriangle className="h-10 w-10 text-amber-400" />,
      title: 'YELLOW 구간',
      subtitle: '중립 또는 경계',
      description: '상승 시도는 가능하지만 일부 지표가 불완전합니다. 신규 진입 규모를 줄이고 손절선과 실패 조건을 더 촘촘하게 관리하세요.',
      accent: 'bg-amber-500/30',
    },
    RED: {
      color: 'text-rose-400',
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/20',
      icon: <ShieldAlert className="h-10 w-10 text-rose-400" />,
      title: 'RED 구간',
      subtitle: '방어 우선 하락장',
      description: '시장 압력이 높습니다. 신규 매수보다 현금 비중 확대, 보유 종목 손절선 준수, 포트폴리오 리스크 축소를 우선하세요.',
      accent: 'bg-rose-500/30',
    },
  } as const;

  const config = stateConfig[data.state];
  const updatedAt = data.metrics.updatedAt ? new Date(data.metrics.updatedAt).toLocaleString('ko-KR') : '확인 불가';
  const p3Score = data.metrics.p3Score ?? 0;

  return (
    <div
      className={`relative flex flex-col items-center justify-center gap-4 overflow-hidden rounded-lg border p-8 text-center shadow-2xl backdrop-blur-md transition-all duration-700 ${config.bg} ${config.border}`}
    >
      <div className={`absolute -left-12 -top-12 h-32 w-32 rounded-full opacity-20 blur-3xl ${config.accent}`} />

      {/* Fail-safe 스트립 */}
      {isStale && (
        <div role="alert" className="relative z-10 w-full rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300 flex items-start gap-2 text-left mb-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" aria-hidden="true" />
          <span className="leading-relaxed">
            데이터 소스 장애 — 최근 정상 값 표시 중
            {data?.metrics.updatedAt ? ` (마지막 갱신: ${new Date(data.metrics.updatedAt).toLocaleString('ko-KR')})` : ''}
          </span>
        </div>
      )}

      {/* 충돌 경고 배너 */}
      {conflictWarning && (
        <div className="relative z-10 w-full rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 flex items-start gap-2 text-left mb-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          <span className="leading-relaxed">{conflictWarning}</span>
        </div>
      )}

      <div className="relative z-10 flex flex-col items-center gap-3 w-full">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">MARKET STATE</p>
        <h2 className={`text-5xl font-black tracking-tight font-mono ${config.color} drop-shadow-lg mb-2`}>{data.state}</h2>
        
        <div
          className="w-full h-2 bg-slate-800 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={p3Score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`P3 종합 점수 ${p3Score}점 만점 100점, 상태 ${data.state}`}
        >
          <div
            className="h-full bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500 rounded-full transition-all duration-1000"
            style={{ width: `${Math.min(p3Score, 100)}%` }}
          />
        </div>
        <p className="text-xs text-slate-400 font-medium">종합 점수 {p3Score}/100</p>
        
        <div className={`mt-2 w-full p-3 rounded-xl border ${config.bg} ${config.border} text-left`}>
          <div className="flex items-center gap-2 mb-1.5">
            {config.icon && <div className="[&>svg]:w-4 [&>svg]:h-4">{config.icon}</div>}
            <span className={`text-xs font-bold ${config.color}`}>{config.title}</span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-300">{config.description}</p>
        </div>
      </div>

      <div className="relative z-10 mt-3 flex flex-wrap justify-center gap-2">
        {[
          data.metrics.trend, 
          data.metrics.breadth, 
          data.metrics.volatility, 
          data.metrics.ftd,
          data.metrics.distribution,
          data.metrics.newHighLow,
          data.metrics.sectorRotation
        ].map((m) => (
          <span
            key={m.label}
            className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase
              ${m.status === 'PASS' ? 'border-emerald-500/40 text-emerald-300' : m.status === 'WARNING' ? 'border-amber-500/40 text-amber-300' : 'border-rose-500/40 text-rose-300'}`}
          >
            {m.label} · {m.status}
          </span>
        ))}
        <span className="rounded-full border border-slate-700 bg-slate-900/50 px-3 py-1 text-[10px] font-bold text-slate-300">
          P3 {p3Score}/100
        </span>
        {macroRegime && (
          <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase
            ${macroRegime === 'RISK_ON' ? 'border-emerald-500/40 text-emerald-300' : macroRegime === 'RISK_OFF' ? 'border-rose-500/40 text-rose-300' : 'border-amber-500/40 text-amber-300'}`}
          >
            Macro · {macroRegime}
          </span>
        )}
      </div>

      {/* 30일 Sparkline */}
      {history.length >= 2 && (
        <div className="relative z-10 w-full max-w-xl">
          <ScoreSparkline history={history} currentScore={p3Score} />
        </div>
      )}

      <div className="relative z-10 mt-2 flex flex-wrap items-center justify-center gap-3">
        <div className="flex items-center gap-1.5 rounded-full border border-slate-800/80 bg-slate-900/40 px-3 py-1">
          <Globe className="h-3 w-3 text-slate-500" />
          <span className="text-[10px] font-bold uppercase tracking-tight text-slate-500">
            Yahoo Finance 지연 데이터 · 기준 시각 {updatedAt}
          </span>
        </div>
        {error && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-bold text-amber-300">
            일부 데이터는 fallback 상태입니다.
          </span>
        )}
      </div>
    </div>
  );
}
