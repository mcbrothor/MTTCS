'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import MarketBanner from '@/components/ui/MarketBanner';
import RegimeHeroCard from '@/components/macro/RegimeHeroCard';
import type { MacroRegime, MacroScoreBreakdown } from '@/lib/macro/compute';

interface HistoryPoint {
  date: string;
  macroScore: number;
  regime: string;
}

interface MacroApiResponse {
  score: number;
  regime: MacroRegime;
  breakdown: MacroScoreBreakdown[];
  spyAbove50ma: boolean;
  hygIefDiff: number;
  vixLevel: number;
  asOf: string;
  data: Record<string, {
    symbol: string;
    regularMarketPrice: number;
    regularMarketChangePercent: number;
    fiftyDayAverage: number;
  }>;
}

const ASSET_CONFIG = [
  { sym: 'SPY',     label: 'S&P 500',   role: '대형주 추세 지표' },
  { sym: 'QQQ',     label: 'Nasdaq 100', role: '기술주 강도 지표' },
  { sym: 'HYG',     label: 'HY Bond',    role: '하이일드 채권 · Risk-ON 신호' },
  { sym: 'IEF',     label: '7-10Y UST',  role: '중기 국채 · 안전자산 흐름' },
  { sym: 'TLT',     label: '20Y+ UST',   role: '장기 국채 · 금리 방향' },
  { sym: 'GLD',     label: 'Gold',       role: '안전자산 수요 지표' },
  { sym: '^VIX',    label: 'VIX',        role: '공포지수 · 변동성 레벨' },
  { sym: 'BTC-USD', label: 'Bitcoin',    role: '위험선호 확장 지표' },
] as const;

const RATIO_CONFIG = [
  {
    label: 'QQQ / SPY',
    sub: '기술주 쏠림',
    symA: 'QQQ',
    symB: 'SPY',
    positiveDesc: '빅테크 주도 장세',
    negativeDesc: '대형주 분산 진행',
  },
  {
    label: 'HYG / IEF',
    sub: '크레딧 스프레드',
    symA: 'HYG',
    symB: 'IEF',
    positiveDesc: 'Risk-ON · 하이일드 강세',
    negativeDesc: 'Risk-OFF · 안전채권 선호',
  },
  {
    label: 'IWM / SPY',
    sub: '중소형 순환매',
    symA: 'IWM',
    symB: 'SPY',
    positiveDesc: '광범위 상승 · 소형주 참여',
    negativeDesc: '대형주 집중 · 폭 약화',
  },
] as const;

function getRegimeCommentary(score: number, regime: MacroRegime, spyAbove50ma: boolean, hygIefDiff: number, vixLevel: number) {
  const headline =
    regime === 'RISK_ON'
      ? '글로벌 자금 흐름이 위험자산으로 향하는 국면입니다'
      : regime === 'NEUTRAL'
        ? '매크로 신호가 혼재하는 경계 구간입니다'
        : '리스크 회피 심리가 우세한 방어적 국면입니다';

  const points: string[] = [];

  if (spyAbove50ma) {
    points.push(`S&P 500이 50일 이동평균 위에 위치해 단기 추세가 유지되고 있습니다`);
  } else {
    points.push(`S&P 500이 50일 이동평균 아래로 내려와 단기 추세가 훼손된 상태입니다`);
  }

  if (hygIefDiff > 0.2) {
    points.push(`하이일드 채권(HYG)이 국채(IEF) 대비 ${Math.abs(hygIefDiff).toFixed(2)}%p 강세로 신용 시장이 Risk-ON을 지지합니다`);
  } else if (hygIefDiff < -0.2) {
    points.push(`하이일드 채권(HYG)이 국채(IEF) 대비 ${Math.abs(hygIefDiff).toFixed(2)}%p 약세로 크레딧 스프레드 확대 우려가 있습니다`);
  } else {
    points.push(`하이일드 채권과 국채 간 상대강도 차이(${hygIefDiff > 0 ? '+' : ''}${hygIefDiff.toFixed(2)}%p)가 중립 수준입니다`);
  }

  if (vixLevel < 18) {
    points.push(`VIX ${vixLevel.toFixed(1)} — 공포지수가 낮아 시장 심리가 안정적입니다`);
  } else if (vixLevel < 25) {
    points.push(`VIX ${vixLevel.toFixed(1)} — 불확실성이 다소 높아 포지션 규모 조절이 필요합니다`);
  } else {
    points.push(`VIX ${vixLevel.toFixed(1)} — 공포지수 급등 상태로 신규 진입은 매우 신중해야 합니다`);
  }

  return { headline, points: points.slice(0, 3) };
}

export default function MacroPage() {
  const [macroData, setMacroData] = useState<MacroApiResponse | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/macro').then((r) => r.json()),
      fetch('/api/macro/history?days=7').then((r) => r.json()),
    ])
      .then(([macro, hist]) => {
        if (macro.score !== undefined) setMacroData(macro);
        else setHasError(true);
        if (Array.isArray(hist.data)) setHistory(hist.data);
      })
      .catch(() => setHasError(true))
      .finally(() => setIsLoading(false));
  }, []);

  const score = macroData?.score ?? 0;
  const regime = macroData?.regime ?? 'NEUTRAL';
  const breakdown = macroData?.breakdown ?? [];
  const quotes = macroData?.data ?? {};

  const commentary = macroData
    ? getRegimeCommentary(score, regime, macroData.spyAbove50ma, macroData.hygIefDiff, macroData.vixLevel)
    : null;

  const nextStepText =
    score >= 70
      ? `레짐 ${score}점 — RISK-ON 환경. 마스터 필터가 GREEN이면 공격적 후보를 탐색하세요.`
      : score >= 45
        ? `레짐 ${score}점 — 중립 국면. 신중하게 후보를 검토하고 비중을 줄이세요.`
        : `레짐 ${score}점 — RISK-OFF 환경. 신규 진입을 중단하고 현금을 확보하세요.`;

  return (
    <div className="space-y-6 pb-12">
      <header className="mb-6 border-b border-[var(--border)] pb-6">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-500">
          STEP 01 · 시장 분석 / 매크로
        </p>
        <h1 className="text-[22px] font-extrabold leading-[1.2] tracking-[-0.02em] text-[var(--text-primary)]">
          매크로 분석
        </h1>
        <p className="mt-2 max-w-[580px] text-xs leading-[1.6] text-[var(--text-secondary)]">
          글로벌 자금 흐름과 리스크 선호도를 6개 컴포넌트로 점수화합니다. 마스터 필터와 함께 확인해 진입 공격성을 조절하세요.
        </p>
      </header>

      <MarketBanner />

      {isLoading && (
        <div className="flex h-40 items-center justify-center rounded-lg border border-slate-800/50 bg-slate-900/50 backdrop-blur-md">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <p className="text-xs font-medium uppercase tracking-widest text-slate-500">매크로 데이터 동기화 중</p>
          </div>
        </div>
      )}

      {!isLoading && hasError && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
          <span>매크로 데이터를 불러오지 못했습니다. 잠시 후 새로고침하세요.</span>
        </div>
      )}

      {!isLoading && !hasError && (
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Left Sidebar: Regime Hero Card */}
          <div className="flex flex-col gap-6 lg:w-[320px] xl:w-[360px] shrink-0">
            <RegimeHeroCard
              score={score}
              regime={regime}
              breakdown={breakdown}
              history={history}
              asOf={macroData?.asOf ?? null}
            />

            {/* Run-of-play guide — mirrors master-filter's "운용 가이드라인" */}
            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface-strong)] p-6 shadow-[var(--panel-shadow)]">
              <h3 className="mb-4 text-[13px] font-semibold text-[var(--text-primary)]">매크로 운용 원칙</h3>
              <ul className="space-y-3 text-xs text-[var(--text-secondary)]">
                <li className="flex gap-2">
                  <span className="flex items-center gap-1 font-semibold text-emerald-300 shrink-0">
                    <TrendingUp className="h-3 w-3" /> RISK-ON:
                  </span>
                  진입 비중 최대화. 마스터 필터 GREEN 조건 충족 시 공격적 후보 탐색.
                </li>
                <li className="flex gap-2">
                  <span className="flex items-center gap-1 font-semibold text-amber-300 shrink-0">
                    <Minus className="h-3 w-3" /> NEUTRAL:
                  </span>
                  진입 비중 절반 이하. 이미 보유 중인 종목 손절선 점검 우선.
                </li>
                <li className="flex gap-2">
                  <span className="flex items-center gap-1 font-semibold text-rose-300 shrink-0">
                    <TrendingDown className="h-3 w-3" /> RISK-OFF:
                  </span>
                  신규 매수 중단. 현금 비중 확대 및 포지션 정리 우선.
                </li>
              </ul>
            </div>
          </div>

          {/* Right Content */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            {/* Commentary Card */}
            {commentary && (
              <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface-strong)] p-5 shadow-[var(--panel-shadow)]">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">매크로 해석</p>
                <p className="text-[13px] font-semibold text-[var(--text-primary)] mb-3">{commentary.headline}</p>
                <ul className="space-y-1.5">
                  {commentary.points.map((pt) => (
                    <li key={pt} className="flex gap-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500" />
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Asset Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {ASSET_CONFIG.map(({ sym, label, role }) => {
                const q = quotes[sym];
                if (!q) return null;
                const chg = q.regularMarketChangePercent;
                const isUp = chg >= 0;
                const above50ma = q.regularMarketPrice > q.fiftyDayAverage;

                return (
                  <div key={sym} className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-4 shadow-sm">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="font-mono text-[11px] font-bold text-[var(--text-secondary)]">{label}</span>
                      <span className={`font-mono text-[10px] font-bold ${isUp ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {isUp ? '+' : ''}{chg.toFixed(2)}%
                      </span>
                    </div>
                    <div className="font-mono font-bold text-[15px] text-[var(--text-primary)] mb-2">
                      {sym === '^VIX' ? q.regularMarketPrice.toFixed(2) : `$${q.regularMarketPrice.toFixed(2)}`}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <span className={`inline-block rounded-[4px] border px-1.5 py-0.5 text-[9px] font-medium ${
                        isUp ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/20 bg-rose-500/10 text-rose-300'
                      }`}>
                        {isUp ? '▲' : '▼'} {role}
                      </span>
                      {sym !== '^VIX' && sym !== 'BTC-USD' && (
                        <span className={`inline-block rounded-[4px] border px-1.5 py-0.5 text-[9px] font-medium ${
                          above50ma ? 'border-sky-500/20 bg-sky-500/10 text-sky-300' : 'border-slate-600/40 bg-slate-800/50 text-slate-400'
                        }`}>
                          50MA {above50ma ? '위' : '아래'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Ratio Cards */}
            <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface-strong)] p-4 shadow-[var(--panel-shadow)]">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">상대강도 비교</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {RATIO_CONFIG.map(({ label, sub, symA, symB, positiveDesc, negativeDesc }) => {
                  const a = quotes[symA];
                  const b = quotes[symB];
                  if (!a || !b) return null;
                  const diff = a.regularMarketChangePercent - b.regularMarketChangePercent;
                  const isPositive = diff >= 0;
                  const borderColor = isPositive ? 'border-emerald-500/20' : 'border-amber-500/20';
                  const textColor = isPositive ? 'text-emerald-400' : 'text-amber-400';

                  return (
                    <div key={label} className={`rounded-xl border ${borderColor} bg-[var(--surface-soft)] p-3`}>
                      <div className="flex justify-between mb-1">
                        <span className={`text-[11px] font-bold ${textColor}`}>{label}</span>
                        <span className="text-[10px] text-[var(--text-tertiary)]">{sub}</span>
                      </div>
                      <div className="font-mono text-[10px] text-[var(--text-secondary)] mb-1">
                        {symA} {a.regularMarketChangePercent >= 0 ? '+' : ''}{a.regularMarketChangePercent.toFixed(2)}%
                        {' vs '}
                        {symB} {b.regularMarketChangePercent >= 0 ? '+' : ''}{b.regularMarketChangePercent.toFixed(2)}%
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                        <span className={isPositive ? 'text-emerald-400' : 'text-amber-400'}>
                          {isPositive ? '▲' : '▼'}
                        </span>
                        {isPositive ? positiveDesc : negativeDesc}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Next Step CTA */}
      {!isLoading && (
        <div className="flex items-center justify-between gap-4 rounded-[16px] border border-sky-700/30 bg-sky-900/10 px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-sky-400 mb-1">다음 단계</p>
            <p className="text-sm text-slate-300">{nextStepText}</p>
          </div>
          <Link
            href="/scanner"
            className="flex items-center gap-1.5 shrink-0 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400"
          >
            종목 발굴
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
