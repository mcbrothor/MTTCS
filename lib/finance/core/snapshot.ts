import type {
  BeautyContestSession,
  ContestCandidate,
  Direction,
  SepaEvidence,
  TradeContestSnapshot,
  TradeEntrySnapshot,
  TradeLlmVerdict,
  VcpAnalysis,
} from '../../../types/index.ts';

interface BuildEntrySnapshotInput {
  ticker: string;
  direction: Direction;
  checklist: {
    chk_sepa?: boolean;
    chk_market?: boolean;
    chk_risk?: boolean;
    chk_entry?: boolean;
    chk_stoploss?: boolean;
    chk_exit?: boolean;
    chk_psychology?: boolean;
  };
  sepaEvidence: SepaEvidence | null;
  vcpAnalysis?: VcpAnalysis | null;
  totalEquity?: number | null;
  plannedRisk?: number | null;
  riskPercent?: number | null;
  entryPrice?: number | null;
  stoplossPrice?: number | null;
  positionSize?: number | null;
  totalShares?: number | null;
  entryTargets?: TradeEntrySnapshot['plan']['entry_targets'];
  trailingStops?: TradeEntrySnapshot['plan']['trailing_stops'];
  planNote?: string | null;
  invalidationNote?: string | null;
  capturedAt?: string;
}

export function buildEntrySnapshot(input: BuildEntrySnapshotInput): TradeEntrySnapshot {
  const capturedAt = input.capturedAt || new Date().toISOString();
  const summary = input.sepaEvidence?.summary;
  const metrics = input.sepaEvidence?.metrics;

  return {
    version: 'mtn-entry-snapshot-v1',
    captured_at: capturedAt,
    ticker: input.ticker.toUpperCase(),
    direction: input.direction,
    checklist: {
      sepa: Boolean(input.checklist.chk_sepa),
      market: input.checklist.chk_market === undefined ? Boolean(input.checklist.chk_sepa) : Boolean(input.checklist.chk_market),
      risk: Boolean(input.checklist.chk_risk),
      entry: Boolean(input.checklist.chk_entry),
      stoploss: Boolean(input.checklist.chk_stoploss),
      exit: Boolean(input.checklist.chk_exit),
      psychology: Boolean(input.checklist.chk_psychology),
    },
    plan: {
      total_equity: input.totalEquity ?? null,
      planned_risk: input.plannedRisk ?? null,
      risk_percent: input.riskPercent ?? null,
      entry_price: input.entryPrice ?? null,
      stoploss_price: input.stoplossPrice ?? null,
      position_size: input.positionSize ?? null,
      total_shares: input.totalShares ?? null,
      entry_targets: input.entryTargets ?? null,
      trailing_stops: input.trailingStops ?? null,
    },
    sepa: {
      status: input.sepaEvidence?.status ?? null,
      passed: summary?.passed ?? null,
      failed: summary?.failed ?? null,
      core_passed: summary?.corePassed ?? null,
      core_failed: summary?.coreFailed ?? null,
      core_total: summary?.coreTotal ?? null,
      rs_rating: metrics?.rsRating ?? null,
      rs_source: metrics?.rsSource ?? null,
      macro_action_level: metrics?.macroActionLevel ?? null,
    },
    vcp: {
      grade: input.vcpAnalysis?.grade ?? null,
      score: input.vcpAnalysis?.score ?? null,
      base_type: input.vcpAnalysis?.baseType ?? null,
      pivot_price: input.vcpAnalysis?.pivotPrice ?? null,
      recommended_entry: input.vcpAnalysis?.recommendedEntry ?? null,
      invalidation_price: input.vcpAnalysis?.invalidationPrice ?? null,
      breakout_volume_status: input.vcpAnalysis?.breakoutVolumeStatus ?? null,
      contraction_count: input.vcpAnalysis?.contractions.length ?? null,
      volume_dry_up_score: input.vcpAnalysis?.volumeDryUpScore ?? null,
      pocket_pivot_score: input.vcpAnalysis?.pocketPivotScore ?? null,
    },
    notes: {
      plan_note: input.planNote ?? null,
      invalidation_note: input.invalidationNote ?? null,
    },
  };
}

export function buildContestSnapshot(session: BeautyContestSession, candidate: ContestCandidate, capturedAt = new Date().toISOString()): TradeContestSnapshot {
  return {
    version: 'mtn-contest-snapshot-v1',
    captured_at: capturedAt,
    session: {
      id: session.id,
      market: session.market,
      universe: session.universe,
      selected_at: session.selected_at,
      status: session.status,
      llm_provider: session.llm_provider || null,
      response_schema_version: session.response_schema_version || null,
    },
    candidate: {
      id: candidate.id,
      ticker: candidate.ticker,
      exchange: candidate.exchange,
      name: candidate.name || null,
      user_rank: candidate.user_rank,
      llm_rank: candidate.llm_rank ?? null,
      actual_invested: candidate.actual_invested,
      final_pick_rank: candidate.final_pick_rank ?? null,
      recommendation_tier: candidate.recommendation_tier ?? null,
      recommendation_reason: candidate.recommendation_reason ?? null,
      entry_reference_price: candidate.entry_reference_price ?? null,
      linked_trade_id: candidate.linked_trade_id ?? null,
    },
    market_context: session.market_context ?? null,
    candidate_pool_snapshot: session.candidate_pool_snapshot ?? null,
  };
}

export function buildLlmVerdict(session: BeautyContestSession, candidate: ContestCandidate, capturedAt = new Date().toISOString()): TradeLlmVerdict {
  const analysis = candidate.llm_analysis && typeof candidate.llm_analysis === 'object'
    ? candidate.llm_analysis as Record<string, unknown>
    : null;
  const confidence = typeof analysis?.confidence === 'number'
    ? analysis.confidence
    : Number.isFinite(Number(analysis?.confidence))
      ? Number(analysis?.confidence)
      : null;
  const raw = analysis?.raw && typeof analysis.raw === 'object' && !Array.isArray(analysis.raw)
    ? analysis.raw as Record<string, unknown>
    : null;

  return {
    version: 'mtn-llm-verdict-v1',
    captured_at: capturedAt,
    session_id: session.id,
    candidate_id: candidate.id,
    ticker: candidate.ticker,
    llm_provider: session.llm_provider || null,
    llm_rank: candidate.llm_rank ?? null,
    comment: candidate.llm_comment ?? null,
    overall: typeof analysis?.overall === 'string' ? analysis.overall as TradeLlmVerdict['overall'] : null,
    key_strength: typeof analysis?.key_strength === 'string' ? analysis.key_strength : null,
    key_risk: typeof analysis?.key_risk === 'string' ? analysis.key_risk : null,
    recommendation: typeof analysis?.recommendation === 'string' ? analysis.recommendation as TradeLlmVerdict['recommendation'] : null,
    confidence,
    scores: candidate.llm_scores ?? null,
    raw,
    analysis: analysis ?? null,
    response_schema_version: session.response_schema_version ?? null,
  };
}
