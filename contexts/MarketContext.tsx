'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { MasterFilterResponse, MasterFilterMetricDetail } from '@/types';

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

/**
 * 기본 지표 메타데이터 생성기 (에러/기본값용)
 */
const createEmptyMetric = (label: string, threshold: string | number, unit: string): MasterFilterMetricDetail => ({
  label,
  value: 'N/A',
  threshold,
  status: 'FAIL',
  unit,
  description: '데이터를 불러올 수 없습니다.',
  source: 'System Fallback'
});

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<MasterFilterResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [bypassRisk, setBypassRisk] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function fetchMarketData() {
      try {
        const response = await fetch('/api/master-filter');
        if (!response.ok) throw new Error('마스터 필터 데이터를 불러오지 못했습니다.');
        const result = await response.json();
        if (mounted) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error('알 수 없는 오류'));
          // 에러 시 방어적으로 설정 (YELLOW 수준의 제어 및 새 타입 구조 적용)
          setData({
            state: 'YELLOW',
            metrics: {
              trend: createEmptyMetric('Trend Alignment', 200, 'pts'),
              breadth: createEmptyMetric('Market Breadth', 50, '%'),
              liquidity: createEmptyMetric('Institutional Liquidity', 4, 'days'),
              volatility: createEmptyMetric('Volatility (VIX)', 20, 'pts'),
              leadership: createEmptyMetric('Major Leadership', 'Focused', 'state'),
              score: 2,
              updatedAt: new Date().toISOString()
            },
            insightLog: '서버 접속이 불안정하거나 시세 제공업체의 응답이 지연되고 있습니다. 안전을 위해 신규 진입을 자제하십시오.',
            isAiGenerated: false
          });
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    fetchMarketData();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <MarketContext.Provider value={{ data, isLoading, error, bypassRisk, setBypassRisk }}>
      {children}
    </MarketContext.Provider>
  );
}

export function useMarket() {
  return useContext(MarketContext);
}
