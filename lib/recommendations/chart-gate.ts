import type { TechnicalChartAnalysis } from '@/lib/ai/technical-chart-analysis';
import type { MarketAnalysisResponse } from '@/types';
import type { DailyCategoryTop10Pick } from '@/lib/daily-screeners';

export type FundamentalVerification = 'VERIFIED' | 'PARTIAL' | 'MISSING' | 'UNVERIFIED';
export type ChartGateDisposition = 'ACTIONABLE' | 'WATCHLIST' | 'EXCLUDED' | 'UNVERIFIED';

export interface RecommendationChartGate {
  disposition: ChartGateDisposition;
  verdict: 'BUY' | 'WATCH' | 'AVOID' | 'UNVERIFIED';
  setupGrade: 'A' | 'B' | 'C' | 'D' | null;
  readiness: string | null;
  eligible: boolean;
  fundamentalVerification: FundamentalVerification;
  score: number;
  summary: string;
}

export interface RecommendationPublicationGateFailure {
  ticker: string;
  disposition: ChartGateDisposition | 'MISSING';
  verdict: RecommendationChartGate['verdict'] | 'MISSING';
  fundamentalVerification: FundamentalVerification | 'MISSING';
  summary: string;
}

export interface RecommendationPublicationGate {
  requiredCount: number;
  totalCount: number;
  eligibleCount: number;
  coverage: number;
  canPublish: boolean;
  reason: string | null;
  failures: RecommendationPublicationGateFailure[];
}

function hasNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function assessFundamentalVerification(analysis: MarketAnalysisResponse): FundamentalVerification {
  const fundamentals = analysis.fundamentals;
  if (!fundamentals) return 'MISSING';
  const coreComplete = [fundamentals.epsGrowthPct, fundamentals.revenueGrowthPct, fundamentals.roePct].every(hasNumber);
  if (!coreComplete) return 'MISSING';
  return hasNumber(fundamentals.debtToEquityPct) ? 'VERIFIED' : 'PARTIAL';
}

function technicalScore(technical: TechnicalChartAnalysis) {
  const readinessWeight = {
    ACTIONABLE: 500,
    NEAR_TRIGGER: 360,
    EARLY: 220,
    EXTENDED: 80,
    INVALID: -900,
  }[technical.readiness];
  const gradeWeight = { A: 160, B: 110, C: 50, D: -80 }[technical.setupGrade];
  const verdictWeight = technical.verdict === 'BUY' ? 180 : technical.verdict === 'WATCH' ? 0 : -1_000;
  const confluenceWeight = Number.isFinite(technical.professionalPlan.confluenceScore)
    ? technical.professionalPlan.confluenceScore * 2
    : technical.professionalPlan.trendScore * 15;
  return readinessWeight + gradeWeight + verdictWeight + confluenceWeight;
}

export function buildRecommendationChartGate(
  analysis: MarketAnalysisResponse,
  technical: TechnicalChartAnalysis,
): RecommendationChartGate {
  const fundamentalVerification = assessFundamentalVerification(analysis);
  const technicallyEligible = technical.verdict !== 'AVOID'
    && technical.readiness !== 'INVALID'
    && technical.readiness !== 'EXTENDED';
  const fundamentalEligible = fundamentalVerification !== 'MISSING';
  const actionable = technicallyEligible
    && fundamentalEligible
    && technical.verdict === 'BUY'
    && technical.setupGrade === 'A'
    && technical.readiness === 'ACTIONABLE';
  const eligible = technicallyEligible && fundamentalEligible;
  const disposition: ChartGateDisposition = actionable
    ? 'ACTIONABLE'
    : eligible ? 'WATCHLIST' : 'EXCLUDED';
  const fundamentalScore = fundamentalVerification === 'VERIFIED' ? 100
    : fundamentalVerification === 'PARTIAL' ? 20 : -350;
  const score = technicalScore(technical) + fundamentalScore;
  const fundamentalLabel = fundamentalVerification === 'VERIFIED' ? '검증' : fundamentalVerification === 'PARTIAL' ? '부분 확인' : '미검증';

  return {
    disposition,
    verdict: technical.verdict,
    setupGrade: technical.setupGrade,
    readiness: technical.readiness,
    eligible,
    fundamentalVerification,
    score,
    summary: `차트 ${technical.verdict} ${technical.setupGrade}/${technical.readiness}, 펀더멘털 ${fundamentalLabel}`,
  };
}

export function buildUnverifiedRecommendationChartGate(reason: string): RecommendationChartGate {
  return {
    disposition: 'UNVERIFIED',
    verdict: 'UNVERIFIED',
    setupGrade: null,
    readiness: null,
    eligible: false,
    fundamentalVerification: 'UNVERIFIED',
    score: -500,
    summary: `통합 검증 보류: ${reason}`,
  };
}

export function isOfficiallyEligibleRecommendationGate(gate: RecommendationChartGate | null | undefined) {
  return Boolean(
    gate?.eligible === true
    && (gate.disposition === 'ACTIONABLE' || gate.disposition === 'WATCHLIST')
    && (gate.verdict === 'BUY' || gate.verdict === 'WATCH')
    && (gate.fundamentalVerification === 'VERIFIED' || gate.fundamentalVerification === 'PARTIAL'),
  );
}

export function assessRecommendationPublicationGate<
  T extends Pick<DailyCategoryTop10Pick, 'ticker'> & { chartGate?: RecommendationChartGate },
>(picks: T[], requiredCount = 10): RecommendationPublicationGate {
  const failures = picks.flatMap((pick): RecommendationPublicationGateFailure[] => {
    if (isOfficiallyEligibleRecommendationGate(pick.chartGate)) return [];
    return [{
      ticker: pick.ticker,
      disposition: pick.chartGate?.disposition || 'MISSING',
      verdict: pick.chartGate?.verdict || 'MISSING',
      fundamentalVerification: pick.chartGate?.fundamentalVerification || 'MISSING',
      summary: pick.chartGate?.summary || '통합 차트·펀더멘털 검증 결과가 없습니다.',
    }];
  });
  const eligibleCount = picks.length - failures.length;
  const canPublish = picks.length === requiredCount && eligibleCount === requiredCount;
  const reason = canPublish
    ? null
    : picks.length !== requiredCount
      ? `공식 발행에는 ${requiredCount}개 종목이 필요하지만 ${picks.length}개만 확인되었습니다.`
      : `공식 발행 검증 통과 ${eligibleCount}/${requiredCount}: ${failures.map((failure) => failure.ticker).join(', ')}`;
  return {
    requiredCount,
    totalCount: picks.length,
    eligibleCount,
    coverage: requiredCount > 0 ? Math.min(1, eligibleCount / requiredCount) : 0,
    canPublish,
    reason,
    failures,
  };
}

export function rankChartGatedPicks<T extends DailyCategoryTop10Pick & { chartGate?: RecommendationChartGate }>(picks: T[]) {
  return [...picks]
    .sort((left, right) => {
      const leftScore = left.chartGate?.score ?? -500;
      const rightScore = right.chartGate?.score ?? -500;
      if (rightScore !== leftScore) return rightScore - leftScore;
      if (right.confidence !== left.confidence) return right.confidence - left.confidence;
      return left.rank - right.rank;
    })
    .map((pick, index) => ({ ...pick, rank: index + 1 }));
}
