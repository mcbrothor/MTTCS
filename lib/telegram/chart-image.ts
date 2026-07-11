import { Resvg } from '@resvg/resvg-js';
import type { ChartPatternOverlay, MarketAnalysisResponse } from '@/types';
import type { TechnicalChartAnalysis } from '@/lib/ai/technical-chart-analysis';

const WIDTH = 1200;
const HEIGHT = 900;
const PLOT = { left: 72, top: 96, width: 1040, height: 520 };
const FOOTER_TOP = 654;
const RANGE_BARS = 252;

export interface TelegramChartImageInput {
  ticker: string;
  exchange: string;
  name?: string | null;
  rank: number;
  analysis: MarketAnalysisResponse;
  technical: TechnicalChartAnalysis;
  rangeBars?: number | null;
}

export function selectTelegramChartPicks<T extends { rank: number }>(picks: T[], limit: number) {
  return [...picks]
    .sort((left, right) => left.rank - right.rank)
    .slice(0, Math.min(10, Math.max(1, limit)));
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] || char);
}

function number(value: number | null | undefined, digits = 2) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: digits }) : '-';
}

function movingAverage(values: number[], period: number) {
  return values.map((_, index) => {
    if (index < period - 1) return null;
    return values.slice(index - period + 1, index + 1).reduce((sum, value) => sum + value, 0) / period;
  });
}

function linePath(values: Array<number | null>, x: (index: number) => number, y: (value: number) => number) {
  return values.reduce((path, value, index) => value === null ? path : `${path}${path ? ' L ' : 'M '}${x(index).toFixed(1)} ${y(value).toFixed(1)}`, '');
}

function chartX(index: number, count: number) {
  return PLOT.left + (count <= 1 ? 0 : (index / (count - 1)) * PLOT.width);
}

function categoryColor(category: ChartPatternOverlay['lines'][number]['category']) {
  return { base: '#38bdf8', pattern: '#a78bfa', pivot: '#fbbf24', risk: '#fb7185', volume: '#34d399' }[category];
}

function truncate(value: string, length: number) {
  return value.length > length ? `${value.slice(0, Math.max(0, length - 1))}...` : value;
}

export function buildRuleBasedTechnicalAnalysis(analysis: MarketAnalysisResponse): TechnicalChartAnalysis {
  const vcp = analysis.vcpAnalysis;
  const patterns = analysis.chartPatterns || [];
  const confirmed = patterns.filter((pattern) => pattern.status === 'CONFIRMED').map((pattern) => pattern.id);
  const latest = analysis.priceData.at(-1)?.close ?? null;
  const pivot = vcp.pivotPrice ?? analysis.riskPlan.entryPrice ?? null;
  const invalidation = vcp.invalidationPrice ?? analysis.riskPlan.selectedStopPrice ?? analysis.riskPlan.stopLossPrice ?? null;
  const abovePivot = latest !== null && pivot !== null && latest >= pivot;
  const verdict = analysis.riskPlan.riskGate?.status === 'BLOCK' ? 'AVOID' : abovePivot && vcp.breakoutVolumeStatus === 'confirmed' ? 'BUY' : 'WATCH';
  const label = patterns.slice(0, 2).map((pattern) => pattern.label).join(', ') || '패턴 신호 부족';
  return {
    verdict,
    confidence: Math.max(0.35, Math.min(0.8, (vcp.score || 0) / 100)),
    summaryKo: `${label}. ${abovePivot ? '피벗 위 가격 유지 여부' : '피벗 돌파'}와 거래량 확인이 필요합니다.`,
    referencedPatternIds: confirmed,
    entryCondition: pivot ? `${number(pivot)} 상향 돌파 및 거래량 확인` : '최근 고점 돌파와 거래량 확인',
    invalidationCondition: invalidation ? `${number(invalidation)} 하향 이탈` : '베이스 저점 이탈',
    patternRead: vcp.details?.slice(0, 2).join(' ') || label,
    riskNotes: analysis.warnings.slice(0, 2).length ? analysis.warnings.slice(0, 2) : ['돌파 거래량과 시장 환경을 함께 확인하세요.'],
  };
}

export function renderTelegramChartPng(input: TelegramChartImageInput) {
  const bars = input.analysis.priceData.slice(-(input.rangeBars || RANGE_BARS));
  if (bars.length < 20) throw new Error('At least 20 price bars are required to render a Telegram chart.');
  const lows = bars.map((bar) => bar.low);
  const highs = bars.map((bar) => bar.high);
  const priceMin = Math.min(...lows);
  const priceMax = Math.max(...highs);
  const padding = Math.max((priceMax - priceMin) * 0.08, priceMax * 0.01);
  const y = (value: number) => PLOT.top + ((priceMax + padding - value) / (priceMax - priceMin + padding * 2)) * PLOT.height;
  const x = (index: number) => chartX(index, bars.length);
  const dateIndex = new Map(bars.map((bar, index) => [bar.date, index]));
  const closes = bars.map((bar) => bar.close);
  const volumeMax = Math.max(...bars.map((bar) => bar.volume || 0), 1);
  const maLines = [
    { values: movingAverage(closes, 20), color: '#60a5fa', label: 'MA20' },
    { values: movingAverage(closes, 50), color: '#fbbf24', label: 'MA50' },
    { values: movingAverage(closes, 200), color: '#f97316', label: 'MA200' },
  ];
  const toIndex = (date: string) => dateIndex.get(date) ?? (date < bars[0].date ? 0 : bars.length - 1);
  const patterns = input.analysis.chartPatterns || [];
  const zones = patterns.flatMap((pattern) => pattern.zones).map((zone) => {
    const x1 = x(toIndex(zone.startDate));
    const x2 = x(toIndex(zone.endDate));
    const y1 = y(zone.high);
    const y2 = y(zone.low);
    return `<rect x="${Math.min(x1, x2).toFixed(1)}" y="${Math.min(y1, y2).toFixed(1)}" width="${Math.max(2, Math.abs(x2 - x1)).toFixed(1)}" height="${Math.max(2, Math.abs(y2 - y1)).toFixed(1)}" fill="${categoryColor(zone.category)}" fill-opacity="0.13" stroke="${categoryColor(zone.category)}" stroke-opacity="0.6" stroke-width="1"/>`;
  }).join('');
  const overlayLines = patterns.flatMap((pattern) => pattern.lines).map((line) => {
    const [start, end] = line.points;
    const dash = line.style === 'dashed' ? '8 5' : line.style === 'dotted' ? '2 5' : '';
    return `<line x1="${x(toIndex(start.date)).toFixed(1)}" y1="${y(start.price).toFixed(1)}" x2="${x(toIndex(end.date)).toFixed(1)}" y2="${y(end.price).toFixed(1)}" stroke="${categoryColor(line.category)}" stroke-width="1.5" stroke-dasharray="${dash}"/>`;
  }).join('');
  const markers = patterns.flatMap((pattern) => pattern.markers).map((marker) => {
    const cx = x(toIndex(marker.date));
    const cy = y(marker.price);
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5" fill="${categoryColor(marker.category)}" stroke="#020617" stroke-width="2"/>`;
  }).join('');
  const candlesticks = bars.map((bar, index) => {
    const cx = x(index);
    const up = bar.close >= bar.open;
    const color = up ? '#10b981' : '#fb7185';
    const bodyTop = y(Math.max(bar.open, bar.close));
    const bodyBottom = y(Math.min(bar.open, bar.close));
    return `<line x1="${cx.toFixed(1)}" y1="${y(bar.high).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${y(bar.low).toFixed(1)}" stroke="${color}" stroke-width="1"/><rect x="${(cx - Math.max(1, 340 / bars.length)).toFixed(1)}" y="${bodyTop.toFixed(1)}" width="${Math.max(2, 680 / bars.length).toFixed(1)}" height="${Math.max(1.5, bodyBottom - bodyTop).toFixed(1)}" fill="${color}"/>`;
  }).join('');
  const volumes = bars.map((bar, index) => {
    const height = ((bar.volume || 0) / volumeMax) * 74;
    return `<rect x="${(x(index) - Math.max(1, 300 / bars.length)).toFixed(1)}" y="${(PLOT.top + PLOT.height - height).toFixed(1)}" width="${Math.max(2, 600 / bars.length).toFixed(1)}" height="${height.toFixed(1)}" fill="${bar.close >= bar.open ? '#10b981' : '#fb7185'}" fill-opacity="0.32"/>`;
  }).join('');
  const riskLines = [
    { value: input.analysis.riskPlan.entryPrice ?? input.analysis.vcpAnalysis.pivotPrice, label: 'PIVOT', color: '#fbbf24' },
    { value: input.analysis.riskPlan.selectedStopPrice ?? input.analysis.riskPlan.stopLossPrice ?? input.analysis.vcpAnalysis.invalidationPrice, label: 'STOP', color: '#fb7185' },
  ].filter((item): item is { value: number; label: string; color: string } => typeof item.value === 'number' && Number.isFinite(item.value)).map((item) => `<line x1="${PLOT.left}" y1="${y(item.value).toFixed(1)}" x2="${PLOT.left + PLOT.width}" y2="${y(item.value).toFixed(1)}" stroke="${item.color}" stroke-width="1.5" stroke-dasharray="7 5"/><text x="${PLOT.left + PLOT.width + 8}" y="${(y(item.value) + 4).toFixed(1)}" fill="${item.color}" font-size="12">${item.label} ${number(item.value)}</text>`).join('');
  const verdictColor = input.technical.verdict === 'BUY' ? '#34d399' : input.technical.verdict === 'AVOID' ? '#fb7185' : '#fbbf24';
  const labels = patterns.slice(0, 4).map((pattern) => `${pattern.label} ${Math.round(pattern.confidence * 100)}%`).join(' | ') || 'No confirmed pattern';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <rect width="100%" height="100%" fill="#020617"/>
    <text x="72" y="44" fill="#f8fafc" font-size="28" font-family="Arial, sans-serif" font-weight="700">${escapeXml(input.ticker)}${input.name ? ` · ${escapeXml(truncate(input.name, 28))}` : ''}</text>
    <text x="72" y="72" fill="#94a3b8" font-size="15" font-family="Arial, sans-serif">${escapeXml(input.exchange)} · Rank #${input.rank} · ${escapeXml(bars.at(-1)?.date || '')} · ${escapeXml(input.analysis.providerUsed)}</text>
    <text x="1120" y="45" fill="${verdictColor}" text-anchor="end" font-size="26" font-family="Arial, sans-serif" font-weight="700">${input.technical.verdict}</text>
    <text x="1120" y="70" fill="#cbd5e1" text-anchor="end" font-size="14" font-family="Arial, sans-serif">confidence ${Math.round(input.technical.confidence * 100)}%</text>
    ${Array.from({ length: 6 }, (_, index) => { const value = priceMin + ((priceMax - priceMin) * index / 5); return `<line x1="${PLOT.left}" y1="${y(value).toFixed(1)}" x2="${PLOT.left + PLOT.width}" y2="${y(value).toFixed(1)}" stroke="#1e293b" stroke-width="1"/><text x="20" y="${(y(value) + 4).toFixed(1)}" fill="#64748b" font-size="12">${number(value)}</text>`; }).join('')}
    ${zones}${volumes}${candlesticks}${maLines.map((line) => `<path d="${linePath(line.values, x, y)}" fill="none" stroke="${line.color}" stroke-width="1.5"/>`).join('')}${overlayLines}${riskLines}${markers}
    <text x="72" y="642" fill="#94a3b8" font-size="13" font-family="Arial, sans-serif">${escapeXml(labels)}</text>
    <line x1="72" y1="${FOOTER_TOP}" x2="1120" y2="${FOOTER_TOP}" stroke="#334155" stroke-width="1"/>
    <text x="72" y="704" fill="#e2e8f0" font-size="18" font-family="Arial, sans-serif" font-weight="700">${escapeXml(truncate(input.technical.summaryKo, 96))}</text>
    <text x="72" y="748" fill="#cbd5e1" font-size="16" font-family="Arial, sans-serif">Entry: ${escapeXml(truncate(input.technical.entryCondition, 88))}</text>
    <text x="72" y="784" fill="#fda4af" font-size="16" font-family="Arial, sans-serif">Invalidation: ${escapeXml(truncate(input.technical.invalidationCondition, 82))}</text>
    <text x="72" y="830" fill="#94a3b8" font-size="14" font-family="Arial, sans-serif">Risk: ${escapeXml(truncate(input.technical.riskNotes.join(' · '), 126))}</text>
  </svg>`;
  return new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render().asPng();
}

export function telegramChartCaption(input: TelegramChartImageInput) {
  return `${input.ticker} #${input.rank} · *${input.technical.verdict}*\n${truncate(input.technical.summaryKo, 380)}`;
}
