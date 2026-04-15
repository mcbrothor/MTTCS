'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { MasterFilterResponse } from '@/types';

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

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<MasterFilterResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [bypassRisk, setBypassRisk] = useState(false); // RED에서 모달 무시용

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
          // 에러 시 방어적으로 설정 (YELLOW 수준의 제어)
          setData({
            state: 'YELLOW',
            metrics: {
              trendState: 'NEUTRAL',
              trendDetails: '지표 조회 실패',
              breadthScore: 50,
              breadthDetails: '조회 실패',
              liquidityState: 'WARNING',
              distributionDays: 0,
              vixValue: null,
              vixState: 'ELEVATED',
              leadershipState: 'SCATTERED',
              updatedAt: new Date().toISOString()
            },
            insightLog: '서버 접속이 불안정하거나 시세 제공업체의 응답이 지연되고 있습니다. 안전을 위해 신규 진입을 자제하십시오.'
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
