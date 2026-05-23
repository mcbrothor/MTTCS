import assert from 'node:assert/strict';
import {
  assessCanslimFundamentalCoverage,
  buildPillarSources,
  enforceCanslimAnalysisCoverage,
  getBlockingCoverageMissingFields,
} from '../lib/finance/engines/canslim-coverage.ts';

console.log('=== CAN SLIM Analysis Tests ===\n');

{
  const coverage = assessCanslimFundamentalCoverage({
    currentQtrEpsGrowth: 42,
    currentQtrSalesGrowth: 31,
    epsGrowthLast3Qtrs: [42, 39, 34],
    annualEpsGrowthEachYear: [55, 41, 29],
    hadNegativeEpsInLast3Yr: false,
    roe: 24,
    institutionalOwnershipPct: 61,
    numInstitutionalHolders: 12,
  });

  assert.equal(coverage.complete, true);
  assert.deepEqual(coverage.missingFields, []);
  console.log('OK complete fundamental coverage passes the completeness gate');
}

{
  const coverage = assessCanslimFundamentalCoverage({
    currentQtrEpsGrowth: 28,
    currentQtrSalesGrowth: null,
    epsGrowthLast3Qtrs: [28, null, null],
    annualEpsGrowthEachYear: [30, null, null],
    hadNegativeEpsInLast3Yr: null,
    roe: null,
    institutionalOwnershipPct: 18,
    numInstitutionalHolders: null,
  });

  assert.equal(coverage.complete, false);
  assert.deepEqual(coverage.missingFields, [
    'C.currentQtrSalesGrowth',
    'C.epsGrowthLast3Qtrs',
    'A.hadNegativeEpsInLast3Yr',
    'A.roe',
    'A.annualEpsGrowthEachYear',
    'I.numInstitutionalHolders',
  ]);
  console.log('OK missing C/A/I data is surfaced explicitly instead of being silently ignored');
}

{
  const result = enforceCanslimAnalysisCoverage(
    {
      pass: true,
      confidence: 'HIGH',
      failedPillar: null,
      warnings: [],
      nStatus: 'VALID',
      stopLossPrice: 92,
      pillarDetails: [],
    },
    {
      complete: false,
      missingFields: ['C.currentQtrSalesGrowth', 'A.roe'],
    }
  );

  assert.equal(result.pass, false);
  assert.equal(result.confidence, 'LOW');
  assert.equal(result.failedPillar, 'DATA_COVERAGE');
  assert.ok(result.warnings.some((warning) => warning.startsWith('CANSLIM_ANALYSIS_INCOMPLETE:')));
  assert.equal(result.pillarDetails.at(-1)?.pillar, 'DATA');
  console.log('OK incomplete analysis cannot be returned as a CAN SLIM pass');
}

{
  const blocking = getBlockingCoverageMissingFields({
    complete: false,
    missingFields: ['I.institutionalOwnershipPct', 'I.numInstitutionalHolders'],
  });

  assert.deepEqual(blocking, []);

  const result = enforceCanslimAnalysisCoverage(
    {
      pass: true,
      confidence: 'HIGH',
      failedPillar: null,
      warnings: [],
      nStatus: 'VALID',
      stopLossPrice: 92,
      pillarDetails: [],
    },
    {
      complete: false,
      missingFields: ['I.institutionalOwnershipPct', 'I.numInstitutionalHolders'],
    }
  );

  assert.equal(result.pass, true);
  assert.equal(result.failedPillar, null);
  console.log('OK missing institutional fields alone no longer force every US ticker to fail');
}

{
  const sources = buildPillarSources({
    currentQtrEpsGrowth: 'SEC EDGAR companyfacts',
    epsGrowthLast3Qtrs: 'Yahoo Finance earningsHistory',
    currentQtrSalesGrowth: 'SEC EDGAR companyfacts',
    annualEpsGrowthEachYear: 'Yahoo Finance incomeStatementHistory',
    roe: 'DART (2025-12-31)',
    institutionalOwnershipPct: 'Yahoo Finance majorHoldersBreakdown',
    numInstitutionalHolders: 'Yahoo Finance institutionOwnership',
    floatShares: 'Yahoo Finance defaultKeyStatistics',
  });

  assert.deepEqual(sources.C, ['SEC EDGAR companyfacts', 'Yahoo Finance earningsHistory']);
  assert.deepEqual(sources.A, ['Yahoo Finance incomeStatementHistory', 'DART (2025-12-31)']);
  assert.deepEqual(sources.I, ['Yahoo Finance majorHoldersBreakdown', 'Yahoo Finance institutionOwnership']);
  assert.deepEqual(sources.S, ['Yahoo Finance defaultKeyStatistics']);
  console.log('OK pillar source mapping keeps data provenance attached to CAN SLIM metrics');
}

console.log('\n=== All CAN SLIM Analysis Tests Passed ===');
