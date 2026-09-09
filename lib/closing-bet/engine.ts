import { CLOSING_POLICY as POLICY, CLOSING_VERSION, CLOSING_EXIT_RULE } from './config';
import type { ClosingBar, ClosingCandidate, ClosingInput, ClosingSnapshot } from './types';

interface SnapshotInput {
  market: ClosingSnapshot['market'];
  tradeDate: string;
  asOf: string;
  createdAt?: string;
  mode: ClosingSnapshot['mode'];
  phase: ClosingSnapshot['phase'];
  universe: ClosingSnapshot['universe'];
  inputs: ClosingInput[];
  benchmarkLateReturnPct: number | null;
  regime: ClosingSnapshot['regime'];
  warnings?: string[];
  session?: { open: string; close: string };
  basicScan?: { startedAt: string; completedAt: string; successfulTickers: string[] };
}

const BASIC_SCAN_MAX_AGE_MS = 10 * 60_000;
const CORE_ANALYSIS_MISSING = new Set([
  'PRICE_MISSING', 'MEASURED_TURNOVER_MISSING', 'DAILY_HISTORY_INSUFFICIENT', 'ATR_MISSING',
  'FULL_SESSION_VWAP_MISSING', 'MINUTES_STALE_OR_MISSING', 'RANGE_POSITION_MISSING',
  'LATE_BASE_MISSING', 'MARKET_LATE_RETURN_MISSING',
]);

const SIGNAL = {
  minRangePosition: 0.8,
  minRvol: 1.5,
  rvolDays: 20,
  minSectorPeers: 3,
  strongExecution: 100,
} as const;

const positive = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const finite = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value);
const day = (value: string) => value.includes('-') ? value.slice(0, 10) : value.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
const time = (value?: string) => value?.includes(':') ? value.slice(0, 8) : value?.replace(/^(\d{2})(\d{2})(\d{2})$/, '$1:$2:$3');
const stamp = (date: string, clock: string) => Date.parse(`${day(date)}T${clock}+09:00`);
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const pct = (value: number | null, base: number | null) => finite(value) && positive(base) ? (value / base - 1) * 100 : null;
const unique = (values: string[]) => [...new Set(values)];
const clockSeconds = (value: string) => value.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
function sessionTimes(input: SnapshotInput) {
  const open = input.session?.open ?? POLICY.open;
  const close = input.session?.close ?? POLICY.close;
  if (![open, close].every((value) => /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value))
    || clockSeconds(open) >= clockSeconds(close) - 3600) throw new Error('Invalid closing session times');
  const beforeClose = (minutes: number) => {
    const seconds = clockSeconds(close) - minutes * 60;
    return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  };
  return { open, close, lateStart: beforeClose(60), cutoff: beforeClose(12), publication: beforeClose(10), lastEntry: beforeClose(2) };
}
const validBar = (bar: ClosingBar) => [bar.open, bar.high, bar.low, bar.close].every(positive)
  && finite(bar.volume) && bar.volume >= 0 && bar.high >= Math.max(bar.open, bar.close, bar.low)
  && bar.low <= Math.min(bar.open, bar.close);

function barsBefore(input: ClosingInput, date: string, cutoff: number, session: ReturnType<typeof sessionTimes>) {
  const daily = [...new Map(input.daily.filter((bar) => day(bar.date) < date && validBar(bar))
    .map((bar) => [day(bar.date), bar])).values()].sort((a, b) => day(a.date).localeCompare(day(b.date)));
  const minutes = [...new Map(input.minutes.filter((bar) => {
    const clock = time(bar.time);
    return day(bar.date) === date && clock && clock >= session.open && clock < session.close
      && stamp(date, clock) + 60_000 <= cutoff && validBar(bar);
  }).map((bar) => [time(bar.time), { ...bar, date, time: time(bar.time) }])).values()]
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  return { daily, minutes };
}

function buildCandidate(input: ClosingInput, context: SnapshotInput, createdAt: string): ClosingCandidate {
  const date = day(context.tradeDate);
  const cutoff = Date.parse(context.asOf);
  const session = sessionTimes(context);
  const { daily, minutes } = barsBefore(input, date, cutoff, session);
  const current = minutes.at(-1);
  const quote = context.mode === 'LIVE' ? input.quote : null;
  const observedAt = quote ? Date.parse(quote.observedAt) : NaN;
  const receivedAt = quote ? Date.parse(quote.receivedAt) : NaN;
  const created = Date.parse(createdAt);
  const quoteEligible = quote !== null && finite(observedAt) && observedAt <= cutoff
    && finite(receivedAt) && receivedAt >= observedAt && receivedAt <= created
    && positive(quote.price) && positive(quote.high) && positive(quote.low)
    && quote.high >= quote.price && quote.low <= quote.price
    && finite(quote.turnover) && quote.turnover >= 0 && finite(quote.volume) && quote.volume >= 0;
  const freshQuote = quoteEligible && created - observedAt <= POLICY.maxQuoteAgeSeconds * 1000;
  const price = quoteEligible ? quote!.price : current?.close ?? null;
  const high = quoteEligible ? quote!.high : minutes.length ? Math.max(...minutes.map((bar) => bar.high)) : null;
  const low = quoteEligible ? quote!.low : minutes.length ? Math.min(...minutes.map((bar) => bar.low)) : null;
  const volume = quoteEligible ? quote!.volume : minutes.reduce((sum, bar) => sum + bar.volume, 0);
  const fullIntraday = minutes.length > 0 && minutes[0].time === session.open;
  const measuredTurnover = fullIntraday && minutes.every((bar) => finite(bar.turnover) && bar.turnover >= 0)
    ? minutes.reduce((sum, bar) => sum + bar.turnover!, 0) : null;
  const turnover = quoteEligible ? quote!.turnover : measuredTurnover;
  const minuteVolume = minutes.reduce((sum, bar) => sum + bar.volume, 0);
  const vwap = positive(measuredTurnover) && positive(minuteVolume) ? measuredTurnover / minuteVolume : null;
  const ma20 = daily.length >= 20 ? mean(daily.slice(-20).map((bar) => bar.close)) : null;
  const ma60 = daily.length >= POLICY.minDailyBars ? mean(daily.slice(-60).map((bar) => bar.close)) : null;
  const previousMa20 = daily.length >= 21 ? mean(daily.slice(-21, -1).map((bar) => bar.close)) : null;
  const ranges = daily.slice(1).map((bar, index) => Math.max(bar.high - bar.low, Math.abs(bar.high - daily[index].close), Math.abs(bar.low - daily[index].close)));
  const atr14 = ranges.length >= 14 ? mean(ranges.slice(-14)) : null;
  const breakout = daily.length >= 20 ? Math.max(...daily.slice(-20).map((bar) => bar.high)) : null;
  const rangePosition = positive(high) && positive(low) && finite(price) && high > low ? (price - low) / (high - low) : null;
  const lateBase = minutes.find((bar) => bar.time === session.lateStart);
  const rvolCutoff = stamp(date, session.cutoff);
  const sameTimeMinutes = minutes.filter((bar) => stamp(date, bar.time!) + 60_000 <= rvolCutoff);
  const lateReturnPct = pct(sameTimeMinutes.at(-1)?.close ?? null, lateBase?.open ?? null);
  const relativeLateReturnPct = finite(lateReturnPct) && finite(context.benchmarkLateReturnPct) ? lateReturnPct - context.benchmarkLateReturnPct : null;
  const sameTime = input.historicalSameTimeVolumes.filter(positive).slice(-SIGNAL.rvolDays);
  const fixedTimeVolume = sameTimeMinutes.reduce((sum, bar) => sum + bar.volume, 0);
  const fixedTimeComplete = fullIntraday && cutoff >= rvolCutoff && sameTimeMinutes.length > 0
    && stamp(date, sameTimeMinutes.at(-1)!.time!) + 60_000 === rvolCutoff;
  const rvol = sameTime.length === SIGNAL.rvolDays && fixedTimeComplete ? fixedTimeVolume / mean(sameTime)! : null;
  const averageDailyVolume = daily.length >= 20 ? mean(daily.slice(-20).map((bar) => bar.volume)) : null;
  const dailyVolumeRatio = positive(averageDailyVolume) ? volume / averageDailyVolume : null;
  const spreadBps = quoteEligible && positive(quote!.ask) && positive(quote!.bid) && quote!.ask! >= quote!.bid!
    ? (quote!.ask! - quote!.bid!) / ((quote!.ask! + quote!.bid!) / 2) * 10_000 : null;
  const flowTime = input.flow.asOf ? Date.parse(input.flow.asOf) : NaN;
  const usableFlow = input.flow.venue === 'KRX' && finite(flowTime) && flowTime <= cutoff
    && (input.flow.kind === 'ESTIMATE' ? flowTime >= stamp(date, session.open)
      : input.flow.kind === 'PREVIOUS_CONFIRMED' && flowTime < stamp(date, '00:00:00'));
  const evidence = input.evidence.filter((item) => finite(Date.parse(item.availableAt)) && Date.parse(item.availableAt) <= cutoff);
  const exclusions: string[] = [];
  const warnings = [...input.warnings];
  const reasons: string[] = [];
  const requiredMissing: string[] = [];

  if (!positive(price)) requiredMissing.push('PRICE_MISSING');
  if (!finite(turnover)) requiredMissing.push('MEASURED_TURNOVER_MISSING');
  else if (turnover < POLICY.minTurnover) exclusions.push('TURNOVER_BELOW_500EOK');
  if (daily.length < POLICY.minDailyBars) requiredMissing.push('DAILY_HISTORY_INSUFFICIENT');
  if (!positive(atr14)) requiredMissing.push('ATR_MISSING');
  if (!positive(vwap)) requiredMissing.push('FULL_SESSION_VWAP_MISSING');
  if (!lateBase) requiredMissing.push('LATE_BASE_MISSING');
  if (!finite(context.benchmarkLateReturnPct)) requiredMissing.push('MARKET_LATE_RETURN_MISSING');
  if (!current || cutoff - (stamp(date, current.time!) + 60_000) > POLICY.maxMinuteAgeSeconds * 1000) requiredMissing.push('MINUTES_STALE_OR_MISSING');
  if (rangePosition === null) requiredMissing.push('RANGE_POSITION_MISSING');
  else if (rangePosition < SIGNAL.minRangePosition) exclusions.push('WEAK_CLOSE_POSITION');
  if (positive(price) && positive(vwap) && price < vwap) exclusions.push('BELOW_VWAP');
  if (positive(price) && positive(ma20) && positive(ma60) && (price < ma20 || ma20 < ma60)) exclusions.push('TREND_NOT_ALIGNED');
  if (positive(price) && positive(high) && positive(breakout) && high >= breakout && price < breakout) exclusions.push('BREAKOUT_NOT_HELD');
  if (finite(rvol) && rvol < SIGNAL.minRvol) exclusions.push('RVOL_BELOW_1_5');
  if (finite(relativeLateReturnPct) && relativeLateReturnPct <= 0) exclusions.push('LATE_RELATIVE_STRENGTH_WEAK');
  if (positive(price) && positive(vwap) && positive(atr14) && price - vwap > atr14 * POLICY.maxExtensionAtr) exclusions.push('OVEREXTENDED_FROM_VWAP');
  if (quote?.statusKnown && quote.blockedReasons.length) exclusions.push(...quote.blockedReasons);
  if (evidence.some((item) => item.kind === 'RISK')) exclusions.push('KNOWN_EVENT_RISK');
  if (context.mode === 'LIVE') {
    if (!freshQuote) requiredMissing.push('QUOTE_STALE_OR_UNVERIFIED');
    if (!quoteEligible || !quote!.statusKnown) requiredMissing.push('SECURITY_STATUS_UNKNOWN');
    if (!finite(spreadBps)) requiredMissing.push('ORDER_BOOK_MISSING_OR_CROSSED');
    else if (spreadBps > POLICY.maxSpreadBps) exclusions.push('SPREAD_TOO_WIDE');
    if (!positive(quote?.askVolume) || !positive(quote?.bidVolume)) requiredMissing.push('ORDER_BOOK_DEPTH_MISSING');
    if (positive(price) && positive(atr14) && positive(quote?.ask) && quote.ask - price > atr14 * POLICY.maxEntryAtr) exclusions.push('ENTRY_ATR_EXCEEDED');
  } else {
    warnings.push('REPLAY_NOT_ACTIONABLE', 'HISTORICAL_ORDER_BOOK_AND_STATUS_UNVERIFIED');
  }
  if (!rvol) warnings.push('SAME_TIME_RVOL_MISSING_NO_SCORE');
  if (!usableFlow) warnings.push('FLOW_UNAVAILABLE_AT_CUTOFF_NO_SCORE');
  if (!evidence.some((item) => item.kind === 'CATALYST')) warnings.push('CATALYST_UNVERIFIED_NO_SCORE');

  const scores = {
    late: (finite(rangePosition) && rangePosition >= SIGNAL.minRangePosition ? 8 : 0)
      + (positive(price) && positive(vwap) && price >= vwap ? 5 : 0)
      + (finite(relativeLateReturnPct) && relativeLateReturnPct > 0 ? 7 : 0)
      + (finite(lateReturnPct) && lateReturnPct > 0 ? 5 : 0),
    liquidity: (finite(turnover) && turnover >= POLICY.minTurnover ? 8 : 0)
      + (finite(turnover) && turnover >= POLICY.minTurnover * 3 ? 4 : 0)
      + (finite(rvol) && rvol >= SIGNAL.minRvol ? 8 : 0),
    chart: (positive(price) && positive(ma20) && positive(ma60) && price >= ma20 && ma20 >= ma60 ? 5 : 0)
      + (positive(price) && positive(breakout) && price >= breakout ? 5 : 0)
      + (positive(ma20) && positive(previousMa20) && ma20 > previousMa20 ? 5 : 0),
    flow: usableFlow ? (positive(input.flow.foreignNet) ? 5 : 0) + (positive(input.flow.institutionNet) ? 5 : 0)
      + (positive(input.flow.foreignNet) && positive(input.flow.institutionNet) ? 5 : 0) : 0,
    catalyst: evidence.some((item) => item.kind === 'CATALYST') ? 6 : 0,
    execution: freshQuote ? (finite(spreadBps) && spreadBps <= POLICY.maxSpreadBps ? 5 : 0)
      + (finite(quote?.executionStrength) && quote.executionStrength >= SIGNAL.strongExecution ? 3 : 0)
      + (positive(quote?.askVolume) && positive(quote?.bidVolume) ? 2 : 0) : 0,
    character: Math.min(5, daily.slice(-20).filter((bar) => bar.high > bar.low && bar.close > bar.open
      && (bar.close - bar.low) / (bar.high - bar.low) >= SIGNAL.minRangePosition).length),
  };
  if (scores.late >= 20) reasons.push('LATE_STRENGTH_HELD');
  if (scores.liquidity >= 8) reasons.push('MEASURED_TURNOVER_QUALIFIED');
  if (scores.chart === 15) reasons.push('UPTREND_BREAKOUT_HELD');
  if (scores.flow === 15) reasons.push('FOREIGN_INSTITUTION_BUYING');
  const entryLow = positive(price) && positive(atr14) ? Math.max(vwap ?? price, price - atr14 * POLICY.maxEntryAtr) : null;
  const entryMax = positive(price) && positive(atr14) ? price + atr14 * POLICY.maxEntryAtr : null;
  const invalidation = positive(price) && positive(vwap) && positive(atr14) ? Math.max(vwap - atr14 * POLICY.maxEntryAtr, price - atr14) : null;
  const target = positive(price) && positive(atr14) ? price + atr14 : null;
  if (positive(quote?.expectedPrice) && positive(entryMax) && quote.expectedPrice > entryMax) exclusions.push('EXPECTED_PRICE_ABOVE_ENTRY_MAX');
  const score = Object.values(scores).reduce((sum, value) => sum + value, 0);
  return {
    ticker: input.ticker, name: input.name, market: input.market, rank: null, score, scores,
    status: exclusions.length ? 'EXCLUDED' : context.mode === 'LIVE' && context.phase === 'FINAL' && !requiredMissing.length ? 'ACTIONABLE' : 'WATCH',
    quality: !positive(price) ? 'MISSING' : requiredMissing.length || !rvol || !usableFlow || context.mode === 'REPLAY' ? 'DEGRADED' : 'FULL',
    sector: quote?.sector ?? null, reasons, exclusions: unique(exclusions), warnings: unique([...warnings, ...requiredMissing]),
    metrics: { price, changePct: pct(price, quoteEligible ? quote!.previousClose : daily.at(-1)?.close ?? null), turnover, vwap, rangePosition, lateReturnPct, relativeLateReturnPct, rvol, dailyVolumeRatio, ma20, ma60, atr14, breakout, spreadBps },
    flow: usableFlow ? input.flow : { foreignNet: null, institutionNet: null, unit: input.flow.unit, asOf: null, kind: 'MISSING', venue: 'UNKNOWN' },
    evidence, plan: { entryLow, entryMax, invalidation, target, exitRule: CLOSING_EXIT_RULE, expiresAt: `${date}T${session.lastEntry}+09:00` },
    chart: minutes,
  };
}

export function buildClosingSnapshot(input: SnapshotInput): ClosingSnapshot {
  const tradeDate = day(input.tradeDate);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const asOf = Date.parse(input.asOf);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tradeDate) || !finite(asOf) || !finite(Date.parse(createdAt))) throw new Error('Invalid closing snapshot timestamp');
  const session = sessionTimes(input);
  const publicationDeadline = stamp(tradeDate, session.publication);
  if (asOf < stamp(tradeDate, session.open) || asOf >= publicationDeadline
    || (input.mode === 'REPLAY' && asOf > stamp(tradeDate, session.cutoff))) throw new Error('Closing snapshot cutoff must precede the closing auction; replay ends 12 minutes before close');
  const inputs = [...new Map(input.inputs.filter((item) => item.market === input.market && /^\d{6}$/.test(item.ticker))
    .map((item) => [item.ticker, item])).values()];
  const candidates = inputs.map((item) => buildCandidate(item, input, createdAt));
  const warnings = [...(input.warnings ?? [])];
  const total = Math.max(input.universe.expectedCount, input.universe.count, inputs.length);
  let collected: number;
  if (input.mode === 'LIVE' && input.basicScan) {
    const started = Date.parse(input.basicScan.startedAt);
    const completed = Date.parse(input.basicScan.completedAt);
    const validScan = finite(started) && finite(completed) && started >= stamp(tradeDate, session.open)
      && started <= completed && completed <= asOf && asOf - started <= BASIC_SCAN_MAX_AGE_MS;
    const poolTickers = new Set(inputs.map((item) => item.ticker));
    collected = validScan ? new Set(input.basicScan.successfulTickers.filter((ticker) => poolTickers.has(ticker))).size : 0;
    if (!validScan) warnings.push('BASIC_SCAN_METADATA_INVALID_OR_EXPIRED');
  } else if (input.mode === 'LIVE') {
    // Coverage measures completion of the pool scan. Candidate freshness remains a separate hard gate.
    collected = inputs.filter(({ quote }) => {
      if (!quote) return false;
      const observed = Date.parse(quote.observedAt);
      const received = Date.parse(quote.receivedAt);
      return positive(quote.price) && positive(quote.high) && positive(quote.low) && quote.high >= quote.price && quote.low <= quote.price
        && finite(quote.turnover) && quote.turnover >= 0 && finite(quote.volume) && quote.volume >= 0
        && finite(observed) && observed <= asOf && finite(received) && received >= observed
        && received >= stamp(tradeDate, session.open) && received <= Date.parse(createdAt) && asOf - received <= BASIC_SCAN_MAX_AGE_MS;
    }).length;
  } else {
    collected = candidates.filter((candidate) => finite(candidate.metrics.turnover) && positive(candidate.metrics.price)).length;
  }
  const coverage = { collected, total, failed: Math.max(0, total - collected) };
  const coverageBlocked = !total || collected / total < POLICY.minCoverage;
  const expired = input.mode === 'LIVE' && (Date.parse(createdAt) >= publicationDeadline || Date.parse(createdAt) < asOf);
  const blocked = coverageBlocked || input.regime === 'UNKNOWN' || input.regime === 'RED' || expired;
  if (coverageBlocked) warnings.push('MARKET_COVERAGE_BELOW_95_PERCENT');
  if (input.regime === 'UNKNOWN' || input.regime === 'RED') warnings.push(`MARKET_REGIME_${input.regime}`);
  if (expired) warnings.push('LIVE_RECOMMENDATION_EXPIRED');
  if (input.mode === 'REPLAY') warnings.push('REPLAY_REVIEW_ONLY', 'CURRENT_MEMBERSHIP_MAY_DIFFER_FROM_HISTORICAL');
  for (const candidate of candidates) {
    const peers = candidate.sector ? candidates.filter((peer) => peer.sector === candidate.sector && positive(peer.metrics.lateReturnPct)).length : 0;
    if (peers >= SIGNAL.minSectorPeers && candidate.evidence.some((item) => item.kind === 'CATALYST')) {
      candidate.scores.catalyst += 4;
      candidate.score += 4;
    }
    if (candidate.status === 'ACTIONABLE' && (blocked || candidate.score < POLICY.minScore)) candidate.status = 'WATCH';
    if (blocked) candidate.warnings = unique([...candidate.warnings, ...warnings.filter((warning) => warning.startsWith('MARKET_') || warning === 'LIVE_RECOMMENDATION_EXPIRED')]);
  }
  candidates.sort((a, b) => b.score - a.score || (b.metrics.turnover ?? 0) - (a.metrics.turnover ?? 0) || a.ticker.localeCompare(b.ticker));
  const sectors = new Map<string, number>();
  const picks: ClosingCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.status !== 'ACTIONABLE') continue;
    if (picks.length >= POLICY.topN) {
      candidate.status = 'WATCH';
      candidate.warnings.push('TOP_FIVE_LIMIT');
      continue;
    }
    if (candidate.sector && (sectors.get(candidate.sector) ?? 0) >= POLICY.maxSameSector) {
      candidate.status = 'WATCH';
      candidate.warnings.push('SECTOR_CONCENTRATION_LIMIT');
      continue;
    }
    candidate.rank = picks.length + 1;
    picks.push(candidate);
    if (candidate.sector) sectors.set(candidate.sector, (sectors.get(candidate.sector) ?? 0) + 1);
  }
  const reviewPool = candidates.filter((candidate) => positive(candidate.metrics.price) && !picks.includes(candidate));
  const liquidityTier = (candidate: ClosingCandidate) => finite(candidate.metrics.turnover)
    ? candidate.metrics.turnover >= POLICY.minTurnover ? 0 : 1 : 2;
  const incompleteCore = (candidate: ClosingCandidate) => candidate.warnings.some((warning) => CORE_ANALYSIS_MISSING.has(warning)) ? 1 : 0;
  const reviewCandidates = reviewPool.sort((a, b) => liquidityTier(a) - liquidityTier(b)
    || incompleteCore(a) - incompleteCore(b)
    || Number(a.status === 'EXCLUDED') - Number(b.status === 'EXCLUDED')
    || b.score - a.score || (b.metrics.turnover ?? 0) - (a.metrics.turnover ?? 0) || a.ticker.localeCompare(b.ticker)).slice(0, POLICY.topN);
  return {
    id: `${CLOSING_VERSION}:${input.market}:${tradeDate}:${input.phase}:${input.mode}:${input.asOf}`,
    modelVersion: CLOSING_VERSION, tradeDate, asOf: input.asOf, createdAt, market: input.market, mode: input.mode, phase: input.phase, venue: 'KRX', session: { open: session.open, close: session.close },
    status: blocked ? 'BLOCKED' : input.mode === 'REPLAY' || candidates.some((candidate) => candidate.quality !== 'FULL') ? 'DEGRADED' : 'READY',
    regime: input.regime, benchmarkLateReturnPct: input.benchmarkLateReturnPct, universe: input.universe, coverage, picks, reviewCandidates, candidates, warnings: unique(warnings),
  };
}
