import type { DataSourceMeta } from '@/types';

export function isMasterFilterDataStale(
  meta?: Pick<DataSourceMeta, 'fallbackUsed' | 'isStale' | 'warnings'> | null,
) {
  return meta?.fallbackUsed === true || meta?.isStale === true;
}
