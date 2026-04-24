import type { CanslimAnalysisCoverage, CanslimPillarKey, CanslimResult, CanslimStockData } from '@/types';

type FundamentalSourceKey =
  | 'currentQtrEpsGrowth'
  | 'priorQtrEpsGrowth'
  | 'epsGrowthLast3Qtrs'
  | 'currentQtrSalesGrowth'
  | 'annualEpsGrowthEachYear'
  | 'hadNegativeEpsInLast3Yr'
  | 'roe'
  | 'floatShares'
  | 'sharesBuyback'
  | 'institutionalSponsorshipTrend'
  | 'institutionalOwnershipPct'
  | 'numInstitutionalHolders';

export type FundamentalSourceMap = Partial<Record<FundamentalSourceKey, string>>;

export function assessCanslimFundamentalCoverage(data: Partial<CanslimStockData>): CanslimAnalysisCoverage {
  const missingFields: string[] = [];
  const quarterlySeries = data.epsGrowthLast3Qtrs ?? [];
  const validQuarterlySeries = quarterlySeries.filter((value): value is number => value !== null);
  const annualSeries = data.annualEpsGrowthEachYear ?? [];
  const validAnnualSeries = annualSeries.filter((value): value is number => value !== null);

  if (data.currentQtrEpsGrowth === null || data.currentQtrEpsGrowth === undefined) missingFields.push('C.currentQtrEpsGrowth');
  if (data.currentQtrSalesGrowth === null || data.currentQtrSalesGrowth === undefined) missingFields.push('C.currentQtrSalesGrowth');
  if (validQuarterlySeries.length < 3) missingFields.push('C.epsGrowthLast3Qtrs');

  if (data.hadNegativeEpsInLast3Yr === null || data.hadNegativeEpsInLast3Yr === undefined) missingFields.push('A.hadNegativeEpsInLast3Yr');
  if (data.roe === null || data.roe === undefined) missingFields.push('A.roe');
  if (validAnnualSeries.length < 2) missingFields.push('A.annualEpsGrowthEachYear');

  if (data.institutionalOwnershipPct === null || data.institutionalOwnershipPct === undefined) missingFields.push('I.institutionalOwnershipPct');
  if (data.numInstitutionalHolders === null || data.numInstitutionalHolders === undefined) missingFields.push('I.numInstitutionalHolders');

  return {
    complete: missingFields.length === 0,
    missingFields,
  };
}

export function buildPillarSources(
  sourceMap: FundamentalSourceMap
): Partial<Record<CanslimPillarKey, string[]>> {
  const pillars: Partial<Record<CanslimPillarKey, string[]>> = {};
  const append = (pillar: CanslimPillarKey, source?: string) => {
    if (!source) return;
    const current = pillars[pillar] ?? [];
    if (!current.includes(source)) current.push(source);
    pillars[pillar] = current;
  };

  append('C', sourceMap.currentQtrEpsGrowth);
  append('C', sourceMap.priorQtrEpsGrowth);
  append('C', sourceMap.epsGrowthLast3Qtrs);
  append('C', sourceMap.currentQtrSalesGrowth);

  append('A', sourceMap.annualEpsGrowthEachYear);
  append('A', sourceMap.hadNegativeEpsInLast3Yr);
  append('A', sourceMap.roe);

  append('S', sourceMap.floatShares);
  append('S', sourceMap.sharesBuyback);

  append('I', sourceMap.institutionalSponsorshipTrend);
  append('I', sourceMap.institutionalOwnershipPct);
  append('I', sourceMap.numInstitutionalHolders);

  return pillars;
}

export function getBlockingCoverageMissingFields(
  coverage: CanslimAnalysisCoverage
) {
  return coverage.missingFields.filter((field) => !field.startsWith('I.'));
}

export function enforceCanslimAnalysisCoverage(
  result: CanslimResult,
  coverage: CanslimAnalysisCoverage
): CanslimResult {
  const blockingMissingFields = getBlockingCoverageMissingFields(coverage);
  if (blockingMissingFields.length === 0) return result;

  const warning = `CANSLIM_ANALYSIS_INCOMPLETE:${blockingMissingFields.join(',')}`;
  const warnings = result.warnings.includes(warning)
    ? result.warnings
    : [...result.warnings, warning];

  return {
    ...result,
    pass: false,
    confidence: 'LOW',
    failedPillar: result.failedPillar ?? 'DATA_COVERAGE',
    warnings,
    pillarDetails: [
      ...result.pillarDetails,
      {
        pillar: 'DATA',
        label: '필수 데이터 커버리지',
        status: 'FAIL',
        value: blockingMissingFields.join(', '),
        threshold: '모든 핵심 CAN SLIM 필수 필드 확보',
        description: '필수 데이터가 비어 있어 7개 지표 전체를 신뢰성 있게 분석하지 못했습니다.',
      },
    ],
  };
}
