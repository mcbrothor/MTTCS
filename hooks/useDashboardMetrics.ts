import { useEffect, useState } from 'react';
import axios from 'axios';
import type { Trade } from '@/types';

export function useDashboardMetrics() {
  const [data, setData] = useState<{
    trades: Trade[];
    totalTrades: number;
    plannedCount: number;
    sepaPassRate: number;
    winRate: number;
    totalPnL: number;
    avgDiscipline: number;
    highDiscipline: { winRate: number; avgPnL: number; count: number };
    lowDiscipline: { winRate: number; avgPnL: number; count: number };
    equityCurve: { date: string; cumulativePnL: number }[];
    loading: boolean;
    error: string | null;
  }>({
    trades: [],
    totalTrades: 0,
    plannedCount: 0,
    sepaPassRate: 0,
    winRate: 0,
    totalPnL: 0,
    avgDiscipline: 0,
    highDiscipline: { winRate: 0, avgPnL: 0, count: 0 },
    lowDiscipline: { winRate: 0, avgPnL: 0, count: 0 },
    equityCurve: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    const fetchTrades = async () => {
      try {
        const response = await axios.get('/api/trades');
        const trades: Trade[] = response.data.data || [];

        const completed = trades.filter((trade) => trade.status === 'COMPLETED');
        const planned = trades.filter((trade) => trade.status === 'PLANNED');
        const winning = completed.filter((trade) => (trade.result_amount || 0) > 0);
        const sepaKnown = trades.filter((trade) => trade.chk_sepa !== undefined || trade.chk_market !== undefined);
        const sepaPass = sepaKnown.filter((trade) => (trade.chk_sepa ?? trade.chk_market) === true);

        const totalPnL = completed.reduce((sum, trade) => sum + (trade.result_amount || 0), 0);
        const avgDiscipline = completed.length
          ? completed.reduce((sum, trade) => sum + (trade.final_discipline || 0), 0) / completed.length
          : 0;

        const highDisciplineTrades = completed.filter((trade) => (trade.final_discipline || 0) >= 80);
        const lowDisciplineTrades = completed.filter((trade) => (trade.final_discipline || 0) < 80);

        const calcGroup = (group: Trade[]) => {
          const count = group.length;
          const wins = group.filter((trade) => (trade.result_amount || 0) > 0).length;
          const pnl = count ? group.reduce((sum, trade) => sum + (trade.result_amount || 0), 0) / count : 0;
          return {
            count,
            winRate: count ? (wins / count) * 100 : 0,
            avgPnL: pnl,
          };
        };

        let currentPnL = 0;
        const equityCurve = [...completed]
          .sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime())
          .map((trade) => {
            currentPnL += trade.result_amount || 0;
            return {
              date: new Date(trade.updated_at).toLocaleDateString('ko-KR'),
              cumulativePnL: currentPnL,
            };
          });

        setData({
          trades,
          totalTrades: completed.length,
          plannedCount: planned.length,
          sepaPassRate: sepaKnown.length ? (sepaPass.length / sepaKnown.length) * 100 : 0,
          winRate: completed.length ? (winning.length / completed.length) * 100 : 0,
          totalPnL,
          avgDiscipline,
          highDiscipline: calcGroup(highDisciplineTrades),
          lowDiscipline: calcGroup(lowDisciplineTrades),
          equityCurve,
          loading: false,
          error: null,
        });
      } catch (err: unknown) {
        const message = axios.isAxiosError(err)
          ? err.response?.data?.message || err.message
          : err instanceof Error
            ? err.message
            : '매매 데이터를 불러오지 못했습니다.';
        setData((prev) => ({
          ...prev,
          loading: false,
          error: message,
        }));
      }
    };

    fetchTrades();
  }, []);

  return data;
}
