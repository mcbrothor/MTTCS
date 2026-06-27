'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import LLMBriefing from '@/components/ui/LLMBriefing';
import RegimeHeroCard from '@/components/macro/RegimeHeroCard';
import DecisionBox from '@/components/master-filter/DecisionBox';
import { friendlyMacroRegimeLabel } from '@/lib/market-display';
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
  { sym: 'HYG',     label: 'HY Bond',    role: '하이일드 채권 · 위험자산 선호 신호' },
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
    positiveDesc: '위험자산 선호 · 하이일드 강세',
    negativeDesc: '안전자산 선호 · 국채 우위',
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
      ? '세계 자금 흐름이 주식 같은 위험자산에 우호적입니다'
      : regime === 'NEUTRAL'
        ? '큰 흐름 신호가 뚜렷하지 않은 애매한 구간입니다'
        : '세계 자금 흐름이 조심스러운 방어 구간입니다';

  const points: string[] = [];

  if (spyAbove50ma) {
    points.push(`S&P 500이 50일 이동평균 위에 위치해 단기 추세가 유지되고 있습니다`);
  } else {
    points.push(`S&P 500이 50일 이동평균 아래로 내려와 단기 추세가 훼손된 상태입니다`);
  }

  if (hygIefDiff > 0.2) {
    points.push(`하이일드 채권(HYG)이 국채(IEF)보다 ${Math.abs(hygIefDiff).toFixed(2)}%p 강해 위험자산 선호를 지지합니다`);
  } else if (hygIefDiff < -0.2) {
    points.push(`하이일드 채권(HYG)이 국채(IEF)보다 ${Math.abs(hygIefDiff).toFixed(2)}%p 약해 신용 시장 부담이 있습니다`);
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

function userFacingMacroError(message: string | null) {
  if (!message) return '큰 흐름 데이터를 불러오지 못했습니다.';
  const lower = message.toLowerCase();
  if (lower.includes('authentication') || lower.includes('unauthorized')) {
    return 'API 인증 필요 · 세션 또는 서버 인증 상태를 확인하세요.';
  }
  if (lower.includes('timeout') || lower.includes('aborted')) {
    return '데이터 요청 시간 초과 · 잠시 후 재시도하세요.';
  }
  return message;
}

export default function MacroPage() {
  const [macroData, setMacroData] = useState<MacroApiResponse | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [macroError, setMacroError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/macro').then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => null) })),
      fetch('/api/macro/history?days=7').then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => null) })),
    ])
      .then(([macro, hist]) => {
        if (macro.ok && macro.body?.score !== undefined) {
          setMacroData(macro.body);
        } else {
          setMacroData(null);
          setHasError(true);
          setMacroError(macro.body?.message || '큰 흐름 데이터를 채점하지 못했습니다.');
        }
        if (hist.ok && Array.isArray(hist.body?.data)) setHistory(hist.body.data);
      })
      .catch((err) => {
        setMacroData(null);
        setHasError(true);
        setMacroError(err instanceof Error ? err.message : '큰 흐름 데이터를 채점하지 못했습니다.');
      })
      .finally(() => setIsLoading(false));
  }, []);

  const score = macroData?.score ?? 0;
  const regime = macroData?.regime ?? 'NEUTRAL';
  const breakdown = macroData?.breakdown ?? [];
  const quotes = macroData?.data ?? {};

  const commentary = macroData
    ? getRegimeCommentary(score, regime, macroData.spyAbove50ma, macroData.hygIefDiff, macroData.vixLevel)
    : null;

  const isMacroScored = Boolean(macroData && !hasError);
  const nextStepText =
    !isMacroScored
      ? '시장 밖 위험 미확인 — 시장이 나쁘다는 뜻이 아닙니다. 데이터/API 상태를 먼저 정상화한 뒤 새 매수 비중을 판단하세요.'
      : score >= 70
      ? `시장 밖 위험 ${score}점 — ${friendlyMacroRegimeLabel(regime)}. 시장 내부 건강도가 좋으면 후보를 적극 검토하세요.`
      : score >= 45
        ? `시장 밖 위험 ${score}점 — ${friendlyMacroRegimeLabel(regime)}. 후보를 신중하게 검토하고 비중을 줄이세요.`
        : `시장 밖 위험 ${score}점 — ${friendlyMacroRegimeLabel(regime)}. 새 매수보다 현금 확보와 방어가 우선입니다.`;

  return (
    <div className="space-y-4 pb-12">
      <header className="border-b border-[var(--border)] pb-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-500">
          STEP 01 · 시장 분석 / 시장 밖 위험 점검
        </p>
        <h1 className="text-[20px] font-extrabold leading-[1.2] text-[var(--text-primary)]">
          시장 밖 위험 점검
        </h1>
        <p className="mt-2 hidden max-w-[620px] text-xs leading-[1.6] text-[var(--text-secondary)] sm:block">
          금리, 달러, 신용 시장, 시장 불안도처럼 큰 자금 흐름을 보고 권장 투자 비중을 조절합니다.
        </p>
      </header>

      <DecisionBox />

      <LLMBriefing regime={macroData?.regime ?? null} />

      {/* 위계 안내 배너 — 시장 밖 위험은 비중 조절용, 시장 내부 건강도가 우선 */}
      <div className="flex items-start gap-3 rounded-xl border border-sky-700/40 bg-sky-900/15 px-4 py-3">
        <AlertTriangle className="h-4 w-4 shrink-0 text-sky-400 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-sky-300 leading-relaxed">
          <strong className="text-sky-200">이 화면은 권장 투자 비중 조절용입니다.</strong>{' '}
          신규 진입 가능 여부는 반드시{' '}
          <Link href="/master-filter" className="underline underline-offset-2 hover:text-sky-100">
            오늘의 결론
          </Link>
          에서 먼저 확인하세요. 시장 내부 건강도가 좋지 않으면 시장 밖 위험 점수와 관계없이 새 매수는 보류합니다.
        </p>
      </div>

      {isLoading && (
        <div className="flex h-40 items-center justify-center rounded-lg border border-slate-800/50 bg-slate-900/50 backdrop-blur-md">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <p className="text-xs font-medium uppercase tracking-widest text-slate-500">시장 밖 위험 데이터 확인 중</p>
          </div>
        </div>
      )}

      {!isLoading && hasError && (
        <div role="alert" className="rounded-xl border border-sky-500/35 bg-sky-500/10 px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
            <div>
              <p className="text-sm font-bold text-sky-200">시장 밖 위험 데이터 확인 필요</p>
              <p className="mt-1 text-sm leading-6 text-sky-100/85">
                {userFacingMacroError(macroError)} 현재 0점 또는 나쁜 시장으로 해석하지 말고,
                API 인증과 데이터 소스가 정상화된 뒤 다시 판단하세요.
              </p>
              <div className="mt-3 grid gap-2 text-xs text-slate-300 md:grid-cols-3">
                <div className="rounded-lg border border-sky-500/20 bg-slate-950/35 p-3">
                  <p className="font-semibold text-sky-200">신용 시장</p>
                  <p className="mt-1 text-slate-400">HY OAS 또는 HYG/IEF 정상 수집 필요</p>
                </div>
                <div className="rounded-lg border border-sky-500/20 bg-slate-950/35 p-3">
                  <p className="font-semibold text-sky-200">금리/환율</p>
                  <p className="mt-1 text-slate-400">금리 커브, 달러, 원화 민감도 확인 필요</p>
                </div>
                <div className="rounded-lg border border-sky-500/20 bg-slate-950/35 p-3">
                  <p className="font-semibold text-sky-200">시장 불안도</p>
                  <p className="mt-1 text-slate-400">VIX 레벨과 term structure 확인 필요</p>
                </div>
              </div>
            </div>
          </div>
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
              <h3 className="mb-4 text-[13px] font-semibold text-[var(--text-primary)]">시장 밖 위험 운용 원칙</h3>
              <ul className="space-y-3 text-xs text-[var(--text-secondary)]">
                <li className="flex gap-2">
                  <span className="flex items-center gap-1 font-semibold text-emerald-300 shrink-0">
                    <TrendingUp className="h-3 w-3" /> 투자하기 좋은 흐름:
                  </span>
                  새 매수 비중을 높일 수 있습니다. 시장 내부 건강도가 좋을 때 후보를 적극 검토합니다.
                </li>
                <li className="flex gap-2">
                  <span className="flex items-center gap-1 font-semibold text-amber-300 shrink-0">
                    <Minus className="h-3 w-3" /> 애매한 흐름:
                  </span>
                  권장 비중을 줄입니다. 이미 보유 중인 종목은 손절선을 먼저 점검합니다.
                </li>
                <li className="flex gap-2">
                  <span className="flex items-center gap-1 font-semibold text-rose-300 shrink-0">
                    <TrendingDown className="h-3 w-3" /> 조심해야 할 흐름:
                  </span>
                  새 매수보다 현금 비중 확대와 포지션 정리가 우선입니다.
                </li>
              </ul>
            </div>
          </div>

          {/* Right Content */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            <div className="grid gap-3 md:grid-cols-4">
              {[
                ['신용 시장', 'HY OAS · HYG/IEF', '돈이 위험자산을 편하게 보는지'],
                ['금리/달러 부담', 'UUP · TLT · Curve', '달러와 금리가 시장에 주는 압박'],
                ['시장 불안도', 'VIX', '불안 심리와 급등 위험'],
                ['시장 참여 폭', 'QQQ/SPY · IWM/SPY', '성장주·소형주가 함께 움직이는지'],
              ].map(([title, metric, desc]) => (
                <div key={title} className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
                  <p className="text-[10px] font-bold uppercase text-slate-500">{title}</p>
                  <p className="mt-1 text-sm font-bold text-[var(--text-primary)]">{metric}</p>
                  <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">{desc}</p>
                </div>
              ))}
            </div>

            {/* Commentary Card */}
            {commentary && (
              <div className="rounded-[16px] border border-[var(--border)] bg-[var(--surface-strong)] p-5 shadow-[var(--panel-shadow)]">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">시장 밖 위험 해석</p>
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

      {/* Next Step CTA — 시장 밖 위험은 비중 조절용. 진입 결정은 오늘의 결론에서 */}
      {!isLoading && (
        <div className="flex items-center justify-between gap-4 rounded-[16px] border border-sky-700/30 bg-sky-900/10 px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-sky-400 mb-1">진입 결정</p>
            <p className="text-sm text-slate-300">{nextStepText}</p>
          </div>
          <Link
            href="/master-filter"
            className="flex items-center gap-1.5 shrink-0 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400"
          >
            오늘의 결론
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
