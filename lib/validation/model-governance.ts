export type ModelStatus = 'DRAFT' | 'RESEARCH_ONLY' | 'SHADOW' | 'APPROVED' | 'RETIRED';

export interface ValidationMetrics {
  expectancy: number;
  sharpe: number;
  sortino: number;
  maxDrawdownPct: number;
  turnover: number;
  hitRate: number;
  payoffRatio: number;
}

export function canInfluenceDecision(status: ModelStatus) {
  return status === 'APPROVED';
}

export function validatePromotion(input: {
  currentStatus: ModelStatus;
  targetStatus: ModelStatus;
  pointInTime: boolean;
  licensed: boolean;
  metrics?: ValidationMetrics | null;
  approvedBy?: string | null;
}) {
  if (input.targetStatus !== 'APPROVED') return { allowed: true, reasons: [] as string[] };
  const reasons: string[] = [];
  if (!input.pointInTime) reasons.push('point-in-time 데이터셋이 필요합니다.');
  if (!input.licensed) reasons.push('승인된 라이선스 데이터셋이 필요합니다.');
  if (!input.metrics) reasons.push('검증 지표가 필요합니다.');
  if (!input.approvedBy) reasons.push('투자전략 승인자가 필요합니다.');
  if (input.metrics && (input.metrics.expectancy <= 0 || input.metrics.maxDrawdownPct > 25)) reasons.push('승격 기준을 충족하지 못했습니다.');
  return { allowed: reasons.length === 0, reasons };
}
