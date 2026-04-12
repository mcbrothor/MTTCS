import axios from 'axios';
import type { OHLCData } from '@/types';

export async function getYahooDailyPrice(ticker: string): Promise<OHLCData[]> {
  const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`, {
    params: {
      range: '2y',
      interval: '1d',
      includePrePost: false,
      events: 'history',
    },
    headers: {
      'user-agent': 'MTTCS/3.0',
    },
  });

  const result = response.data?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0];

  if (!result || !quote || timestamps.length === 0) {
    throw new Error('Yahoo Finance에서 가격 데이터를 찾을 수 없습니다.');
  }

  return timestamps
    .map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      open: Number(quote.open?.[index]),
      high: Number(quote.high?.[index]),
      low: Number(quote.low?.[index]),
      close: Number(quote.close?.[index]),
      volume: Number(quote.volume?.[index]),
    }))
    .filter((row) =>
      Number.isFinite(row.open) &&
      Number.isFinite(row.high) &&
      Number.isFinite(row.low) &&
      Number.isFinite(row.close) &&
      Number.isFinite(row.volume)
    );
}
