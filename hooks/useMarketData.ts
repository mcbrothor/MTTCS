import { useState } from 'react';
import axios from 'axios';
import type { MarketAnalysisResponse } from '@/types';

interface MarketDataState {
  loading: boolean;
  error: string | null;
  analysis: MarketAnalysisResponse | null;
  lastSuccessfulAt: string | null;
}

export function useMarketData() {
  const [data, setData] = useState<MarketDataState>({
    loading: false,
    error: null,
    analysis: null,
    lastSuccessfulAt: null,
  });

  const fetchMarketData = async (
    ticker: string,
    exchange: string,
    totalEquity: number,
    riskPercent: number
  ) => {
    if (!ticker) return;

    setData((prev) => ({ ...prev, loading: true, error: null }));
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await axios.get('/api/market-data', {
        params: { ticker, exchange, totalEquity, riskPercent },
        signal: controller.signal,
      });

      setData({
        loading: false,
        error: null,
        analysis: response.data.data || response.data,
        lastSuccessfulAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const message = axios.isAxiosError(err)
        ? err.code === 'ERR_CANCELED'
          ? 'TIMEOUT: 10 seconds elapsed while loading market data.'
          : err.response?.data?.message || err.response?.data?.error || err.message
        : err instanceof Error
          ? err.message
          : 'Failed to load market data.';
      setData((prev) => ({
        ...prev,
        loading: false,
        error: message,
      }));
    } finally {
      window.clearTimeout(timer);
    }
  };

  const reset = () => setData((prev) => ({ loading: false, error: null, analysis: null, lastSuccessfulAt: prev.lastSuccessfulAt }));

  return { ...data, fetchMarketData, reset };
}
