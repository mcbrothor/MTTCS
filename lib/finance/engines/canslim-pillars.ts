import type { CanslimPillarDetail, CanslimPillarKey, CanslimResult } from '@/types';

export const CANSLIM_PILLARS: CanslimPillarKey[] = ['C', 'A', 'N', 'S', 'L', 'I', 'M'];

export type CanslimPillarDisplayStatus =
  | CanslimPillarDetail['status']
  | 'NONE';

const STATUS_PRIORITY: Record<CanslimPillarDetail['status'], number> = {
  FAIL: 3,
  PASS: 2,
  WARNING: 1,
  INFO: 0,
};

export function getPillarDetails(
  result: Pick<CanslimResult, 'pillarDetails'>,
  pillar: CanslimPillarKey
): CanslimPillarDetail[] {
  return result.pillarDetails.filter((detail) => detail.pillar === pillar);
}

export function getPillarDisplayStatus(
  result: Pick<CanslimResult, 'pillarDetails'>,
  pillar: CanslimPillarKey
): CanslimPillarDisplayStatus {
  const details = getPillarDetails(result, pillar);
  if (details.length === 0) return 'NONE';

  return details.reduce((best, current) => (
    STATUS_PRIORITY[current.status] > STATUS_PRIORITY[best.status] ? current : best
  )).status;
}

export function getPillarPassCount(result: Pick<CanslimResult, 'pillarDetails'>): number {
  return CANSLIM_PILLARS.filter((pillar) => getPillarDisplayStatus(result, pillar) === 'PASS').length;
}

export function getPillarTooltip(
  result: Pick<CanslimResult, 'pillarDetails'>,
  pillar: CanslimPillarKey
): string {
  const details = getPillarDetails(result, pillar);
  if (details.length === 0) return `${pillar}: 데이터 없음`;

  const status = getPillarDisplayStatus(result, pillar);
  const summary = details.map((detail) => `${detail.label}: ${detail.description}`).join(' | ');
  return `${pillar} [${status}]: ${summary}`;
}
