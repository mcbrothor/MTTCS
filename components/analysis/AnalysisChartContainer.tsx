'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp, BarChart3, Globe, RefreshCw, AlertCircle } from 'lucide-react';
import TradingViewAdvancedChart from '../ui/TradingViewAdvancedChart';
import LightweightChart from './LightweightChart';
import { toTradingViewSymbol } from '../ui/TradingViewWidget';

type ChartSource = 'tradingview' | 'naver' | 'mtn';

interface AnalysisChartContainerProps {
  ticker: string;
  exchange: string;
  pivotPrice?: number | null;
  stopLossPrice?: number | null;
  initialSource?: ChartSource;
}

export default function AnalysisChartContainer({
  ticker,
  exchange,
  pivotPrice,
  stopLossPrice,
  initialSource = 'tradingview'
}: AnalysisChartContainerProps) {
  const symbol = toTradingViewSymbol(ticker, exchange);
  const isKrx = symbol.startsWith('KRX:');
  const [source, setSource] = useState<ChartSource>(isKrx && initialSource === 'tradingview' ? 'naver' : initialSource);
  const [priceData, setPriceData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (source === 'mtn' && priceData.length === 0) {
      fetchPriceData();
    }
  }, [source, ticker]);

  const fetchPriceData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Yahoo Ticker 변환 (KRX 대응)
      const isKR = exchange === 'KOSPI' || exchange === 'KOSDAQ' || /^\d{6}$/.test(ticker);
      const yahooTicker = isKR ? `${ticker}.${exchange === 'KOSPI' ? 'KS' : 'KQ'}` : ticker;

      const res = await fetch(`/api/price-history/${yahooTicker}`);
      const payload = await res.json();
      
      if (payload.error) throw new Error(payload.error);
      
      // LightweightChart format: { time: 'YYYY-MM-DD', open, high, low, close }
      const formatted = payload.data.map((d: any) => ({
        time: d.date,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close
      }));
      
      setPriceData(formatted);
    } catch (err) {
      console.error('[AnalysisChart] Failed to fetch data:', err);
      setError('가격 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const naverUrl = isKrx
    ? `https://finance.naver.com/item/fchart.naver?code=${ticker}`
    : `https://finance.naver.com/world/sise.naver?symbol=${ticker}.${exchange === 'NAS' || exchange === 'NASDAQ' ? 'O' : 'N'}`;

  return (
    <div className="flex h-full flex-col bg-slate-950">
      {/* Chart Source Toggle */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/50 px-4 py-2">
        <div className="flex gap-1 rounded-lg bg-slate-950 p-1">
          <SourceButton 
            active={source === 'mtn'} 
            onClick={() => setSource('mtn')} 
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            label="MTN Pro"
          />
          {!isKrx && (
            <SourceButton 
              active={source === 'tradingview'} 
              onClick={() => setSource('tradingview')} 
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              label="TradingView"
            />
          )}
          <SourceButton 
            active={source === 'naver'} 
            onClick={() => setSource('naver')} 
            icon={<Globe className="h-3.5 w-3.5" />}
            label="Naver"
          />
        </div>
        
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
          {source === 'mtn' && <span className="text-amber-500/80">★ Pivot & Stop Overlay</span>}
          {source === 'tradingview' && <span>Official Advanced Chart</span>}
        </div>
      </div>

      {/* Main Display Area */}
      <div className="relative flex-1 overflow-hidden">
        {source === 'tradingview' && !isKrx && (
          <TradingViewAdvancedChart symbol={symbol} />
        )}

        {source === 'naver' && (
          <iframe
            src={naverUrl}
            className="h-full w-full border-0"
            title="Naver Finance Chart"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        )}

        {source === 'mtn' && (
          <div className="h-full w-full p-4">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="h-8 w-8 animate-spin text-emerald-500" />
                  <span className="text-sm font-medium text-slate-400">데이터 수집 중...</span>
                </div>
              </div>
            ) : error ? (
              <div className="flex h-full items-center justify-center p-8">
                <div className="flex flex-col items-center gap-3 text-center">
                  <AlertCircle className="h-10 w-10 text-rose-500/50" />
                  <p className="text-sm font-medium text-slate-300">{error}</p>
                  <button 
                    onClick={fetchPriceData}
                    className="mt-2 text-xs font-bold text-emerald-500 underline"
                  >
                    다시 시도
                  </button>
                </div>
              </div>
            ) : (
              <LightweightChart 
                data={priceData} 
                pivotPrice={pivotPrice} 
                stopLossPrice={stopLossPrice} 
                height={500} 
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceButton({ 
  active, 
  onClick, 
  icon, 
  label 
}: { 
  active: boolean; 
  onClick: () => void; 
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-bold transition-all ${
        active 
          ? 'bg-slate-800 text-white shadow-lg shadow-black/50' 
          : 'text-slate-500 hover:bg-slate-900 hover:text-slate-300'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
