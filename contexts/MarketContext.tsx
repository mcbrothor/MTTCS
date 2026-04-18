'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { DataSourceMeta, MasterFilterMetricDetail, MasterFilterResponse } from '@/types';

interface MarketContextValue {
  data: MasterFilterResponse | null;
  isLoading: boolean;
  error: Error | null;
  market: 'US' | 'KR';
  setMarket: (market: 'US' | 'KR') => void;
  bypassRisk: boolean;
  setBypassRisk: (value: boolean) => void;
}

const MarketContext = createContext<MarketContextValue>({
  data: null,
  isLoading: true,
  error: null,
  market: 'US',
  setMarket: () => {},
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

function fallbackMarketData(market: 'US' | 'KR'): MasterFilterResponse {
  const updatedAt = new Date().toISOString();
  const meta: DataSourceMeta = {
    asOf: updatedAt,
    source: 'System Fallback',
    provider: 'MTN',
    delay: 'UNKNOWN',
    fallbackUsed: true,
    warnings: ['Master filter data could not be loaded.'],
  };

  return {
    state: 'YELLOW',
    market,
    metrics: {
      trend: createEmptyMetric('Trend Alignment', 'PASS', ''),
      breadth: createEmptyMetric('Market Breadth', 'PASS', ''),
      liquidity: createEmptyMetric('Liquidity Flow', 'PASS', ''),
      volatility: createEmptyMetric('Volatility Regime', 'PASS', ''),
      leadership: createEmptyMetric('Leadership', 'PASS', ''),
      score: 0,
      meta,
      mainPrice: 0,
      ma50: 0,
      ma150: 0,
      ma200: 0,
      mainHistory: [],
      vixHistory: [],
      movingAverageHistory: [],
      sectorRows: [],
      ftdReason: '마스터 필터 API 응답이 없어 Follow-Through Day를 확인하지 못했습니다.',
      updatedAt,
    },
    insightLog: '마스터 필터 데이터를 불러오지 못했습니다. 안전을 위해 신규 진입은 보수적으로 판단하세요.',
    isAiGenerated: false,
    aiProviderUsed: 'rules',
    aiModelUsed: 'system-fallback',
    aiFallbackChain: [{ provider: 'rules', model: 'system-fallback', status: 'success' }],
    aiModelInsights: [{
      id: '99-rules-system-fallback',
      provider: 'rules',
      label: 'rules',
      model: 'system-fallback',
      status: 'success',
      text: '마스터 필터 데이터를 불러오지 못했습니다. 안전을 위해 신규 진입은 보수적으로 판단하세요.',
      selected: true,
      priority: 99,
      generatedAt: updatedAt,
    }],
    aiErrorSummary: '브라우저가 마스터 필터 API 응답을 받지 못해 로컬 fallback 데이터를 표시합니다.',
  };
}

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<MasterFilterResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [market, setMarket] = useState<'US' | 'KR'>('US');
  const [bypassRisk, setBypassRisk] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    let mounted = true;

    async function fetchMarketData() {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/master-filter?market=${market}`, { signal: controller.signal });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.message || '마스터 필터 데이터를 불러오지 못했습니다.');
        }
        const result = (await response.json()) as MasterFilterResponse;
        if (mounted) {
          setData({ ...result, market });
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          const message = err instanceof DOMException && err.name === 'AbortError' ? '마스터 필터 요청 시간이 초과되었습니다.' : '알 수 없는 오류';
          setError(err instanceof Error ? err : new Error(message));
          setData(fallbackMarketData(market));
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
  }, [market]);

  return (
    <MarketContext.Provider value={{ data, isLoading, error, market, setMarket, bypassRisk, setBypassRisk }}>
      {children}
    </MarketContext.Provider>
  );
}

export function useMarket() {
  return useContext(MarketContext);
}
