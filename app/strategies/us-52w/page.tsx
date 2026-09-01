'use client';
import { useEffect, useState } from 'react';
import StrategyShell, { type ShellRankRow, type ShellSignalCard } from '@/components/strategy/StrategyShell';

interface RankItem { ticker: string; name: string; rs: number }
interface Candidate { ticker: string; name: string; rs: number; isNewHigh: boolean; distanceToHighPct: number }
interface Signal { date: string; buyTickers: string[]; sellTickers: string[]; holdTickers: string[]; watchTickers: string[]; cashSlots: number; rsRank: RankItem[] }
interface ApiResponse { asOf: string; signal: Signal; candidates: Candidate[] }

const MAX_HOLDINGS = 4;

export default function Us52wPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/strategies/us-52w').then(async r => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || 'fetch failed');
      setData(j.data);
    }).catch(e => setErr(e.message));
  }, []);

  const map = new Map<string, string>();
  for (const c of data?.candidates || []) map.set(c.ticker, c.name);
  for (const r of data?.signal?.rsRank || []) if (!map.has(r.ticker)) map.set(r.ticker, r.name);
  const toItems = (tickers: string[]) => tickers.map((ticker) => ({ ticker, name: map.get(ticker) }));
  const signal = data?.signal;
  const signals: ShellSignalCard[] = [
    { tone: 'buy', title: '매수 (신고가 돌파)', hint: 'RS Top20 ∩ 52주 신고가 · 돌파 당일 진입', items: toItems(signal?.buyTickers || []), emptyText: '조건 충족 ETF 없음 — 빈 슬롯은 현금' },
    { tone: 'sell', title: '매도 (MA10 이탈)', hint: 'MA5보다 휩쏘가 적은 MA10 채택', items: toItems(signal?.sellTickers || []), emptyText: '추세 유지 — 매도 없음' },
    { tone: 'hold', title: '보유 (drift)', hint: '고정 익절 없이 MA10까지 추세 추종', items: toItems(signal?.holdTickers || []), emptyText: '보유 중인 ETF 없음' },
    { tone: 'watch', title: 'WATCH (돌파 임박)', hint: '52주 고점 대비 -1~-5% 사전 감시', items: toItems(signal?.watchTickers || []), emptyText: '돌파 임박 후보 없음' },
  ];
  const cashUsed = signal ? MAX_HOLDINGS - signal.cashSlots : undefined;
  const ranks: ShellRankRow[] = (signal?.rsRank || []).map((r, index) => {
    const candidate = data?.candidates?.find((c) => c.ticker === r.ticker);
    return {
      rank: index + 1,
      ticker: r.ticker,
      name: r.name,
      rs: r.rs,
      isNewHigh: candidate?.isNewHigh ?? false,
      extra: candidate ? `고점 ${candidate.distanceToHighPct.toFixed(1)}%` : null,
    };
  });

  return (
    <StrategyShell
      title="US 52주 신고가 전략 (업종·테마 ETF 50)"
      source="미국 52주_신고가_전략_백테스트_깨달음.xlsx"
      modelVersion="us-52w-2026.08-v1"
      asOf={data?.asOf ?? signal?.date ?? null}
      description="6M SPY 대비 RS Top20 ∩ 52주 신고가 돌파 → 최대 4종목 × 25% → MA10 이탈 매도. 하루 지연 진입은 손익비를 악화시키므로 돌파 시점 진입이 원칙입니다."
      loading={!data && !err}
      error={err}
      signals={signals}
      cashUsed={cashUsed}
      cashTotal={MAX_HOLDINGS}
      cashInterpretation="조건 충족 종목이 적으면 현금이 자동으로 늘어나는 구조 — 신호 부재 자체가 시장 강도 약화 신호입니다."
      ranks={ranks}
      rankHeader="RS Top20 랭킹"
      footerNote="엔진 lib/strategy/us-52w/engine.ts · 유사 ETF 그룹 중복 편입 제한 적용"
    />
  );
}
