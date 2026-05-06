import type { ScannerUniverse } from '@/types';

export type ContestScreenerSource = 'minervini' | 'canslim';

export const DEFAULT_CONTEST_SOURCE: ContestScreenerSource = 'minervini';
export const CONTEST_SOURCE_STORAGE_KEY = 'mtn:contest:last-source:v1';
export const CONTEST_SELECTION_STORAGE_KEY = 'mtn:contest:selected:v1';
export const CONTEST_SELECTIONS_MAP_KEY = 'mtn:contest:selections:v2';
export const CONTEST_SELECTIONS_SOURCE_MAP_KEY = 'mtn:contest:selections-by-source:v1';
export const CANSLIM_SNAPSHOT_PREFIX = 'mtn:canslim-snapshot:v1:';
export const CANSLIM_LATEST_UNIVERSE_STORAGE_KEY = 'mtn:canslim:latest-scan-universe:v1';
export const MAX_CONTEST_CANDIDATES = 15;

export interface ContestTransferSelection {
  source: ContestScreenerSource;
  universe: ScannerUniverse;
  tickers: string[];
  savedAt: string;
}

export function parseContestSource(value: unknown): ContestScreenerSource | null {
  if (value === 'canslim' || value === 'oneil' || value === 'oneil-canslim') return 'canslim';
  if (value === 'minervini' || value === 'sepa' || value === 'mtn') return 'minervini';
  return null;
}

export function contestSourceLabel(source: ContestScreenerSource) {
  return source === 'canslim' ? "O'Neil CANSLIM" : 'Minervini SEPA/VCP';
}

export function sourceUniverseKey(source: ContestScreenerSource, universe: ScannerUniverse) {
  return `${source}:${universe}`;
}
