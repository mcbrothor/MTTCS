import { get } from 'idb-keyval';
import type { CanslimScannerResult, ScannerUniverse } from '@/types';
import { CANSLIM_SNAPSHOT_PREFIX } from './contest-sources';

export interface StoredCanslimSnapshot {
  savedAt: string;
  universe: ScannerUniverse;
  results: CanslimScannerResult[];
  macro: unknown | null;
}

export async function readCanslimSnapshot(universe: ScannerUniverse, readers = {
  primary: (key: string): Promise<unknown> => get(key),
  legacy: (key: string): unknown => typeof window === 'undefined' ? null : window.localStorage.getItem(key),
}): Promise<StoredCanslimSnapshot | null> {
  const key = `${CANSLIM_SNAPSHOT_PREFIX}${universe}`;
  const raw = await readers.primary(key) ?? readers.legacy(key);
  if (!raw) return null;
  const snapshot = (typeof raw === 'string' ? JSON.parse(raw) : raw) as StoredCanslimSnapshot;
  if (snapshot.universe !== universe || !Array.isArray(snapshot.results)) throw new Error('CAN SLIM 저장 결과의 유니버스 또는 형식이 올바르지 않습니다.');
  return snapshot;
}
