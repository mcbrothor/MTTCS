import { set } from 'idb-keyval';
import type { ScannerUniverse } from '@/types';

export const CROSS_CHECK_STORAGE = {
  minervini: 'mtn:scanner-snapshot:v3:',
  canslim: 'mtn:canslim-snapshot:v1:',
  leader: 'mtn:modern-leader-snapshot:v1:',
  momentum: 'mtn:scanner:momentum:v1:',
  qullamaggie: 'mtn:scanner:qullamaggie:v1:',
  reversal: 'mtn:scanner:reversal:v1:',
} as const;

export async function saveCrossCheckSnapshot(source: 'momentum' | 'qullamaggie' | 'reversal', universe: ScannerUniverse, results: unknown[], failed: number) {
  await set(`${CROSS_CHECK_STORAGE[source]}${universe}`, { universe, savedAt: new Date().toISOString(), results, failed });
}
