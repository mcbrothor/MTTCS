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

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
    // HALT에서도 스캔 허용 — 차세대 리더 발굴 기회 유지. 강한 경고만 추가.
    warnings.push('⚠️ 시장 HALT 구간: 신규 진입은 자제하되 워치리스트 등록 후 FTD 확인 시 점진적 진입을 고려합니다.');
    confidence = minConfidence(confidence, 'LOW');
    addDetail(
      'M',
      '시장 방향성',
      'WARNING',
      `HALT (200MA 하회)`,
      'FULL / REDUCED 권장',
      'HALT 구간에서 선택한 종목은 포지션 축소 및 엄격한 손절 원칙 유지.'
    );
  }

  if (effectiveAction === 'REDUCED') {
    const rs = stock.rsRating ?? 0;
    if (rs < CANSLIM_CRITERIA.PREFERRED_RS_RATING) {
      confidence = minConfidence(confidence, 'MEDIUM');
      warnings.push(`시장 약세 구간에서는 RS ${CANSLIM_CRITERIA.PREFERRED_RS_RATING}+ 종목 우선 검토를 권장합니다.`);
    } else {
      warnings.push('시장 약세 구간이지만 RS 90+ 초강세주로 확인됩니다. 포지션 사이즈 축소 권장.');
    }
  }

  if (stock.currentQtrEpsGrowth !== null) {
    if (stock.currentQtrEpsGrowth < -10) {
      addDetail(
        'C',
        '분기 EPS 성장률',
        'FAIL',
        `${stock.currentQtrEpsGrowth}%`,
        '>= -10%',
        '최근 분기 EPS 성장률이 크게 역성장했습니다.'
      );
      return fail('C_EPS', '분기 EPS 급감', `현재 분기 EPS 성장률 ${stock.currentQtrEpsGrowth}%`);
    }

    if (stock.currentQtrEpsGrowth < CANSLIM_CRITERIA.MIN_CURRENT_EPS_GROWTH) {
      confidence = minConfidence(confidence, 'LOW');
      warnings.push(`분기 EPS 성장률 ${stock.currentQtrEpsGrowth}%로 정통 CAN SLIM 기준보다는 약합니다.`);
      addDetail(
        'C',
        '분기 EPS 성장률',
        'WARNING',
        `${stock.currentQtrEpsGrowth}%`,
        `권장 >= ${CANSLIM_CRITERIA.MIN_CURRENT_EPS_GROWTH}%`,
        '역성장은 아니지만 공격적 성장주 기준에는 못 미칩니다.'
      );
    } else {
      addDetail(
        'C',
        '분기 EPS 성장률',
        'PASS',
        `${stock.currentQtrEpsGrowth}%`,
        `>= ${CANSLIM_CRITERIA.MIN_CURRENT_EPS_GROWTH}%`,
        '분기 EPS 성장률이 기준을 충족합니다.'
      );
    }
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
      warnings.push(`분기 매출 성장률 ${stock.currentQtrSalesGrowth}%로 최소 기준은 통과했지만 아주 강한 구간은 아닙니다.`);
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

  // 턴어라운드 허용: 단일 연도 적자는 경고, 복수 연도 적자는 탈락
  if (stock.hadNegativeEpsInLast3Yr === true) {
    const negativeYears = stock.annualEpsGrowthEachYear.filter((v) => v !== null && v < -50).length;
    if (negativeYears >= 2) {
      addDetail('A', '3년 내 적자 이력', 'FAIL', '복수 연도 적자', '1개 연도 이하', '최근 3년 중 2개 연도 이상 깊은 역성장이 확인됐습니다.');
      return fail('A_NEGATIVE_EPS', '복수 연도 적자', '최근 3년 중 2개 연도 이상 심각한 역성장');
    }
    confidence = minConfidence(confidence, 'MEDIUM');
    warnings.push('최근 3년 내 적자 또는 역성장 기록이 있습니다. 턴어라운드 여부를 직접 확인하세요.');
    addDetail('A', '3년 내 적자 이력', 'WARNING', '1개 연도 적자/역성장', '적자 없음 권장', '단일 연도 부진은 턴어라운드 허용. 최근 분기 회복 여부로 판단.');
  } else if (stock.hadNegativeEpsInLast3Yr === false) {
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
    const annualAverageGrowth = average(validYears);
    const hasNegativeYear = validYears.some((value) => value < 0);

    if (hasNegativeYear) {
      const negCount = validYears.filter((v) => v < 0).length;
      if (negCount >= 2) {
        addDetail(
          'A',
          '연도별 EPS 성장',
          'FAIL',
          validYears.map((value) => `${value}%`).join(', '),
          '역성장 연도 1개 이하',
          '2개 연도 이상 역성장이 확인됐습니다.'
        );
        return fail('A_ANNUAL', '연간 EPS 복수 역성장', '연도별 EPS 성장률에 2개 이상 역성장 구간이 있습니다.');
      }
      confidence = minConfidence(confidence, 'MEDIUM');
      warnings.push('1개 연도 역성장이 있으나 턴어라운드 허용 범위입니다. 최근 분기 회복 추세를 확인하세요.');
      addDetail(
        'A',
        '연도별 EPS 성장',
        'WARNING',
        validYears.map((value) => `${value}%`).join(', '),
        '역성장 연도 1개 이하 (권장)',
        '단일 연도 역성장은 경고로 처리. 최근 회복 추세면 통과 가능.'
      );
    }

    if (annualAverageGrowth >= CANSLIM_CRITERIA.MIN_ANNUAL_EPS_GROWTH) {
      addDetail(
        'A',
        '연평균 EPS 성장',
        'PASS',
        `${round(annualAverageGrowth)}%`,
        `평균 >= ${CANSLIM_CRITERIA.MIN_ANNUAL_EPS_GROWTH}%`,
        '최근 연도들의 평균 EPS 성장률이 기준을 충족합니다.'
      );
    } else if (annualAverageGrowth >= 15) {
      confidence = minConfidence(confidence, 'MEDIUM');
      warnings.push(`연평균 EPS 성장률 ${round(annualAverageGrowth)}%로 우량 대형주 수준이지만 정통 CAN SLIM보다는 낮습니다.`);
      addDetail(
        'A',
        '연평균 EPS 성장',
        'WARNING',
        `${round(annualAverageGrowth)}%`,
        `권장 평균 >= ${CANSLIM_CRITERIA.MIN_ANNUAL_EPS_GROWTH}%`,
        '연간 성장의 질은 양호하지만 초고성장 기준에는 못 미칩니다.'
      );
    } else {
      addDetail(
        'A',
        '연평균 EPS 성장',
        'FAIL',
        `${round(annualAverageGrowth)}%`,
        '평균 >= 15%',
        '연평균 EPS 성장률이 너무 낮습니다.'
      );
      return fail('A_ANNUAL', '연간 EPS 부족', `연평균 EPS 성장률 ${round(annualAverageGrowth)}%`);
    }
  } else {
    addDetail('A', '연평균 EPS 성장', 'INFO', `${validYears.length}개 연도`, '최소 2개 연도', '연간 EPS 검증 데이터가 부족합니다.');
    warnings.push('연간 EPS 성장 데이터가 부족합니다.');
  }

  const nStatus = evaluateN(stock);
  const allowedDistanceFromHigh = stock.detectedBasePattern
    ? CANSLIM_CRITERIA.LOOSE_DIST_FROM_52W_HIGH
    : CANSLIM_CRITERIA.MAX_DIST_FROM_52W_HIGH;

  if (nStatus === 'INVALID') {
    const distanceText = `${round(((stock.price52WeekHigh - stock.currentPrice) / stock.price52WeekHigh) * 100)}% 하락`;
    if (stock.detectedBasePattern) {
      confidence = minConfidence(confidence, 'LOW');
      warnings.push('52주 신고가에서는 멀어졌지만 유효 베이스가 있어 워치리스트 경고로 유지합니다.');
      addDetail(
        'N',
        '52주 신고가 근접',
        'WARNING',
        distanceText,
        `<= ${allowedDistanceFromHigh * 100}% 하락`,
        '신고가에서는 멀지만 베이스 재정비 구간으로 해석합니다.'
      );
    } else {
      addDetail(
        'N',
        '52주 신고가 근접',
        'FAIL',
        distanceText,
        `<= ${allowedDistanceFromHigh * 100}% 하락`,
        '52주 신고가에서 너무 멀리 떨어져 있습니다.'
      );
      return fail('N_TOO_FAR', '52주 고가 과이탈', '52주 신고가 대비 허용 하락폭을 초과했습니다.');
    }
  } else if (nStatus === 'TOO_LATE') {
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

  // Yahoo에서 기관 추세를 신뢰성 있게 확인 불가 → WARNING으로만 처리
  if (stock.institutionalSponsorshipTrend === 'DECREASING') {
    confidence = minConfidence(confidence, 'MEDIUM');
    warnings.push('기관 보유 추세가 감소 중으로 보고됩니다. 데이터 소스 신뢰도를 확인하세요.');
    addDetail('I', '기관 보유 추세', 'WARNING', 'DECREASING', 'INCREASING / FLAT', 'Yahoo 데이터 한계로 추세 신뢰도 낮음. SEC 13F/DART 확인 권장.');
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
