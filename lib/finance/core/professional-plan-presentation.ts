import type {
  ProfessionalChartPlan,
  ProfessionalSetupGrade,
  ProfessionalVerdict,
  TradeReadiness,
} from '@/lib/finance/engines/professional-chart-plan';

const VERDICT = {
  BUY: {
    label: '진입 검토',
    meaning: '가격·거래량·위험 조건이 충족됐습니다. 정해진 손절을 전제로만 분할 진입을 검토합니다.',
  },
  WATCH: {
    label: '관찰',
    meaning: '종목의 질은 검토할 만하지만 지금은 매수 조건이 완성되지 않았습니다.',
  },
  AVOID: {
    label: '진입 금지',
    meaning: '차트 구조 또는 위험 조건이 무효입니다. 신규 진입 후보에서 제외합니다.',
  },
} satisfies Record<ProfessionalVerdict, { label: string; meaning: string }>;

const GRADE = {
  A: { label: '우수', meaning: '추세·패턴·손절 폭·보상비·거래량이 대부분 정렬됐습니다.' },
  B: { label: '양호', meaning: '핵심 구조는 양호하지만 거래량 또는 타이밍 확인이 더 필요합니다.' },
  C: { label: '보통', meaning: '일부 조건만 충족했습니다. 다른 후보보다 우선순위가 낮습니다.' },
  D: { label: '미흡', meaning: '신규 진입을 뒷받침할 기술적 근거가 부족합니다.' },
} satisfies Record<ProfessionalSetupGrade, { label: string; meaning: string }>;

const READINESS = {
  ACTIONABLE: { label: '진입 조건 충족', meaning: '유효 기준가를 돌파했고 거래량 확인까지 완료된 구간입니다.' },
  NEAR_TRIGGER: { label: '돌파 확인 대기', meaning: '기준가 부근이지만 종가 돌파와 거래량 확인 전에는 매수하지 않습니다.' },
  EARLY: { label: '구조 형성 중', meaning: '유효한 베이스와 진입 기준가가 아직 확정되지 않았습니다.' },
  EXTENDED: { label: '추격 금지', meaning: '기준가 또는 이동평균선에서 너무 멀어졌습니다. 눌림과 재지지를 기다립니다.' },
  INVALID: { label: '계획 무효', meaning: '손절 구조나 시장 위험 조건이 성립하지 않습니다.' },
} satisfies Record<TradeReadiness, { label: string; meaning: string }>;

export function describeProfessionalPlan(plan: Pick<ProfessionalChartPlan, 'verdict' | 'setupGrade' | 'readiness'>) {
  const verdict = VERDICT[plan.verdict];
  const grade = GRADE[plan.setupGrade];
  const readiness = READINESS[plan.readiness];
  return {
    verdictCode: plan.verdict,
    verdictLabel: verdict.label,
    verdictMeaning: verdict.meaning,
    gradeCode: plan.setupGrade,
    gradeLabel: grade.label,
    gradeMeaning: grade.meaning,
    readinessCode: plan.readiness,
    readinessLabel: readiness.label,
    readinessMeaning: readiness.meaning,
    action: plan.readiness === 'ACTIONABLE'
      ? '손절 기준을 먼저 정한 뒤 계획된 비중만 분할 진입합니다.'
      : plan.readiness === 'NEAR_TRIGGER'
        ? '종가 돌파와 평균 대비 거래량 증가가 함께 확인될 때까지 기다립니다.'
        : plan.readiness === 'EARLY'
          ? '현재는 매수하지 않습니다. 베이스와 피벗이 확정되는지 관찰합니다.'
          : plan.readiness === 'EXTENDED'
            ? '현재 가격을 추격하지 않습니다. 지지 구간 눌림과 재상승 확인을 기다립니다.'
            : '신규 진입을 중단하고 무효 사유가 해소될 때까지 후보에서 제외합니다.',
  };
}
