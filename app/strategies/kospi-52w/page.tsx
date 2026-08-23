'use client';
import { useEffect, useState } from 'react';
import StrategyShell, { type ShellRankRow, type ShellSignalCard } from '@/components/strategy/StrategyShell';

interface RankItem { ticker: string; name: string; rs: number; rank: number }
interface Candidate { ticker: string; name: string; rs: number; isNewHigh: boolean; ma10: number | null; close: number }
interface Signal { date: string; buyTickers: string[]; sellTickers: string[]; holdTickers: string[]; cashSlots: number; rsRank: RankItem[] }
interface ApiResponse { signal: Signal; candidates: Candidate[] }

const MAX_HOLDINGS = 4;

function toNameMap(data: ApiResponse) {
  const map = new Map<string, string>();
  for (const c of data.candidates || []) map.set(c.ticker, c.name);
  for (const r of data.signal?.rsRank || []) if (!map.has(r.ticker)) map.set(r.ticker, r.name);
  return map;
}

function toItems(tickers: string[], map: Map<string, string>) {
  return tickers.map((ticker) => ({ ticker, name: map.get(ticker) }));
}

export default function Kospi52wPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/strategies/kospi-52w').then(async r => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || 'fetch failed');
      setData(j.data);
    }).catch(e => setErr(e.message));
  }, []);

  const map = data ? toNameMap(data) : new Map<string, string>();
  const signal = data?.signal;
  const signals: ShellSignalCard[] = [
    { tone: 'buy', title: '매수 (신고가 돌파)', hint: 'RS Top12 ∩ 52주 신고가 · 당일 종가 진입', items: toItems(signal?.buyTickers || [], map), emptyText: '조건 충족 종목 없음 — 빈 슬롯은 현금' },
    { tone: 'sell', title: '매도 (MA10 이탈)', hint: '종가가 MA10 아래 마감 시', items: toItems(signal?.sellTickers || [], map), emptyText: '추세 유지 — 매도 없음' },
    { tone: 'hold', title: '보유 (drift)', hint: '비중 재조정 없이 추세 추종', items: toItems(signal?.holdTickers || [], map), emptyText: '보유 중인 종목 없음' },
    { tone: 'watch', title: '재진입 대기', hint: 'RS Top12 + 신고가 재충족 시 재매수', items: [], emptyText: '재진입 후보 없음' },
  ];
  const cashUsed = signal ? MAX_HOLDINGS - signal.cashSlots : undefined;
  const ranks: ShellRankRow[] = (signal?.rsRank || []).map((r) => ({
    rank: r.rank,
    ticker: r.ticker,
    name: r.name,
    rs: r.rs,
    isNewHigh: data?.candidates?.find((c) => c.ticker === r.ticker)?.isNewHigh ?? false,
  }));

  return (
    <StrategyShell
      title="KOSPI 52주 신고가 전략"
      source="코스피 52주_신고가_전략_핵심과_깨달음.xlsx"
      modelVersion="kospi-52w-2026.08-v1"
      asOf={signal?.date ?? null}
      description="RS Top12 ∩ 52주 신고가 → 최대 4종목 × 25% → MA10 이탈 매도. 잘 가는 종목의 비중을 억지로 줄이지 않고(drift), 조건이 재충족되면 다시 탑승합니다."
      loading={!data && !err}
      error={err}
      signals={signals}
      cashUsed={cashUsed}
      cashTotal={MAX_HOLDINGS}
      cashInterpretation={cashUsed === 0
        ? '보유 슬롯 0/4 — 신고가 신호 부재 자체가 시장 약세 신호일 수 있습니다. 억지로 채우지 않습니다.'
        : '신호 수에 따라 현금이 자동으로 늘어나는 구조 — 현금은 투자 실패가 아니라 리스크 조절 포지션입니다.'}
      ranks={ranks}
      rankHeader="RS Top12 랭킹"
      footerNote="엔진 lib/strategy/kospi-52w/engine.ts · 비용 편도 0.10% · 신호일 종가 진입, 익일부터 수익 반영으로 미래정보 차단"
    />
  );
}
