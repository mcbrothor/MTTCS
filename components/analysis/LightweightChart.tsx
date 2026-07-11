'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, IPriceLine, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';
import type { CandlestickData, HistogramData, ISeriesApi, LineData, Time } from 'lightweight-charts';
import type { ChartPatternLine, ChartPatternMarker, ChartPatternOverlay, ChartPatternOverlayCategory, ChartPatternZone } from '@/types';
import { isIsoChartDate, normalizeChartDate } from '@/lib/finance/core/chart-time';

interface LightweightChartProps {
  data: { time: string; open: number; high: number; low: number; close: number; volume?: number | null }[];
  pivotPrice?: number | null;
  stopLossPrice?: number | null;
  targetPrice?: number | null;
  pivotLabel?: string;
  chartPatterns?: ChartPatternOverlay[];
  height?: number;
}

type OverlayMode = 'all' | 'base' | 'pivot' | 'volume';
type RangeMode = '3M' | '6M' | '1Y' | 'ALL';
type StudyKey = 'ma20' | 'ma50' | 'ma200' | 'volume';

interface RenderedLine {
  id: string;
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  dash: string;
}

interface RenderedZone {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface RenderedMarker {
  id: string;
  label: string;
  x: number;
  y: number;
  color: string;
  shape: ChartPatternMarker['shape'];
}

interface RenderedOverlay {
  lines: RenderedLine[];
  zones: RenderedZone[];
  markers: RenderedMarker[];
  width: number;
  height: number;
}

const EMPTY_OVERLAY: RenderedOverlay = { lines: [], zones: [], markers: [], width: 0, height: 0 };

const MODE_LABEL: Record<OverlayMode, string> = {
  all: '전체',
  base: '베이스',
  pivot: '피벗/손절',
  volume: '거래량',
};

const RANGE_LABEL: Record<RangeMode, string> = {
  '3M': '3M',
  '6M': '6M',
  '1Y': '1Y',
  ALL: 'ALL',
};

const STUDY_LABEL: Record<StudyKey, string> = {
  ma20: 'MA20',
  ma50: 'MA50',
  ma200: 'MA200',
  volume: 'Volume',
};

const CATEGORY_COLOR: Record<ChartPatternOverlayCategory, string> = {
  base: '#38bdf8',
  pattern: '#a78bfa',
  pivot: '#fbbf24',
  risk: '#fb7185',
  volume: '#34d399',
};

const STUDY_COLOR: Record<Exclude<StudyKey, 'volume'>, string> = {
  ma20: '#60a5fa',
  ma50: '#fbbf24',
  ma200: '#f97316',
};

const RANGE_BARS: Record<RangeMode, number | null> = {
  '3M': 63,
  '6M': 126,
  '1Y': 252,
  ALL: null,
};

function categoriesForMode(mode: OverlayMode): Set<ChartPatternOverlayCategory> | null {
  if (mode === 'all') return null;
  if (mode === 'base') return new Set(['base', 'pattern']);
  if (mode === 'pivot') return new Set(['pivot', 'risk']);
  return new Set(['volume']);
}

function categoryVisible(category: ChartPatternOverlayCategory, mode: OverlayMode) {
  const categories = categoriesForMode(mode);
  return categories === null || categories.has(category);
}

function lineDash(style: ChartPatternLine['style']) {
  if (style === 'dashed') return '6 4';
  if (style === 'dotted') return '2 4';
  return '';
}

function markerPath(marker: RenderedMarker) {
  const size = 7;
  if (marker.shape === 'diamond') {
    return `${marker.x},${marker.y - size} ${marker.x + size},${marker.y} ${marker.x},${marker.y + size} ${marker.x - size},${marker.y}`;
  }
  if (marker.shape === 'triangleDown') {
    return `${marker.x - size},${marker.y - size} ${marker.x + size},${marker.y - size} ${marker.x},${marker.y + size}`;
  }
  return `${marker.x - size},${marker.y + size} ${marker.x + size},${marker.y + size} ${marker.x},${marker.y - size}`;
}

function movingAverageData(
  data: LightweightChartProps['data'],
  period: number,
): LineData<Time>[] {
  const rows: LineData<Time>[] = [];
  for (let index = period - 1; index < data.length; index += 1) {
    const slice = data.slice(index - period + 1, index + 1);
    const value = slice.reduce((sum, item) => sum + item.close, 0) / period;
    rows.push({ time: data[index].time as Time, value });
  }
  return rows;
}

function volumeData(data: LightweightChartProps['data']): HistogramData<Time>[] {
  return data
    .filter((item) => typeof item.volume === 'number' && Number.isFinite(item.volume))
    .map((item) => ({
      time: item.time as Time,
      value: Number(item.volume),
      color: item.close >= item.open ? 'rgba(16, 185, 129, 0.35)' : 'rgba(244, 63, 94, 0.35)',
    }));
}

function normalizeChartData(data: LightweightChartProps['data']) {
  const byTime = new Map<string, LightweightChartProps['data'][number]>();
  for (const bar of data) {
    const time = normalizeChartDate(bar.time);
    if (!isIsoChartDate(time)) continue;
    byTime.set(time, { ...bar, time });
  }
  return Array.from(byTime.values()).sort((left, right) => left.time.localeCompare(right.time));
}

function normalizeChartPatterns(patterns: ChartPatternOverlay[]) {
  return patterns.map((pattern) => ({
    ...pattern,
    dateRange: {
      start: normalizeChartDate(pattern.dateRange.start),
      end: normalizeChartDate(pattern.dateRange.end),
    },
    anchors: pattern.anchors.map((anchor) => ({ ...anchor, date: normalizeChartDate(anchor.date) })),
    lines: pattern.lines.map((line) => ({
      ...line,
      points: line.points.map((point) => ({ ...point, date: normalizeChartDate(point.date) })) as ChartPatternLine['points'],
    })),
    zones: pattern.zones.map((zone) => ({
      ...zone,
      startDate: normalizeChartDate(zone.startDate),
      endDate: normalizeChartDate(zone.endDate),
    })),
    markers: pattern.markers.map((marker) => ({ ...marker, date: normalizeChartDate(marker.date) })),
  }));
}

export default function LightweightChart({ 
  data, 
  pivotPrice, 
  stopLossPrice,
  targetPrice,
  pivotLabel = 'Pivot',
  chartPatterns = [],
  height = 400 
}: LightweightChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick', Time> | null>(null);
  const pivotLineRef = useRef<IPriceLine | null>(null);
  const stopLineRef = useRef<IPriceLine | null>(null);
  const targetLineRef = useRef<IPriceLine | null>(null);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('all');
  const [rangeMode, setRangeMode] = useState<RangeMode>('1Y');
  const [enabledStudies, setEnabledStudies] = useState<Record<StudyKey, boolean>>({
    ma20: true,
    ma50: true,
    ma200: true,
    volume: true,
  });
  const [renderedOverlay, setRenderedOverlay] = useState<RenderedOverlay>(EMPTY_OVERLAY);
  const normalizedData = useMemo(() => normalizeChartData(data), [data]);
  const normalizedPatterns = useMemo(() => normalizeChartPatterns(chartPatterns), [chartPatterns]);
  const patternCount = normalizedPatterns.length;
  const modes = useMemo<OverlayMode[]>(() => ['all', 'base', 'pivot', 'volume'], []);
  const ranges = useMemo<RangeMode[]>(() => ['3M', '6M', '1Y', 'ALL'], []);
  const studies = useMemo<StudyKey[]>(() => ['ma20', 'ma50', 'ma200', 'volume'], []);
  const visibleData = useMemo(() => {
    const bars = RANGE_BARS[rangeMode];
    return bars === null ? normalizedData : normalizedData.slice(-bars);
  }, [normalizedData, rangeMode]);

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

    candlestickSeries.setData(visibleData as CandlestickData[]);
    seriesRef.current = candlestickSeries;

    if (enabledStudies.ma20) {
      const ma20 = chart.addSeries(LineSeries, {
        color: STUDY_COLOR.ma20,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      ma20.setData(movingAverageData(visibleData, 20));
    }
    if (enabledStudies.ma50) {
      const ma50 = chart.addSeries(LineSeries, {
        color: STUDY_COLOR.ma50,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      ma50.setData(movingAverageData(visibleData, 50));
    }
    if (enabledStudies.ma200) {
      const ma200 = chart.addSeries(LineSeries, {
        color: STUDY_COLOR.ma200,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      ma200.setData(movingAverageData(visibleData, 200));
    }
    const volumes = volumeData(visibleData);
    if (enabledStudies.volume && volumes.length > 0) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: '',
        priceLineVisible: false,
        lastValueVisible: false,
      });
      volumeSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.82,
          bottom: 0,
        },
      });
      volumeSeries.setData(volumes);
    }

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

    const renderOverlays = () => {
      const container = chartContainerRef.current;
      if (!container) return;
      const width = container.clientWidth;
      const chartHeight = height;
      const timeScale = chart.timeScale();
      const firstVisible = visibleData[0]?.time ?? '';
      const lastVisible = visibleData.at(-1)?.time ?? '';
      const clampDate = (date: string) => {
        if (!firstVisible || !lastVisible) return date;
        if (date < firstVisible) return firstVisible;
        if (date > lastVisible) return lastVisible;
        return date;
      };
      const toX = (date: string) => timeScale.timeToCoordinate(clampDate(date) as Time);
      const toY = (price: number) => candlestickSeries.priceToCoordinate(price);
      const visibleLine = (line: ChartPatternLine): RenderedLine | null => {
        if (!categoryVisible(line.category, overlayMode)) return null;
        const x1 = toX(line.points[0].date);
        const y1 = toY(line.points[0].price);
        const x2 = toX(line.points[1].date);
        const y2 = toY(line.points[1].price);
        if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
        return {
          id: line.id,
          label: line.label,
          x1,
          y1,
          x2,
          y2,
          color: CATEGORY_COLOR[line.category],
          dash: lineDash(line.style),
        };
      };
      const visibleZone = (zone: ChartPatternZone): RenderedZone | null => {
        if (!categoryVisible(zone.category, overlayMode)) return null;
        const x1 = toX(zone.startDate);
        const x2 = toX(zone.endDate);
        const top = toY(zone.high);
        const bottom = toY(zone.low);
        if (x1 === null || x2 === null || top === null || bottom === null) return null;
        return {
          id: zone.id,
          label: zone.label,
          x: Math.min(x1, x2),
          y: Math.min(top, bottom),
          width: Math.max(2, Math.abs(x2 - x1)),
          height: Math.max(2, Math.abs(bottom - top)),
          color: CATEGORY_COLOR[zone.category],
        };
      };
      const visibleMarker = (marker: ChartPatternMarker): RenderedMarker | null => {
        if (!categoryVisible(marker.category, overlayMode)) return null;
        const x = toX(marker.date);
        const y = toY(marker.price);
        if (x === null || y === null) return null;
        return {
          id: marker.id,
          label: marker.label,
          x,
          y,
          color: CATEGORY_COLOR[marker.category],
          shape: marker.shape,
        };
      };

      setRenderedOverlay({
        width,
        height: chartHeight,
        lines: normalizedPatterns.flatMap((pattern) => pattern.lines).map(visibleLine).filter((item): item is RenderedLine => Boolean(item)),
        zones: normalizedPatterns.flatMap((pattern) => pattern.zones).map(visibleZone).filter((item): item is RenderedZone => Boolean(item)),
        markers: normalizedPatterns.flatMap((pattern) => pattern.markers).map(visibleMarker).filter((item): item is RenderedMarker => Boolean(item)),
      });
    };

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
        renderOverlays();
      }
    };

    const handleVisibleRangeChange = () => renderOverlays();
    chart.timeScale().subscribeVisibleTimeRangeChange(handleVisibleRangeChange);
    window.addEventListener('resize', handleResize);
    const refreshTimer = window.setTimeout(renderOverlays, 0);

    return () => {
      window.clearTimeout(refreshTimer);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(handleVisibleRangeChange);
      window.removeEventListener('resize', handleResize);
      seriesRef.current = null;
      chart.remove();
    };
  }, [enabledStudies, height, normalizedPatterns, overlayMode, pivotLabel, pivotPrice, stopLossPrice, targetPrice, visibleData]);

  return (
    <div className="relative w-full rounded-2xl border border-slate-800 overflow-hidden bg-slate-950">
      <div ref={chartContainerRef} className="w-full" />
      {patternCount > 0 ? (
        <svg
          className="pointer-events-none absolute left-0 top-0 z-[5]"
          width={renderedOverlay.width}
          height={renderedOverlay.height}
          viewBox={`0 0 ${renderedOverlay.width} ${renderedOverlay.height}`}
          aria-hidden="true"
        >
          {renderedOverlay.zones.map((zone) => (
            <g key={zone.id}>
              <rect
                x={zone.x}
                y={zone.y}
                width={zone.width}
                height={zone.height}
                fill={zone.color}
                fillOpacity="0.08"
                stroke={zone.color}
                strokeOpacity="0.45"
                strokeDasharray="5 4"
                rx="4"
              />
              <text x={zone.x + 6} y={zone.y + 14} fill={zone.color} fontSize="10" fontWeight="700">
                {zone.label}
              </text>
            </g>
          ))}
          {renderedOverlay.lines.map((line) => (
            <g key={line.id}>
              <line
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke={line.color}
                strokeWidth="1.6"
                strokeDasharray={line.dash}
                strokeLinecap="round"
              />
              <text x={Math.max(4, Math.min(renderedOverlay.width - 72, line.x2 - 68))} y={line.y2 - 5} fill={line.color} fontSize="10" fontWeight="700">
                {line.label}
              </text>
            </g>
          ))}
          {renderedOverlay.markers.map((marker) => (
            <g key={marker.id}>
              {marker.shape === 'circle' ? (
                <circle cx={marker.x} cy={marker.y} r="5" fill={marker.color} fillOpacity="0.9" />
              ) : (
                <polygon points={markerPath(marker)} fill={marker.color} fillOpacity="0.9" />
              )}
              <text x={marker.x + 8} y={marker.y - 7} fill={marker.color} fontSize="10" fontWeight="700">
                {marker.label}
              </text>
            </g>
          ))}
        </svg>
      ) : null}
      <div className="absolute right-3 top-3 z-10 flex gap-1 rounded-lg border border-slate-700 bg-slate-950/85 p-1 shadow-xl backdrop-blur">
        {ranges.map((range) => (
          <button
            key={range}
            type="button"
            onClick={() => setRangeMode(range)}
            className={`rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${
              rangeMode === range
                ? 'bg-sky-500/20 text-sky-100'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
            }`}
          >
            {RANGE_LABEL[range]}
          </button>
        ))}
      </div>
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
      {patternCount > 0 ? (
        <div className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-24px)] flex-wrap gap-1 rounded-lg border border-slate-700 bg-slate-950/85 p-1 shadow-xl backdrop-blur">
          {modes.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setOverlayMode(mode)}
              className={`rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${
                overlayMode === mode
                  ? 'bg-emerald-500/20 text-emerald-100'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              {MODE_LABEL[mode]}
            </button>
          ))}
          <span className="px-2 py-1 text-[10px] font-bold text-slate-500">{patternCount} patterns</span>
        </div>
      ) : null}
      <div className="absolute bottom-3 right-3 z-10 flex max-w-[calc(100%-24px)] flex-wrap gap-1 rounded-lg border border-slate-700 bg-slate-950/85 p-1 shadow-xl backdrop-blur">
        {studies.map((study) => (
          <button
            key={study}
            type="button"
            onClick={() => setEnabledStudies((current) => ({ ...current, [study]: !current[study] }))}
            className={`rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${
              enabledStudies[study]
                ? 'bg-slate-700 text-white'
                : 'text-slate-500 hover:bg-slate-800 hover:text-slate-100'
            }`}
          >
            {STUDY_LABEL[study]}
          </button>
        ))}
      </div>
    </div>
  );
}
