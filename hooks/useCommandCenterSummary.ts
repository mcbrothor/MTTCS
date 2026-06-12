'use client';

import { useEffect, useMemo, useState } from 'react';
import type { MacroRegime, MasterFilterResponse, MarketState, Trade, WatchlistItem } from '@/types';

export interface CommandCenterSummary {
  marketState: MarketState | null;
  macroRegime: MacroRegime | null;
  activeRisk: number;
  plannedCount: number;
  recentCandidates: WatchlistItem[];
  recentTrades: Trade[];
  nextAction: {
    href: string;
    label: string;
    reason: string;
  };
  loading: boolean;
  error: string | null;
  updatedAt: string | null;
}

const initialSummary: CommandCenterSummary = {
  marketState: null,
  macroRegime: null,
  activeRisk: 0,
  plannedCount: 0,
  recentCandidates: [],
  recentTrades: [],
  nextAction: {
    href: '/master-filter',
    label: '오늘 시장 신호판 확인',
    reason: '오늘 신규 진입이 가능한지 먼저 확인합니다.',
  },
  loading: true,
  error: null,
  updatedAt: null,
};

function isKoreanTicker(ticker: string) {
  return /^\d{6}$/.test(ticker);
}

function filterByMarket<T extends { ticker: string }>(items: T[], market: 'US' | 'KR') {
  return items.filter((item) => (market === 'KR' ? isKoreanTicker(item.ticker) : !isKoreanTicker(item.ticker)));
}

function chooseNextAction(params: {
  marketState: MarketState | null;
  plannedCount: number;
  activeRisk: number;
  candidateCount: number;
}) {
  if (params.marketState === 'RED') {
    return {
      href: '/portfolio',
      label: '포지션 리스크 점검',
      reason: '시장 방어 구간입니다. 신규 진입보다 기존 노출 관리가 우선입니다.',
    };
  }
  if (params.plannedCount > 0) {
    return {
      href: '/portfolio',
      label: '계획 대기 포지션 확인',
      reason: '저장된 매매 계획을 실제 포지션 관리 흐름으로 이어갑니다.',
    };
  }
  if (params.candidateCount > 0) {
    return {
      href: '/watchlist',
      label: '관심 후보 점검',
      reason: '이미 추적 중인 후보에서 오늘 실행 가능한 종목을 고릅니다.',
    };
  }
  if (params.marketState === 'GREEN' || params.marketState === 'YELLOW') {
    return {
      href: '/scanner',
      label: '종목 발굴 시작',
      reason: '시장 상태를 바탕으로 신규 후보를 탐색합니다.',
    };
  }
  return {
    href: '/master-filter',
    label: '오늘 시장 신호판 확인',
    reason: '진입 가능 신호와 큰 흐름을 먼저 확정합니다.',
  };
}

async function parseOptionalJson<T>(response: Response, fallback: T) {
  if (response.ok) return (await response.json()) as T;
  if (response.status === 401) {
    throw new Error('로그인이 필요합니다. MTN에 로그인한 뒤 Command Center를 다시 확인해 주세요.');
  }
  return fallback;
}

export function useCommandCenterSummary(market: 'US' | 'KR' = 'US') {
  const [summary, setSummary] = useState<CommandCenterSummary>(initialSummary);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);

    async function loadSummary() {
      setSummary((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const [masterFilterResponse, macroResponse, tradesResponse, watchlistResponse] = await Promise.all([
          fetch(`/api/master-filter?market=${market}`, { signal: controller.signal }),
          fetch('/api/macro', { signal: controller.signal }),
          fetch(`/api/trades?market=${market}&includeLivePrices=false&limit=40`, { signal: controller.signal }),
          fetch('/api/watchlist', { signal: controller.signal }),
        ]);

        const masterFilter = await parseOptionalJson<MasterFilterResponse | null>(masterFilterResponse, null);
        const macro = await parseOptionalJson<{ regime?: MacroRegime } | null>(macroResponse, null);
        const tradesJson = await parseOptionalJson<{ data?: Trade[] }>(tradesResponse, { data: [] });
        const watchlistJson = await parseOptionalJson<{ data?: WatchlistItem[] }>(watchlistResponse, { data: [] });

        const trades = tradesJson.data ?? [];
        const activeTrades = trades.filter((trade) => trade.status === 'ACTIVE');
        const plannedTrades = trades.filter((trade) => trade.status === 'PLANNED');
        const candidates = filterByMarket(watchlistJson.data ?? [], market).slice(0, 5);
        const activeRisk = activeTrades.reduce((sum, trade) => sum + (trade.metrics?.openRisk || trade.planned_risk || 0), 0);
        const marketState = masterFilter?.state ?? null;
        const nextAction = chooseNextAction({
          marketState,
          plannedCount: plannedTrades.length,
          activeRisk,
          candidateCount: candidates.length,
        });

        if (!mounted) return;
        setSummary({
          marketState,
          macroRegime: macro?.regime ?? null,
          activeRisk,
          plannedCount: plannedTrades.length,
          recentCandidates: candidates,
          recentTrades: trades.slice(0, 6),
          nextAction,
          loading: false,
          error: null,
          updatedAt: masterFilter?.metrics?.updatedAt ?? masterFilter?.metrics?.meta?.asOf ?? new Date().toISOString(),
        });
      } catch (err: unknown) {
        if (!mounted) return;
        const message = err instanceof DOMException && err.name === 'AbortError'
          ? 'Command Center 데이터를 불러오는 시간이 초과되었습니다.'
          : err instanceof Error
            ? err.message
            : 'Command Center 데이터를 불러오지 못했습니다.';
        setSummary((prev) => ({ ...prev, loading: false, error: message }));
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void loadSummary();

    return () => {
      mounted = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [market]);

  return useMemo(() => summary, [summary]);
}
