'use client';

import { useEffect, useState } from 'react';
import StrategyShell, { type ShellSignalCard } from '@/components/strategy/StrategyShell';

interface ActionItem { ticker: string; name: string }
interface RankingItem extends ActionItem {
  rank: number;
  score: number;
  eligible: boolean;
  relativeMomentum6: number | null;
}
interface PortfolioItem extends ActionItem {
  targetWeightPct: number;
  score: number;
}
interface MonthlyStrategyResponse {
  modelVersion: string;
  modelStatus: string;
  status: 'FINAL' | 'PROVISIONAL' | 'BLOCKED';
  signalAt: string | null;
  effectiveAt: string | null;
  latestObservationAt: string | null;
  breadth: number | null;
  drawdownPct: number | null;
  averageRelativeMomentum: number | null;
  cashWeightPct: number;
  quality: { status: 'FULL' | 'BLOCKED'; requested: number; available: number; coverage: number; warnings: string[] };
  regime: { regime: string; rawRegime: string; hysteresisApplied: boolean; weight: number } | null;
  portfolio: PortfolioItem[];
  rankings: RankingItem[];
  actions: { buy: ActionItem[]; hold: ActionItem[]; sell: ActionItem[]; watch: ActionItem[] };
}

const REGIME_LABELS: Record<string, string> = {
  BROAD_TREND: '광범위 추세',
  TREND: '추세',
  NON_TREND: '비추세',
  RECOVERY: '회복',
  CRASH_100: '깊은 약세 3단계',
  CRASH_75: '깊은 약세 2단계',
  CRASH_50: '깊은 약세 1단계',
  CASH: '현금 대기',
};

export interface MonthlyStrategyPageProps {
  endpoint: string;
  title: string;
  source: string;
  fallbackModelVersion: string;
  description: string;
  marketLabel: string;
}

export default function MonthlyStrategyPage(props: MonthlyStrategyPageProps) {
  const [data, setData] = useState<MonthlyStrategyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(props.endpoint)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || '전략 데이터를 불러오지 못했습니다.');
        setData(body.data);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, [props.endpoint]);

  const signals: ShellSignalCard[] = data ? [
    { tone: 'buy', title: '신규 편입', hint: 'Top3 진입', items: data.actions.buy, emptyText: '신규 편입 없음' },
    { tone: 'hold', title: '유지', hint: '기존 Top5 완충', items: data.actions.hold, emptyText: '유지 종목 없음' },
    { tone: 'sell', title: '제외', hint: 'Top5 이탈 또는 필터 미달', items: data.actions.sell, emptyText: '제외 종목 없음' },
    { tone: 'watch', title: '후보', hint: '차순위 적격 업종', items: data.actions.watch, emptyText: '대기 후보 없음' },
  ] : [];
  const targetByTicker = new Map((data?.portfolio || []).map((target) => [target.ticker, target]));

  return (
    <StrategyShell
      title={props.title}
      source={props.source}
      modelVersion={data?.modelVersion || props.fallbackModelVersion}
      statusBadge={`${data?.modelStatus || 'RESEARCH_ONLY'}${data?.status ? ` · ${data.status}` : ''}`}
      asOf={data?.signalAt ?? null}
      description={props.description}
      loading={!data && !error}
      error={error}
      signals={signals}
      cashUsed={data ? 100 - data.cashWeightPct : undefined}
      cashTotal={data ? 100 : undefined}
      cashInterpretation={data ? `목표 투자 ${Math.max(0, 100 - data.cashWeightPct).toFixed(0)}% · 목표 현금 ${data.cashWeightPct.toFixed(0)}%. 적격 업종이 3개 미만이면 빈 슬롯은 현금으로 유지합니다.` : undefined}
      ranks={(data?.rankings || []).slice(0, 8).map((row) => {
        const target = targetByTicker.get(row.ticker);
        return {
          rank: row.rank,
          ticker: row.ticker,
          name: row.name,
          rs: row.relativeMomentum6,
          extra: target ? `목표 ${target.targetWeightPct.toFixed(0)}% · 점수 ${row.score.toFixed(0)}` : row.eligible ? `적격 · 점수 ${row.score.toFixed(0)}` : '필터 제외',
        };
      })}
      rankHeader="복합 모멘텀 랭킹"
      hideRankMarker
      extraSection={data ? (
        <section className={`rounded-2xl border p-4 ${data.status === 'BLOCKED' ? 'border-rose-400/30 bg-rose-500/8' : 'border-[var(--border)] bg-[var(--surface-strong)]'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-[var(--text-primary)]">현재 판정</p>
            <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${data.status === 'FINAL' ? 'border-emerald-400/30 text-emerald-300' : 'border-rose-400/30 text-rose-300'}`}>
              {data.status}
            </span>
          </div>
          {data.regime ? (
            <>
              <p className="mt-2 text-sm font-semibold text-amber-300">{REGIME_LABELS[data.regime.regime] || data.regime.regime} · 목표 위험예산 {data.regime.weight.toFixed(0)}%</p>
              <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">
                Breadth {data.breadth?.toFixed(1) ?? '—'}% · {props.marketLabel} 고점 대비 {data.drawdownPct?.toFixed(1) ?? '—'}% · Top3 평균 6M RS {data.averageRelativeMomentum?.toFixed(1) ?? '—'}%p
                {data.regime.hysteresisApplied ? ' · 이탈 완충 적용' : ''}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm font-semibold text-rose-300">데이터 품질 기준 미달로 신규 신호를 차단했습니다.</p>
          )}
          <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">
            완료 월말 {data.signalAt || '—'} · 다음 종가 체결 {data.effectiveAt || '다음 거래일 대기'} · 최신 관측 {data.latestObservationAt || '—'}
          </p>
          <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">
            데이터 {data.quality.available}/{data.quality.requested} ({(data.quality.coverage * 100).toFixed(0)}%){data.quality.warnings.length ? ` · 경고 ${data.quality.warnings.length}건` : ''}
          </p>
        </section>
      ) : null}
      footerNote="월말 확정 신호만 사용 · 다음 거래일 종가 체결 · 체결 다음 세션부터 수익 반영 · 편도 비용 0.10% 검증 기준"
    />
  );
}
