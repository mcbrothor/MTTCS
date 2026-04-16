'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { MasterFilterMetricDetail, MasterFilterResponse } from '@/types';

interface MarketContextValue {
  data: MasterFilterResponse | null;
  isLoading: boolean;
  error: Error | null;
  bypassRisk: boolean;
  setBypassRisk: (value: boolean) => void;
}

const MarketContext = createContext<MarketContextValue>({
  data: null,
  isLoading: true,
  error: null,
  bypassRisk: false,
  setBypassRisk: () => {},
});

const createEmptyMetric = (label: string, threshold: string | number, unit: string): MasterFilterMetricDetail => ({
  label,
  value: 'N/A',
  threshold,
  status: 'FAIL',
  unit,
  description: '데이터를 불러오지 못했습니다.',
  source: 'System Fallback',
});

function fallbackMarketData(): MasterFilterResponse {
  const updatedAt = new Date().toISOString();
  return {
    state: 'YELLOW',
    metrics: {
      trend: createEmptyMetric('Trend Alignment', 200, 'pts'),
      breadth: createEmptyMetric('Market Breadth', 50, '%'),
      liquidity: createEmptyMetric('Distribution Days', 5, 'days'),
      volatility: createEmptyMetric('Volatility (VIX)', 20, 'pts'),
      leadership: createEmptyMetric('Sector Leadership', 'Risk-on', 'state'),
      score: 2,
      p3Score: 50,
      updatedAt,
    },
    insightLog: '마스터 필터 데이터를 불러오지 못했습니다. 안전을 위해 신규 진입을 보수적으로 판단하세요.',
    isAiGenerated: false,
  };
}

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<MasterFilterResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [bypassRisk, setBypassRisk] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    let mounted = true;

    async function fetchMarketData() {
      try {
        const response = await fetch('/api/master-filter', { signal: controller.signal });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.message || '마스터 필터 데이터를 불러오지 못했습니다.');
        }
        const result = (await response.json()) as MasterFilterResponse;
        if (mounted) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          const message = err instanceof DOMException && err.name === 'AbortError' ? '마스터 필터 요청 시간이 초과되었습니다.' : '알 수 없는 오류';
          setError(err instanceof Error ? err : new Error(message));
          setData(fallbackMarketData());
        }
      } finally {
        window.clearTimeout(timeout);
        if (mounted) setIsLoading(false);
      }
    }

    fetchMarketData();

    return () => {
      mounted = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return <MarketContext.Provider value={{ data, isLoading, error, bypassRisk, setBypassRisk }}>{children}</MarketContext.Provider>;
}

export function useMarket() {
  return useContext(MarketContext);
}
