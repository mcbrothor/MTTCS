'use client';

import { useEffect, useState } from 'react';
import type { InvestorFlowOscillatorSnapshot, LeadershipBreadthSnapshot, MarketSentimentSnapshot } from '@/types';

type Payload<T> = { data?: T; message?: string };

function Quality({ value }: { value: string }) {
  const tone = value === 'FULL' ? 'text-emerald-300' : value === 'BLOCKED' ? 'text-rose-300' : 'text-amber-300';
  return <span className={`font-mono text-[10px] font-bold ${tone}`}>{value}</span>;
}

export default function InvestmentManagementSignals({ market }: { market: 'US' | 'KR' }) {
  const [result, setResult] = useState<{
    market: 'US' | 'KR';
    breadth: LeadershipBreadthSnapshot | null;
    flow: InvestorFlowOscillatorSnapshot | null;
    sentiment: MarketSentimentSnapshot | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const requests: Promise<Response>[] = [fetch(`/api/market-breadth?market=${market}`, { signal: controller.signal })];
    if (market === 'KR') {
      requests.push(fetch('/api/investor-flow/oscillator', { signal: controller.signal }));
      requests.push(fetch('/api/market-sentiment', { signal: controller.signal }));
    }
    Promise.all(requests)
      .then(async (responses) => {
        const payloads = await Promise.all(responses.map((response) => response.json()));
        const failed = responses.findIndex((response) => !response.ok);
        if (failed >= 0) throw new Error(payloads[failed]?.message || '통합 신호를 불러오지 못했습니다.');
        setResult({
          market,
          breadth: (payloads[0] as Payload<LeadershipBreadthSnapshot>).data || null,
          flow: market === 'KR' ? (payloads[1] as Payload<InvestorFlowOscillatorSnapshot>).data || null : null,
          sentiment: market === 'KR' ? (payloads[2] as Payload<MarketSentimentSnapshot>).data || null : null,
          error: null,
        });
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
          setResult({ market, breadth: null, flow: null, sentiment: null, error: reason instanceof Error ? reason.message : '통합 신호 오류' });
        }
      });
    return () => controller.abort();
  }, [market]);

  if (!result || result.market !== market) return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-4 text-xs text-[var(--text-secondary)]">주도업종·수급·시장심리를 계산하고 있습니다.</div>;
  if (result.error) return <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-xs text-rose-200">{result.error}</div>;
  const { breadth, flow, sentiment } = result;

  return (
    <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-4 shadow-[var(--panel-shadow)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold tracking-[0.12em] text-violet-300">투자관리 통합 신호</p>
          <h3 className="mt-1 text-sm font-bold text-[var(--text-primary)]">확산 · 수급 · 심리</h3>
        </div>
        <span className="text-[10px] text-[var(--text-tertiary)]">자동주문 없음</span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <article className="rounded-lg border border-[var(--border)] bg-black/10 p-3">
          <div className="flex justify-between"><span className="text-xs text-[var(--text-secondary)]">주도업종 Breadth</span>{breadth && <Quality value={breadth.quality} />}</div>
          <p className="mt-2 font-mono text-xl font-bold text-white">{breadth?.score ?? '—'}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">{breadth?.state || '계산 불가'} · 피크아웃 {breadth?.peakout || '—'}</p>
        </article>
        {market === 'KR' ? (
          <>
            <article className="rounded-lg border border-[var(--border)] bg-black/10 p-3">
              <div className="flex justify-between"><span className="text-xs text-[var(--text-secondary)]">외국인·기관 수급</span>{flow && <Quality value={flow.quality} />}</div>
              <p className="mt-2 font-mono text-xl font-bold text-white">{flow?.score ?? '—'}</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{flow?.state || '계산 불가'} · {flow?.coveredStocks ?? 0}/{flow?.requestedStocks ?? 0}종목</p>
            </article>
            <article className="rounded-lg border border-[var(--border)] bg-black/10 p-3">
              <div className="flex justify-between"><span className="text-xs text-[var(--text-secondary)]">한국 Fear & Greed</span>{sentiment && <Quality value={sentiment.quality} />}</div>
              <p className="mt-2 font-mono text-xl font-bold text-white">{sentiment?.score ?? '—'}</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{sentiment?.label || '계산 차단'} · MACD {sentiment?.macd.direction || 'UNKNOWN'}</p>
            </article>
          </>
        ) : (
          <article className="rounded-lg border border-[var(--border)] bg-black/10 p-3 md:col-span-2">
            <p className="text-xs text-[var(--text-secondary)]">구성종목 확산이 약해지면서 지수만 고점에 남는 경우 피크아웃 경고를 냅니다.</p>
            <p className="mt-2 text-[11px] text-[var(--text-tertiary)]">20·60·200일선 상회 비율과 60일 양수익 종목 비율을 20·35·25·20%로 합성합니다.</p>
          </article>
        )}
      </div>
      {[...(breadth?.warnings || []), ...(flow?.warnings || []), ...(sentiment?.warnings || [])].length > 0 && (
        <p className="text-[11px] leading-5 text-amber-200">{[...(breadth?.warnings || []), ...(flow?.warnings || []), ...(sentiment?.warnings || [])].join(' · ')}</p>
      )}
    </section>
  );
}
