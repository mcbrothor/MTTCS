import { useState } from 'react';
import axios from 'axios';
import type { MarketAnalysisResponse } from '@/types';

interface MarketDataState {
  loading: boolean;
  error: string | null;
  analysis: MarketAnalysisResponse | null;
}

export function useMarketData() {
  const [data, setData] = useState<MarketDataState>({
    loading: false,
    error: null,
    analysis: null,
  });

  const fetchMarketData = async (ticker: string, exchange: string, totalEquity: number) => {
    if (!ticker) return;

    setData((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await axios.get('/api/market-data', {
        params: { ticker, exchange, totalEquity },
      });

      setData({
        loading: false,
        error: null,
        analysis: response.data,
      });
    } catch (err: unknown) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.message || err.response?.data?.error || err.message
        : err instanceof Error
          ? err.message
          : '시장 데이터를 불러오지 못했습니다.';
      setData((prev) => ({
        ...prev,
        loading: false,
        error: message,
      }));
    }
  };

  const reset = () => setData({ loading: false, error: null, analysis: null });

  return { ...data, fetchMarketData, reset };
}
