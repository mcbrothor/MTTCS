import type { MacroActionLevel } from '@/types';

export const REDUCED_RS_THRESHOLD = 80;

interface MacroScopedScannerRow {
  status?: 'queued' | 'running' | 'done' | 'error' | null;
  rsRating?: number | null;
}

export function passesScannerMacroPolicy(
  row: MacroScopedScannerRow,
  actionLevel: MacroActionLevel | null | undefined,
  showAllMacroResults = false
) {
  if (!actionLevel || showAllMacroResults) return true;
  if (row.status !== 'done') return true;

  if (actionLevel === 'HALT') return false;
  if (actionLevel === 'REDUCED') return (row.rsRating || 0) >= REDUCED_RS_THRESHOLD;
  return true;
}
