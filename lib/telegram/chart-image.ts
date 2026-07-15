import { Resvg } from '@resvg/resvg-js';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { ChartPatternLine, ChartPatternOverlay, MarketAnalysisResponse } from '@/types';
import type { TechnicalChartAnalysis } from '@/lib/ai/technical-chart-analysis';
import { describeProfessionalPlan } from '@/lib/finance/core/professional-plan-presentation';

const WIDTH = 1200;
const HEIGHT = 1500;
const PRICE_PLOT = { left: 82, top: 158, width: 1010, height: 535 };
const VOLUME_PLOT = { left: 82, top: 718, width: 1010, height: 105 };
const RANGE_BARS = 252;
const FONT_FAMILY = 'Noto Sans KR';
const FONT = `'${FONT_FAMILY}'`;
const FONT_FILE = 'assets/fonts/NotoSansKR-Variable.ttf';

export interface TelegramChartImageInput {
  ticker: string;
  exchange: string;
  name?: string | null;
  rank: number;
  analysis: MarketAnalysisResponse;
  technical: TechnicalChartAnalysis;
  rangeBars?: number | null;
}

export function telegramChartFontPath() {
  return path.join(process.cwd(), FONT_FILE);
}

function requireTelegramChartFont() {
  const fontPath = telegramChartFontPath();
  if (!existsSync(fontPath)) {
    throw new Error(`Telegram chart font is missing: ${fontPath}`);
  }
  return fontPath;
}

export function selectTelegramChartPicks<T extends { rank: number; chartGate?: { eligible?: boolean } }>(picks: T[], limit: number) {
  return [...picks]
    .filter((pick) => pick.chartGate?.eligible === true)
    .sort((left, right) => left.rank - right.rank)
    .slice(0, Math.min(10, Math.max(1, limit)));
}

export function isTelegramChartAnalysisSendable(
  technical: Pick<TechnicalChartAnalysis, 'verdict' | 'readiness'>,
) {
  return technical.verdict !== 'AVOID'
    && technical.readiness !== 'INVALID'
    && technical.readiness !== 'EXTENDED';
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] || char);
}

function number(value: number | null | undefined, digits = 2) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-US', { maximumFractionDigits: digits })
    : '-';
}

function percent(value: number | null | undefined, digits = 1) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(digits)}%` : '-';
}

function movingAverage(values: number[], period: number) {
  return values.map((_, index) => {
    if (index < period - 1) return null;
    return values.slice(index - period + 1, index + 1).reduce((sum, value) => sum + value, 0) / period;
  });
}

function linePath(values: Array<number | null>, x: (index: number) => number, y: (value: number) => number) {
  return values.reduce((path, value, index) => value === null
    ? path
    : `${path}${path ? ' L ' : 'M '}${x(index).toFixed(1)} ${y(value).toFixed(1)}`, '');
}

function chartX(index: number, count: number) {
  return PRICE_PLOT.left + (count <= 1 ? 0 : (index / (count - 1)) * PRICE_PLOT.width);
}

function categoryColor(category: ChartPatternOverlay['lines'][number]['category']) {
  return { base: '#38bdf8', pattern: '#a78bfa', pivot: '#fbbf24', risk: '#fb7185', volume: '#34d399' }[category];
}

function truncate(value: string, length: number) {
  return value.length > length ? `${value.slice(0, Math.max(0, length - 1))}...` : value;
}

function wrapText(value: string, maxChars: number, maxLines: number) {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const lines: string[] = [];
  let remaining = clean;
  while (remaining && lines.length < maxLines) {
    if (remaining.length <= maxChars) {
      lines.push(remaining);
      remaining = '';
      break;
    }
    const wordBoundary = remaining.lastIndexOf(' ', maxChars);
    const splitAt = wordBoundary >= Math.floor(maxChars * 0.55) ? wordBoundary : maxChars;
    lines.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining && lines.length > 0) {
    const last = lines.length - 1;
    lines[last] = `${lines[last].slice(0, Math.max(1, maxChars - 3)).trimEnd()}...`;
  }
  return lines;
}

function textLines(value: string, x: number, y: number, maxChars: number, maxLines: number, color: string, size = 20, lineHeight = 29) {
  return wrapText(value, maxChars, maxLines)
    .map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" fill="${color}" font-size="${size}" font-family="${FONT}">${escapeXml(line)}</text>`)
    .join('');
}

export function selectActionableChartPatterns(
  patterns: ChartPatternOverlay[],
  bars: MarketAnalysisResponse['priceData'],
) {
  const priority = ['VCP', 'HIGH_TIGHT_FLAG', 'CUP_WITH_HANDLE', 'DOUBLE_BOTTOM'];
  const dateIndex = new Map(bars.map((bar, index) => [bar.date, index]));
  const latestIndex = bars.length - 1;
  const relevant = patterns.filter((pattern) => {
    if (pattern.status === 'INVALIDATED' || pattern.confidence < 0.55) return false;
    if (pattern.status === 'CANDIDATE' && pattern.confidence < 0.72) return false;
    const endIndex = dateIndex.get(pattern.dateRange.end);
    return endIndex === undefined || latestIndex - endIndex <= 80;
  });
  const primary = [...relevant]
    .filter((pattern) => priority.includes(pattern.type))
    .sort((left, right) => priority.indexOf(left.type) - priority.indexOf(right.type) || right.confidence - left.confidence)[0];
  const supportResistance = relevant.find((pattern) => pattern.type === 'SUPPORT_RESISTANCE');
  const volumeSignal = relevant.find((pattern) => pattern.type === 'POCKET_PIVOT');
  return [primary, supportResistance, volumeSignal].filter((pattern): pattern is ChartPatternOverlay => Boolean(pattern));
}

function patternLabel(pattern: ChartPatternOverlay) {
  return {
    VCP: 'VCP 변동성 수축',
    HIGH_TIGHT_FLAG: '고수익 플래그',
    BOLLINGER_SQUEEZE: '변동성 압축',
    POCKET_PIVOT: '포켓 피벗',
    SUPPORT_RESISTANCE: '지지·저항',
    CUP_WITH_HANDLE: '컵 위드 핸들',
    DOUBLE_BOTTOM: '이중 바닥',
  }[pattern.type];
}

function nearestSupportResistanceLines(patterns: ChartPatternOverlay[], currentPrice: number) {
  const lines = patterns.filter((pattern) => pattern.type === 'SUPPORT_RESISTANCE').flatMap((pattern) => pattern.lines);
  const price = (line: ChartPatternLine) => line.points.at(-1)?.price ?? 0;
  const support = lines.filter((line) => price(line) < currentPrice).sort((left, right) => price(right) - price(left))[0];
  const resistance = lines.filter((line) => price(line) >= currentPrice).sort((left, right) => price(left) - price(right))[0];
  return [support, resistance].filter((line): line is ChartPatternLine => Boolean(line));
}

function section(title: string, body: string, y: number, accent: string, maxLines = 2) {
  return `<line x1="82" y1="${y}" x2="82" y2="${y + 88}" stroke="${accent}" stroke-width="5"/>
    <text x="106" y="${y + 20}" fill="${accent}" font-size="19" font-family="${FONT}" font-weight="700">${escapeXml(title)}</text>
    ${textLines(body, 106, y + 53, 70, maxLines, '#e2e8f0', 22, 29)}`;
}

export function renderTelegramChartPng(input: TelegramChartImageInput) {
  const bars = input.analysis.priceData.slice(-(input.rangeBars || RANGE_BARS));
  if (bars.length < 20) throw new Error('At least 20 price bars are required to render a Telegram chart.');
  const setup = input.technical.professionalPlan;
  const presentation = describeProfessionalPlan(setup);
  const currentPrice = bars.at(-1)?.close ?? 0;
  const scalePrices = [
    ...bars.flatMap((bar) => [bar.low, bar.high]),
    setup.triggerPrice,
    setup.stopPrice,
    setup.entryZoneLow,
    setup.entryZoneHigh,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
  const priceMin = Math.min(...scalePrices);
  const priceMax = Math.max(...scalePrices);
  const padding = Math.max((priceMax - priceMin) * 0.07, priceMax * 0.008);
  const y = (value: number) => PRICE_PLOT.top + ((priceMax + padding - value) / (priceMax - priceMin + padding * 2)) * PRICE_PLOT.height;
  const x = (index: number) => chartX(index, bars.length);
  const dateIndex = new Map(bars.map((bar, index) => [bar.date, index]));
  const closes = bars.map((bar) => bar.close);
  const volumeMax = Math.max(...bars.map((bar) => bar.volume || 0), 1);
  const maLines = [
    { values: movingAverage(closes, 20), color: '#60a5fa', label: '20일선' },
    { values: movingAverage(closes, 50), color: '#fbbf24', label: '50일선' },
    { values: movingAverage(closes, 200), color: '#f97316', label: '200일선' },
  ];
  const toIndex = (date: string) => dateIndex.get(date) ?? (date < bars[0].date ? 0 : bars.length - 1);
  const patterns = selectActionableChartPatterns(input.analysis.chartPatterns || [], bars);
  const primary = patterns.find((pattern) => pattern.type !== 'SUPPORT_RESISTANCE' && pattern.type !== 'POCKET_PIVOT');
  const zones = (primary?.zones || []).slice(-3).map((zone) => {
    const x1 = x(toIndex(zone.startDate));
    const x2 = x(toIndex(zone.endDate));
    const y1 = y(zone.high);
    const y2 = y(zone.low);
    return `<rect x="${Math.min(x1, x2).toFixed(1)}" y="${Math.min(y1, y2).toFixed(1)}" width="${Math.max(2, Math.abs(x2 - x1)).toFixed(1)}" height="${Math.max(2, Math.abs(y2 - y1)).toFixed(1)}" fill="${categoryColor(zone.category)}" fill-opacity="0.10" stroke="${categoryColor(zone.category)}" stroke-opacity="0.55" stroke-width="1.5"/>`;
  }).join('');
  const visibleLines = [
    ...(primary?.lines || []).slice(-3),
    ...nearestSupportResistanceLines(patterns, currentPrice),
  ];
  const overlayLines = visibleLines.map((line) => {
    const [start, end] = line.points;
    const dash = line.style === 'dashed' ? '8 6' : line.style === 'dotted' ? '2 6' : '';
    return `<line x1="${x(toIndex(start.date)).toFixed(1)}" y1="${y(start.price).toFixed(1)}" x2="${x(toIndex(end.date)).toFixed(1)}" y2="${y(end.price).toFixed(1)}" stroke="${categoryColor(line.category)}" stroke-width="1.5" stroke-dasharray="${dash}" stroke-opacity="0.72"/>`;
  }).join('');
  const markers = patterns.filter((pattern) => pattern.type === 'POCKET_PIVOT').flatMap((pattern) => pattern.markers).slice(-3).map((marker) => {
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
    const height = ((bar.volume || 0) / volumeMax) * VOLUME_PLOT.height;
    return `<rect x="${(x(index) - Math.max(1, 300 / bars.length)).toFixed(1)}" y="${(VOLUME_PLOT.top + VOLUME_PLOT.height - height).toFixed(1)}" width="${Math.max(2, 600 / bars.length).toFixed(1)}" height="${height.toFixed(1)}" fill="${bar.close >= bar.open ? '#10b981' : '#fb7185'}" fill-opacity="0.42"/>`;
  }).join('');
  const horizontalLine = (
    value: number,
    label: string,
    color: string,
    dash = '8 6',
    side: 'left' | 'right' = 'right',
  ) => {
    const labelX = side === 'right' ? PRICE_PLOT.left + PRICE_PLOT.width - 238 : PRICE_PLOT.left;
    const textX = side === 'right' ? PRICE_PLOT.left + PRICE_PLOT.width - 10 : PRICE_PLOT.left + 10;
    return `<line x1="${PRICE_PLOT.left}" y1="${y(value).toFixed(1)}" x2="${PRICE_PLOT.left + PRICE_PLOT.width}" y2="${y(value).toFixed(1)}" stroke="${color}" stroke-width="2" stroke-dasharray="${dash}"/><rect x="${labelX}" y="${(y(value) - 24).toFixed(1)}" width="238" height="28" fill="#020617" fill-opacity="0.9"/><text x="${textX}" y="${(y(value) - 5).toFixed(1)}" fill="${color}" text-anchor="${side === 'right' ? 'end' : 'start'}" font-size="17" font-family="${FONT}" font-weight="700">${escapeXml(label)} ${number(value)}</text>`;
  };
  const levelLines: Array<{ value: number; label: string; color: string; dash: string; side: 'left' | 'right' }> = [];
  const addLevel = (value: number | null, label: string, color: string, dash: string, side: 'left' | 'right') => {
    if (value === null || value < priceMin - padding || value > priceMax + padding) return;
    if (levelLines.some((line) => Math.abs(line.value - value) / value < 0.0025)) return;
    levelLines.push({ value, label, color, dash, side });
  };
  addLevel(currentPrice, '현재가', '#f8fafc', '2 5', 'right');
  addLevel(setup.triggerPrice, '1 돌파 기준', '#fbbf24', '8 6', 'right');
  addLevel(setup.stopPrice, '3 무효화', '#fb7185', '8 6', 'right');
  addLevel(setup.keySupport, '2 핵심 지지', '#38bdf8', '5 5', 'left');
  addLevel(setup.keyResistance, setup.triggerPrice === null ? '1 핵심 저항 · 매수가 아님' : '상단 저항', '#a78bfa', '3 7', 'left');
  const planLines = levelLines.map((line) => horizontalLine(line.value, line.label, line.color, line.dash, line.side)).join('');
  const entryZone = setup.entryZoneLow !== null && setup.entryZoneHigh !== null
    ? `<rect x="${PRICE_PLOT.left}" y="${y(setup.entryZoneHigh).toFixed(1)}" width="${PRICE_PLOT.width}" height="${Math.max(2, y(setup.entryZoneLow) - y(setup.entryZoneHigh)).toFixed(1)}" fill="#38bdf8" fill-opacity="0.10" stroke="#38bdf8" stroke-opacity="0.6" stroke-width="1"/><text x="${PRICE_PLOT.left + 8}" y="${(y(setup.entryZoneHigh) - 7).toFixed(1)}" fill="#7dd3fc" font-size="17" font-family="${FONT}" font-weight="700">계획 구간 ${number(setup.entryZoneLow)}~${number(setup.entryZoneHigh)}</text>`
    : '';
  const dateTicks = Array.from({ length: 6 }, (_, index) => Math.round(index * (bars.length - 1) / 5)).map((index) => `<line x1="${x(index).toFixed(1)}" y1="${VOLUME_PLOT.top + VOLUME_PLOT.height}" x2="${x(index).toFixed(1)}" y2="${VOLUME_PLOT.top + VOLUME_PLOT.height + 7}" stroke="#64748b"/><text x="${x(index).toFixed(1)}" y="${VOLUME_PLOT.top + VOLUME_PLOT.height + 27}" fill="#94a3b8" text-anchor="middle" font-size="13" font-family="${FONT}">${escapeXml(bars[index].date.slice(2))}</text>`).join('');
  const verdictColor = input.technical.verdict === 'BUY' ? '#34d399' : input.technical.verdict === 'AVOID' ? '#fb7185' : '#fbbf24';
  const alignmentColor = setup.timeframeAlignment === 'BULLISH_ALIGNED' ? '#34d399' : setup.timeframeAlignment === 'BEARISH_CONFLICT' ? '#fb7185' : '#c4b5fd';
  const labels = patterns.map((pattern) => `${patternLabel(pattern)} ${Math.round(pattern.confidence * 100)}%`).join(' · ') || '확정 패턴 없음';
  const confluenceDetails = setup.confluenceFactors
    .filter((factor) => factor.status === 'PASS' || factor.status === 'PARTIAL')
    .slice(0, 3)
    .map((factor) => `${factor.label} ${factor.score}/${factor.maxScore}`)
    .join(' · ') || '확인된 정합 요인 없음';
  const [primaryScenario, alternateScenario, failureScenario] = setup.scenarios;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <rect width="100%" height="100%" fill="#020617"/>
    <text x="82" y="20" fill="#64748b" font-size="13" font-family="${FONT}" font-weight="700">MTN TECHNICAL INSIGHT · DETERMINISTIC LEVELS</text>
    <text x="82" y="54" fill="#f8fafc" font-size="30" font-family="${FONT}" font-weight="700">${escapeXml(input.ticker)}${input.name ? ` · ${escapeXml(truncate(input.name, 24))}` : ''}</text>
    <text x="82" y="82" fill="#94a3b8" font-size="16" font-family="${FONT}">${escapeXml(input.exchange)} · 추천 ${input.rank}위 · 기준일 ${escapeXml(bars.at(-1)?.date || '')}</text>
    <text x="1110" y="54" fill="${verdictColor}" text-anchor="end" font-size="29" font-family="${FONT}" font-weight="700">${escapeXml(presentation.verdictLabel)}</text>
    <text x="1110" y="82" fill="#cbd5e1" text-anchor="end" font-size="16" font-family="${FONT}">현재가 ${number(currentPrice)} · 거래량 ${number(setup.relativeVolume, 1)}배</text>
    <text x="82" y="130" fill="#60a5fa" font-size="16" font-family="${FONT}">20일선</text><text x="155" y="130" fill="#fbbf24" font-size="16" font-family="${FONT}">50일선</text><text x="228" y="130" fill="#f97316" font-size="16" font-family="${FONT}">200일선</text><text x="310" y="130" fill="#94a3b8" font-size="16" font-family="${FONT}">${escapeXml(truncate(labels, 82))}</text>
    ${Array.from({ length: 6 }, (_, index) => { const value = priceMin + ((priceMax - priceMin) * index / 5); return `<line x1="${PRICE_PLOT.left}" y1="${y(value).toFixed(1)}" x2="${PRICE_PLOT.left + PRICE_PLOT.width}" y2="${y(value).toFixed(1)}" stroke="#1e293b" stroke-width="1"/><text x="20" y="${(y(value) + 5).toFixed(1)}" fill="#64748b" font-size="13" font-family="${FONT}">${number(value)}</text>`; }).join('')}
    ${zones}${entryZone}${candlesticks}${maLines.map((line) => `<path d="${linePath(line.values, x, y)}" fill="none" stroke="${line.color}" stroke-width="1.6"/>`).join('')}${overlayLines}${planLines}${markers}
    <line x1="${VOLUME_PLOT.left}" y1="${VOLUME_PLOT.top + VOLUME_PLOT.height}" x2="${VOLUME_PLOT.left + VOLUME_PLOT.width}" y2="${VOLUME_PLOT.top + VOLUME_PLOT.height}" stroke="#334155"/>${volumes}${dateTicks}
    <line x1="82" y1="866" x2="1110" y2="866" stroke="#334155"/>
    <rect x="82" y="890" width="330" height="110" fill="#0f172a"/><rect x="435" y="890" width="330" height="110" fill="#0f172a"/><rect x="788" y="890" width="322" height="110" fill="#0f172a"/>
    <text x="102" y="918" fill="${verdictColor}" font-size="18" font-family="${FONT}" font-weight="700">판정 · ${escapeXml(presentation.verdictLabel)} (${presentation.verdictCode})</text>
    ${textLines(presentation.verdictMeaning, 102, 951, 25, 3, '#cbd5e1', 17, 21)}
    <text x="455" y="918" fill="#7dd3fc" font-size="18" font-family="${FONT}" font-weight="700">컨플루언스 · ${setup.confluenceScore}/100 · ${presentation.gradeCode}</text>
    ${textLines(confluenceDetails, 455, 951, 25, 3, '#cbd5e1', 17, 21)}
    <text x="808" y="918" fill="${alignmentColor}" font-size="18" font-family="${FONT}" font-weight="700">다중 시간대 · ${escapeXml(presentation.readinessLabel)}</text>
    ${textLines(`${setup.timeframeSummary}. ${presentation.readinessMeaning}`, 808, 951, 24, 3, '#cbd5e1', 17, 21)}
    ${section('지금 할 일', presentation.action, 1020, verdictColor)}
    ${section(`1 ${primaryScenario.label}`, `${primaryScenario.condition} ${primaryScenario.action}`, 1132, '#38bdf8', 3)}
    ${section(`2 ${alternateScenario.label}`, `${alternateScenario.condition} ${alternateScenario.action}`, 1260, '#a78bfa', 3)}
    ${section(`3 ${failureScenario.label}`, `${failureScenario.condition} ${failureScenario.action}`, 1380, '#fb7185', 3)}
  </svg>`;
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: WIDTH },
    font: {
      fontFiles: [requireTelegramChartFont()],
      loadSystemFonts: false,
      defaultFontFamily: FONT_FAMILY,
      sansSerifFamily: FONT_FAMILY,
    },
    languages: ['ko-KR', 'en-US'],
    textRendering: 1,
  }).render().asPng();
}

export function telegramChartCaption(input: TelegramChartImageInput) {
  const setup = input.technical.professionalPlan;
  const presentation = describeProfessionalPlan(setup);
  const entry = setup.entryZoneLow !== null && setup.entryZoneHigh !== null
    ? `${number(setup.entryZoneLow)}~${number(setup.entryZoneHigh)}`
    : '유효 진입가 미확정';
  return [
    `${input.ticker} · 추천 ${input.rank}위`,
    `판정: ${presentation.verdictLabel}(${presentation.verdictCode}) - ${presentation.verdictMeaning}`,
    `품질: ${presentation.gradeCode}·${presentation.gradeLabel} · 컨플루언스 ${setup.confluenceScore}/100`,
    `현재 단계: ${presentation.readinessLabel}(${presentation.readinessCode}) - ${presentation.readinessMeaning}`,
    `다중 시간대: ${setup.timeframeSummary}`,
    `핵심 레벨: 지지 ${number(setup.keySupport)} · 저항 ${number(setup.keyResistance)}`,
    `계획 구간: ${entry} · 손절: ${number(setup.stopPrice)} · 2R 목표: ${number(setup.targetPrice)}`,
    `지금 할 일: ${presentation.action}`,
    `기본 시나리오: ${setup.scenarios[0].condition}`,
    `실패 조건: ${setup.scenarios[2].condition}`,
  ].join('\n').slice(0, 1024);
}
