'use client';

import { startTransition, useEffect, useState } from 'react';

interface StripQuote {
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
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

  useEffect(() => {
    let mounted = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      try {
        const response = await fetch('/api/macro', { cache: 'no-store' });
        if (!response.ok) return;

        const json = (await response.json()) as MacroStripResponse;
        if (!mounted || !json.data) return;

        startTransition(() => {
          setQuotes(json.data ?? {});
        });
      } catch {
        // Ignore transient market-strip failures and keep the last good snapshot.
      }
    };

    void load();
    intervalId = setInterval(() => {
      void load();
    }, 15_000);

    return () => {
      mounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
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
            className={`flex min-w-[102px] shrink-0 flex-col rounded-2xl border px-3 py-2 ${tone}`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
              {item.label}
            </span>
            <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">
              {formatPrice(quote?.regularMarketPrice, item.digits)}
            </span>
            <span className="font-mono text-[11px] font-medium">
              {formatChange(quote?.regularMarketChangePercent)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
