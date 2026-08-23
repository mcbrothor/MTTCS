'use client';
import { useEffect, useState } from 'react';

interface Signal { date: string; buyTickers: string[]; sellTickers: string[]; holdTickers: string[]; cashSlots: number; rsRank: { ticker: string; rs: number }[] }

export default function Kospi52wPage() {
  const [data, setData] = useState<{ signal: Signal; candidates: { ticker: string; rs: number; isNewHigh: boolean }[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/strategies/kospi-52w').then(async r => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || 'fetch failed');
      setData(j.data);
    }).catch(e => setErr(e.message));
  }, []);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-bold">KOSPI 52주 신고가 전략 (업종 ETF)</h1>
      <p className="text-sm text-slate-400">RS Top12 ∩ 52주 신고가 → 최대 4종목 × 25% → MA10 이탈 매도 · drift · 빈 슬롯 현금 (독립 전략탭 A안)</p>
      <div className="rounded-xl border border-slate-800 p-4 text-sm">
        <p className="font-semibold">오늘 신호 {data?.signal.date || '로딩 중'}</p>
        {err && <p className="text-rose-400">{err}</p>}
        {data && (
          <>
            <p className="mt-2">매수: {data.signal.buyTickers.join(', ') || '없음'} · 매도(MA10): {data.signal.sellTickers.join(', ') || '없음'} · 보유: {data.signal.holdTickers.join(', ') || '없음'} · 현금 슬롯: {data.signal.cashSlots}/4</p>
            <p className="mt-2 text-xs">RS Top12: {data.signal.rsRank.map(r => `${r.ticker}(${r.rs.toFixed(1)})`).join(' · ')}</p>
            <p className="mt-2 text-xs">후보 신고가: {data.candidates.filter(c=>c.isNewHigh).map(c=>c.ticker).join(', ') || '없음'}</p>
            <p className="mt-2 text-xs text-slate-500">엔진 lib/strategy/kospi-52w/engine.ts · 비용 0.10% · 신호일 종가 진입, 익일 수익반영으로 미래정보 차단</p>
          </>
        )}
      </div>
    </div>
  );
}
