import { rejectUnauthenticatedRequest } from '@/lib/auth/api';
﻿import { NextResponse } from 'next/server';
import { getRequestSession, getServerSession } from '@/lib/auth/session';
import { getMtnKrLivePrice, getMtnUsLiveQuotes } from '@/lib/finance/core/live-price-providers';
import { buildLivePriceMap } from '@/lib/finance/core/live-trade-pricing';
import { calculatePortfolioRiskSummary } from '@/lib/finance/core/portfolio-risk';
import { buildEntrySnapshot } from '@/lib/finance/core/snapshot';
import { attachTradeMetrics } from '@/lib/finance/core/trade-metrics';
import { evaluateRiskGate } from '@/lib/finance/core/risk-gate';
import { buildAuthoritativeRiskPolicy, normalizeRiskStrategy } from '@/lib/finance/core/risk-policy';
import {
  buildConservativeDrawdownSeries,
  calculateAuthoritativeCandidateRisk,
  calculateCurrentDrawdownPct,
  calculateRollingLossLimits,
  findServerManagedTradePatchFields,
  isOpenPositionRiskVerifiable,
  projectWorstCaseSectorContext,
  resolvePlannedRiskReservation,
  resolveAuthoritativeRiskEquity,
  selectConservativeMacroContext,
} from '@/lib/finance/core/server-risk-context';
import { supabaseServer } from '@/lib/supabase/server';
import { getYahooFundamentals } from '@/lib/finance/providers/yahoo-api';
import type {
  AppliedRiskStrategy,
  CapitalSnapshot,
  MacroActionLevel,
  PortfolioRiskSummary,
  SecurityProfile,
  Trade,
  TradeStatus,
} from '@/types';

const VALID_STATUSES: TradeStatus[] = ['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'];
const MARKET_MACRO_INDEX_CODES: Record<'US' | 'KR', string[]> = {
  US: ['SPY', 'QQQ'],
  KR: ['^KS200', '^KQ150'],
};
const SNAPSHOT_RELEVANT_FIELDS = new Set([
  'ticker',
  'direction',
  'plan_mode',
  'chk_sepa',
  'chk_market',
  'chk_risk',
  'chk_entry',
  'chk_stoploss',
  'chk_exit',
  'chk_psychology',
  'total_equity',
  'planned_risk',
  'risk_percent',
  'entry_price',
  'stoploss_price',
  'position_size',
  'total_shares',
  'entry_targets',
  'trailing_stops',
  'risk_strategy',
  'requested_risk_strategy',
  'risk_gate',
  'risk_policy_snapshot',
  'chart_plan',
  'plan_answers',
  'strategy_template_id',
  'sepa_evidence',
  'vcp_analysis',
  'plan_note',
  'invalidation_note',
]);

type TradeRecordForSnapshot = Pick<
  Trade,
  | 'ticker'
  | 'direction'
  | 'plan_mode'
  | 'chk_sepa'
  | 'chk_market'
  | 'chk_risk'
  | 'chk_entry'
  | 'chk_stoploss'
  | 'chk_exit'
  | 'chk_psychology'
  | 'sepa_evidence'
  | 'total_equity'
  | 'planned_risk'
  | 'risk_percent'
  | 'entry_price'
  | 'stoploss_price'
  | 'position_size'
  | 'total_shares'
  | 'entry_targets'
  | 'trailing_stops'
  | 'risk_strategy'
  | 'requested_risk_strategy'
  | 'risk_gate'
  | 'risk_policy_snapshot'
  | 'chart_plan'
  | 'plan_answers'
  | 'strategy_template_id'
  | 'plan_note'
  | 'invalidation_note'
> & {
  vcp_analysis?: unknown;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected error';
}

function isKoreanTicker(ticker: string) {
  return /^\d{6}$/.test(ticker);
}

async function resolveCandidateSector(
  ticker: string,
  market: 'US' | 'KR',
  profiles: SecurityProfile[]
): Promise<{ sector: string | null; source: 'SECURITY_PROFILE' | 'YAHOO' | 'WORST_CASE' }> {
  const stored = profiles.find((profile) => profile.ticker.toUpperCase() === ticker);
  const storedSector = stored?.sector?.trim();
  if (storedSector) return { sector: storedSector, source: 'SECURITY_PROFILE' };

  const symbols = market === 'US'
    ? [ticker]
    : stored?.exchange === 'KOSDAQ'
      ? [`${ticker}.KQ`]
      : stored?.exchange === 'KOSPI'
        ? [`${ticker}.KS`]
        : [`${ticker}.KS`, `${ticker}.KQ`];
  const fundamentals = await Promise.all(symbols.map((symbol) => getYahooFundamentals(symbol)));
  const liveSector = fundamentals.find((row) => row?.sector?.trim())?.sector?.trim() || null;
  return liveSector
    ? { sector: liveSector, source: 'YAHOO' }
    : { sector: null, source: 'WORST_CASE' };
}

function apiError(message: string, code: string, status = 400, details?: unknown) {
  return NextResponse.json(
    {
      message,
      code,
      details,
      recoverable: status < 500,
    },
    { status }
  );
}

function normalizeRiskPercent(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric > 1 ? numeric / 100 : numeric;
}

function nullableNumber(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function normalizeStringArray(value: unknown, max = 12) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

function nullableText(value: unknown, max = 2000) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function buildTradeEntrySnapshot(trade: TradeRecordForSnapshot) {
  const positionSize =
    typeof trade.position_size === 'number'
      ? trade.position_size
      : typeof trade.total_shares === 'number'
        ? trade.total_shares
        : null;
  const totalShares =
    typeof trade.total_shares === 'number'
      ? trade.total_shares
      : typeof trade.position_size === 'number'
        ? trade.position_size
        : null;
  const capitalSnapshot = typeof trade.plan_answers?.capitalSnapshot === 'object'
    ? trade.plan_answers.capitalSnapshot as CapitalSnapshot
    : null;

  return buildEntrySnapshot({
    ticker: trade.ticker,
    direction: trade.direction,
    checklist: {
      chk_sepa: trade.chk_sepa,
      chk_market: trade.chk_market,
      chk_risk: trade.chk_risk,
      chk_entry: trade.chk_entry,
      chk_stoploss: trade.chk_stoploss,
      chk_exit: trade.chk_exit,
      chk_psychology: trade.chk_psychology,
    },
    sepaEvidence: trade.sepa_evidence,
    vcpAnalysis: trade.vcp_analysis as never,
    totalEquity: trade.total_equity,
    plannedRisk: trade.planned_risk,
    riskPercent: trade.risk_percent,
    entryPrice: trade.entry_price,
    stoplossPrice: trade.stoploss_price,
    positionSize,
    totalShares,
    entryTargets: trade.entry_targets,
    trailingStops: trade.trailing_stops,
    appliedRiskStrategy: trade.risk_strategy ?? null,
    requestedRiskStrategy: trade.requested_risk_strategy ?? null,
    riskGate: trade.risk_gate ?? null,
    riskPolicy: trade.risk_policy_snapshot ?? null,
    planMode: trade.plan_mode ?? 'SYSTEM_ANALYSIS',
    chartPlan: trade.chart_plan ?? null,
    capitalSnapshot,
    planNote: trade.plan_note,
    invalidationNote: trade.invalidation_note,
  });
}

class RiskContextError extends Error {
  constructor(
    message: string,
    readonly code = 'RISK_CONTEXT_UNAVAILABLE',
    readonly status = 409,
    readonly details?: unknown
  ) {
    super(message);
  }
}

interface ServerRiskContext {
  totalEquity: number;
  accountEquity: number;
  currentOpenRisk: number;
  reservedPlannedRisk: number;
  sectorExposurePct: number;
  sectorRiskPct: number;
  candidateSector: string | null;
  candidateSectorSource: 'SECURITY_PROFILE' | 'YAHOO' | 'WORST_CASE';
  sectorContextDegraded: boolean;
  drawdownPct: number;
  drawdownContextDegraded: boolean;
  drawdownFallbackTradeIds: string[];
  dailyLossPct: number;
  weeklyLossPct: number;
  dailyRealizedPnl: number;
  weeklyRealizedPnl: number;
  lossWindowMode: 'ROLLING_24H_7D';
  currentPositionCount: number;
  maxPositions: number;
  marketActionLevel: MacroActionLevel;
  macroCalcDate: string;
  macroIndexCodes: string[];
}

async function loadServerRiskContext(input: {
  ticker: string;
  market: 'US' | 'KR';
  ownerId: string;
  requestedEquity: number;
  capitalSnapshot: unknown;
  candidateExposure: number;
  candidateRisk: number;
}): Promise<ServerRiskContext> {
  const [tradeResult, settingsResult, profileResult, macroResult, performanceResult] = await Promise.all([
    supabaseServer
      .from('trades')
      .select('*, trade_executions(*)')
      .eq('user_id', input.ownerId)
      .in('status', ['PLANNED', 'ACTIVE', 'COMPLETED'])
      .order('updated_at', { ascending: true }),
    supabaseServer.from('portfolio_settings').select('*').eq('market', input.market).maybeSingle(),
    supabaseServer.from('security_profiles').select('*').eq('market', input.market),
    supabaseServer
      .from('macro_trend')
      .select('index_code, action_level, calc_date')
      .eq('market', input.market)
      .order('calc_date', { ascending: false })
      .limit(20),
    supabaseServer
      .from('trade_performance_records')
      .select('trade_id, realized_pnl, completed_at')
      .eq('market', input.market)
      .order('completed_at', { ascending: true }),
  ]);

  if (tradeResult.error || settingsResult.error || profileResult.error || macroResult.error || performanceResult.error) {
    throw new RiskContextError(
      '서버 리스크 컨텍스트를 조회하지 못했습니다.',
      'RISK_CONTEXT_QUERY_FAILED',
      503,
      {
        trades: tradeResult.error?.message,
        settings: settingsResult.error?.message,
        profiles: profileResult.error?.message,
        macro: macroResult.error?.message,
        performance: performanceResult.error?.message,
      }
    );
  }

  const settings = settingsResult.data;
  const accountEquity = Number(settings?.total_equity);
  if (!settings || !Number.isFinite(accountEquity) || accountEquity <= 0) {
    throw new RiskContextError('검증 가능한 계좌 자본 설정이 없습니다.', 'CAPITAL_CONTEXT_UNAVAILABLE');
  }

  const snapshot = input.capitalSnapshot && typeof input.capitalSnapshot === 'object'
    ? input.capitalSnapshot as Partial<CapitalSnapshot>
    : null;
  if (snapshot?.market !== input.market) {
    throw new RiskContextError('자본 스냅샷의 시장이 종목 시장과 일치하지 않습니다.', 'CAPITAL_SNAPSHOT_STALE');
  }

  const macroContext = selectConservativeMacroContext((macroResult.data || []).map((row) => ({
    indexCode: row.index_code,
    actionLevel: row.action_level,
    calcDate: row.calc_date,
  })), new Date(), MARKET_MACRO_INDEX_CODES[input.market]);
  if (!macroContext) {
    throw new RiskContextError(
      '최신 시장 액션 컨텍스트가 없습니다. 매크로 지표를 갱신한 뒤 다시 시도해 주세요.',
      'MACRO_CONTEXT_UNAVAILABLE'
    );
  }

  const rows = ((tradeResult.data || []) as unknown as (Trade & {
    market?: 'US' | 'KR';
    trade_executions?: Trade['executions'];
  })[]).filter((trade) => input.market === 'KR' ? isKoreanTicker(trade.ticker) : !isKoreanTicker(trade.ticker));
  const profiles = (profileResult.data || []) as SecurityProfile[];
  const profileByTicker = new Map(profiles.map((profile) => [profile.ticker.toUpperCase(), profile]));
  const candidateSectorResolution = await resolveCandidateSector(input.ticker, input.market, profiles);
  const candidateSector = candidateSectorResolution.sector;
  const activeTrades = rows
    .filter((trade) => trade.status === 'ACTIVE')
    .map((trade) => {
      const { trade_executions: executions, ...rest } = trade;
      return { ...rest, executions: executions || [] } as Trade;
    });

  const executionUnknownTickers = activeTrades
    .filter((trade) => {
      const metrics = attachTradeMetrics(trade).metrics;
      return !isOpenPositionRiskVerifiable(metrics);
    })
    .map((trade) => trade.ticker);
  if (executionUnknownTickers.length > 0) {
    throw new RiskContextError(
      '체결 기록으로 보유 수량을 검증할 수 없는 활성 포지션이 있어 신규 계획을 저장할 수 없습니다.',
      'OPEN_RISK_CONTEXT_INCOMPLETE',
      409,
      { executionUnknownTickers }
    );
  }

  let priceMap: Map<string, number | null>;
  try {
    priceMap = await buildLivePriceMap(activeTrades, {
      getUsQuotes: getMtnUsLiveQuotes,
      getKrPrice: getMtnKrLivePrice,
    });
  } catch (error) {
    throw new RiskContextError(
      '활성 포지션의 현재가를 확인하지 못했습니다.',
      'LIVE_PRICE_CONTEXT_UNAVAILABLE',
      409,
      getErrorMessage(error)
    );
  }

  const tradesWithMetrics = activeTrades.map((trade) => attachTradeMetrics(
    trade,
    priceMap.get(trade.ticker) || null
  ));
  const portfolio = calculatePortfolioRiskSummary(
    tradesWithMetrics,
    accountEquity,
    profiles,
    input.market
  );
  if ((portfolio.unknownRiskPositions || 0) > 0) {
    throw new RiskContextError(
      '현재가 또는 손절가가 누락된 활성 포지션이 있어 신규 계획을 저장할 수 없습니다.',
      'OPEN_RISK_CONTEXT_INCOMPLETE',
      409,
      { unknownRiskPositions: portfolio.unknownRiskPositions }
    );
  }

  const equityResolution = resolveAuthoritativeRiskEquity({
    requestedEquity: input.requestedEquity,
    snapshotAmount: snapshot?.amount,
    accountEquity,
    accountCash: portfolio.cash,
    basis: snapshot?.basis,
    fallbackUsed: snapshot?.fallbackUsed,
  });
  if (!equityResolution.ok) {
    throw new RiskContextError(equityResolution.message, equityResolution.code);
  }

  const invalidPlannedTradeIds: string[] = [];
  const plannedReservations = rows
    .filter((trade) => trade.status === 'PLANNED')
    .map((trade) => {
      const totalShares = Number(trade.total_shares ?? trade.position_size);
      const entryPrice = Number(trade.entry_price);
      const reservation = resolvePlannedRiskReservation({
        submittedRisk: trade.planned_risk,
        entryPrice,
        stoplossPrice: trade.stoploss_price,
        totalShares,
      });
      if (!reservation) {
        invalidPlannedTradeIds.push(trade.id);
      }

      const answers = trade.plan_answers && typeof trade.plan_answers === 'object'
        ? trade.plan_answers as Record<string, unknown>
        : null;
      const savedContext = answers?.serverRiskContext && typeof answers.serverRiskContext === 'object'
        ? answers.serverRiskContext as Record<string, unknown>
        : null;
      const savedSector = typeof savedContext?.candidateSector === 'string'
        ? savedContext.candidateSector.trim()
        : '';

      return {
        tradeId: trade.id,
        exposure: reservation?.exposure ?? 0,
        risk: reservation?.risk ?? 0,
        sector: profileByTicker.get(trade.ticker.toUpperCase())?.sector?.trim() || savedSector || null,
      };
    });
  if (invalidPlannedTradeIds.length > 0) {
    throw new RiskContextError(
      '기존 미체결 계획의 예약 리스크를 검증할 수 없습니다. 해당 계획을 취소하거나 다시 생성해 주세요.',
      'PLANNED_RISK_CONTEXT_INCOMPLETE',
      409,
      { tradeIds: invalidPlannedTradeIds }
    );
  }

  const plannedRiskReservation = plannedReservations.reduce((sum, reservation) => sum + reservation.risk, 0);
  const sectorExposureByName = new Map(portfolio.sectorExposure.map((row) => [row.sector, { ...row }]));
  const sectorRiskByName = new Map((portfolio.sectorRisk || []).map((row) => [row.sector, { ...row }]));
  let sectorContextDegraded = candidateSector === null;
  for (const reservation of plannedReservations) {
    let sector = reservation.sector;
    if (!sector) {
      sectorContextDegraded = true;
      sector = Array.from(sectorExposureByName.values()).sort((left, right) => right.exposure - left.exposure)[0]?.sector || 'Unknown';
    }
    const exposureRow = sectorExposureByName.get(sector) || { sector, exposure: 0, exposurePct: 0, count: 0 };
    exposureRow.exposure += reservation.exposure;
    exposureRow.count += 1;
    sectorExposureByName.set(sector, exposureRow);
    const riskRow = sectorRiskByName.get(sector) || { sector, openRisk: 0, riskPct: 0, count: 0 };
    riskRow.openRisk += reservation.risk;
    riskRow.count += 1;
    sectorRiskByName.set(sector, riskRow);
  }
  const portfolioWithReservations: PortfolioRiskSummary = {
    ...portfolio,
    sectorExposure: Array.from(sectorExposureByName.values()),
    sectorRisk: Array.from(sectorRiskByName.values()),
  };

  const completedTrades = rows.filter((trade) => trade.status === 'COMPLETED');
  const completedTradeIds = new Set(completedTrades.map((trade) => trade.id));
  const performanceRows = (performanceResult.data || [])
    .filter((row) => completedTradeIds.has(String(row.trade_id)));
  const performanceByTradeId = new Map(performanceRows.map((row) => [String(row.trade_id), row]));
  const completedObservations = completedTrades.map((trade) => {
    const performance = performanceByTradeId.get(trade.id);
    const { trade_executions: executions, ...rest } = trade;
    const metrics = attachTradeMetrics({ ...rest, executions: executions || [] } as Trade).metrics;
    return {
      tradeId: trade.id,
      completedAt: String(performance?.completed_at || trade.updated_at || trade.created_at || ''),
      recordedPnl: performance?.realized_pnl,
      fallbackPnl: metrics?.realizedPnL,
      plannedRisk: trade.planned_risk,
    };
  }).sort((left, right) => left.completedAt.localeCompare(right.completedAt));
  const drawdownSeries = buildConservativeDrawdownSeries(completedObservations);
  if (!drawdownSeries.ok) {
    throw new RiskContextError(
      '완료 거래의 손익과 계획 리스크가 모두 누락되어 계좌 드로다운을 검증할 수 없습니다.',
      'DRAWDOWN_CONTEXT_INCOMPLETE',
      409,
      { tradeIds: drawdownSeries.unresolvedTradeIds }
    );
  }
  const drawdownPct = calculateCurrentDrawdownPct(
    accountEquity,
    drawdownSeries.pnls
  );
  if (drawdownPct === null) {
    throw new RiskContextError(
      '계좌 드로다운을 신뢰할 수 있게 재구성하지 못했습니다.',
      'DRAWDOWN_CONTEXT_INCOMPLETE'
    );
  }
  const rollingLosses = calculateRollingLossLimits(
    accountEquity,
    completedObservations.map((observation, index) => ({
      completedAt: observation.completedAt,
      pnl: drawdownSeries.pnls[index],
    }))
  );
  if (!rollingLosses) {
    throw new RiskContextError(
      '완료 거래 시각 또는 손익이 불완전하여 일·주 손실 한도를 검증할 수 없습니다.',
      'LOSS_LIMIT_CONTEXT_INCOMPLETE',
      409
    );
  }

  const currentPositionCount = activeTrades.length + plannedReservations.length;
  const maxPositions = Number(portfolio.maxPositions);
  if (!Number.isSafeInteger(maxPositions) || maxPositions <= 0) {
    throw new RiskContextError('최대 포지션 한도를 검증하지 못했습니다.', 'POSITION_LIMIT_CONTEXT_INCOMPLETE');
  }

  const sectorContext = projectWorstCaseSectorContext({
    portfolio: portfolioWithReservations,
    candidateExposure: input.candidateExposure,
    candidateRisk: input.candidateRisk,
    totalEquity: equityResolution.equity,
    candidateSector: sectorContextDegraded ? null : candidateSector,
  });
  if (!sectorContext) {
    throw new RiskContextError('섹터 집중 리스크를 계산하지 못했습니다.', 'SECTOR_CONTEXT_INCOMPLETE');
  }

  return {
    totalEquity: equityResolution.equity,
    accountEquity,
    currentOpenRisk: portfolio.totalOpenRisk + plannedRiskReservation,
    reservedPlannedRisk: plannedRiskReservation,
    sectorExposurePct: sectorContext.sectorExposurePct,
    sectorRiskPct: sectorContext.sectorRiskPct,
    candidateSector,
    candidateSectorSource: candidateSectorResolution.source,
    sectorContextDegraded,
    drawdownPct,
    drawdownContextDegraded: drawdownSeries.degraded,
    drawdownFallbackTradeIds: drawdownSeries.fallbackTradeIds,
    dailyLossPct: rollingLosses.dailyLossPct,
    weeklyLossPct: rollingLosses.weeklyLossPct,
    dailyRealizedPnl: rollingLosses.dailyRealizedPnl,
    weeklyRealizedPnl: rollingLosses.weeklyRealizedPnl,
    lossWindowMode: rollingLosses.windowMode,
    currentPositionCount,
    maxPositions,
    marketActionLevel: macroContext.actionLevel,
    macroCalcDate: macroContext.calcDate,
    macroIndexCodes: macroContext.indexCodes,
  };
}

export async function POST(request: Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;
  try {
    const session = await getRequestSession(request);
    if (!session) return apiError('Authentication required.', 'AUTH_REQUIRED', 401);
    const body = await request.json();
    const ticker = String(body.ticker || '').trim().toUpperCase();
    const market = isKoreanTicker(ticker) ? 'KR' : 'US';
    const totalShares = Number(body.total_shares ?? body.position_size ?? 0);
    const plannedRisk = Number(body.planned_risk ?? 0);
    const requestedEquity = Number(body.total_equity);
    const riskPercent = normalizeRiskPercent(body.risk_percent ?? 0.03);
    const direction = body.direction === 'SHORT' ? 'SHORT' : 'LONG';
    const planMode = body.plan_mode === 'MANUAL_STRATEGY' ? 'MANUAL_STRATEGY' : 'SYSTEM_ANALYSIS';
    const isManualStrategy = planMode === 'MANUAL_STRATEGY';
    const appliedRiskStrategy = normalizeRiskStrategy(body.risk_strategy);
    const requestedRiskStrategy = normalizeRiskStrategy(body.requested_risk_strategy);
    const planAnswers = body.plan_answers && typeof body.plan_answers === 'object' && !Array.isArray(body.plan_answers)
      ? body.plan_answers as Record<string, unknown>
      : {};

    if (!ticker) {
      return apiError('Ticker is required.', 'MISSING_TICKER');
    }
    const requiredChecklistFields = ['chk_risk', 'chk_entry', 'chk_stoploss', 'chk_exit', 'chk_psychology'] as const;
    const missingChecklistFields = requiredChecklistFields.filter((field) => body[field] !== true);
    if (missingChecklistFields.length > 0) {
      return apiError(
        'Risk, entry, stop, exit, and psychology confirmations are required.',
        'CHECKLIST_INCOMPLETE',
        400,
        { fields: missingChecklistFields }
      );
    }
    if (!isManualStrategy) {
      const sepaStatus = body.sepa_evidence?.status;
      if (body.chk_sepa !== true || (sepaStatus !== 'pass' && sepaStatus !== 'warning')) {
        return apiError('A completed passing or warning SEPA assessment is required.', 'SEPA_FAILED');
      }
    }
    if (!Number.isFinite(totalShares) || totalShares <= 0) {
      return apiError('Position size must be at least 1 share.', 'INVALID_POSITION_SIZE');
    }
    if (!Number.isFinite(plannedRisk) || plannedRisk <= 0) {
      return apiError('Planned risk must be greater than zero.', 'INVALID_PLANNED_RISK');
    }
    if (!Number.isFinite(requestedEquity) || requestedEquity <= 0) {
      return apiError('Verified account equity is required.', 'INVALID_TOTAL_EQUITY');
    }
    if (!riskPercent || riskPercent > 0.1) {
      return apiError('Risk percent must be greater than 0 and at most 10%.', 'INVALID_RISK_PERCENT');
    }
    if (
      appliedRiskStrategy === 'AUTO' ||
      (isManualStrategy && appliedRiskStrategy !== 'MANUAL_FIXED_RISK') ||
      (!isManualStrategy && appliedRiskStrategy === 'MANUAL_FIXED_RISK')
    ) {
      return apiError('Applied risk strategy is missing or inconsistent with the plan mode.', 'INVALID_RISK_STRATEGY');
    }
    if (!isManualStrategy && (!body.entry_targets || !body.trailing_stops || !body.sepa_evidence)) {
      return apiError('SEPA evidence and entry plan fields are required.', 'MISSING_STRATEGY_FIELDS');
    }
    if (isManualStrategy) {
      const chartPlan = body.chart_plan;
      const targetPrice = Number(chartPlan?.targetPrice ?? body.target_price ?? body.targetPrice);
      if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
        return apiError('Manual strategy target price is required.', 'MISSING_TARGET_PRICE');
      }
      const entryPrice = Number(body.entry_price);
      if (direction === 'LONG' && targetPrice <= entryPrice) {
        return apiError('LONG 수동 계획에서는 목표가가 진입가보다 높아야 합니다.', 'INVALID_TARGET_PRICE');
      }
      if (direction === 'SHORT' && targetPrice >= entryPrice) {
        return apiError('SHORT 수동 계획에서는 목표가가 진입가보다 낮아야 합니다.', 'INVALID_TARGET_PRICE');
      }
    }

    const entryPrice = Number(body.entry_price);
    const stoplossPrice = Number(body.stoploss_price);
    if (!Number.isFinite(entryPrice) || entryPrice <= 0 || !Number.isFinite(stoplossPrice) || stoplossPrice <= 0) {
      return apiError('Entry price and stop price must be greater than zero.', 'INVALID_ENTRY_STOP');
    }
    if (direction === 'LONG' && stoplossPrice >= entryPrice) {
      return apiError('LONG 포지션에서는 손절가가 진입가보다 낮아야 합니다.', 'INVALID_STOPLOSS');
    }
    if (direction === 'SHORT' && stoplossPrice <= entryPrice) {
      return apiError('SHORT 포지션에서는 손절가가 진입가보다 높아야 합니다.', 'INVALID_STOPLOSS');
    }

    const candidateRisk = calculateAuthoritativeCandidateRisk({
      submittedRisk: plannedRisk,
      entryPrice,
      stoplossPrice,
      totalShares,
    });
    if (!candidateRisk) {
      return apiError('손절 기준 후보 리스크를 계산할 수 없습니다.', 'INVALID_CANDIDATE_RISK');
    }

    const riskContext = await loadServerRiskContext({
      ticker,
      market,
      ownerId: session.systemId,
      requestedEquity,
      capitalSnapshot: planAnswers.capitalSnapshot,
      candidateExposure: entryPrice * totalShares,
      candidateRisk,
    });
    const riskPolicy = {
      ...buildAuthoritativeRiskPolicy(
        market,
        appliedRiskStrategy as AppliedRiskStrategy,
        riskPercent
      ),
      maxPositions: riskContext.maxPositions,
    };
    const serverRiskGate = evaluateRiskGate({
      policy: riskPolicy,
      totalEquity: riskContext.totalEquity,
      candidateRisk,
      currentOpenRisk: riskContext.currentOpenRisk,
      stopQuality: 'VALID',
      sectorExposurePct: riskContext.sectorExposurePct,
      sectorRiskPct: riskContext.sectorRiskPct,
      drawdownPct: riskContext.drawdownPct,
      dailyLossPct: riskContext.dailyLossPct,
      weeklyLossPct: riskContext.weeklyLossPct,
      currentPositionCount: riskContext.currentPositionCount,
      marketActionLevel: riskContext.marketActionLevel,
    });
    if (serverRiskGate.status === 'BLOCK') {
      return apiError('Server risk policy blocked this trade plan.', 'RISK_GATE_BLOCKED', 409, serverRiskGate);
    }
    if (serverRiskGate.status === 'REDUCE') {
      return apiError(
        '서버 리스크 정책이 축소를 요구합니다. 현재 컨텍스트에서는 안전한 축소 한도를 자동 검증할 수 없어 저장을 차단합니다.',
        'RISK_GATE_RESIZE_REQUIRED',
        409,
        serverRiskGate
      );
    }

    const serverRiskPercent = Number((candidateRisk / riskContext.totalEquity).toFixed(6));
    const serverRiskContextSnapshot = {
      version: 'mtn-server-risk-context-v1',
      capturedAt: new Date().toISOString(),
      accountEquity: riskContext.accountEquity,
      riskEquity: riskContext.totalEquity,
      currentOpenRisk: riskContext.currentOpenRisk,
      reservedPlannedRisk: riskContext.reservedPlannedRisk,
      projectedWorstCaseSectorExposurePct: riskContext.sectorExposurePct,
      projectedWorstCaseSectorRiskPct: riskContext.sectorRiskPct,
      candidateSector: riskContext.candidateSector,
      candidateSectorSource: riskContext.candidateSectorSource,
      sectorContextDegraded: riskContext.sectorContextDegraded,
      drawdownPct: riskContext.drawdownPct,
      drawdownContextDegraded: riskContext.drawdownContextDegraded,
      drawdownFallbackTradeIds: riskContext.drawdownFallbackTradeIds,
      dailyLossPct: riskContext.dailyLossPct,
      weeklyLossPct: riskContext.weeklyLossPct,
      dailyRealizedPnl: riskContext.dailyRealizedPnl,
      weeklyRealizedPnl: riskContext.weeklyRealizedPnl,
      lossWindowMode: riskContext.lossWindowMode,
      currentPositionCount: riskContext.currentPositionCount,
      maxPositions: riskContext.maxPositions,
      marketActionLevel: riskContext.marketActionLevel,
      macroCalcDate: riskContext.macroCalcDate,
      macroIndexCodes: riskContext.macroIndexCodes,
    };

    const record: Record<string, unknown> & TradeRecordForSnapshot = {
      ticker,
      market,
      direction,
      plan_mode: planMode,
      status: 'PLANNED',
      chk_sepa: Boolean(body.chk_sepa),
      chk_market: body.chk_market ?? body.chk_sepa,
      chk_risk: Boolean(body.chk_risk),
      chk_entry: Boolean(body.chk_entry),
      chk_stoploss: Boolean(body.chk_stoploss),
      chk_exit: Boolean(body.chk_exit),
      chk_psychology: Boolean(body.chk_psychology),
      sepa_evidence: body.sepa_evidence ?? null,
      vcp_analysis: body.vcp_analysis ?? null,
      total_equity: riskContext.totalEquity,
      planned_risk: candidateRisk,
      risk_percent: serverRiskPercent,
      atr_value: Number(body.atr_value) || null,
      entry_price: Number(body.entry_price) || null,
      stoploss_price: Number(body.stoploss_price) || null,
      position_size: totalShares,
      total_shares: totalShares,
      entry_targets: body.entry_targets ?? null,
      trailing_stops: body.trailing_stops ?? null,
      risk_strategy: appliedRiskStrategy,
      requested_risk_strategy: requestedRiskStrategy,
      risk_gate: serverRiskGate,
      risk_policy_snapshot: riskPolicy,
      chart_plan: body.chart_plan ?? null,
      plan_answers: { ...planAnswers, serverRiskContext: serverRiskContextSnapshot },
      strategy_template_id: nullableText(body.strategy_template_id, 120),
      setup_tags: normalizeStringArray(body.setup_tags) ?? [],
      mistake_tags: normalizeStringArray(body.mistake_tags) ?? [],
      plan_note: nullableText(body.plan_note),
      invalidation_note: nullableText(body.invalidation_note),
      review_note: nullableText(body.review_note),
      review_action: nullableText(body.review_action, 500),
      updated_at: new Date().toISOString(),
    };

    record.entry_snapshot = buildTradeEntrySnapshot(record as TradeRecordForSnapshot);
    record.current_plan_snapshot = record.entry_snapshot;

    record.user_id = session.systemId;

    const { data, error } = await supabaseServer
      .rpc('create_trade_plan_with_position_limit', {
        p_user_id: session.systemId,
        p_market: market,
        p_max_positions: riskContext.maxPositions,
        p_candidate_sector: riskContext.candidateSector,
        p_candidate_sector_source: riskContext.candidateSectorSource,
        p_max_single_trade_risk_pct: riskPolicy.maxSingleTradeRiskPct,
        p_max_portfolio_heat_pct: riskPolicy.maxPortfolioHeatPct,
        p_max_sector_risk_pct: riskPolicy.maxSectorRiskPct,
        p_trade: record,
      })
      .single();

    if (error?.message?.includes('MTN_POSITION_LIMIT_REACHED')) {
      throw new RiskContextError(
        '동시 요청으로 최대 포지션 한도가 먼저 소진되었습니다.',
        'POSITION_LIMIT_REACHED',
        409,
        { maxPositions: riskContext.maxPositions }
      );
    }
    if (error?.message?.includes('MTN_PORTFOLIO_HEAT_LIMIT_REACHED')) {
      throw new RiskContextError(
        '동시 요청으로 포트폴리오 리스크 예산이 먼저 소진되었습니다.',
        'PORTFOLIO_HEAT_LIMIT_REACHED',
        409,
        { maxPortfolioHeatPct: riskPolicy.maxPortfolioHeatPct }
      );
    }
    if (error?.message?.includes('MTN_SECTOR_RISK_LIMIT_REACHED')) {
      throw new RiskContextError(
        '동시 요청으로 동일 섹터 리스크 예산이 먼저 소진되었습니다.',
        'SECTOR_RISK_LIMIT_REACHED',
        409,
        { maxSectorRiskPct: riskPolicy.maxSectorRiskPct, sector: riskContext.candidateSector }
      );
    }
    if (error?.message?.includes('MTN_SINGLE_TRADE_RISK_LIMIT_REACHED')) {
      throw new RiskContextError(
        '후보 리스크가 데이터베이스의 단일 거래 한도를 초과했습니다.',
        'SINGLE_TRADE_RISK_LIMIT_REACHED',
        409,
        { maxSingleTradeRiskPct: riskPolicy.maxSingleTradeRiskPct }
      );
    }
    if (
      error?.message?.includes('MTN_ACTIVE_RISK_CONTEXT_INCOMPLETE') ||
      error?.message?.includes('MTN_PLANNED_RISK_CONTEXT_INCOMPLETE') ||
      error?.message?.includes('MTN_CAPITAL_CONTEXT_INCOMPLETE')
    ) {
      throw new RiskContextError(
        '저장 직전 데이터베이스 리스크 컨텍스트가 변경되었거나 불완전합니다.',
        'RISK_CONTEXT_STALE',
        409
      );
    }
    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: unknown) {
    if (error instanceof RiskContextError) {
      return apiError(error.message, error.code, error.status, error.details);
    }
    console.error('Save Trade Error:', error);
    return apiError(getErrorMessage(error), 'SAVE_TRADE_FAILED', 500);
  }
}

export async function GET(request: Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.has('limit') ? Math.max(1, parseInt(searchParams.get('limit')!, 10)) : null;
    const offset = searchParams.has('offset') ? Math.max(0, parseInt(searchParams.get('offset')!, 10)) : 0;
    const id = searchParams.get('id');
    const market = searchParams.get('market');
    const status = searchParams.get('status') as TradeStatus | null;
    const includeLivePrices = searchParams.get('includeLivePrices') !== 'false';

    if (market && market !== 'US' && market !== 'KR') {
      return apiError('market must be US or KR.', 'INVALID_MARKET', 400, { allowed: ['US', 'KR'] });
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return apiError('Invalid trade status.', 'INVALID_STATUS', 400, { allowed: VALID_STATUSES });
    }

    let query = supabaseServer
      .from('trades')
      .select('*, trade_executions(*)')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    const session = await getServerSession();
    if (session) query = query.eq('user_id', session.systemId);

    if (id) {
      query = query.eq('id', id);
    } else {
      if (market) query = query.eq('market', market);
      if (status) query = query.eq('status', status);
      if (limit !== null) query = query.range(offset, offset + limit - 1);
    }

    const { data, error } = await query;

    if (error) throw error;

    const allRecords = (data || []) as unknown as (Trade & { trade_executions?: Trade['executions'] })[];

    const priceMap = includeLivePrices
      ? await buildLivePriceMap(allRecords, {
          getUsQuotes: getMtnUsLiveQuotes,
          getKrPrice: getMtnKrLivePrice,
        })
      : new Map<string, number>();

    const trades = allRecords.map((trade) => {
      const { trade_executions: tradeExecutions, ...rest } = trade;
      const currentPrice = includeLivePrices && trade.status === 'ACTIVE' ? (priceMap.get(trade.ticker) || null) : null;

      return attachTradeMetrics({
        ...rest,
        executions: tradeExecutions || [],
      } as Trade, currentPrice);
    });

    return NextResponse.json({ data: trades });
  } catch (error: unknown) {
    console.error('Fetch Trades Error:', error);
    return apiError(getErrorMessage(error), 'FETCH_TRADES_FAILED', 500);
  }
}

export async function PATCH(request: Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;
  try {
    const session = await getRequestSession(request);
    if (!session) return apiError('Authentication required.', 'AUTH_REQUIRED', 401);
    const body = await request.json();
    const id = String(body.id || '').trim();

    if (!id) {
      return apiError('Trade ID is required.', 'MISSING_TRADE_ID');
    }

    const { data: existingTrade, error: existingTradeError } = await supabaseServer
      .from('trades')
      .select('*')
      .eq('id', id)
      .eq('user_id', session.systemId)
      .single();

    if (existingTradeError) throw existingTradeError;

    const currentVersion = Number(existingTrade.version || 0);
    const expectedVersion = body.expected_version === undefined
      ? currentVersion
      : Number(body.expected_version);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
      return apiError('expected_version must be a non-negative integer.', 'INVALID_VERSION', 400);
    }
    if (expectedVersion !== currentVersion) {
      return apiError(
        '거래가 다른 요청에서 먼저 변경되었습니다. 새로고침 후 다시 시도해 주세요.',
        'TRADE_UPDATE_CONFLICT',
        409
      );
    }

    const serverManagedFields = findServerManagedTradePatchFields(
      body as Record<string, unknown>,
      existingTrade as Record<string, unknown>
    );
    if (serverManagedFields.length > 0) {
      return apiError(
        '서버가 관리하는 리스크·자본·체결 필드는 일반 수정으로 변경할 수 없습니다. 계획을 다시 생성해 주세요.',
        'SERVER_MANAGED_TRADE_FIELDS',
        409,
        { fields: serverManagedFields }
      );
    }

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      version: currentVersion + 1,
    };

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return apiError('Invalid trade status.', 'INVALID_STATUS', 400, { allowed: VALID_STATUSES });
      }
      if (body.status === existingTrade.status) {
        // Existing clients submit the current status with ordinary edits.
      } else if (existingTrade.status !== 'PLANNED' || body.status !== 'CANCELLED') {
        return apiError(
          '거래 상태는 체결 API로만 변경할 수 있습니다. 일반 수정은 미체결 계획 취소만 허용됩니다.',
          'STATUS_TRANSITION_REQUIRES_EXECUTION',
          409
        );
      } else {
        update.status = 'CANCELLED';
      }
    }

    const finalDiscipline = nullableNumber(body.final_discipline);
    if (finalDiscipline !== undefined) {
      if (Number.isNaN(finalDiscipline)) {
        return apiError('final_discipline must be a number.', 'INVALID_NUMBER', 400, { field: 'final_discipline' });
      }
      update.final_discipline = finalDiscipline;
    }

    if (body.emotion_note !== undefined) {
      update.emotion_note = body.emotion_note === null ? null : String(body.emotion_note);
    }

    const checklistFields = ['chk_sepa', 'chk_market', 'chk_risk', 'chk_entry', 'chk_stoploss', 'chk_exit', 'chk_psychology'] as const;
    for (const field of checklistFields) {
      if (body[field] !== undefined) {
        const nextValue = Boolean(body[field]);
        if (nextValue !== Boolean(existingTrade[field])) update[field] = nextValue;
      }
    }

    if (body.exit_reason !== undefined) {
      update.exit_reason = body.exit_reason === null ? null : String(body.exit_reason);
    }

    const setupTags = normalizeStringArray(body.setup_tags);
    if (setupTags !== undefined) update.setup_tags = setupTags;
    const mistakeTags = normalizeStringArray(body.mistake_tags);
    if (mistakeTags !== undefined) update.mistake_tags = mistakeTags;
    const planNote = nullableText(body.plan_note);
    if (planNote !== undefined && planNote !== (existingTrade.plan_note ?? null)) update.plan_note = planNote;
    const invalidationNote = nullableText(body.invalidation_note);
    if (invalidationNote !== undefined && invalidationNote !== (existingTrade.invalidation_note ?? null)) {
      update.invalidation_note = invalidationNote;
    }
    const reviewNote = nullableText(body.review_note);
    if (reviewNote !== undefined) update.review_note = reviewNote;
    const reviewAction = nullableText(body.review_action, 500);
    if (reviewAction !== undefined) update.review_action = reviewAction;
    const updatesPlanSnapshot = Object.keys(update).some((field) => SNAPSHOT_RELEVANT_FIELDS.has(field));
    if (updatesPlanSnapshot) {
      if (existingTrade.entry_snapshot_locked_at) {
        return apiError(
          '진입 체결 후 계획 원본은 잠겼습니다. 사유를 포함한 amendment API를 사용하세요.',
          'ENTRY_SNAPSHOT_LOCKED',
          409,
        );
      }
      const mergedTrade = {
        ...(existingTrade as TradeRecordForSnapshot),
        ...update,
      };
      update.entry_snapshot = buildTradeEntrySnapshot(mergedTrade);
      update.current_plan_snapshot = update.entry_snapshot;
    }

    let updateQuery = supabaseServer
      .from('trades')
      .update(update)
      .eq('id', id)
      .eq('user_id', session.systemId)
      .eq('version', currentVersion);
    if (update.status === 'CANCELLED') {
      updateQuery = updateQuery.eq('status', 'PLANNED').is('entry_snapshot_locked_at', null);
    } else if (updatesPlanSnapshot) {
      updateQuery = updateQuery.is('entry_snapshot_locked_at', null);
    }

    const { data, error } = await updateQuery
      .select('*, trade_executions(*)')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return apiError(
        '거래 상태가 동시에 변경되었습니다. 새로고침 후 다시 시도해 주세요.',
        'TRADE_UPDATE_CONFLICT',
        409
      );
    }

    const trade = data as unknown as Trade & { trade_executions?: Trade['executions'] };
    const { trade_executions: tradeExecutions, ...rest } = trade;

    return NextResponse.json({
      data: attachTradeMetrics({
        ...rest,
        executions: tradeExecutions || [],
      } as Trade),
    });
  } catch (error: unknown) {
    console.error('Update Trade Error:', error);
    return apiError(getErrorMessage(error), 'UPDATE_TRADE_FAILED', 500);
  }
}

export async function DELETE(request: Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim();

  if (!id) {
    return apiError('Trade ID is required.', 'MISSING_TRADE_ID');
  }

  try {
    const session = await getServerSession();
    const { error } = await supabaseServer
      .from('trades')
      .delete()
      .eq('id', id)
      .eq('user_id', session?.systemId ?? '');
    if (error) throw error;

    return NextResponse.json({ data: { id } });
  } catch (error: unknown) {
    console.error('Delete Trade Error:', error);
    return apiError(getErrorMessage(error), 'DELETE_TRADE_FAILED', 500);
  }
}
