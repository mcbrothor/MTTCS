import type {
  CanslimAnalysisCoverage,
  CanslimMacroMarketData,
  CanslimNStatus,
  CanslimPillarDetail,
  CanslimResult,
  CanslimStockData,
  DualScreenerTier,
  VcpAnalysis,
} from '@/types';
import { CANSLIM_CRITERIA, MACRO_CRITERIA } from './canslim-criteria.ts';

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

function minConfidence(
  current: CanslimResult['confidence'],
  next: CanslimResult['confidence']
): CanslimResult['confidence'] {
  const rank = { HIGH: 2, MEDIUM: 1, LOW: 0 } as const;
  return rank[next] < rank[current] ? next : current;
}

export function evaluateN(stock: CanslimStockData): CanslimNStatus {
  const distFromHigh =
    (stock.price52WeekHigh - stock.currentPrice) / stock.price52WeekHigh;
  const maxDistanceFromHigh = stock.detectedBasePattern
    ? CANSLIM_CRITERIA.LOOSE_DIST_FROM_52W_HIGH
    : CANSLIM_CRITERIA.MAX_DIST_FROM_52W_HIGH;

  if (distFromHigh > maxDistanceFromHigh) return 'INVALID';

  if (!stock.pivotPoint) {
    return distFromHigh <= CANSLIM_CRITERIA.PIVOT_BUY_ZONE_MAX ? 'VALID' : 'EXTENDED';
  }

  const ratio = stock.currentPrice / stock.pivotPoint;
  if (ratio <= 1 + CANSLIM_CRITERIA.PIVOT_BUY_ZONE_MAX) return 'VALID';
  if (ratio <= 1 + CANSLIM_CRITERIA.PIVOT_EXTENDED_MAX) return 'EXTENDED';
  return 'TOO_LATE';
}

export function evaluateCanslim(
  stock: CanslimStockData,
  macro: CanslimMacroMarketData,
  isBreakoutDay: boolean = false,
  entryPrice?: number
): CanslimResult {
  const warnings: string[] = [];
  const pillarDetails: CanslimPillarDetail[] = [];
  let confidence: CanslimResult['confidence'] = 'HIGH';

  const addDetail = (
    pillar: string,
    label: string,
    status: CanslimPillarDetail['status'],
    value: string | number | null,
    threshold: string,
    description: string
  ) => {
    pillarDetails.push({ pillar, label, status, value, threshold, description });
  };

  const fail = (pillar: string, label: string, description: string): CanslimResult => ({
    pass: false,
    confidence: 'LOW',
    failedPillar: pillar,
    warnings,
    nStatus: 'INVALID',
    stopLossPrice: null,
    pillarDetails: [
      ...pillarDetails,
      { pillar, label, status: 'FAIL', value: null, threshold: '', description },
    ],
  });

  const effectiveAction = macro.actionLevel;

  if (macro.distributionDayCount >= MACRO_CRITERIA.DISTRIBUTION_DAY_REDUCED_THRESHOLD) {
    warnings.push(`주의: 시장 분산일이 ${macro.distributionDayCount}일 발생했습니다.`);
  }

  addDetail(
    'M',
    '시장 방향성',
    effectiveAction === 'FULL' ? 'PASS' : effectiveAction === 'REDUCED' ? 'WARNING' : 'FAIL',
    `${effectiveAction} (50MA: ${macro.is_uptrend_50 ? '상회' : '하회'}, 분산일 ${macro.distributionDayCount})`,
    'FULL / REDUCED / HALT',
    '시장 추세와 분산일을 함께 반영한 매크로 판정입니다.'
  );

  if (effectiveAction === 'HALT') {
    return fail('M', '시장 HALT', '시장 환경이 방어 구간이라 신규 진입을 중단합니다.');
  }

  if (effectiveAction === 'REDUCED') {
    const rs = stock.rsRating ?? 0;
    if (rs < CANSLIM_CRITERIA.PREFERRED_RS_RATING) {
      return fail(
        'M_REDUCED',
        '시장 약세 + RS 부족',
        `시장 약세 구간에서는 RS ${CANSLIM_CRITERIA.PREFERRED_RS_RATING}+ 종목만 통과시킵니다.`
      );
    }
    warnings.push('시장 50일선 하회 구간이라 RS 90+ 초강세주만 통과시켰습니다.');
  }

  if (stock.currentQtrEpsGrowth !== null) {
    if (stock.currentQtrEpsGrowth < CANSLIM_CRITERIA.MIN_CURRENT_EPS_GROWTH) {
      addDetail(
        'C',
        '분기 EPS 성장률',
        'FAIL',
        `${stock.currentQtrEpsGrowth}%`,
        `>= ${CANSLIM_CRITERIA.MIN_CURRENT_EPS_GROWTH}%`,
        '최근 분기 EPS 성장률이 기준 미달입니다.'
      );
      return fail('C_EPS', '분기 EPS 부족', `현재 분기 EPS 성장률 ${stock.currentQtrEpsGrowth}%`);
    }
    addDetail(
      'C',
      '분기 EPS 성장률',
      'PASS',
      `${stock.currentQtrEpsGrowth}%`,
      `>= ${CANSLIM_CRITERIA.MIN_CURRENT_EPS_GROWTH}%`,
      '분기 EPS 성장률이 기준을 충족합니다.'
    );
  } else {
    addDetail('C', '분기 EPS 성장률', 'INFO', null, `>= ${CANSLIM_CRITERIA.MIN_CURRENT_EPS_GROWTH}%`, '데이터가 없어 판정을 보류했습니다.');
    warnings.push('분기 EPS 데이터가 부족합니다.');
  }

  if (stock.currentQtrSalesGrowth !== null) {
    if (stock.currentQtrSalesGrowth < CANSLIM_CRITERIA.MIN_CURRENT_SALES_GROWTH) {
      addDetail(
        'C',
        '분기 매출 성장률',
        'FAIL',
        `${stock.currentQtrSalesGrowth}%`,
        `>= ${CANSLIM_CRITERIA.MIN_CURRENT_SALES_GROWTH}%`,
        '최근 분기 매출 성장률이 기준 미달입니다.'
      );
      return fail('C_SALES', '분기 매출 부족', `분기 매출 성장률 ${stock.currentQtrSalesGrowth}%`);
    }

    if (stock.currentQtrSalesGrowth < CANSLIM_CRITERIA.PREFERRED_CURRENT_SALES_GROWTH) {
      confidence = minConfidence(confidence, 'MEDIUM');
      warnings.push(`분기 매출 성장률 ${stock.currentQtrSalesGrowth}%로 최소 기준은 통과했지만 강한 리더 구간은 아닙니다.`);
      addDetail(
        'C',
        '분기 매출 성장률',
        'WARNING',
        `${stock.currentQtrSalesGrowth}%`,
        `권장 >= ${CANSLIM_CRITERIA.PREFERRED_CURRENT_SALES_GROWTH}%`,
        '최소 기준은 통과했지만 매출 모멘텀이 아주 강한 편은 아닙니다.'
      );
    } else {
      addDetail(
        'C',
        '분기 매출 성장률',
        'PASS',
        `${stock.currentQtrSalesGrowth}%`,
        `>= ${CANSLIM_CRITERIA.PREFERRED_CURRENT_SALES_GROWTH}%`,
        '분기 매출 성장률이 강한 기준을 충족합니다.'
      );
    }
  } else {
    addDetail('C', '분기 매출 성장률', 'INFO', null, `>= ${CANSLIM_CRITERIA.MIN_CURRENT_SALES_GROWTH}%`, '데이터가 없어 판정을 보류했습니다.');
    warnings.push('분기 매출 성장률 데이터가 부족합니다.');
  }

  const validQtrs = stock.epsGrowthLast3Qtrs.filter((value): value is number => value !== null);
  if (validQtrs.length >= CANSLIM_CRITERIA.MIN_CONSECUTIVE_GROWTH_QTRS) {
    const allAbove = validQtrs.every((value) => value >= CANSLIM_CRITERIA.MIN_CURRENT_EPS_GROWTH);
    if (!allAbove) {
      confidence = minConfidence(confidence, 'MEDIUM');
      warnings.push('최근 3개 분기 연속 고성장은 아니어서 C 점수 신뢰도를 낮췄습니다.');
      addDetail(
        'C',
        '3분기 연속 성장',
        'WARNING',
        validQtrs.map((value) => `${value}%`).join(', '),
        `각 분기 >= ${CANSLIM_CRITERIA.MIN_CURRENT_EPS_GROWTH}%`,
        '최근 분기 실적은 강하지만 3분기 연속 고성장 패턴은 아닙니다.'
      );
    } else {
      addDetail(
        'C',
        '3분기 연속 성장',
        'PASS',
        validQtrs.map((value) => `${value}%`).join(', '),
        `각 분기 >= ${CANSLIM_CRITERIA.MIN_CURRENT_EPS_GROWTH}%`,
        '최근 3개 분기 모두 고성장을 유지했습니다.'
      );
    }
  } else {
    addDetail('C', '3분기 연속 성장', 'INFO', `${validQtrs.length}개 분기`, '3개 분기 필요', '연속 성장 검증용 데이터가 부족합니다.');
    warnings.push('최근 3분기 연속 성장 검증 데이터가 충분하지 않습니다.');
  }

  if (stock.currentQtrEpsGrowth !== null && stock.priorQtrEpsGrowth !== null) {
    if (stock.currentQtrEpsGrowth < stock.priorQtrEpsGrowth) {
      confidence = minConfidence(confidence, 'MEDIUM');
      warnings.push('EPS 성장 가속은 꺾였지만 절대 성장률은 유지되고 있습니다.');
      addDetail(
        'C',
        'EPS 가속화',
        'WARNING',
        `${stock.currentQtrEpsGrowth}% vs 이전 ${stock.priorQtrEpsGrowth}%`,
        '현재 분기 >= 이전 분기',
        '성장 가속은 둔화됐습니다.'
      );
    } else {
      addDetail(
        'C',
        'EPS 가속화',
        'PASS',
        `${stock.currentQtrEpsGrowth}% vs 이전 ${stock.priorQtrEpsGrowth}%`,
        '현재 분기 >= 이전 분기',
        'EPS 성장률이 가속되고 있습니다.'
      );
    }
  }

  if (stock.hadNegativeEpsInLast3Yr === true) {
    addDetail('A', '3년 내 적자 이력', 'FAIL', '적자 기록', '적자 없음', '최근 3년 안에 적자가 확인됐습니다.');
    return fail('A_NEGATIVE_EPS', '적자 이력', '최근 3년 내 적자 기록 발견');
  }
  if (stock.hadNegativeEpsInLast3Yr === false) {
    addDetail('A', '3년 내 적자 이력', 'PASS', '적자 없음', '적자 없음', '최근 3년 내 적자 기록이 없습니다.');
  }

  if (stock.roe !== null) {
    if (stock.roe < CANSLIM_CRITERIA.MIN_ROE) {
      addDetail('A', 'ROE', 'FAIL', `${stock.roe}%`, `>= ${CANSLIM_CRITERIA.MIN_ROE}%`, 'ROE가 기준 미달입니다.');
      return fail('A_ROE', 'ROE 부족', `ROE ${stock.roe}% < ${CANSLIM_CRITERIA.MIN_ROE}%`);
    }
    addDetail('A', 'ROE', 'PASS', `${stock.roe}%`, `>= ${CANSLIM_CRITERIA.MIN_ROE}%`, 'ROE가 기준을 충족합니다.');
  } else {
    addDetail('A', 'ROE', 'INFO', null, `>= ${CANSLIM_CRITERIA.MIN_ROE}%`, 'ROE 데이터가 없습니다.');
    warnings.push('ROE 데이터가 부족합니다.');
  }

  const validYears = stock.annualEpsGrowthEachYear.filter((value): value is number => value !== null);
  if (validYears.length >= 2) {
    const allAbove = validYears.every((value) => value >= CANSLIM_CRITERIA.MIN_ANNUAL_EPS_GROWTH);
    if (!allAbove) {
      addDetail(
        'A',
        '연도별 EPS 성장',
        'FAIL',
        validYears.map((value) => `${value}%`).join(', '),
        `각 연도 >= ${CANSLIM_CRITERIA.MIN_ANNUAL_EPS_GROWTH}%`,
        '연간 EPS 성장의 일관성이 부족합니다.'
      );
      return fail('A_ANNUAL', '연간 EPS 부족', '연도별 EPS 성장률이 기준 미달인 해가 있습니다.');
    }
    addDetail(
      'A',
      '연도별 EPS 성장',
      'PASS',
      validYears.map((value) => `${value}%`).join(', '),
      `각 연도 >= ${CANSLIM_CRITERIA.MIN_ANNUAL_EPS_GROWTH}%`,
      '연도별 EPS 성장률이 기준을 충족합니다.'
    );
  } else {
    addDetail('A', '연도별 EPS 성장', 'INFO', `${validYears.length}개 연도`, '최소 2개 연도', '연간 EPS 검증 데이터가 부족합니다.');
    warnings.push('연간 EPS 성장 데이터가 부족합니다.');
  }

  const nStatus = evaluateN(stock);
  const allowedDistanceFromHigh = stock.detectedBasePattern
    ? CANSLIM_CRITERIA.LOOSE_DIST_FROM_52W_HIGH
    : CANSLIM_CRITERIA.MAX_DIST_FROM_52W_HIGH;

  if (nStatus === 'INVALID') {
    addDetail(
      'N',
      '52주 신고가 근접',
      'FAIL',
      `${round(((stock.price52WeekHigh - stock.currentPrice) / stock.price52WeekHigh) * 100)}% 하락`,
      `<= ${allowedDistanceFromHigh * 100}% 하락`,
      '52주 신고가에서 너무 멀리 떨어져 있습니다.'
    );
    return fail('N_TOO_FAR', '52주 고가 과이탈', '52주 신고가 대비 허용 하락폭을 초과했습니다.');
  }

  if (nStatus === 'TOO_LATE') {
    confidence = minConfidence(confidence, 'LOW');
    warnings.push('피벗 대비 과열 구간이라 추격 매수는 금지합니다.');
    addDetail(
      'N',
      '피벗 대비 위치',
      'WARNING',
      `${stock.pivotPoint ? round((stock.currentPrice / stock.pivotPoint - 1) * 100) : '?'}%`,
      '피벗 +10% 이내',
      '추격 매수 금지 구간입니다.'
    );
  } else if (nStatus === 'EXTENDED') {
    confidence = minConfidence(confidence, 'MEDIUM');
    warnings.push('피벗 대비 다소 확장된 구간이라 진입 타이밍이 까다롭습니다.');
    addDetail(
      'N',
      '피벗 대비 위치',
      'WARNING',
      `${stock.pivotPoint ? round((stock.currentPrice / stock.pivotPoint - 1) * 100) : '?'}%`,
      '피벗 +5% 이내',
      '적정 매수 구간은 지났지만 아직 관찰 가능한 범위입니다.'
    );
  } else {
    addDetail(
      'N',
      '피벗 대비 위치',
      'PASS',
      stock.pivotPoint ? `피벗 ${round(stock.pivotPoint)} / 현재가 ${round(stock.currentPrice)}` : '52주 고가 근접',
      '피벗 +5% 이내 또는 신고가 근접',
      '매수 적정 구간입니다.'
    );
  }

  if (stock.detectedBasePattern) {
    addDetail(
      'N',
      '베이스 패턴',
      'PASS',
      stock.detectedBasePattern,
      'CUP_WITH_HANDLE / DOUBLE_BOTTOM / FLAT_BASE / VCP',
      `${stock.weeksBuildingBase ?? '?'}주 동안 형성된 ${stock.detectedBasePattern} 패턴입니다.`
    );
  }

  if (isBreakoutDay && stock.avgVolume50 > 0) {
    const volumeRatio = stock.dailyVolume / stock.avgVolume50;
    if (volumeRatio < CANSLIM_CRITERIA.MIN_BREAKOUT_VOLUME_RATIO) {
      addDetail(
        'S',
        '돌파 거래량',
        'FAIL',
        `${round(volumeRatio)}배`,
        `>= ${CANSLIM_CRITERIA.MIN_BREAKOUT_VOLUME_RATIO}배`,
        '돌파 거래량이 평균 대비 부족합니다.'
      );
      return fail('S_VOLUME', '돌파 거래량 부족', `돌파 거래량 ${round(volumeRatio)}배`);
    }
    addDetail(
      'S',
      '돌파 거래량',
      'PASS',
      `${round(volumeRatio)}배`,
      `>= ${CANSLIM_CRITERIA.MIN_BREAKOUT_VOLUME_RATIO}배`,
      '돌파 거래량이 충분합니다.'
    );
  }

  if (stock.floatShares !== null) {
    if (stock.floatShares > CANSLIM_CRITERIA.LARGE_FLOAT_THRESHOLD) {
      confidence = minConfidence(confidence, 'MEDIUM');
      warnings.push('유통 주식 수가 커서 수급 탄력이 둔할 수 있습니다.');
      addDetail(
        'S',
        '유통 주식 수',
        'WARNING',
        `${(stock.floatShares / 1_000_000).toFixed(0)}M주`,
        `<= ${CANSLIM_CRITERIA.LARGE_FLOAT_THRESHOLD / 1_000_000}M주`,
        '대형주라 탄력이 다소 무거울 수 있습니다.'
      );
    } else if (stock.floatShares <= CANSLIM_CRITERIA.PREFERRED_MAX_FLOAT) {
      addDetail(
        'S',
        '유통 주식 수',
        'PASS',
        `${(stock.floatShares / 1_000_000).toFixed(0)}M주`,
        `<= ${CANSLIM_CRITERIA.PREFERRED_MAX_FLOAT / 1_000_000}M주`,
        '수급상 탄력적인 구간입니다.'
      );
    }
  }

  if (stock.sharesBuyback === true) {
    addDetail('S', '자사주 매입', 'PASS', '확인', '공급 축소', '자사주 매입으로 공급 축소 신호가 확인됩니다.');
  }

  if (stock.rsRating !== null) {
    if (stock.rsRating < CANSLIM_CRITERIA.MIN_RS_RATING) {
      addDetail('L', '상대강도 RS', 'FAIL', stock.rsRating, `>= ${CANSLIM_CRITERIA.MIN_RS_RATING}`, '상대강도가 부족합니다.');
      return fail('L_RS', 'RS 부족', `RS ${stock.rsRating} < ${CANSLIM_CRITERIA.MIN_RS_RATING}`);
    }

    addDetail(
      'L',
      '상대강도 RS',
      'PASS',
      stock.rsRating,
      stock.rsRating >= CANSLIM_CRITERIA.PREFERRED_RS_RATING
        ? `>= ${CANSLIM_CRITERIA.PREFERRED_RS_RATING}`
        : `>= ${CANSLIM_CRITERIA.MIN_RS_RATING}`,
      stock.rsRating >= CANSLIM_CRITERIA.PREFERRED_RS_RATING
        ? '초강세 리더 구간입니다.'
        : '리더 기준을 충족합니다.'
    );
  } else {
    addDetail('L', '상대강도 RS', 'INFO', null, `>= ${CANSLIM_CRITERIA.MIN_RS_RATING}`, 'RS 데이터가 없어 보수적으로 해석해야 합니다.');
    warnings.push('RS 데이터가 부족합니다.');
  }

  if (stock.institutionalSponsorshipTrend === 'DECREASING') {
    addDetail('I', '기관 보유 추세', 'FAIL', 'DECREASING', 'INCREASING / FLAT', '기관 보유 추세가 감소 중입니다.');
    return fail('I_TREND', '기관 이탈', '기관 보유 추세가 감소하고 있습니다.');
  }

  if (stock.numInstitutionalHolders !== null) {
    if (stock.numInstitutionalHolders < CANSLIM_CRITERIA.MIN_INSTITUTIONAL_HOLDERS) {
      addDetail(
        'I',
        '보유 기관 수',
        'FAIL',
        stock.numInstitutionalHolders,
        `>= ${CANSLIM_CRITERIA.MIN_INSTITUTIONAL_HOLDERS}`,
        '보유 기관 수가 너무 적습니다.'
      );
      return fail('I_COUNT', '기관 수 부족', `보유 기관 ${stock.numInstitutionalHolders}개`);
    }
    addDetail(
      'I',
      '보유 기관 수',
      'PASS',
      stock.numInstitutionalHolders,
      `>= ${CANSLIM_CRITERIA.MIN_INSTITUTIONAL_HOLDERS}`,
      '충분한 기관이 보유하고 있습니다.'
    );
  } else {
    addDetail('I', '보유 기관 수', 'INFO', null, `>= ${CANSLIM_CRITERIA.MIN_INSTITUTIONAL_HOLDERS}`, '기관 보유 데이터가 없습니다.');
    warnings.push('기관 보유 수 데이터가 부족합니다.');
  }

  if (stock.institutionalOwnershipPct !== null) {
    if (stock.institutionalOwnershipPct > CANSLIM_CRITERIA.MAX_INSTITUTIONAL_OWNERSHIP_PCT) {
      confidence = minConfidence(confidence, 'MEDIUM');
      addDetail(
        'I',
        '기관 보유 비중',
        'WARNING',
        `${stock.institutionalOwnershipPct}%`,
        `<= ${CANSLIM_CRITERIA.MAX_INSTITUTIONAL_OWNERSHIP_PCT}%`,
        '기관 보유 비중이 높아 매물 출회 리스크가 있습니다.'
      );
    } else if (stock.institutionalOwnershipPct < CANSLIM_CRITERIA.MIN_INSTITUTIONAL_OWNERSHIP_PCT) {
      addDetail(
        'I',
        '기관 보유 비중',
        'WARNING',
        `${stock.institutionalOwnershipPct}%`,
        `>= ${CANSLIM_CRITERIA.MIN_INSTITUTIONAL_OWNERSHIP_PCT}%`,
        '기관 관심은 있으나 아직 충분히 깊지는 않습니다.'
      );
    } else {
      addDetail(
        'I',
        '기관 보유 비중',
        'PASS',
        `${stock.institutionalOwnershipPct}%`,
        `${CANSLIM_CRITERIA.MIN_INSTITUTIONAL_OWNERSHIP_PCT}~${CANSLIM_CRITERIA.MAX_INSTITUTIONAL_OWNERSHIP_PCT}%`,
        '기관 보유 비중이 적정 구간입니다.'
      );
    }
  }

  const effectiveEntryPrice = entryPrice ?? stock.currentPrice;
  const stopLossPrice = effectiveEntryPrice > 0
    ? round(effectiveEntryPrice * (1 - CANSLIM_CRITERIA.STOP_LOSS_PCT))
    : null;

  return {
    pass: true,
    confidence,
    failedPillar: null,
    warnings,
    nStatus,
    stopLossPrice,
    pillarDetails,
  };
}

export function determineDualScreenerTier(
  canslimPass: boolean,
  vcpGrade: VcpAnalysis['grade'] | null
): DualScreenerTier {
  const vcpPass = vcpGrade === 'strong' || vcpGrade === 'forming';

  if (canslimPass && vcpPass) return 'TIER_1';
  if (canslimPass && !vcpPass) return 'WATCHLIST';
  if (!canslimPass && vcpPass) return 'SHORT_TERM';
  return 'EXCLUDED';
}

export function enforceCanslimAnalysisCoverage(
  result: CanslimResult,
  coverage: CanslimAnalysisCoverage
): CanslimResult {
  if (coverage.complete) return result;

  const warning = `CANSLIM_ANALYSIS_INCOMPLETE:${coverage.missingFields.join(',')}`;
  const warnings = result.warnings.includes(warning)
    ? result.warnings
    : [...result.warnings, warning];
  const pillarDetails = [
    ...result.pillarDetails,
    {
      pillar: 'DATA',
      label: '필수 데이터 커버리지',
      status: 'FAIL' as const,
      value: coverage.missingFields.join(', '),
      threshold: '모든 핵심 CAN SLIM 필드 확보',
      description: '핵심 데이터가 비어 있어 전체 분석을 완전하게 수행하지 못했습니다.',
    },
  ];

  return {
    ...result,
    pass: false,
    confidence: 'LOW',
    failedPillar: result.failedPillar ?? 'DATA_COVERAGE',
    warnings,
    pillarDetails,
  };
}

export function dualTierLabel(tier: DualScreenerTier): { label: string; color: string; emoji: string } {
  switch (tier) {
    case 'TIER_1':
      return { label: '최우선 관심', color: 'emerald', emoji: 'T1' };
    case 'WATCHLIST':
      return { label: '워치리스트', color: 'amber', emoji: 'WL' };
    case 'SHORT_TERM':
      return { label: '단기 후보', color: 'blue', emoji: 'ST' };
    case 'EXCLUDED':
      return { label: '제외', color: 'slate', emoji: '--' };
  }
}
