'use client';

import { startTransition, useEffect, useState } from 'react';

interface StripQuote {
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  source?: string;
}

interface MacroStripResponse {
  data?: Record<string, StripQuote>;
}

const STRIP_ITEMS = [
  { symbol: '^GSPC', label: 'S&P500', digits: 2 },
  { symbol: '^IXIC', label: 'NASDAQ', digits: 2 },
  { symbol: '^KS11', label: 'KOSPI', digits: 2 },
  { symbol: '^KQ11', label: 'KOSDAQ', digits: 2 },
  { symbol: 'KRW=X', label: 'USD/KRW', digits: 2 },
] as const;

function formatPrice(value?: number, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatChange(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export default function MarketStrip() {
  const [quotes, setQuotes] = useState<Record<string, StripQuote>>({});
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const idleId = window.setTimeout(() => setEnabled(true), 2500);
    return () => window.clearTimeout(idleId);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let mounted = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let currentController: AbortController | null = null;

    const load = async () => {
      currentController?.abort();
      currentController = new AbortController();
      try {
        const response = await fetch('/api/macro', {
          cache: 'no-store',
          signal: currentController.signal,
        });
        if (!response.ok) return;

        const json = (await response.json()) as MacroStripResponse & { asOf?: string };
        if (!mounted || !json.data) return;

        startTransition(() => {
          setQuotes(json.data ?? {});
          if (json.asOf) {
            const d = new Date(json.asOf);
            const dateStr = d.toLocaleDateString('ko-KR', { 
              year: 'numeric', 
              month: '2-digit', 
              day: '2-digit' 
            }).replace(/\s/g, '').replace(/\.$/, '.');
            const timeStr = d.toLocaleTimeString('ko-KR', { 
              hour12: false, 
              hour: '2-digit', 
              minute: '2-digit', 
              second: '2-digit' 
            });
            setUpdatedAt(`${dateStr} ${timeStr}`);
          }
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void load();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    void load();
    // 업데이트 주기를 1시간(3,600,000ms)으로 변경
    intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 3_600_000);

    return () => {
      mounted = false;
      if (intervalId) clearInterval(intervalId);
      currentController?.abort();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled]);

  return (
    <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
      {STRIP_ITEMS.map((item) => {
        const quote = quotes[item.symbol];
        const change = quote?.regularMarketChangePercent ?? null;
        const tone = change === null
          ? 'border-[var(--border)] text-[var(--text-secondary)]'
          : change >= 0
            ? 'border-emerald-400/20 bg-emerald-500/8 text-emerald-200'
            : 'border-rose-400/20 bg-rose-500/8 text-rose-200';

        return (
          <div
            key={item.symbol}
            className={`flex min-w-[108px] shrink-0 flex-col rounded-2xl border px-3 py-2 ${tone} relative`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
              {item.label}
            </span>
            <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">
              {formatPrice(quote?.regularMarketPrice, item.digits)}
            </span>
            <div className="flex justify-between items-center mt-0.5">
              <span className="font-mono text-[11px] font-medium">
                {formatChange(quote?.regularMarketChangePercent)}
              </span>
              <span className="text-[8px] font-bold tracking-wider text-[var(--text-tertiary)] uppercase opacity-70">
                {quote?.source || (item.symbol === 'KRW=X' ? 'Yahoo' : 'KIS')}
              </span>
            </div>
          </div>
        );
      })}
      
      {updatedAt && (
        <div className="ml-auto shrink-0 flex items-center pr-2 text-[10px] text-[var(--text-tertiary)] font-mono">
          Last Updated: {updatedAt}
        </div>
      )}
    </div>
  );
}
