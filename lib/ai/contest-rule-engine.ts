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

type RuleRiskFlag =
  | 'RS_DATA_MISSING'
  | 'STOP_PLAN_BLOCKED_INSUFFICIENT_BASE'
  | 'HTF_PATTERN_NOT_CONFIRMED'
  | 'EXTREME_12M_RETURN'
  | 'LOW_AVG_DOLLAR_VOLUME'
  | 'PRICE_PATTERN_SEPA_ONLY';

function hasNum(v: unknown): boolean {
  return typeof v === 'number' && isFinite(v) && v > 0;
}

function scoreCandidate(snap: Record<string, unknown>): ScoreBreakdown {
  const n = (v: unknown, fallback = 0) => (typeof v === 'number' && isFinite(v) ? v : fallback);

  // VCP quality (25pts)
  const vcpPts = Math.min(25, (n(snap.vcp_score) / 100) * 25);

  // RS leadership (25pts)
  // fallback chain: rs_rating → internal_rs_rating → external_rs_rating
  // 데이터 없음(null)이면 중립 10점 부여 (페널티 없음)
  const rsVal = hasNum(snap.rs_rating) ? n(snap.rs_rating)
    : hasNum(snap.internal_rs_rating) ? n(snap.internal_rs_rating)
    : hasNum(snap.external_rs_rating) ? n(snap.external_rs_rating)
    : null;
  const rsBase = rsVal !== null ? Math.min(20, (rsVal / 99) * 20) : 10;
  const rsNewHigh = snap.rs_line_new_high ? 3 : snap.rs_line_near_high ? 1 : 0;
  const rsPercentileBonus = n(snap.rs_percentile) >= 90 ? 2 : 0;
  const rsPts = Math.min(25, rsBase + rsNewHigh + rsPercentileBonus);

  // SEPA pass rate (20pts)
  const sepaPass = n(snap.sepa_passed);
  const sepaFail = n(snap.sepa_failed);
  const sepaTotal = sepaPass + sepaFail;
  const sepaPts = sepaTotal > 0 ? Math.min(20, (sepaPass / sepaTotal) * 20) : 10;

  // Momentum (15pts)
  // ibd/weighted 모두 없으면 중립 5점 부여
  const ibdRaw = hasNum(snap.ibd_proxy_score) ? n(snap.ibd_proxy_score)
    : hasNum(snap.weighted_momentum_score) ? n(snap.weighted_momentum_score)
    : null;
  const ibdPts = ibdRaw !== null ? Math.min(10, (ibdRaw / 100) * 10) : 5;
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

function deriveOverall(score: number, riskFlags: RuleRiskFlag[]): ContestLlmOverall {
  if (riskFlags.includes('STOP_PLAN_BLOCKED_INSUFFICIENT_BASE')) return 'NEUTRAL';
  if (score >= 62) return 'POSITIVE';
  if (score >= 40) return 'NEUTRAL';
  return 'NEGATIVE';
}

function deriveRecommendation(
  score: number,
  rank: number,
  totalCandidates: number,
  riskFlags: RuleRiskFlag[],
): ContestLlmRecommendation {
  const topCutoff = Math.max(1, Math.ceil(totalCandidates * 0.2));
  const bottomCutoff = Math.max(topCutoff + 1, Math.ceil(totalCandidates * 0.8));
  const stopBlocked = riskFlags.includes('STOP_PLAN_BLOCKED_INSUFFICIENT_BASE');
  const rsMissing = riskFlags.includes('RS_DATA_MISSING');
  const extremeRun = riskFlags.includes('EXTREME_12M_RETURN');

  if (score < 40 || rank >= bottomCutoff) return 'SKIP';
  if (!stopBlocked && !rsMissing && !extremeRun && (score >= 62 || (rank <= topCutoff && score >= 55))) {
    return 'PROCEED';
  }
  return 'WATCH';
}

function deriveConfidence(score: number, riskFlags: RuleRiskFlag[]): number {
  const penalty =
    (riskFlags.includes('RS_DATA_MISSING') ? 0.08 : 0) +
    (riskFlags.includes('STOP_PLAN_BLOCKED_INSUFFICIENT_BASE') ? 0.06 : 0) +
    (riskFlags.includes('EXTREME_12M_RETURN') ? 0.05 : 0);
  const raw = 0.30 + (score / 100) * 0.68 - penalty;
  return Math.min(0.98, Math.max(0.30, Math.round(raw * 100) / 100));
}

function resolveRs(snap: Record<string, unknown>): number | null {
  const n = (v: unknown) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : null);
  return n(snap.rs_rating) ?? n(snap.internal_rs_rating) ?? n(snap.external_rs_rating) ?? null;
}

function buildKeyStrength(snap: Record<string, unknown>, scores: ScoreBreakdown): string {
  const n = (v: unknown, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
  const rsResolved = resolveRs(snap);
  const rs = rsResolved ?? 0;
  const hasRs = rsResolved !== null;
  const vcp = n(snap.vcp_score);
  const sepaPass = n(snap.sepa_passed);
  const sepaFail = n(snap.sepa_failed);
  const sepaTotal = sepaPass + sepaFail;
  const sepaRate = sepaTotal > 0 ? sepaPass / sepaTotal : 0;
  const pivotDist = Math.abs(n(snap.distance_to_pivot_pct, 999));
  const htf = snap.high_tight_flag as Record<string, unknown> | null | undefined;

  if (htf?.passed) return `High Tight Flag 패턴 감지 — 폭발적 상승 구조`;
  if (snap.rs_line_new_high && hasRs && rs >= 85) return `RS 라인 신고가 돌파 (RS ${rs}), 유니버스 상대강도 최상위권`;
  if (vcp >= 75 && pivotDist <= 5) return `VCP ${vcp}점 고품질 수축 + 피벗 ${pivotDist.toFixed(1)}% 이격, 진입 적기`;
  if (hasRs && rs >= 90) return `RS 등급 ${rs} — 유니버스 내 최상위 상대강도`;
  if (sepaRate >= 0.8 && sepaTotal >= 5) return `가격 패턴 기반 SEPA ${sepaPass}/${sepaTotal} 통과, 펀더멘털은 외부 LLM 상세 검토 필요`;
  if (snap.mansfield_rs_flag && hasRs && rs >= 80) return `Mansfield RS 양성 + RS ${rs}, 모멘텀 연속성 확인`;
  if (vcp >= 65) return `VCP ${vcp}점 수축 구조 형성, 변동성 압축 진행 중`;
  if (hasRs && rs >= 80) return `RS 등급 ${rs}, 상대강도 상위권 유지`;
  if (pivotDist <= 5) return `피벗 ${pivotDist.toFixed(1)}% 이격, 매수 진입 가능 구간`;
  return `기술적 종합 점수 ${scores.total.toFixed(0)}점, 후보군 내 상대적 우위`;
}

function buildRiskFlags(snap: Record<string, unknown>): RuleRiskFlag[] {
  const n = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : null);
  const flags: RuleRiskFlag[] = [];
  const htf = snap.high_tight_flag as Record<string, unknown> | null | undefined;
  const sepaPass = n(snap.sepa_passed);
  const sepaFail = n(snap.sepa_failed);

  if (resolveRs(snap) === null) flags.push('RS_DATA_MISSING');
  if (htf?.stopReliability === 'INSUFFICIENT_BASE' || (typeof htf?.baseDays === 'number' && htf.baseDays < 5)) {
    flags.push('STOP_PLAN_BLOCKED_INSUFFICIENT_BASE');
  } else if (htf && htf.passed === false) {
    flags.push('HTF_PATTERN_NOT_CONFIRMED');
  }
  if ((n(snap.return_12m) ?? 0) >= 500) flags.push('EXTREME_12M_RETURN');
  if ((n(snap.avg_dollar_volume) ?? Infinity) < 10_000_000) flags.push('LOW_AVG_DOLLAR_VOLUME');
  if (sepaPass !== null && sepaFail !== null && sepaPass + sepaFail > 0) flags.push('PRICE_PATTERN_SEPA_ONLY');

  return flags;
}

function buildKeyRisk(snap: Record<string, unknown>, scores: ScoreBreakdown): string {
  const n = (v: unknown, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
  const rsResolved = resolveRs(snap);
  const rs = rsResolved ?? 0;
  const hasRs = rsResolved !== null;
  const pivotDist = Math.abs(n(snap.distance_to_pivot_pct, 999));
  const sepaPass = n(snap.sepa_passed);
  const sepaFail = n(snap.sepa_failed);
  const sepaTotal = sepaPass + sepaFail;
  const sepaRate = sepaTotal > 0 ? sepaPass / sepaTotal : 0;

  if (pivotDist > 15) return `피벗 이격 ${pivotDist.toFixed(0)}% 초과, 추격 진입 시 손절 폭 과대`;
  if (sepaRate < 0.5 && sepaTotal >= 5) return `SEPA ${sepaPass}/${sepaTotal} 충족에 그침, 기술적 완성도 미흡`;
  if (hasRs && rs < 70) return `RS 등급 ${rs} — 유니버스 대비 상대강도 부진`;
  if (!hasRs) return `RS 데이터 미확보 — 유니버스 상대강도 확인 필요`;
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
    const riskFlags = buildRiskFlags(item.snap);
    const overall = deriveOverall(item.scores.total, riskFlags);
    const recommendation = deriveRecommendation(item.scores.total, rank, scored.length, riskFlags);
    const confidence = deriveConfidence(item.scores.total, riskFlags);
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
        mtn_role: 'PRELIMINARY_SCREEN',
        committee_role: 'DECISION_INFLUENCING_REVIEW',
        overall,
        key_strength,
        key_risk,
        recommendation,
        confidence,
        risk_flags: riskFlags,
        data_quality: {
          rs_available: !riskFlags.includes('RS_DATA_MISSING'),
          stop_plan_available: !riskFlags.includes('STOP_PLAN_BLOCKED_INSUFFICIENT_BASE'),
          sepa_scope: 'PRICE_PATTERN_ONLY',
        },
        disclaimers: [
          'MTN Rule Engine 결과는 최종 투자 결정이 아니라 1차 정량 평가입니다.',
          '최종 투자 계획은 외부 LLM의 펀더멘털, 리스크, 이벤트, 집행 가능성 평가와 결합해야 합니다.',
        ],
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
