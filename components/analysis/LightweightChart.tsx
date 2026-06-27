'use client';

import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, IPriceLine, CandlestickSeries } from 'lightweight-charts';
import type { CandlestickData } from 'lightweight-charts';

interface LightweightChartProps {
  data: { time: string; open: number; high: number; low: number; close: number }[];
  pivotPrice?: number | null;
  stopLossPrice?: number | null;
  targetPrice?: number | null;
  pivotLabel?: string;
  height?: number;
}

export default function LightweightChart({ 
  data, 
  pivotPrice, 
  stopLossPrice,
  targetPrice,
  pivotLabel = 'Pivot',
  height = 400 
}: LightweightChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const pivotLineRef = useRef<IPriceLine | null>(null);
  const stopLineRef = useRef<IPriceLine | null>(null);
  const targetLineRef = useRef<IPriceLine | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#020617' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.5)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.5)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: height,
      timeScale: {
        borderColor: '#1e293b',
      },
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });

    candlestickSeries.setData(data as CandlestickData[]);

    // Pivot Line
    if (pivotPrice) {
      pivotLineRef.current = candlestickSeries.createPriceLine({
        price: pivotPrice,
        color: '#fbbf24',
        lineWidth: 2,
        lineStyle: 0, // Solid
        axisLabelVisible: true,
        title: pivotLabel.toUpperCase(),
      });
    }

    // Stop Loss Line
    if (stopLossPrice) {
      stopLineRef.current = candlestickSeries.createPriceLine({
        price: stopLossPrice,
        color: '#f43f5e',
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: 'STOP LOSS',
      });
    }

    if (targetPrice) {
      targetLineRef.current = candlestickSeries.createPriceLine({
        price: targetPrice,
        color: '#38bdf8',
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: 'TARGET',
      });
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data, pivotPrice, stopLossPrice, targetPrice, pivotLabel, height]);

  return (
    <div className="relative w-full rounded-2xl border border-slate-800 overflow-hidden bg-slate-950">
      <div ref={chartContainerRef} className="w-full" />
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        {pivotPrice ? (
          <div className="flex items-center gap-2 rounded-lg bg-slate-900/80 px-2 py-1 border border-slate-700 backdrop-blur-md">
            <div className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
            <span className="text-[10px] font-bold text-slate-300">{pivotLabel}: {pivotPrice.toLocaleString()}</span>
          </div>
        ) : null}
        {stopLossPrice ? (
          <div className="flex items-center gap-2 rounded-lg bg-slate-900/80 px-2 py-1 border border-slate-700 backdrop-blur-md">
            <div className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
            <span className="text-[10px] font-bold text-slate-300">Stop: {stopLossPrice.toLocaleString()}</span>
          </div>
        ) : null}
        {targetPrice ? (
          <div className="flex items-center gap-2 rounded-lg bg-slate-900/80 px-2 py-1 border border-slate-700 backdrop-blur-md">
            <div className="h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.5)]" />
            <span className="text-[10px] font-bold text-slate-300">Target: {targetPrice.toLocaleString()}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
