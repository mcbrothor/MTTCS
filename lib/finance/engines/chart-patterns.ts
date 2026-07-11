import type {
  ChartPatternLine,
  ChartPatternMarker,
  ChartPatternOverlay,
  ChartPatternOverlayCategory,
  ChartPatternZone,
  OHLCData,
  RiskPlan,
  VcpAnalysis,
} from '../../../types/index.ts';

interface BuildChartPatternsInput {
  data: OHLCData[];
  vcpAnalysis: VcpAnalysis;
  riskPlan?: RiskPlan | null;
}

interface IndexedPoint {
  index: number;
  date: string;
  price: number;
}

const MAX_SUPPORT_RESISTANCE_LINES = 6;

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function firstDate(data: OHLCData[]) {
  return data[0]?.date ?? '';
}

function lastDate(data: OHLCData[]) {
  return data.at(-1)?.date ?? '';
}

function dateAtOrLast(data: OHLCData[], index: number) {
  return data[Math.max(0, Math.min(data.length - 1, index))]?.date ?? lastDate(data);
}

function priceRange(data: OHLCData[]) {
  if (data.length === 0) return { low: 0, high: 0 };
  return {
    low: round(Math.min(...data.map((bar) => bar.low))),
    high: round(Math.max(...data.map((bar) => bar.high))),
  };
}

function confidenceFromScore(score: number, floor = 0.35, ceiling = 0.92) {
  return round(clamp(floor + (score / 100) * (ceiling - floor), floor, ceiling), 2);
}

function horizontalLine(
  id: string,
  label: string,
  category: ChartPatternOverlayCategory,
  price: number,
  startDate: string,
  endDate: string,
  style: ChartPatternLine['style'] = 'solid',
): ChartPatternLine {
  return {
    id,
    label,
    category,
    points: [{ date: startDate, price: round(price) }, { date: endDate, price: round(price) }],
    style,
  };
}

function zoneForBars(
  id: string,
  label: string,
  category: ChartPatternOverlayCategory,
  data: OHLCData[],
): ChartPatternZone | null {
  if (data.length === 0) return null;
  const range = priceRange(data);
  return {
    id,
    label,
    category,
    startDate: firstDate(data),
    endDate: lastDate(data),
    low: range.low,
    high: range.high,
  };
}

function buildVcpPattern(data: OHLCData[], vcp: VcpAnalysis): ChartPatternOverlay | null {
  if (data.length === 0) return null;
  const hasSignal = vcp.contractions.length > 0 || vcp.pivotPrice !== null || vcp.invalidationPrice !== null;
  if (!hasSignal) return null;

  const start = vcp.contractions[0]?.peakDate ?? vcp.pivotDate ?? firstDate(data);
  const lines: ChartPatternLine[] = [];
  const zones: ChartPatternZone[] = vcp.contractions.map((contraction, index) => ({
    id: `vcp-contraction-${index + 1}`,
    label: `C${index + 1} ${contraction.depthPct}%`,
    category: 'base',
    startDate: contraction.peakDate,
    endDate: contraction.troughDate,
    low: round(contraction.troughPrice),
    high: round(contraction.peakPrice),
  }));

  if (vcp.pivotPrice !== null) {
    lines.push(horizontalLine('vcp-pivot', 'VCP Pivot', 'pivot', vcp.pivotPrice, start, lastDate(data), 'solid'));
  }
  if (vcp.invalidationPrice !== null) {
    lines.push(horizontalLine('vcp-invalidation', 'Invalidation', 'risk', vcp.invalidationPrice, start, lastDate(data), 'dashed'));
  }

  const anchors = [
    ...vcp.contractions.flatMap((contraction, index) => [
      { date: contraction.peakDate, price: contraction.peakPrice, role: `contraction_${index + 1}_peak`, label: `C${index + 1} high` },
      { date: contraction.troughDate, price: contraction.troughPrice, role: `contraction_${index + 1}_trough`, label: `C${index + 1} low` },
    ]),
    ...(vcp.pivotPrice !== null && vcp.pivotDate ? [{ date: vcp.pivotDate, price: vcp.pivotPrice, role: 'pivot', label: 'Pivot' }] : []),
  ];

  const rangePrices = [
    ...vcp.contractions.flatMap((item) => [item.peakPrice, item.troughPrice]),
    vcp.pivotPrice,
    vcp.invalidationPrice,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  return {
    id: 'pattern-vcp',
    type: 'VCP',
    label: 'VCP Base',
    confidence: confidenceFromScore(vcp.score),
    status: vcp.grade === 'strong' ? 'CONFIRMED' : vcp.grade === 'none' ? 'CANDIDATE' : 'FORMING',
    dateRange: { start, end: lastDate(data) },
    priceRange: {
      low: round(Math.min(...rangePrices)),
      high: round(Math.max(...rangePrices)),
    },
    anchors,
    lines,
    zones,
    markers: [],
    evidence: {
      score: vcp.score,
      grade: vcp.grade,
      contractionCount: vcp.contractions.length,
      contractionDepths: vcp.contractions.map((item) => item.depthPct),
      volumeDryUpScore: vcp.volumeDryUpScore,
      breakoutVolumeStatus: vcp.breakoutVolumeStatus,
    },
  };
}

function buildHighTightFlagPattern(data: OHLCData[], vcp: VcpAnalysis): ChartPatternOverlay | null {
  const htf = vcp.highTightFlag;
  if (!htf || data.length === 0) return null;

  const baseStartIndex = Math.max(0, data.length - htf.baseDays);
  const baseStart = dateAtOrLast(data, baseStartIndex);
  const end = lastDate(data);
  const lines = [
    horizontalLine('htf-pivot', 'HTF Pivot', 'pivot', htf.baseHigh, baseStart, end, 'solid'),
    ...(htf.stopPrice !== null ? [horizontalLine('htf-stop', 'HTF Stop', 'risk', htf.stopPrice, baseStart, end, 'dashed')] : []),
  ];
  const zone = zoneForBars('htf-base-zone', 'HTF Base', 'base', data.slice(baseStartIndex));

  return {
    id: 'pattern-high-tight-flag',
    type: 'HIGH_TIGHT_FLAG',
    label: 'High Tight Flag',
    confidence: htf.passed ? 0.86 : confidenceFromScore(htf.tightnessScore, 0.3, 0.68),
    status: htf.passed ? 'CONFIRMED' : 'CANDIDATE',
    dateRange: { start: baseStart, end },
    priceRange: { low: round(htf.baseLow), high: round(htf.baseHigh) },
    anchors: [
      { date: baseStart, price: htf.baseHigh, role: 'base_high', label: 'Base high' },
      { date: end, price: htf.baseLow, role: 'base_low', label: 'Base low' },
    ],
    lines,
    zones: zone ? [zone] : [],
    markers: [],
    evidence: {
      passed: htf.passed,
      baseDays: htf.baseDays,
      maxDrawdownPct: htf.maxDrawdownPct,
      rightSideVolumeRatio: htf.rightSideVolumeRatio,
      tightnessScore: htf.tightnessScore,
      stopReliability: htf.stopReliability,
    },
  };
}

function buildBollingerSqueezePattern(data: OHLCData[], vcp: VcpAnalysis): ChartPatternOverlay | null {
  if (data.length < 20 || vcp.bbWidth === null || vcp.bbWidthPercentile === null || vcp.bbWidthPercentile > 40) return null;
  const slice = data.slice(-20);
  const zone = zoneForBars('bb-squeeze-zone', 'BB Squeeze', 'base', slice);
  if (!zone) return null;

  return {
    id: 'pattern-bollinger-squeeze',
    type: 'BOLLINGER_SQUEEZE',
    label: 'BB Squeeze',
    confidence: vcp.bbWidthPercentile <= 20 ? 0.82 : 0.62,
    status: vcp.bbWidthPercentile <= 20 ? 'CONFIRMED' : 'FORMING',
    dateRange: { start: firstDate(slice), end: lastDate(slice) },
    priceRange: { low: zone.low, high: zone.high },
    anchors: [],
    lines: [],
    zones: [zone],
    markers: [],
    evidence: {
      bbWidth: vcp.bbWidth,
      bbWidthPercentile: vcp.bbWidthPercentile,
      bbSqueezeScore: vcp.bbSqueezeScore,
    },
  };
}

function buildPocketPivotPattern(data: OHLCData[], vcp: VcpAnalysis): ChartPatternOverlay | null {
  if (data.length === 0 || vcp.pocketPivots.length === 0) return null;
  const markers: ChartPatternMarker[] = vcp.pocketPivots.map((pivot, index) => ({
    id: `pocket-pivot-${index + 1}`,
    label: 'Pocket Pivot',
    category: 'volume',
    shape: 'diamond',
    date: pivot.date,
    price: pivot.close,
  }));

  return {
    id: 'pattern-pocket-pivot',
    type: 'POCKET_PIVOT',
    label: 'Pocket Pivot',
    confidence: vcp.pocketPivots.length >= 2 ? 0.86 : 0.66,
    status: vcp.pocketPivots.length >= 2 ? 'CONFIRMED' : 'FORMING',
    dateRange: { start: vcp.pocketPivots[0].date, end: vcp.pocketPivots.at(-1)?.date ?? lastDate(data) },
    priceRange: {
      low: round(Math.min(...vcp.pocketPivots.map((item) => item.close))),
      high: round(Math.max(...vcp.pocketPivots.map((item) => item.close))),
    },
    anchors: vcp.pocketPivots.map((pivot) => ({ date: pivot.date, price: pivot.close, role: 'pocket_pivot', label: 'Pocket Pivot' })),
    lines: [],
    zones: [],
    markers,
    evidence: {
      count: vcp.pocketPivots.length,
      pocketPivotScore: vcp.pocketPivotScore,
      volumes: vcp.pocketPivots.map((pivot) => pivot.volume),
    },
  };
}

function findSwings(data: OHLCData[], lookback = 120) {
  const slice = data.slice(-lookback);
  const offset = data.length - slice.length;
  const highs: IndexedPoint[] = [];
  const lows: IndexedPoint[] = [];
  for (let index = 2; index < slice.length - 2; index += 1) {
    const bar = slice[index];
    const neighbors = [slice[index - 2], slice[index - 1], slice[index + 1], slice[index + 2]];
    if (neighbors.every((item) => bar.high >= item.high)) {
      highs.push({ index: offset + index, date: bar.date, price: round(bar.high) });
    }
    if (neighbors.every((item) => bar.low <= item.low)) {
      lows.push({ index: offset + index, date: bar.date, price: round(bar.low) });
    }
  }
  return { highs, lows, slice };
}

function clusterLevels(points: IndexedPoint[], tolerancePct = 1.5) {
  const clusters: IndexedPoint[][] = [];
  for (const point of [...points].sort((a, b) => a.price - b.price)) {
    const cluster = clusters.find((items) => Math.abs(point.price / (items.reduce((sum, item) => sum + item.price, 0) / items.length) - 1) * 100 <= tolerancePct);
    if (cluster) cluster.push(point);
    else clusters.push([point]);
  }
  return clusters
    .filter((cluster) => cluster.length >= 2)
    .map((cluster) => ({
      points: cluster,
      price: round(cluster.reduce((sum, item) => sum + item.price, 0) / cluster.length),
      touches: cluster.length,
      latestIndex: Math.max(...cluster.map((item) => item.index)),
    }))
    .sort((a, b) => b.touches - a.touches || b.latestIndex - a.latestIndex);
}

function buildSupportResistancePattern(data: OHLCData[]): ChartPatternOverlay | null {
  if (data.length < 50) return null;
  const { highs, lows, slice } = findSwings(data);
  const start = firstDate(slice);
  const end = lastDate(slice);
  const support = clusterLevels(lows).slice(0, 3);
  const resistance = clusterLevels(highs).slice(0, 3);
  const lines = [
    ...resistance.map((level, index) => horizontalLine(`resistance-${index + 1}`, `R${index + 1}`, 'pivot', level.price, start, end, 'dashed')),
    ...support.map((level, index) => horizontalLine(`support-${index + 1}`, `S${index + 1}`, 'risk', level.price, start, end, 'dashed')),
  ].slice(0, MAX_SUPPORT_RESISTANCE_LINES);
  if (lines.length === 0) return null;
  const linePrices = lines.flatMap((line) => line.points.map((point) => point.price));

  return {
    id: 'pattern-support-resistance',
    type: 'SUPPORT_RESISTANCE',
    label: 'Support / Resistance',
    confidence: round(clamp(0.45 + Math.min(lines.length, 4) * 0.08, 0.45, 0.78), 2),
    status: 'FORMING',
    dateRange: { start, end },
    priceRange: { low: Math.min(...linePrices), high: Math.max(...linePrices) },
    anchors: [],
    lines,
    zones: [],
    markers: [],
    evidence: {
      supportTouches: support.map((item) => item.touches),
      resistanceTouches: resistance.map((item) => item.touches),
      lookbackBars: slice.length,
    },
  };
}

function buildCupWithHandleCandidate(data: OHLCData[]): ChartPatternOverlay | null {
  if (data.length < 90) return null;
  const slice = data.slice(-180);
  const leftWindow = slice.slice(0, Math.floor(slice.length * 0.45));
  const rightWindow = slice.slice(Math.floor(slice.length * 0.45));
  const leftHigh = leftWindow.reduce((best, bar) => (bar.high > best.high ? bar : best), leftWindow[0]);
  const lowAfterLeft = slice.slice(slice.indexOf(leftHigh)).reduce((best, bar) => (bar.low < best.low ? bar : best), leftHigh);
  const rightHigh = rightWindow.reduce((best, bar) => (bar.high > best.high ? bar : best), rightWindow[0]);
  const depthPct = ((leftHigh.high - lowAfterLeft.low) / leftHigh.high) * 100;
  const rightSideRecoveryPct = rightHigh.high / leftHigh.high;
  const handleSlice = slice.slice(-25);
  const handleHigh = Math.max(...handleSlice.map((bar) => bar.high));
  const handleLow = Math.min(...handleSlice.map((bar) => bar.low));
  const handleDepthPct = ((handleHigh - handleLow) / handleHigh) * 100;

  if (depthPct < 12 || depthPct > 45 || rightSideRecoveryPct < 0.82 || rightSideRecoveryPct > 1.12 || handleDepthPct > 18) {
    return null;
  }

  const pivot = round(Math.min(leftHigh.high, rightHigh.high));
  const start = leftHigh.date;
  const end = lastDate(slice);
  return {
    id: 'pattern-cup-with-handle',
    type: 'CUP_WITH_HANDLE',
    label: 'Cup with Handle',
    confidence: round(clamp(0.42 + (rightSideRecoveryPct - 0.82) * 0.9 + (18 - handleDepthPct) * 0.01, 0.42, 0.72), 2),
    status: 'CANDIDATE',
    dateRange: { start, end },
    priceRange: { low: round(lowAfterLeft.low), high: round(Math.max(leftHigh.high, rightHigh.high)) },
    anchors: [
      { date: leftHigh.date, price: leftHigh.high, role: 'left_rim', label: 'Left rim' },
      { date: lowAfterLeft.date, price: lowAfterLeft.low, role: 'cup_low', label: 'Cup low' },
      { date: rightHigh.date, price: rightHigh.high, role: 'right_rim', label: 'Right rim' },
    ],
    lines: [horizontalLine('cup-pivot', 'Cup Pivot', 'pivot', pivot, start, end, 'solid')],
    zones: [{
      id: 'cup-base-zone',
      label: 'Cup Base',
      category: 'pattern',
      startDate: start,
      endDate: end,
      low: round(lowAfterLeft.low),
      high: round(Math.max(leftHigh.high, rightHigh.high)),
    }],
    markers: [],
    evidence: {
      depthPct: round(depthPct),
      rightSideRecoveryPct: round(rightSideRecoveryPct * 100, 1),
      handleDepthPct: round(handleDepthPct),
    },
  };
}

function buildDoubleBottomCandidate(data: OHLCData[]): ChartPatternOverlay | null {
  if (data.length < 70) return null;
  const { lows, slice } = findSwings(data, 160);
  if (lows.length < 2) return null;

  for (let index = lows.length - 1; index > 0; index -= 1) {
    const second = lows[index];
    const first = [...lows.slice(0, index)].reverse().find((candidate) => second.index - candidate.index >= 15);
    if (!first) continue;
    const troughDiffPct = Math.abs(second.price / first.price - 1) * 100;
    const between = data.slice(first.index, second.index + 1);
    const middleHigh = Math.max(...between.map((bar) => bar.high));
    const rallyPct = ((middleHigh - Math.min(first.price, second.price)) / Math.min(first.price, second.price)) * 100;
    if (troughDiffPct > 5 || rallyPct < 8) continue;

    const end = lastDate(slice);
    const markers: ChartPatternMarker[] = [
      { id: 'double-bottom-low-1', label: 'W1', category: 'pattern', shape: 'triangleUp', date: first.date, price: first.price },
      { id: 'double-bottom-low-2', label: 'W2', category: 'pattern', shape: 'triangleUp', date: second.date, price: second.price },
    ];
    return {
      id: 'pattern-double-bottom',
      type: 'DOUBLE_BOTTOM',
      label: 'Double Bottom',
      confidence: round(clamp(0.44 + (5 - troughDiffPct) * 0.03 + Math.min(rallyPct, 20) * 0.008, 0.44, 0.76), 2),
      status: 'CANDIDATE',
      dateRange: { start: first.date, end },
      priceRange: { low: round(Math.min(first.price, second.price)), high: round(middleHigh) },
      anchors: [
        { date: first.date, price: first.price, role: 'first_trough', label: 'First low' },
        { date: second.date, price: second.price, role: 'second_trough', label: 'Second low' },
      ],
      lines: [horizontalLine('double-bottom-neckline', 'Neckline', 'pivot', middleHigh, first.date, end, 'solid')],
      zones: [],
      markers,
      evidence: {
        troughDiffPct: round(troughDiffPct),
        middleRallyPct: round(rallyPct),
      },
    };
  }

  return null;
}

function validPattern(pattern: ChartPatternOverlay | null): pattern is ChartPatternOverlay {
  if (!pattern) return false;
  const prices = [
    pattern.priceRange.low,
    pattern.priceRange.high,
    ...pattern.anchors.map((anchor) => anchor.price),
    ...pattern.lines.flatMap((line) => line.points.map((point) => point.price)),
    ...pattern.zones.flatMap((zone) => [zone.low, zone.high]),
    ...pattern.markers.map((marker) => marker.price),
  ];
  return prices.every((price) => Number.isFinite(price)) && Boolean(pattern.dateRange.start && pattern.dateRange.end);
}

export function buildChartPatterns(input: BuildChartPatternsInput): ChartPatternOverlay[] {
  const { data, vcpAnalysis } = input;
  if (data.length < 20) return [];

  return [
    buildVcpPattern(data, vcpAnalysis),
    buildHighTightFlagPattern(data, vcpAnalysis),
    buildBollingerSqueezePattern(data, vcpAnalysis),
    buildPocketPivotPattern(data, vcpAnalysis),
    buildSupportResistancePattern(data),
    buildCupWithHandleCandidate(data),
    buildDoubleBottomCandidate(data),
  ].filter(validPattern);
}

export function chartPatternSummary(patterns: ChartPatternOverlay[]) {
  return patterns.map((pattern) => ({
    id: pattern.id,
    type: pattern.type,
    label: pattern.label,
    confidence: pattern.confidence,
    status: pattern.status,
    dateRange: pattern.dateRange,
    priceRange: pattern.priceRange,
    evidence: pattern.evidence,
  }));
}
