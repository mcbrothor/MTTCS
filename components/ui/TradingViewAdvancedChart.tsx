'use client';

import { useEffect, useRef } from 'react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

let tvScriptLoadingPromise: Promise<void> | null = null;

interface TradingViewAdvancedChartProps {
  symbol: string;
  interval?: string;
  theme?: 'dark' | 'light';
}

export default function TradingViewAdvancedChart({
  symbol,
  interval = 'W',
  theme = 'dark',
}: TradingViewAdvancedChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Generate a unique ID that does not change across renders
  const containerId = useRef(`tv_chart_${Date.now()}_${Math.random().toString(36).substring(7)}`);

  useEffect(() => {
    // 1. Script Load
    if (!tvScriptLoadingPromise) {
      tvScriptLoadingPromise = new Promise((resolve) => {
        const script = document.createElement('script');
        script.id = 'tradingview-widget-loading-script';
        script.src = 'https://s3.tradingview.com/tv.js';
        script.type = 'text/javascript';
        script.onload = () => resolve();
        document.head.appendChild(script);
      });
    }

    // 2. Init Widget
    tvScriptLoadingPromise.then(() => {
      if (containerRef.current && 'TradingView' in window) {
        // Clear previous widget
        containerRef.current.innerHTML = '';
        
        // @ts-expect-error TradingView is attached to window by tv.js
        new window.TradingView.widget({
          autosize: true,
          symbol: symbol,
          interval: interval,
          timezone: 'Asia/Seoul',
          theme: theme,
          style: '1',
          locale: 'kr',
          enable_publishing: false,
          backgroundColor: 'rgba(2, 6, 23, 1)', // tailwind slate-950
          gridColor: 'rgba(30, 41, 59, 0.4)', // tailwind slate-800
          hide_top_toolbar: false,
          hide_legend: false,
          save_image: false,
          container_id: containerId.current,
          // Moving Average (50, 150, 200) 및 볼륨 지표 설정
          studies: [
            { id: 'MASimple@tv-basicstudies', inputs: { length: 50 } },
            { id: 'MASimple@tv-basicstudies', inputs: { length: 150 } },
            { id: 'MASimple@tv-basicstudies', inputs: { length: 200 } },
            'Volume@tv-basicstudies',
          ],
        });
      }
    });
  }, [symbol, interval, theme]);

  return (
    <div className="relative h-full w-full bg-slate-950">
      {/* Loading Placeholder */}
      <div className="absolute inset-0 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
      {/* Chart Container */}
      <div 
        id={containerId.current} 
        ref={containerRef} 
        className="absolute inset-0 z-10" 
      />
    </div>
  );
}
