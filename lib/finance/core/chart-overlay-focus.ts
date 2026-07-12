import type { ChartPatternOverlayCategory } from '@/types';

export type ChartOverlayMode = 'all' | 'base' | 'pivot' | 'volume';

function categoriesForMode(mode: ChartOverlayMode): Set<ChartPatternOverlayCategory> | null {
  if (mode === 'all') return null;
  if (mode === 'base') return new Set(['base', 'pattern']);
  if (mode === 'pivot') return new Set(['pivot', 'risk']);
  return new Set(['volume']);
}

export function isChartOverlayVisible(input: {
  patternId: string;
  category: ChartPatternOverlayCategory;
  mode: ChartOverlayMode;
  focusedPatternId: string | null;
}) {
  if (input.focusedPatternId) return input.patternId === input.focusedPatternId;
  const categories = categoriesForMode(input.mode);
  return categories === null || categories.has(input.category);
}
