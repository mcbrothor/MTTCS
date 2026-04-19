/**
 * CAN SLIM 필터링 엔진 (디자인 문서 v2.0 §2.3)
 *
 * 7개 Pillar(M→C→A→N→S→L→I)를 순차적으로 검증합니다.
 * 하나라도 기준 미달이면 즉시 탈락시키고 탈락 원인을 기록합니다.
 *
 * 필터 적용 순서: 연산 비용이 낮은 항목 먼저 (M, C, A → N, S, L, I)
 * - M(시장 방향): 매크로 데이터만 확인 → 가장 저비용
 * - C, A(실적): 이미 패칭된 숫자 비교 → 저비용
 * - N(차트 패턴): 베이스 패턴 감지 필요 → 고비용
 * - S(수급): 거래량 비교 → 중간
 * - L(상대강도): RS 점수 비교 → 저비용
 * - I(기관): 기관 데이터 비교 → 저비용
 */

import type {
  CanslimMacroMarketData,
  CanslimNStatus,
  CanslimPillarDetail,
  CanslimResult,
  CanslimStockData,
  DualScreenerTier,
  VcpAnalysis,
} from '@/types';
import { CANSLIM_CRITERIA, MACRO_CRITERIA } from './canslim-criteria';

const round = (v: number, d = 2) => Number(v.toFixed(d));

// =============================================
// N 조건 평가 — 피벗 대비 현재가 위치 판정
// =============================================

/**
 * N 조건: 52주 신고가 근접 + 피벗 포인트 돌파 여부
 *
 * | 구간           | 조건                             | 판정      |
 * |----------------|----------------------------------|-----------|
 * | 매수 적정      | currentPrice ≤ pivotPoint × 1.05 | VALID     |
 * | 추격 매수 위험 | pivot × 1.05 < price ≤ × 1.10   | EXTENDED  |
 * | 추격 매수 금지 | currentPrice > pivotPoint × 1.10 | TOO_LATE  |
 */
export function evaluateN(stock: CanslimStockData): CanslimNStatus {
  const distFromHigh =
    (stock.price52WeekHigh - stock.currentPrice) / stock.price52WeekHigh;

  // 52주 고가 대비 15% 이상 하락 → 바닥권 종목 매수 금지
  if (distFromHigh > CANSLIM_CRITERIA.MAX_DIST_FROM_52W_HIGH) return 'INVALID';

  if (!stock.pivotPoint) {
    // 피벗 미정의 시 52주 고가 기준 fallback
    return distFromHigh <= CANSLIM_CRITERIA.PIVOT_BUY_ZONE_MAX ? 'VALID' : 'EXTENDED';
  }

  const ratio = stock.currentPrice / stock.pivotPoint;
  if (ratio <= 1 + CANSLIM_CRITERIA.PIVOT_BUY_ZONE_MAX) return 'VALID';
  if (ratio <= 1 + CANSLIM_CRITERIA.PIVOT_EXTENDED_MAX) return 'EXTENDED';
  return 'TOO_LATE';
}

// =============================================
// 메인 CAN SLIM 평가 함수
// =============================================

/**
 * CAN SLIM 7 Pillar 종합 평가
 *
 * @param stock      종목 펀더멘털/기술적 데이터
 * @param macro      매크로 시장 데이터 (분배일, FTD 포함)
 * @param isBreakoutDay  돌파 당일 여부 (거래량 조건 적용)
 * @param entryPrice 매수 기준가 (손절가 계산용, 선택)
 */
export function evaluateCanslim(
  stock: CanslimStockData,
  macro: CanslimMacroMarketData,
  isBreakoutDay: boolean = false,
  entryPrice?: number
): CanslimResult {
  const warnings: string[] = [];
  const pillarDetails: CanslimPillarDetail[] = [];
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';

  // --- 헬퍼: 즉시 탈락 반환 ---
  const fail = (pillar: string, label: string, desc: string): CanslimResult => ({
    pass: false,
    confidence: 'LOW',
    failedPillar: pillar,
    warnings,
    nStatus: 'INVALID',
    stopLossPrice: null,
    pillarDetails: [
      ...pillarDetails,
      { pillar, label, status: 'FAIL', value: null, threshold: '', description: desc },
    ],
  });

  // --- 헬퍼: Pillar 상세 추가 ---
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

  // ══════════════════════════════════════════════════════════
  // M: 시장 환경 최우선 체크
  // ══════════════════════════════════════════════════════════

  // 분배일 기반 actionLevel 오버라이드 (디자인 문서 §1 M)
  const effectiveAction =
    macro.distributionDayCount >= MACRO_CRITERIA.DISTRIBUTION_DAY_HALT_THRESHOLD
      ? 'HALT'
      : macro.distributionDayCount >= MACRO_CRITERIA.DISTRIBUTION_DAY_REDUCED_THRESHOLD
        ? 'REDUCED'
        : macro.actionLevel;

  addDetail(
    'M', '시장 방향성',
    effectiveAction === 'FULL' ? 'PASS' : effectiveAction === 'REDUCED' ? 'WARNING' : 'FAIL',
    `${effectiveAction} (분배일: ${macro.distributionDayCount}, FTD: ${macro.followThroughDay ? '확인' : '미확인'})`,
    'FULL 또는 REDUCED(RS 90+ 한정)',
    '시장 환경이 불리하면 아무리 좋은 종목도 매수 신호를 내지 않습니다.'
  );

  if (effectiveAction === 'HALT') {
    return fail('M', '시장 HALT', 'CAN SLIM 스캐너 전면 정지 — 분배일 6일 이상 또는 HALT 상태');
  }

  if (effectiveAction === 'REDUCED') {
    const rs = stock.rsRating ?? 0;
    if (rs < CANSLIM_CRITERIA.PREFERRED_RS_RATING) {
      return fail('M_REDUCED', '시장 REDUCED + RS 부족',
        `REDUCED 상태에서는 RS ${CANSLIM_CRITERIA.PREFERRED_RS_RATING}+ 종목만 스캔 가능 (현재: ${rs})`);
    }
    warnings.push('시장 하락 경고 구간: RS 90+ 종목 위주로 보수적인 접근이 필요합니다.');
  }

  // ══════════════════════════════════════════════════════════
  // C: 분기 실적
  // ══════════════════════════════════════════════════════════

  // EPS 성장률 검증
  if (stock.currentQtrEpsGrowth !== null) {
    if (stock.currentQtrEpsGrowth < CANSLIM_CRITERIA.MIN_CURRENT_EPS_GROWTH) {
      addDetail('C', '분기 EPS 성장률', 'FAIL',
        `${stock.currentQtrEpsGrowth}%`, `≥ ${CANSLIM_CRITERIA.MIN_CURRENT_EPS_GROWTH}%`,
        '최근 분기 EPS 성장률이 기준 미달입니다.');
      return fail('C_EPS', '분기 EPS 부족',
        `현재 분기 EPS 성장률 ${stock.currentQtrEpsGrowth}% < ${CANSLIM_CRITERIA.MIN_CURRENT_EPS_GROWTH}%`);
    }
    addDetail('C', '분기 EPS 성장률', 'PASS',
      `${stock.currentQtrEpsGrowth}%`, `≥ ${CANSLIM_CRITERIA.MIN_CURRENT_EPS_GROWTH}%`,
      '분기 EPS 성장률이 기준을 충족합니다.');
  } else {
    addDetail('C', '분기 EPS 성장률', 'INFO', null, `≥ ${CANSLIM_CRITERIA.MIN_CURRENT_EPS_GROWTH}%`,
      '데이터가 확보되지 않아 판정할 수 없습니다.');
    warnings.push('분기 EPS 데이터가 부족하여 일부 판정이 제한될 수 있습니다.');
  }

  // 매출 성장률 검증
  if (stock.currentQtrSalesGrowth !== null) {
    if (stock.currentQtrSalesGrowth < CANSLIM_CRITERIA.MIN_CURRENT_SALES_GROWTH) {
      addDetail('C', '분기 매출 성장률', 'FAIL',
        `${stock.currentQtrSalesGrowth}%`, `≥ ${CANSLIM_CRITERIA.MIN_CURRENT_SALES_GROWTH}%`,
        '최근 분기 매출 성장률이 기준 미달입니다.');
      return fail('C_SALES', '분기 매출 부족',
        `매출 성장률 ${stock.currentQtrSalesGrowth}% < ${CANSLIM_CRITERIA.MIN_CURRENT_SALES_GROWTH}%`);
    }
    addDetail('C', '분기 매출 성장률', 'PASS',
      `${stock.currentQtrSalesGrowth}%`, `≥ ${CANSLIM_CRITERIA.MIN_CURRENT_SALES_GROWTH}%`,
      '분기 매출 성장률이 기준을 충족합니다.');
  } else {
    addDetail('C', '분기 매출 성장률', 'INFO', null, `≥ ${CANSLIM_CRITERIA.MIN_CURRENT_SALES_GROWTH}%`,
      '데이터가 확보되지 않아 판정할 수 없습니다.');
    warnings.push('분기 매출 데이터가 부족하여 명확한 성장성 판정이 어렵습니다.');
  }

  // 연속 성장 분기 검증 (v2.0 추가)
  const validQtrs = stock.epsGrowthLast3Qtrs.filter((g): g is number => g !== null);
  if (validQtrs.length >= CANSLIM_CRITERIA.MIN_CONSECUTIVE_GROWTH_QTRS) {
    const allAbove = validQtrs.every((g) => g >= CANSLIM_CRITERIA.MIN_CURRENT_EPS_GROWTH);
    if (!allAbove) {
      addDetail('C', '3분기 연속 성장', 'FAIL',
        validQtrs.map((g) => `${g}%`).join(', '),
        `각 분기 ≥ ${CANSLIM_CRITERIA.MIN_CURRENT_EPS_GROWTH}%`,
        '1분기 반짝 실적은 인정하지 않습니다.');
      return fail('C_CONSECUTIVE', '연속 성장 미달', '최근 3분기 연속 기준치 이상 성장을 유지하지 못했습니다.');
    }
    addDetail('C', '3분기 연속 성장', 'PASS',
      validQtrs.map((g) => `${g}%`).join(', '),
      `각 분기 ≥ ${CANSLIM_CRITERIA.MIN_CURRENT_EPS_GROWTH}%`,
      '최근 3분기 모두 기준치 이상 성장을 유지합니다.');
  } else {
    addDetail('C', '3분기 연속 성장', 'INFO',
      `${validQtrs.length}개 분기 확보`, `3개 분기 필요`,
      '충분한 분기 데이터가 없어 연속 성장 검증을 스킵합니다.');
    warnings.push('최근 3분기 연속 성장을 검증하기 위한 데이터가 충분하지 않습니다.');
  }

  // EPS 가속화 검증 (v2.0 추가 — 탈락이 아닌 confidence 감점)
  if (stock.currentQtrEpsGrowth !== null && stock.priorQtrEpsGrowth !== null) {
    if (stock.currentQtrEpsGrowth < stock.priorQtrEpsGrowth) {
      confidence = 'MEDIUM';
      warnings.push('성장률 둔화 감지: 현재 분기 성장률이 직전 분기보다 낮습니다.');
      addDetail('C', 'EPS 가속화', 'WARNING',
        `${stock.currentQtrEpsGrowth}% vs 직전 ${stock.priorQtrEpsGrowth}%`,
        '현재 분기 ≥ 직전 분기',
        '성장률이 둔화되고 있습니다. 감점 처리합니다.');
    } else {
      addDetail('C', 'EPS 가속화', 'PASS',
        `${stock.currentQtrEpsGrowth}% vs 직전 ${stock.priorQtrEpsGrowth}%`,
        '현재 분기 ≥ 직전 분기',
        'EPS 성장률이 가속화되고 있습니다.');
    }
  }

  // ══════════════════════════════════════════════════════════
  // A: 연간 실적
  // ══════════════════════════════════════════════════════════

  // 적자 이력 필터 (v2.0 추가)
  if (stock.hadNegativeEpsInLast3Yr === true) {
    addDetail('A', '3년 내 적자 이력', 'FAIL', '적자 감지', '적자 없음',
      '3년 내 단 한 번이라도 적자를 기록한 기업은 즉시 탈락입니다.');
    return fail('A_NEGATIVE_EPS', '적자 이력', '최근 3년 내 적자 기록 발견');
  }
  if (stock.hadNegativeEpsInLast3Yr === false) {
    addDetail('A', '3년 내 적자 이력', 'PASS', '적자 없음', '적자 없음',
      '최근 3년 내 적자 기록이 없습니다.');
  }

  // ROE 검증
  if (stock.roe !== null) {
    if (stock.roe < CANSLIM_CRITERIA.MIN_ROE) {
      addDetail('A', 'ROE', 'FAIL', `${stock.roe}%`, `≥ ${CANSLIM_CRITERIA.MIN_ROE}%`,
        '자기자본이익률이 기준 미달입니다.');
      return fail('A_ROE', 'ROE 부족', `ROE ${stock.roe}% < ${CANSLIM_CRITERIA.MIN_ROE}%`);
    }
    addDetail('A', 'ROE', 'PASS', `${stock.roe}%`, `≥ ${CANSLIM_CRITERIA.MIN_ROE}%`,
      '자기자본이익률이 기준을 충족합니다.');
  } else {
    addDetail('A', 'ROE', 'INFO', null, `≥ ${CANSLIM_CRITERIA.MIN_ROE}%`,
      'ROE 데이터가 확보되지 않았습니다.');
    warnings.push('ROE(자기자본이익률) 데이터가 확보되지 않았습니다.');
  }

  // 연도별 독립 검증 (v2.0 변경)
  const validYears = stock.annualEpsGrowthEachYear.filter((g): g is number => g !== null);
  if (validYears.length >= 2) {
    const allAbove = validYears.every((g) => g >= CANSLIM_CRITERIA.MIN_ANNUAL_EPS_GROWTH);
    if (!allAbove) {
      addDetail('A', '연도별 EPS 성장', 'FAIL',
        validYears.map((g) => `${g}%`).join(', '),
        `각 연도 ≥ ${CANSLIM_CRITERIA.MIN_ANNUAL_EPS_GROWTH}%`,
        '3년 각 연도의 EPS 성장률이 독립적으로 기준을 충족해야 합니다.');
      return fail('A_ANNUAL', '연간 EPS 부족', '연도별 EPS 성장률이 기준 미달인 연도가 있습니다.');
    }
    addDetail('A', '연도별 EPS 성장', 'PASS',
      validYears.map((g) => `${g}%`).join(', '),
      `각 연도 ≥ ${CANSLIM_CRITERIA.MIN_ANNUAL_EPS_GROWTH}%`,
      '각 연도의 EPS 성장률이 모두 기준을 충족합니다.');
  } else {
    addDetail('A', '연도별 EPS 성장', 'INFO',
      `${validYears.length}개 연도 확보`, '3개 연도 필요',
      '충분한 연간 데이터가 없어 연도별 독립 검증을 스킵합니다.');
    warnings.push('연간 EPS 데이터가 부족하여 연도별 독립 검증을 스킵했습니다.');
  }

  // ══════════════════════════════════════════════════════════
  // N: 신고가 및 베이스 패턴
  // ══════════════════════════════════════════════════════════

  const nStatus = evaluateN(stock);

  if (nStatus === 'INVALID') {
    addDetail('N', '52주 신고가 근접', 'FAIL',
      `고가 대비 ${round(((stock.price52WeekHigh - stock.currentPrice) / stock.price52WeekHigh) * 100)}% 하락`,
      `≤ ${CANSLIM_CRITERIA.MAX_DIST_FROM_52W_HIGH * 100}% 하락`,
      '52주 고가에서 너무 멀리 떨어져 있습니다. 바닥권 종목 매수 금지.');
    return fail('N_TOO_FAR', '52주 고가 과이탈', '52주 신고가 대비 15% 초과 하락');
  }

  if (nStatus === 'TOO_LATE') {
    warnings.push('주가가 피벗 대비 +10% 이상 이격되어 추격 매수 위험이 높습니다.');
    confidence = 'LOW';
    addDetail('N', '피벗 대비 위치', 'WARNING',
      `피벗 대비 ${stock.pivotPoint ? round((stock.currentPrice / stock.pivotPoint - 1) * 100) : '?'}% 초과`,
      '피벗 +10% 이내',
      '추격 매수 금지 구간입니다.');
  } else if (nStatus === 'EXTENDED') {
    warnings.push('주가가 피벗 대비 +5%~10% 구간에 있어 추격 매수에 주의해야 합니다.');
    addDetail('N', '피벗 대비 위치', 'WARNING',
      `피벗 대비 ${stock.pivotPoint ? round((stock.currentPrice / stock.pivotPoint - 1) * 100) : '?'}% 초과`,
      '피벗 +5% 이내',
      '추격 매수 위험 구간입니다.');
  } else {
    addDetail('N', '피벗 대비 위치', 'PASS',
      stock.pivotPoint ? `피벗 ${round(stock.pivotPoint)} / 현재가 ${round(stock.currentPrice)}` : '52주 고가 근접',
      '피벗 +5% 이내 또는 52주 고가 5% 이내',
      '매수 적정 구간입니다.');
  }

  // 베이스 패턴 정보
  if (stock.detectedBasePattern) {
    addDetail('N', '베이스 패턴', 'PASS',
      stock.detectedBasePattern,
      'CUP_WITH_HANDLE / DOUBLE_BOTTOM / FLAT_BASE / VCP',
      `${stock.weeksBuildingBase ?? '?'}주간 형성된 ${stock.detectedBasePattern} 패턴이 감지되었습니다.`);
  }

  // ══════════════════════════════════════════════════════════
  // S: 수급 (거래량 + Float)
  // ══════════════════════════════════════════════════════════

  if (isBreakoutDay && stock.avgVolume50 > 0) {
    const volumeRatio = stock.dailyVolume / stock.avgVolume50;
    if (volumeRatio < CANSLIM_CRITERIA.MIN_BREAKOUT_VOLUME_RATIO) {
      addDetail('S', '돌파 거래량', 'FAIL',
        `${round(volumeRatio)}배`, `≥ ${CANSLIM_CRITERIA.MIN_BREAKOUT_VOLUME_RATIO}배`,
        '돌파 시점에서 거래량이 50일 평균 대비 150% 미만입니다.');
      return fail('S_VOLUME', '돌파 거래량 부족',
        `돌파일 거래량 ${round(volumeRatio)}배 < ${CANSLIM_CRITERIA.MIN_BREAKOUT_VOLUME_RATIO}배`);
    }
    addDetail('S', '돌파 거래량', 'PASS',
      `${round(volumeRatio)}배`, `≥ ${CANSLIM_CRITERIA.MIN_BREAKOUT_VOLUME_RATIO}배`,
      '돌파 시점 거래량이 충분합니다.');
  }

  // Float 크기 판정 (감점 요소)
  if (stock.floatShares !== null) {
    if (stock.floatShares > CANSLIM_CRITERIA.LARGE_FLOAT_THRESHOLD) {
      warnings.push('유통 주식수가 많아 주가 탄력이 다소 무거울 수 있는 대형주입니다.');
      if (confidence === 'HIGH') confidence = 'MEDIUM';
      addDetail('S', '유통 주식 수', 'WARNING',
        `${(stock.floatShares / 1_000_000).toFixed(0)}M주`, `≤ ${CANSLIM_CRITERIA.LARGE_FLOAT_THRESHOLD / 1_000_000}M주`,
        '대형주로 기관 매수 시 주가 탄력이 제한될 수 있습니다.');
    } else if (stock.floatShares <= CANSLIM_CRITERIA.PREFERRED_MAX_FLOAT) {
      addDetail('S', '유통 주식 수', 'PASS',
        `${(stock.floatShares / 1_000_000).toFixed(0)}M주`, `≤ ${CANSLIM_CRITERIA.PREFERRED_MAX_FLOAT / 1_000_000}M주`,
        '소형·중형주로 기관 매수 시 주가 탄력이 극대화됩니다.');
    }
  }

  // 자사주 매입 (긍정 신호)
  if (stock.sharesBuyback === true) {
    warnings.push('자사주 매입 이력이 포착되어 주식 공급 감소 효과가 기대됩니다.');
    addDetail('S', '자사주 매입', 'PASS', '매입 확인',
      '공급 축소 신호', '자사주 매입으로 유통 주식 수가 줄어들고 있습니다.');
  }

  // ══════════════════════════════════════════════════════════
  // L: 상대강도
  // ══════════════════════════════════════════════════════════

  if (stock.rsRating !== null) {
    if (stock.rsRating < CANSLIM_CRITERIA.MIN_RS_RATING) {
      addDetail('L', '상대강도 RS', 'FAIL',
        stock.rsRating, `≥ ${CANSLIM_CRITERIA.MIN_RS_RATING}`,
        '시장을 이끄는 대장주가 아닙니다.');
      return fail('L_RS', 'RS 점수 부족',
        `RS ${stock.rsRating} < ${CANSLIM_CRITERIA.MIN_RS_RATING}`);
    }

    if (stock.rsRating >= CANSLIM_CRITERIA.PREFERRED_RS_RATING) {
      warnings.push('상대강도가 매우 우수한 주도주형(Elite) RS 등급입니다.');
      addDetail('L', '상대강도 RS', 'PASS',
        stock.rsRating, `≥ ${CANSLIM_CRITERIA.PREFERRED_RS_RATING} (엘리트)`,
        'RS 90+ 엘리트 종목입니다.');
    } else {
      addDetail('L', '상대강도 RS', 'PASS',
        stock.rsRating, `≥ ${CANSLIM_CRITERIA.MIN_RS_RATING}`,
        '상대강도 기준을 충족합니다.');
    }
  } else {
    addDetail('L', '상대강도 RS', 'INFO', null, `≥ ${CANSLIM_CRITERIA.MIN_RS_RATING}`,
      'RS 데이터가 확보되지 않았습니다.');
    warnings.push('시장 대비 상대강도(RS) 데이터가 부족하여 판정이 유예되었습니다.');
  }

  // ══════════════════════════════════════════════════════════
  // I: 기관 수급
  // ══════════════════════════════════════════════════════════

  if (stock.institutionalSponsorshipTrend === 'DECREASING') {
    addDetail('I', '기관 보유 추세', 'FAIL', 'DECREASING',
      'INCREASING 또는 FLAT', '기관 보유 비중이 감소 추세입니다.');
    return fail('I_TREND', '기관 이탈', '기관 보유 추세가 감소하고 있습니다.');
  }

  if (stock.numInstitutionalHolders !== null) {
    if (stock.numInstitutionalHolders < CANSLIM_CRITERIA.MIN_INSTITUTIONAL_HOLDERS) {
      addDetail('I', '보유 기관 수', 'FAIL',
        stock.numInstitutionalHolders, `≥ ${CANSLIM_CRITERIA.MIN_INSTITUTIONAL_HOLDERS}개`,
        '보유 기관이 너무 적어 수급이 불안정합니다.');
      return fail('I_COUNT', '기관 수 부족',
        `보유 기관 ${stock.numInstitutionalHolders}개 < ${CANSLIM_CRITERIA.MIN_INSTITUTIONAL_HOLDERS}개`);
    }
    addDetail('I', '보유 기관 수', 'PASS',
      stock.numInstitutionalHolders, `≥ ${CANSLIM_CRITERIA.MIN_INSTITUTIONAL_HOLDERS}개`,
      '충분한 기관이 보유하고 있습니다.');
  } else {
    addDetail('I', '보유 기관 수', 'INFO', null, `≥ ${CANSLIM_CRITERIA.MIN_INSTITUTIONAL_HOLDERS}개`,
      '기관 보유 데이터가 확보되지 않았습니다.');
    warnings.push('기관 보유 현황 데이터가 확보되지 않아 수급 분석이 불완전할 수 있습니다.');
  }

  // 기관 과밀집 경고 (v2.0 추가)
  if (stock.institutionalOwnershipPct !== null) {
    if (stock.institutionalOwnershipPct > CANSLIM_CRITERIA.MAX_INSTITUTIONAL_OWNERSHIP_PCT) {
      warnings.push('기관 보유 비중 과다: 잠재적인 대량 매도 물량 출회 가능성에 유의하십시오.');
      if (confidence === 'HIGH') confidence = 'MEDIUM';
      addDetail('I', '기관 보유 비율', 'WARNING',
        `${stock.institutionalOwnershipPct}%`, `≤ ${CANSLIM_CRITERIA.MAX_INSTITUTIONAL_OWNERSHIP_PCT}%`,
        '기관 과밀집 — 매도 압력 위험이 있습니다.');
    } else if (stock.institutionalOwnershipPct < CANSLIM_CRITERIA.MIN_INSTITUTIONAL_OWNERSHIP_PCT) {
      warnings.push('기관 관심 부족: 아직 메이저 기관들의 수급이 충분히 유입되지 않은 상태입니다.');
      addDetail('I', '기관 보유 비율', 'WARNING',
        `${stock.institutionalOwnershipPct}%`, `≥ ${CANSLIM_CRITERIA.MIN_INSTITUTIONAL_OWNERSHIP_PCT}%`,
        '기관 관심이 부족합니다.');
    } else {
      addDetail('I', '기관 보유 비율', 'PASS',
        `${stock.institutionalOwnershipPct}%`,
        `${CANSLIM_CRITERIA.MIN_INSTITUTIONAL_OWNERSHIP_PCT}~${CANSLIM_CRITERIA.MAX_INSTITUTIONAL_OWNERSHIP_PCT}%`,
        '기관 보유 비율이 정상 구간입니다.');
    }
  }

  // ══════════════════════════════════════════════════════════
  // 손절가 자동 계산 (오닐 원칙: 7~8% 기계적 손절)
  // ══════════════════════════════════════════════════════════

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

// =============================================
// 이중 스크리너 비교 (디자인 문서 §4)
// =============================================

/**
 * CAN SLIM + VCP 결과를 교차 비교하여 이중 검증 티어를 결정합니다.
 *
 * | CAN SLIM | VCP       | 티어        | 권장 액션                    |
 * |----------|-----------|-------------|------------------------------|
 * | ✅ PASS  | ✅ strong/forming | TIER_1    | 🔴 최우선 관심 종목        |
 * | ✅ PASS  | ❌ weak/none      | WATCHLIST  | 🟡 패턴 완성 대기          |
 * | ❌ FAIL  | ✅ strong/forming | SHORT_TERM | 🟡 단기 트레이딩 후보      |
 * | ❌ FAIL  | ❌ weak/none      | EXCLUDED   | ⚫ 스크리너 제외            |
 */
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

/**
 * 이중 검증 티어의 한글 라벨/색상 정보
 */
export function dualTierLabel(tier: DualScreenerTier): { label: string; color: string; emoji: string } {
  switch (tier) {
    case 'TIER_1': return { label: '최우선 관심', color: 'emerald', emoji: '🔴' };
    case 'WATCHLIST': return { label: '워치리스트', color: 'amber', emoji: '🟡' };
    case 'SHORT_TERM': return { label: '단기 후보', color: 'blue', emoji: '🟡' };
    case 'EXCLUDED': return { label: '제외', color: 'slate', emoji: '⚫' };
  }
}
