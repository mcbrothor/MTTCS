import type { ContestScreenerSource } from '@/lib/contest-sources';

export interface ScannerTelegramCandidate {
  ticker: string;
  name?: string | null;
  exchange?: string | null;
  recommendationTier?: string | null;
  recommendationReason?: string | null;
  dualTier?: string | null;
  pass?: boolean | null;
  rsRating?: number | null;
  vcpScore?: number | null;
  vcpGrade?: string | null;
  sepaStatus?: string | null;
  confidence?: string | null;
  pivotPrice?: number | null;
  distanceToPivotPct?: number | null;
  currentPrice?: number | null;
}

function md(value: unknown) {
  return String(value ?? '-').replace(/([_*`[\]])/g, '\\$1');
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return value.toLocaleString('en-US', { maximumFractionDigits: digits });
}

function sourceTitle(source: ContestScreenerSource) {
  return source === 'canslim' ? "O'Neil CANSLIM" : 'Minervini SEPA/VCP';
}

export function formatScannerTelegramMessage(input: {
  source: ContestScreenerSource;
  universe: string;
  candidates: ScannerTelegramCandidate[];
  generatedAt?: Date;
}) {
  const generatedAt = input.generatedAt || new Date();
  const rows = input.candidates.slice(0, 30);
  const header = [
    `*MTN ${md(sourceTitle(input.source))} Screening*`,
    `Universe: *${md(input.universe)}*`,
    `Candidates: *${rows.length}*`,
    `Time: ${md(generatedAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }))}`,
  ];

  if (rows.length === 0) {
    return [...header, '', '전송할 통과/추천 대상 종목이 없습니다.'].join('\n');
  }

  const body = rows.map((item, index) => {
    const verdict = input.source === 'canslim'
      ? `${item.dualTier || (item.pass ? 'PASS' : 'REVIEW')} / ${item.confidence || '-'}`
      : `${item.recommendationTier || item.sepaStatus || 'REVIEW'} / VCP ${formatNumber(item.vcpScore, 0)}`;
    const metrics = [
      `RS ${formatNumber(item.rsRating, 0)}`,
      item.vcpGrade ? `VCP ${item.vcpGrade}` : null,
      item.distanceToPivotPct !== null && item.distanceToPivotPct !== undefined ? `Pivot ${formatNumber(item.distanceToPivotPct)}%` : null,
      item.pivotPrice ? `Ref ${formatNumber(item.pivotPrice)}` : null,
    ].filter(Boolean).join(' | ');

    return [
      `${index + 1}. *${md(item.ticker)}* ${item.name ? `(${md(item.name)})` : ''}`,
      `   ${md(verdict)}`,
      metrics ? `   ${md(metrics)}` : null,
      item.recommendationReason ? `   ${md(item.recommendationReason).slice(0, 180)}` : null,
    ].filter(Boolean).join('\n');
  });

  return [...header, '', ...body].join('\n');
}
