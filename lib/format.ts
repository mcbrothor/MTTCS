import type { DataSourceMeta } from '@/types';

export function formatScore(n: number | null | undefined): string {
  if (n == null) return '-';
  return String(Math.round(n));
}

export function formatPercent(n: number | null | undefined, digits = 2): string {
  if (n == null) return '-';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

export function formatVolume(n: number | null | undefined): string {
  if (n == null) return '-';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatTimestamp(iso: string | null | undefined, mode: 'relative' | 'absolute' = 'relative'): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '-';

  if (mode === 'absolute') {
    return date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}시간 전`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}일 전`;
}

export function formatDelay(meta: DataSourceMeta): string {
  const delayLabel: Record<DataSourceMeta['delay'], string> = {
    REALTIME: '실시간',
    DELAYED_15M: '15분 지연',
    EOD: '장마감 데이터',
    UNKNOWN: '지연 미상',
  };
  return delayLabel[meta.delay] ?? '지연 미상';
}
