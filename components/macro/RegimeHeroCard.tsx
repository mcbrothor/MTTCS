'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Globe, HelpCircle, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip } from 'recharts';
import type { MacroRegime, MacroScoreBreakdown } from '@/lib/macro/compute';

interface HistoryPoint {
  date: string;
  macroScore: number;
  regime: string;
}

interface Props {
  score: number;
  regime: MacroRegime;
  breakdown: MacroScoreBreakdown[];
  history: HistoryPoint[];
  asOf: string | null;
}

const REGIME_CONFIG = {
  RISK_ON: {
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    accent: 'bg-emerald-500/30',
    icon: <TrendingUp className="h-5 w-5 text-emerald-400" />,
    label: 'RISK-ON',
    description: '추세 추종과 공격적 종목 탐색에 우호적인 매크로 환경입니다. 마스터 필터 상태를 함께 확인하세요.',
  },
  NEUTRAL: {
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    accent: 'bg-amber-500/30',
    icon: <Minus className="h-5 w-5 text-amber-400" />,
    label: 'NEUTRAL',
    description: '매크로 신호가 혼재합니다. 신규 진입 비중을 줄이고 리스크 관리를 우선하세요.',
  },
  RISK_OFF: {
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    accent: 'bg-rose-500/30',
    icon: <TrendingDown className="h-5 w-5 text-rose-400" />,
    label: 'RISK-OFF',
    description: '글로벌 리스크 회피 국면입니다. 현금 비중 확대와 기존 포지션 축소를 우선하세요.',
  },
} as const;

function ScoreSparkline({ history, currentScore }: { history: HistoryPoint[]; currentScore: number }) {
  if (history.length < 2) return null;

  const first = history[0].macroScore;
  const delta = currentScore - first;
  const isImproving = delta > 0;

  return (
    <div className="w-full mt-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Macro Score 7일 추세</span>
        <span className={`flex items-center gap-1 text-xs font-bold ${isImproving ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
          {isImproving ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : null}
          {isImproving ? '+' : ''}{delta}pt ({first} → {currentScore})
        </span>
      </div>
      <div className="h-16">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
            <defs>
              <linearGradient id="macroSparkGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <ReferenceLine y={70} stroke="#10b981" strokeDasharray="3 2" strokeOpacity={0.4} />
            <ReferenceLine y={45} stroke="#f59e0b" strokeDasharray="3 2" strokeOpacity={0.4} />
            <Area
              type="monotone"
              dataKey="macroScore"
              stroke="#10b981"
              strokeWidth={1.5}
              fill="url(#macroSparkGrad)"
              isAnimationActive={false}
              dot={false}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', fontSize: 10 }}
              formatter={(value) => [`Macro: ${value ?? '-'}`, ''] as [string, string]}
              labelFormatter={(label) => String(label ?? '')}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-4 text-[9px] text-slate-600 mt-0.5 justify-center">
        <span className="text-emerald-600">── RISK-ON ≥70</span>
        <span className="text-amber-600">── NEUTRAL ≥45</span>
      </div>
    </div>
  );
}

function ComponentRow({ item }: { item: MacroScoreBreakdown }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const ratio = item.score / item.weight;
  const barColor = ratio > 0.7 ? 'bg-emerald-500' : ratio > 0.4 ? 'bg-amber-500' : 'bg-rose-500';
  const textColor = ratio > 0.7 ? 'text-emerald-400' : ratio > 0.4 ? 'text-amber-400' : 'text-rose-400';

  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)] mb-1">
        <div className="flex items-center gap-1 min-w-0">
          <span className="truncate">{item.label}</span>
          <div className="relative shrink-0">
            <button
              type="button"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              onFocus={() => setShowTooltip(true)}
              onBlur={() => setShowTooltip(false)}
              className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-sky-900/60 text-sky-300 hover:bg-sky-800 transition-colors"
              aria-label={`${item.label} 산출 근거`}
            >
              <HelpCircle className="h-2.5 w-2.5" />
            </button>
            {showTooltip && (
              <div className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-lg border border-sky-700/50 bg-slate-950 p-3 text-xs text-slate-300 shadow-2xl">
                <div className="absolute -bottom-1.5 left-2 h-3 w-3 rotate-45 border-b border-r border-sky-700/50 bg-slate-950" />
                <p className="font-bold text-slate-200 mb-1">{item.label}</p>
                <p className="text-slate-400 mb-1.5">{item.rawValue}</p>
                <p className="rounded border border-sky-900 bg-sky-950/50 p-1.5 font-mono text-[10px] text-yellow-300 leading-relaxed">
                  {item.threshold}
                </p>
              </div>
            )}
          </div>
        </div>
        <span className={`font-mono shrink-0 ml-2 ${textColor}`}>
          {item.score}/{item.weight}
        </span>
      </div>
      <div className="h-[3px] bg-[var(--surface-soft)] rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full transition-all duration-700`} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

export default function RegimeHeroCard({ score, regime, breakdown, history, asOf }: Props) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const config = REGIME_CONFIG[regime];
  const updatedAt = asOf ? new Date(asOf).toLocaleString('ko-KR') : null;

  return (
    <div className={`relative flex flex-col overflow-hidden rounded-lg border p-6 shadow-2xl backdrop-blur-md transition-all duration-700 ${config.bg} ${config.border}`}>
      <div className={`absolute -left-12 -top-12 h-32 w-32 rounded-full opacity-20 blur-3xl ${config.accent}`} />

      <div className="relative z-10 flex flex-col items-center text-center gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">MACRO REGIME</p>

        {/* Score + Regime Label */}
        <div className="flex flex-col items-center gap-1">
          <div className={`font-mono font-extrabold text-[52px] leading-none tracking-[-0.03em] drop-shadow-lg ${config.color}`}>
            {score}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
            <span>/100 ·</span>
            <span className={`flex items-center gap-1 font-bold ${config.color}`}>
              {config.icon}
              {config.label}
            </span>
          </div>
        </div>

        {/* Role Badge */}
        <span className="rounded-full border border-slate-700 bg-slate-900/50 px-3 py-1 text-[10px] font-bold text-slate-300">
          공격성 조절 · 매일 장마감 갱신
        </span>

        {/* Gauge with threshold markers */}
        <div className="w-full">
          <div
            className="relative h-2 rounded-full bg-[var(--surface-soft)]"
            role="progressbar"
            aria-valuenow={score}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`매크로 레짐 점수 ${score}/100, 상태 ${config.label}`}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500 transition-all duration-1000"
              style={{ width: `${Math.min(score, 100)}%` }}
            />
            {/* Threshold markers */}
            <div className="absolute inset-y-[-3px] w-[1.5px] bg-white/30 rounded-full" style={{ left: '45%' }} />
            <div className="absolute inset-y-[-3px] w-[1.5px] bg-white/30 rounded-full" style={{ left: '70%' }} />
          </div>
          <div className="flex justify-between mt-1.5 text-[9px] text-[var(--text-tertiary)]">
            <span>Risk-OFF</span>
            <span>Neutral ≥45</span>
            <span>Risk-ON ≥70</span>
          </div>
        </div>

        {/* Regime Description */}
        <div className={`w-full rounded-xl border p-3 text-left ${config.bg} ${config.border}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <div className="[&>svg]:w-3.5 [&>svg]:h-3.5">{config.icon}</div>
            <span className={`text-[11px] font-bold ${config.color}`}>{config.label}</span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-300">{config.description}</p>
        </div>
      </div>

      {/* Breakdown Toggle */}
      <div className="relative z-10 mt-4">
        <button
          type="button"
          onClick={() => setShowBreakdown((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-left text-[11px] font-semibold text-slate-400 hover:bg-slate-900/60 transition-colors"
        >
          <span>컴포넌트 근거 보기</span>
          {showBreakdown ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {showBreakdown && (
          <div className="mt-3 space-y-0">
            {breakdown.map((item) => (
              <ComponentRow key={item.label} item={item} />
            ))}
          </div>
        )}
      </div>

      {/* Sparkline */}
      {history.length >= 2 && (
        <div className="relative z-10 w-full">
          <ScoreSparkline history={history} currentScore={score} />
        </div>
      )}

      {/* Timestamp */}
      <div className="relative z-10 mt-4 flex items-center justify-center gap-1.5 rounded-full border border-slate-800/80 bg-slate-900/40 px-3 py-1">
        <Globe className="h-3 w-3 text-slate-500" />
        <span className="text-[10px] font-bold uppercase tracking-tight text-slate-500">
          {updatedAt ? `기준 ${updatedAt}` : 'Yahoo Finance · 장마감 후 갱신'}
        </span>
      </div>
    </div>
  );
}
