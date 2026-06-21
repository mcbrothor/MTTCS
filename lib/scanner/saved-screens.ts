import type { ScannerResult } from '@/types';

const TIER_SCORE: Record<string, number> = { Recommended: 3, Action: 2, 'IB Review': 1 };

export function diffScannerSnapshots(previous: ScannerResult[], current: ScannerResult[]) {
  const before = new Map(previous.map((item) => [item.ticker, item]));
  const after = new Map(current.map((item) => [item.ticker, item]));
  const entered = current.filter((item) => !before.has(item.ticker));
  const exited = previous.filter((item) => !after.has(item.ticker));
  const changed = current.flatMap((item) => {
    const old = before.get(item.ticker);
    if (!old || old.recommendationTier === item.recommendationTier) return [];
    return [{ ticker: item.ticker, name: item.name, from: old.recommendationTier, to: item.recommendationTier,
      direction: (TIER_SCORE[item.recommendationTier || ''] || 0) > (TIER_SCORE[old.recommendationTier || ''] || 0) ? 'up' as const : 'down' as const }];
  });
  return { entered, exited, upgraded: changed.filter((x) => x.direction === 'up'), downgraded: changed.filter((x) => x.direction === 'down') };
}
