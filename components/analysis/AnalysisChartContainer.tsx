'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { TrendingUp, Globe, RefreshCw, AlertCircle } from 'lucide-react';
import TradingViewAdvancedChart from '../ui/TradingViewAdvancedChart';
import LightweightChart from './LightweightChart';
import { toTradingViewSymbol } from '../ui/TradingViewWidget';
import { useIsMobile } from '@/lib/hooks/useViewport';
import type { ChartPatternOverlay } from '@/types';

type ChartSource = 'tradingview' | 'naver' | 'mtn';

interface PriceHistoryPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
}

interface ChartPoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
}

interface AnalysisChartContainerProps {
  ticker: string;
  exchange: string;
  pivotPrice?: number | null;
  stopLossPrice?: number | null;
  targetPrice?: number | null;
  pivotLabel?: string;
  chartPatterns?: ChartPatternOverlay[];
  focusedPatternId?: string | null;
  onPatternFocusChange?: (patternId: string | null) => void;
  initialData?: ChartPoint[];
  initialSource?: ChartSource;
}

export default function AnalysisChartContainer({
  ticker,
  exchange,
  pivotPrice,
  stopLossPrice,
  targetPrice,
  pivotLabel,
  chartPatterns = [],
  focusedPatternId,
  onPatternFocusChange,
  initialData = [],
  initialSource = 'tradingview'
}: AnalysisChartContainerProps) {
  const isMobile = useIsMobile();
  const symbol = toTradingViewSymbol(ticker, exchange);
  const isKrx = symbol.startsWith('KRX:');
  const resolvedInitial: ChartSource = (isMobile && initialSource === 'tradingview')
    ? (pivotPrice ? 'mtn' : 'naver')
    : (isKrx && initialSource === 'tradingview' ? 'naver' : initialSource);
  const [source, setSource] = useState<ChartSource>(resolvedInitial);
  const [priceData, setPriceData] = useState<ChartPoint[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [internalPatternFocus, setInternalPatternFocus] = useState<string | null>(null);
  const activePatternFocus = focusedPatternId === undefined ? internalPatternFocus : focusedPatternId;

  const setPatternFocus = (patternId: string | null) => {
    if (focusedPatternId === undefined) setInternalPatternFocus(patternId);
    onPatternFocusChange?.(patternId);
  };

  const fetchPriceData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Yahoo Ticker 변환 (KRX 대응)
      const isKR = exchange === 'KOSPI' || exchange === 'KOSDAQ' || /^\d{6}$/.test(ticker);
      const yahooTicker = isKR ? `${ticker}.${exchange === 'KOSPI' ? 'KS' : 'KQ'}` : ticker;

      const res = await fetch(`/api/price-history/${yahooTicker}`);
      const payload = await res.json() as { data?: PriceHistoryPoint[]; error?: string };
      
      if (payload.error) throw new Error(payload.error);
      if (!Array.isArray(payload.data)) throw new Error('Invalid price history response');
      
      // LightweightChart format: { time: 'YYYY-MM-DD', open, high, low, close }
      const formatted = payload.data.map((d) => ({
        time: d.date,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: d.volume ?? null
      }));
      
      setPriceData(formatted);
    } catch (err) {
      console.error('[AnalysisChart] Failed to fetch data:', err);
      setError('가격 데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [exchange, ticker]);

  useEffect(() => {
    if (initialData.length > 0) {
      setPriceData(initialData);
    }
  }, [initialData]);

  useEffect(() => {
    if (source === 'mtn' && priceData.length === 0) {
      fetchPriceData();
    }
  }, [fetchPriceData, priceData.length, source]);

  const naverUrl = isKrx
    ? `https://finance.naver.com/item/fchart.naver?code=${ticker}`
    : `https://finance.naver.com/world/sise.naver?symbol=${ticker}.${exchange === 'NAS' || exchange === 'NASDAQ' ? 'O' : 'N'}`;

  return (
    <div className="flex h-full flex-col bg-slate-950">
      {/* Chart Source Toggle */}
      <div className="border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex gap-1 rounded-lg bg-slate-950 p-1">
            <SourceButton
              active={source === 'mtn'}
              onClick={() => setSource('mtn')}
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              label="MTN Pro"
            />
            {!isKrx && !isMobile && (
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
            {source === 'mtn' && <span className="text-amber-500/80">★ Pattern Overlay</span>}
            {source === 'tradingview' && <span>Official Advanced Chart</span>}
          </div>
        </div>
        {source === 'mtn' && chartPatterns.length > 0 ? (
          <div className="flex gap-1 overflow-x-auto border-t border-slate-800/70 px-4 py-2 [scrollbar-width:none]">
            <button
              type="button"
              data-pattern-focus-id="all"
              onClick={() => setPatternFocus(null)}
              aria-pressed={activePatternFocus === null}
              className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${
                activePatternFocus === null
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              전체 패턴
            </button>
            {chartPatterns.map((pattern) => (
              <button
                key={pattern.id}
                type="button"
                data-pattern-focus-id={pattern.id}
                onClick={() => setPatternFocus(pattern.id)}
                aria-pressed={activePatternFocus === pattern.id}
                className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${
                  activePatternFocus === pattern.id
                    ? 'bg-sky-500/20 text-sky-100 ring-1 ring-sky-400/40'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                }`}
              >
                {pattern.label}
              </button>
            ))}
          </div>
        ) : null}
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
                targetPrice={targetPrice}
                pivotLabel={pivotLabel}
                chartPatterns={chartPatterns}
                focusedPatternId={activePatternFocus}
                onPatternFocusChange={setPatternFocus}
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
