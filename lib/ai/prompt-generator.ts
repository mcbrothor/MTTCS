import { ScannerResult } from '@/types';

/**
 * 뷰티 콘테스트용 글로벌 IB 리서치 프롬프트 생성기
 * 민버비니/오닐 철학 + 글로벌 IB(GS/MS) 페르소나 적용
 */
export function generateBeautyContestPrompt(candidates: ScannerResult[]): string {
  if (candidates.length === 0) return '';

  const dateStr = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // 1. 페르소나 및 분석 지시문 (국문)
  let prompt = `당신은 글로벌 탑티어 투자은행(IB)의 수석 주식 리서치 애널리스트이자, 마크 민버비니(Mark Minervini)의 SEPA/VCP 전략과 윌리엄 오닐(William O'Neil)의 CAN SLIM 원칙을 완벽하게 마스터한 전문가입니다.

오늘 날짜: ${dateStr}
분석 대상: 아래 제공된 ${candidates.length}개의 종목 후보군

### [미션]
제공된 기술적/기본적 데이터를 바탕으로, 향후 3~6개월 내 시장을 주도할 가능성이 가장 높은 상위 3개 종목을 선별하고 '뷰티 콘테스트' 최종 순위를 매겨주세요. 

### [분석 가이드라인]
1. **모멘텀의 질(Quality of Momentum)**: RS Rating, 52주 고점 대비 거리, VCP 패턴의 완성도(회수율, 거래량 감소 여부)를 평가하세요.
2. **펀더멘탈 가속화**: EPS 및 매출 성장률 가속화 여부, ROE 등 수익성 지표를 확인하세요.
3. **리스크 요인(Red Flags)**: 시스템이 감지한 경고 문구나 기술적 과열 징후를 냉철하게 지적하세요.
4. **최종 선발**: 1~3위를 선정하고, 각 종목에 대해 'IB 리서치 노트' 스타일로 핵심 투자 포인트와 리스크 요인을 요약하세요.
5. **검증 가이드**: 분석 후, 사용자가 웹 검색을 통해 추가로 확인해야 할 '최신 뉴스 키워드' 및 '실적 가이던스 체크포인트'를 제시하세요.

### [제공된 종목 데이터]
`;

  // 2. 종목별 데이터 통합
  candidates.forEach((c, idx) => {
    prompt += `\n--- [후보 ${idx + 1}: ${c.ticker} (${c.name})] ---\n`;
    prompt += `- 시장: ${c.exchange}\n`;
    prompt += `- 현재가: ${c.currentPrice} (${c.priceAsOf})\n`;
    
    // 기술적 지표
    prompt += `[기술적 분석 (VCP/SEPA)]\n`;
    prompt += `  * VCP 등급: ${c.vcpGrade} (점수: ${c.vcpScore}/100)\n`;
    prompt += `  * SEPA 상태: ${c.sepaStatus === 'pass' ? '통과 (전형적인 주도주 정렬)' : '주의/미달'}\n`;
    prompt += `  * 피벗 거리: ${c.distanceToPivotPct !== null ? `${c.distanceToPivotPct}%` : '계산 중'}\n`;
    if (c.vcpDetails && c.vcpDetails.length > 0) {
      prompt += `  * VCP 상세 내역:\n    - ${c.vcpDetails.join('\n    - ')}\n`;
    }

    // 기본적 지표 (있을 경우)
    if (c.fundamentals) {
      prompt += `[기본적 분석 (Fundamentals)]\n`;
      prompt += `  * EPS 성장률: ${c.fundamentals.epsGrowthPct ?? 'N/A'}%\n`;
      prompt += `  * 매출 성장률: ${c.fundamentals.revenueGrowthPct ?? 'N/A'}%\n`;
      prompt += `  * ROE: ${c.fundamentals.roePct ?? 'N/A'}%\n`;
      prompt += `  * 부채비율: ${c.fundamentals.debtToEquityPct ?? 'N/A'}%\n`;
    }

    // 시스템 경고
    if (c.errorMessage || (c.status === 'error')) {
      prompt += `[시스템 메시지]: ${c.errorMessage ?? '데이터 수집 중 오류가 발생했습니다.'}\n`;
    }
  });

  prompt += `\n### [응답 형식]
1. 전체 요약 (현재 시장 환경에 비춘 후보군의 특징)
2. 뷰티 콘테스트 최종 순위 (1위 ~ 3위)
3. 종목별 심층 분석 (투자 포인트, 리스크, 기술적 평점)
4. 사용자가 추가로 직접 검색해봐야 할 핵심 질문 리스트 (최신 뉴스 및 가이던스 관련)

**모든 분석은 한국어로 작성해 주세요.** 이제 분석을 시작해 주십시오.`;

  return prompt;
}
