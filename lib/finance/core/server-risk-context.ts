import type { CapitalBasisKind, MacroActionLevel, PortfolioRiskSummary } from '../../../types/index.ts';

const CAPITAL_BASIS_KINDS: CapitalBasisKind[] = [
  'CURRENT_ACCOUNT',
  'CONSERVATIVE',
  'AVAILABLE_CASH',
  'MANUAL',
  'SCENARIO',
];

const SERVER_MANAGED_TRADE_PATCH_FIELDS = new Set([
  'ticker',
  'direction',
  'plan_mode',
  'total_equity',
  'planned_risk',
  'risk_percent',
  'atr_value',
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
  'sepa_evidence',
  'vcp_analysis',
  'exit_price',
  'result_amount',
]);

const NUMERIC_SERVER_MANAGED_TRADE_PATCH_FIELDS = new Set([
  'total_equity',
  'planned_risk',
  'risk_percent',
  'atr_value',
  'entry_price',
  'stoploss_price',
  'position_size',
  'total_shares',
  'exit_price',
  'result_amount',
]);

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function currentManagedValue(field: string, current: Record<string, unknown>) {
  if (field === 'total_shares') return current.total_shares ?? current.position_size;
  if (field === 'position_size') return current.position_size ?? current.total_shares;
  return current[field];
}

function managedValuesEqual(field: string, submitted: unknown, current: Record<string, unknown>) {
  const existing = currentManagedValue(field, current);
  if (submitted === existing) return true;
  if ((submitted === null || submitted === '') && (existing === null || existing === undefined || existing === '')) return true;

  if (NUMERIC_SERVER_MANAGED_TRADE_PATCH_FIELDS.has(field)) {
    const submittedNumber = Number(submitted);
    const existingNumber = Number(existing);
    if (!Number.isFinite(submittedNumber) || !Number.isFinite(existingNumber)) return false;
    const tolerance = Math.max(1e-9, Math.max(Math.abs(submittedNumber), Math.abs(existingNumber)) * 1e-12);
    return Math.abs(submittedNumber - existingNumber) <= tolerance;
  }

  if (field === 'ticker') {
    return String(submitted).trim().toUpperCase() === String(existing).trim().toUpperCase();
  }
  if (typeof submitted === 'string' || typeof existing === 'string') {
    return String(submitted).trim() === String(existing).trim();
  }
  return stableJson(submitted) === stableJson(existing);
}

export function findServerManagedTradePatchFields(
  payload: Record<string, unknown>,
  current?: Record<string, unknown>
) {
  return Object.keys(payload).filter((field) => (
    SERVER_MANAGED_TRADE_PATCH_FIELDS.has(field) &&
    (!current || !managedValuesEqual(field, payload[field], current))
  ));
}

interface ResolveAuthoritativeRiskEquityInput {
  requestedEquity: unknown;
  snapshotAmount: unknown;
  accountEquity: unknown;
  accountCash: unknown;
  basis: unknown;
  fallbackUsed: unknown;
}

export type AuthoritativeRiskEquityResult =
  | {
      ok: true;
      equity: number;
      basis: CapitalBasisKind;
    }
  | {
      ok: false;
      code: 'CAPITAL_CONTEXT_UNAVAILABLE' | 'CAPITAL_FALLBACK_FORBIDDEN' | 'CAPITAL_SNAPSHOT_STALE';
      message: string;
    };

function finitePositive(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function approximatelyEqual(left: number, right: number) {
  const tolerance = Math.max(0.01, Math.max(Math.abs(left), Math.abs(right)) * 0.000001);
  return Math.abs(left - right) <= tolerance;
}

export function resolveAuthoritativeRiskEquity(
  input: ResolveAuthoritativeRiskEquityInput
): AuthoritativeRiskEquityResult {
  const requestedEquity = finitePositive(input.requestedEquity);
  const snapshotAmount = finitePositive(input.snapshotAmount);
  const accountEquity = finitePositive(input.accountEquity);
  const accountCash = Number(input.accountCash);
  const basis = CAPITAL_BASIS_KINDS.includes(input.basis as CapitalBasisKind)
    ? input.basis as CapitalBasisKind
    : null;

  if (!requestedEquity || !snapshotAmount || !accountEquity || !basis) {
    return {
      ok: false,
      code: 'CAPITAL_CONTEXT_UNAVAILABLE',
      message: '검증 가능한 계좌 자본 스냅샷이 필요합니다.',
    };
  }
  if (input.fallbackUsed !== false) {
    return {
      ok: false,
      code: 'CAPITAL_FALLBACK_FORBIDDEN',
      message: '대체 자본값으로 만든 계획은 저장할 수 없습니다. 계좌 정보를 다시 조회해 주세요.',
    };
  }
  if (!approximatelyEqual(requestedEquity, snapshotAmount)) {
    return {
      ok: false,
      code: 'CAPITAL_SNAPSHOT_STALE',
      message: '계획 자본값과 저장 요청의 자본값이 일치하지 않습니다. 다시 분석해 주세요.',
    };
  }

  const verifiedLimit = basis === 'AVAILABLE_CASH'
    ? (Number.isFinite(accountCash) && accountCash > 0 ? accountCash : 0)
    : accountEquity;
  const exceedsVerifiedLimit = requestedEquity > verifiedLimit && !approximatelyEqual(requestedEquity, verifiedLimit);
  const currentAccountChanged = basis === 'CURRENT_ACCOUNT' && !approximatelyEqual(requestedEquity, accountEquity);

  if (exceedsVerifiedLimit || currentAccountChanged) {
    return {
      ok: false,
      code: 'CAPITAL_SNAPSHOT_STALE',
      message: '제출한 자본 기준이 현재 서버 계좌 정보와 일치하지 않습니다. 계좌를 새로고침한 뒤 다시 분석해 주세요.',
    };
  }

  return { ok: true, equity: requestedEquity, basis };
}

export function calculateAuthoritativeCandidateRisk(input: {
  submittedRisk: unknown;
  entryPrice: unknown;
  stoplossPrice: unknown;
  totalShares: unknown;
}) {
  const submittedRisk = finitePositive(input.submittedRisk);
  const entryPrice = finitePositive(input.entryPrice);
  const stoplossPrice = finitePositive(input.stoplossPrice);
  const totalShares = finitePositive(input.totalShares);
  if (!submittedRisk || !entryPrice || !stoplossPrice || !totalShares) return null;

  const stopDefinedRisk = Math.abs(entryPrice - stoplossPrice) * totalShares;
  if (!Number.isFinite(stopDefinedRisk) || stopDefinedRisk <= 0) return null;
  return Number(Math.max(submittedRisk, stopDefinedRisk).toFixed(2));
}

export function isOpenPositionRiskVerifiable(metrics: {
  hasEntries?: unknown;
  netShares?: unknown;
} | null | undefined) {
  return metrics?.hasEntries === true && finitePositive(metrics.netShares) !== null;
}

export function resolvePlannedRiskReservation(input: {
  submittedRisk: unknown;
  entryPrice: unknown;
  stoplossPrice: unknown;
  totalShares: unknown;
}) {
  const entryPrice = finitePositive(input.entryPrice);
  const totalShares = finitePositive(input.totalShares);
  const submittedRisk = finitePositive(input.submittedRisk);
  if (!entryPrice || !totalShares || !submittedRisk) return null;
  const risk = calculateAuthoritativeCandidateRisk(input) ?? submittedRisk;
  const exposure = entryPrice * totalShares;
  if (!Number.isFinite(exposure) || exposure <= 0) return null;
  return { risk, exposure };
}

export function calculateCurrentDrawdownPct(currentEquity: unknown, realizedPnls: unknown[]) {
  const equity = finitePositive(currentEquity);
  const pnls = realizedPnls.map(Number);
  if (!equity || pnls.some((value) => !Number.isFinite(value))) return null;
  if (pnls.length === 0) return 0;

  const startingEquity = equity - pnls.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(startingEquity) || startingEquity <= 0) return null;

  let runningEquity = startingEquity;
  let peakEquity = startingEquity;
  for (const pnl of pnls) {
    runningEquity += pnl;
    peakEquity = Math.max(peakEquity, runningEquity);
  }
  if (peakEquity <= 0) return null;

  return Number((Math.max(0, (peakEquity - equity) / peakEquity) * 100).toFixed(4));
}

export interface RealizedPnlObservation {
  completedAt: unknown;
  pnl: unknown;
}

export function calculateRollingLossLimits(
  currentEquity: unknown,
  observations: RealizedPnlObservation[],
  now = new Date()
) {
  const equity = finitePositive(currentEquity);
  const nowMs = now.getTime();
  if (!equity || !Number.isFinite(nowMs)) return null;

  const dayMs = 24 * 60 * 60 * 1000;
  const weekMs = 7 * dayMs;
  let dailyRealizedPnl = 0;
  let weeklyRealizedPnl = 0;

  for (const observation of observations) {
    if (typeof observation.completedAt !== 'string' || observation.completedAt.trim() === '') return null;
    const completedAtMs = new Date(observation.completedAt).getTime();
    const pnl = finiteAmount(observation.pnl);
    if (!Number.isFinite(completedAtMs) || pnl === null) return null;

    const ageMs = nowMs - completedAtMs;
    if (ageMs < -5 * 60 * 1000) return null;
    if (ageMs >= 0 && ageMs <= weekMs) weeklyRealizedPnl += pnl;
    if (ageMs >= 0 && ageMs <= dayMs) dailyRealizedPnl += pnl;
  }

  return {
    dailyLossPct: Number((Math.max(0, -dailyRealizedPnl / equity) * 100).toFixed(4)),
    weeklyLossPct: Number((Math.max(0, -weeklyRealizedPnl / equity) * 100).toFixed(4)),
    dailyRealizedPnl: Number(dailyRealizedPnl.toFixed(2)),
    weeklyRealizedPnl: Number(weeklyRealizedPnl.toFixed(2)),
    windowMode: 'ROLLING_24H_7D' as const,
  };
}

export interface DrawdownObservation {
  tradeId: string;
  completedAt: string;
  recordedPnl?: unknown;
  fallbackPnl?: unknown;
  plannedRisk?: unknown;
}

export type ConservativeDrawdownSeriesResult =
  | {
      ok: true;
      pnls: number[];
      degraded: boolean;
      fallbackTradeIds: string[];
    }
  | {
      ok: false;
      unresolvedTradeIds: string[];
    };

function finiteAmount(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function buildConservativeDrawdownSeries(
  observations: DrawdownObservation[]
): ConservativeDrawdownSeriesResult {
  const fallbackTradeIds: string[] = [];
  const unresolvedTradeIds: string[] = [];
  const ordered = [...observations].sort((left, right) => left.completedAt.localeCompare(right.completedAt));
  const pnls = ordered.map((observation) => {
    const recordedPnl = finiteAmount(observation.recordedPnl);
    if (recordedPnl !== null) return recordedPnl;

    fallbackTradeIds.push(observation.tradeId);
    const fallbackPnl = finiteAmount(observation.fallbackPnl);
    if (fallbackPnl !== null) return fallbackPnl;

    const plannedRisk = finitePositive(observation.plannedRisk);
    if (plannedRisk !== null) return -plannedRisk;

    unresolvedTradeIds.push(observation.tradeId);
    return 0;
  });

  if (unresolvedTradeIds.length > 0) return { ok: false, unresolvedTradeIds };
  return {
    ok: true,
    pnls,
    degraded: fallbackTradeIds.length > 0,
    fallbackTradeIds,
  };
}

export function isMacroContextFresh(calcDate: unknown, now = new Date(), maxAgeDays = 7) {
  if (typeof calcDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(calcDate)) return false;
  const observedAt = new Date(`${calcDate}T23:59:59.999Z`).getTime();
  const ageMs = now.getTime() - observedAt;
  return Number.isFinite(observedAt) && ageMs >= -24 * 60 * 60 * 1000 && ageMs <= maxAgeDays * 24 * 60 * 60 * 1000;
}

function isMacroActionLevel(value: unknown): value is MacroActionLevel {
  return value === 'FULL' || value === 'REDUCED' || value === 'HALT';
}

export function selectConservativeMacroContext(
  rows: { indexCode: unknown; actionLevel: unknown; calcDate: unknown }[],
  now = new Date(),
  expectedIndexCodes?: string[]
) {
  const latestByIndex = new Map<string, { actionLevel: unknown; calcDate: string }>();
  for (const row of rows) {
    const indexCode = String(row.indexCode || '').trim();
    const calcDate = typeof row.calcDate === 'string' ? row.calcDate : '';
    if (!indexCode || !/^\d{4}-\d{2}-\d{2}$/.test(calcDate)) continue;
    const current = latestByIndex.get(indexCode);
    if (!current || calcDate > current.calcDate) {
      latestByIndex.set(indexCode, { actionLevel: row.actionLevel, calcDate });
    }
  }

  const freshRows = Array.from(latestByIndex.entries()).filter(([, row]) => (
    isMacroActionLevel(row.actionLevel) && isMacroContextFresh(row.calcDate, now)
  )) as [string, { actionLevel: MacroActionLevel; calcDate: string }][];
  const freshByIndex = new Map(freshRows);
  const selectedRows = expectedIndexCodes
    ? expectedIndexCodes.map((indexCode) => {
        const row = freshByIndex.get(indexCode);
        return row ? [indexCode, row] as [string, { actionLevel: MacroActionLevel; calcDate: string }] : null;
      })
    : freshRows;
  if (selectedRows.length === 0 || selectedRows.some((row) => row === null)) return null;
  const completeRows = selectedRows as [string, { actionLevel: MacroActionLevel; calcDate: string }][];

  const actionLevel: MacroActionLevel = completeRows.some(([, row]) => row.actionLevel === 'HALT')
    ? 'HALT'
    : completeRows.some(([, row]) => row.actionLevel === 'REDUCED')
      ? 'REDUCED'
      : 'FULL';

  return {
    actionLevel,
    calcDate: completeRows.map(([, row]) => row.calcDate).sort()[0],
    indexCodes: completeRows.map(([indexCode]) => indexCode).sort(),
  };
}

export function projectWorstCaseSectorContext(input: {
  portfolio: PortfolioRiskSummary;
  candidateExposure: number;
  candidateRisk: number;
  totalEquity: number;
  candidateSector?: string | null;
}) {
  const equity = finitePositive(input.totalEquity);
  if (!equity || !Number.isFinite(input.candidateExposure) || input.candidateExposure < 0 ||
      !Number.isFinite(input.candidateRisk) || input.candidateRisk < 0) {
    return null;
  }

  const candidateSector = input.candidateSector?.trim() || null;
  const largestCurrentExposure = candidateSector
    ? Number(input.portfolio.sectorExposure.find((row) => row.sector === candidateSector)?.exposure || 0)
    : Math.max(0, ...input.portfolio.sectorExposure.map((row) => Number(row.exposure) || 0));
  const largestCurrentSectorRisk = candidateSector
    ? Number((input.portfolio.sectorRisk || []).find((row) => row.sector === candidateSector)?.openRisk || 0)
    : Math.max(0, ...(input.portfolio.sectorRisk || []).map((row) => Number(row.openRisk) || 0));

  return {
    sectorExposurePct: Number((((largestCurrentExposure + input.candidateExposure) / equity) * 100).toFixed(4)),
    sectorRiskPct: Number((((largestCurrentSectorRisk + input.candidateRisk) / equity) * 100).toFixed(4)),
  };
}
