import type {
  ContestLlmOverall,
  ContestLlmRecommendation,
  ContestLlmResponse,
} from '@/types';

export const RULE_ENGINE_VERSION = 'mtn-rule-engine-v1';
export const RULE_ENGINE_PROVIDER = 'rule-engine';

interface ScoreBreakdown {
  vcp: number;       // 0-25
  rs: number;        // 0-25
  sepa: number;      // 0-20
  momentum: number;  // 0-15
  technical: number; // 0-15
  total: number;     // 0-100
}

function scoreCandidate(snap: Record<string, unknown>): ScoreBreakdown {
  const n = (v: unknown, fallback = 0) => (typeof v === 'number' && isFinite(v) ? v : fallback);

  // VCP quality (25pts)
  const vcpPts = Math.min(25, (n(snap.vcp_score) / 100) * 25);

  // RS leadership (25pts)
  const rsBase = Math.min(20, (n(snap.rs_rating) / 99) * 20);
  const rsNewHigh = snap.rs_line_new_high ? 3 : snap.rs_line_near_high ? 1 : 0;
  const rsPercentileBonus = n(snap.rs_percentile) >= 90 ? 2 : 0;
  const rsPts = Math.min(25, rsBase + rsNewHigh + rsPercentileBonus);

  // SEPA pass rate (20pts)
  const sepaPass = n(snap.sepa_passed);
  const sepaFail = n(snap.sepa_failed);
  const sepaTotal = sepaPass + sepaFail;
  const sepaPts = sepaTotal > 0 ? Math.min(20, (sepaPass / sepaTotal) * 20) : 10;

  // Momentum (15pts)
  const ibd = n(snap.ibd_proxy_score, n(snap.weighted_momentum_score));
  const ibdPts = Math.min(10, (ibd / 100) * 10);
  const mansBonus = snap.mansfield_rs_flag ? 5 : n(snap.mansfield_rs_score) > 1.0 ? 3 : 0;
  const momentumPts = Math.min(15, ibdPts + mansBonus);

  // Technical structure (15pts)
  const contractionPts = Math.min(3, (n(snap.contraction_score) / 100) * 3);
  const volumeDryPts = Math.min(3, (n(snap.volume_dry_up_score) / 100) * 3);
  const pivotDist = Math.abs(n(snap.distance_to_pivot_pct, 999));
  const pivotPts = pivotDist <= 2 ? 5 : pivotDist <= 5 ? 4 : pivotDist <= 8 ? 3 : pivotDist <= 12 ? 1 : 0;
  const bbPts = (n(snap.bb_squeeze_score) / 100) * 2;
  const pocketPts = (n(snap.pocket_pivot_score) / 100) * 2;
  const technicalPts = Math.min(15, contractionPts + volumeDryPts + pivotPts + bbPts + pocketPts);

  const total = vcpPts + rsPts + sepaPts + momentumPts + technicalPts;
  const r = (v: number) => Math.round(v * 10) / 10;
  return {
    vcp: r(vcpPts), rs: r(rsPts), sepa: r(sepaPts),
    momentum: r(momentumPts), technical: r(technicalPts), total: r(total),
  };
}

function deriveOverall(score: number): ContestLlmOverall {
  if (score >= 62) return 'POSITIVE';
  if (score >= 40) return 'NEUTRAL';
  return 'NEGATIVE';
}

function deriveRecommendation(overall: ContestLlmOverall): ContestLlmRecommendation {
  if (overall === 'POSITIVE') return 'PROCEED';
  if (overall === 'NEGATIVE') return 'SKIP';
  return 'WATCH';
}

function deriveConfidence(score: number): number {
  // Linear map: score 0 → 0.30, score 100 → 0.98
  return Math.min(0.98, Math.max(0.30, Math.round((0.30 + (score / 100) * 0.68) * 100) / 100));
}

function buildKeyStrength(snap: Record<string, unknown>, scores: ScoreBreakdown): string {
  const n = (v: unknown, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
  const rs = n(snap.rs_rating);
  const vcp = n(snap.vcp_score);
  const sepaPass = n(snap.sepa_passed);
  const sepaFail = n(snap.sepa_failed);
  const sepaTotal = sepaPass + sepaFail;
  const sepaRate = sepaTotal > 0 ? sepaPass / sepaTotal : 0;
  const pivotDist = Math.abs(n(snap.distance_to_pivot_pct, 999));
  const htf = snap.high_tight_flag as Record<string, unknown> | null | undefined;

  if (htf?.detected) return `High Tight Flag 패턴 감지 — 폭발적 상승 구조`;
  if (snap.rs_line_new_high && rs >= 85) return `RS 라인 신고가 돌파 (RS ${rs}), 유니버스 상대강도 최상위권`;
  if (vcp >= 75 && pivotDist <= 5) return `VCP ${vcp}점 고품질 수축 + 피벗 ${pivotDist.toFixed(1)}% 이격, 진입 적기`;
  if (rs >= 90) return `RS 등급 ${rs} — 유니버스 내 최상위 상대강도`;
  if (sepaRate >= 0.8 && sepaTotal >= 5) return `SEPA ${sepaPass}/${sepaTotal} 충족, 기술적 품질 최상위`;
  if (snap.mansfield_rs_flag && rs >= 80) return `Mansfield RS 양성 + RS ${rs}, 모멘텀 연속성 확인`;
  if (vcp >= 65) return `VCP ${vcp}점 수축 구조 형성, 변동성 압축 진행 중`;
  if (rs >= 80) return `RS 등급 ${rs}, 상대강도 상위권 유지`;
  if (pivotDist <= 5) return `피벗 ${pivotDist.toFixed(1)}% 이격, 매수 진입 가능 구간`;
  return `기술적 종합 점수 ${scores.total.toFixed(0)}점, 후보군 내 상대적 우위`;
}

function buildKeyRisk(snap: Record<string, unknown>, scores: ScoreBreakdown): string {
  const n = (v: unknown, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
  const rs = n(snap.rs_rating);
  const pivotDist = Math.abs(n(snap.distance_to_pivot_pct, 999));
  const sepaPass = n(snap.sepa_passed);
  const sepaFail = n(snap.sepa_failed);
  const sepaTotal = sepaPass + sepaFail;
  const sepaRate = sepaTotal > 0 ? sepaPass / sepaTotal : 0;

  if (pivotDist > 15) return `피벗 이격 ${pivotDist.toFixed(0)}% 초과, 추격 진입 시 손절 폭 과대`;
  if (sepaRate < 0.5 && sepaTotal >= 5) return `SEPA ${sepaPass}/${sepaTotal} 충족에 그침, 기술적 완성도 미흡`;
  if (rs < 70) return `RS 등급 ${rs} — 유니버스 대비 상대강도 부진`;
  if (n(snap.volume_dry_up_score) < 30 && n(snap.vcp_score) > 50) return `거래량 수축 부족, VCP 완성도 미달`;
  if (pivotDist > 8) return `피벗 이격 ${pivotDist.toFixed(1)}%, 최적 진입 구간 초과 가능성`;
  if (rs < 80) return `RS ${rs}, 상대강도 중위권 — 유니버스 내 리더십 미확인`;
  if (n(snap.contraction_score) < 40) return `가격 수축 구조 미형성, 추가 베이스 형성 대기 필요`;
  if (scores.total < 55) return `종합 점수 ${scores.total.toFixed(0)}점, 후보군 내 하위권`;
  return `시장 상황 변화 시 유동성 대응 및 포지션 관리 필요`;
}

export interface RuleEngineCandidate {
  id: string;
  ticker: string;
  snapshot: Record<string, unknown> | null;
  user_rank: number;
}

export function runRuleEngine(
  candidates: RuleEngineCandidate[],
  sessionId: string,
): ContestLlmResponse {
  const scored = candidates.map(c => ({
    candidate: c,
    snap: (c.snapshot ?? {}) as Record<string, unknown>,
    scores: scoreCandidate((c.snapshot ?? {}) as Record<string, unknown>),
  }));

  // Primary: composite score desc. Tiebreak: user_rank asc (user's preference)
  scored.sort((a, b) =>
    b.scores.total - a.scores.total || a.candidate.user_rank - b.candidate.user_rank,
  );

  const rankings = scored.map((item, idx) => {
    const rank = idx + 1;
    const overall = deriveOverall(item.scores.total);
    const recommendation = deriveRecommendation(overall);
    const confidence = deriveConfidence(item.scores.total);
    const key_strength = buildKeyStrength(item.snap, item.scores);
    const key_risk = buildKeyRisk(item.snap, item.scores);

    return {
      session_id: sessionId,
      candidate_id: item.candidate.id,
      ticker: item.candidate.ticker,
      rank,
      overall,
      key_strength,
      key_risk,
      recommendation,
      confidence,
      comment: key_strength,
      scores: item.scores as unknown as Record<string, unknown>,
      analysis: {
        overall,
        key_strength,
        key_risk,
        recommendation,
        confidence,
        scores: item.scores,
      },
    };
  });

  return {
    response_schema_version: 'mtn-contest-json-v3',
    session_id: sessionId,
    executive_summary: '',
    rankings,
  };
}
