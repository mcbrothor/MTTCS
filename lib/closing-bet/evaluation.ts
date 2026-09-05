import { CLOSING_POLICY as POLICY } from './config';
import type { ClosingBar, ClosingCandidate, ClosingEvaluation, ClosingSnapshot } from './types';

const positive = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const dateKey = (value: string) => value.includes('-') ? value.slice(0, 10) : value.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
const clock = (value?: string) => value?.includes(':') ? value.slice(0, 8) : value?.replace(/^(\d{2})(\d{2})(\d{2})$/, '$1:$2:$3');
const percent = (price: number, entry: number) => (price / entry - 1) * 100;
const seconds = (value: string) => value.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
type Session = { open: string; close: string };
const defaultSession: Session = { open: POLICY.open, close: POLICY.close };
function validateSession(session: Session) {
  if (![session.open, session.close].every((value) => /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value))
    || seconds(session.open) + 1800 >= seconds(session.close)) throw new Error('Invalid closing evaluation session');
  return session;
}
function exitClock(open: string) {
  const value = seconds(open) + 1800;
  return `${String(Math.floor(value / 3600)).padStart(2, '0')}:${String(Math.floor(value / 60) % 60).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function sessionBars(bars: ClosingBar[], date: string, session: Session) {
  return [...new Map(bars.filter((bar) => dateKey(bar.date) === date && clock(bar.time)
    && clock(bar.time)! >= session.open && clock(bar.time)! <= session.close
    && [bar.open, bar.high, bar.low, bar.close].every(positive)
    && bar.high >= Math.max(bar.open, bar.close, bar.low) && bar.low <= Math.min(bar.open, bar.close))
    .map((bar) => [clock(bar.time), { ...bar, time: clock(bar.time)! }])).values()]
    .sort((a, b) => a.time.localeCompare(b.time));
}

export function evaluateClosingCandidate(
  snapshot: ClosingSnapshot,
  candidate: ClosingCandidate,
  entryDay: ClosingBar[],
  nextDay: ClosingBar[],
  nextTradeDate: string | null,
  costBps: number = POLICY.costBps,
  nextSession?: Session,
): ClosingEvaluation {
  if (!Number.isFinite(costBps) || costBps < 0) throw new Error('Closing evaluation costBps must be non-negative');
  const tradeDate = dateKey(snapshot.tradeDate);
  const nextDate = nextTradeDate ? dateKey(nextTradeDate) : null;
  const entrySession = validateSession(snapshot.session ?? defaultSession);
  const followingSession = validateSession(nextSession ?? defaultSession);
  const timeExit = exitClock(followingSession.open);
  const result: ClosingEvaluation = {
    snapshotId: snapshot.id, ticker: candidate.ticker, market: candidate.market, tradeDate, nextTradeDate: nextDate,
    status: 'PENDING', close: null, entry: null, exit: null, exitReason: null,
    benchmarkReturnPct: null, netReturnPct: null, maePct: null, mfePct: null, costBps,
    warnings: ['CONDITIONAL_SIMULATION_NOT_ACTUAL_FILL', 'AUCTION_FILL_AND_QUEUE_NOT_VERIFIED'],
  };
  if (candidate.market !== snapshot.market || !snapshot.candidates.some((row) => row.ticker === candidate.ticker)) {
    return { ...result, status: 'DATA_MISSING', warnings: [...result.warnings, 'CANDIDATE_SNAPSHOT_MISMATCH'] };
  }
  const sameDay = sessionBars(entryDay, tradeDate, entrySession);
  const closing = sameDay.find((bar) => bar.time === entrySession.close);
  if (closing) result.close = closing.close;
  if (!nextDate || !nextDay.length) return result;
  if (nextDate <= tradeDate) return { ...result, status: 'DATA_MISSING', warnings: [...result.warnings, 'INVALID_NEXT_TRADE_DATE'] };
  const following = sessionBars(nextDay, nextDate, followingSession);
  const opening = following.find((bar) => bar.time === followingSession.open);
  if (!closing || !opening) return { ...result, status: 'DATA_MISSING', warnings: [...result.warnings, 'KRX_CLOSE_OR_NEXT_OPEN_MISSING'] };
  result.benchmarkReturnPct = percent(opening.open, closing.close);
  const plan = candidate.plan;
  if (!positive(plan.entryLow) || !positive(plan.entryMax) || !positive(plan.invalidation) || !positive(plan.target)
    || plan.entryLow > plan.entryMax || plan.invalidation >= plan.entryLow || plan.target <= plan.entryMax) {
    return { ...result, status: 'DATA_MISSING', warnings: [...result.warnings, 'ENTRY_PLAN_INVALID'] };
  }
  if (candidate.status === 'EXCLUDED' || closing.close < plan.entryLow || closing.close > plan.entryMax) {
    return { ...result, status: 'NO_ENTRY', exitReason: candidate.status === 'EXCLUDED' ? 'CANDIDATE_EXCLUDED' : 'CLOSE_OUTSIDE_ENTRY_RANGE' };
  }
  result.entry = closing.close;
  if (snapshot.mode === 'REPLAY' || candidate.status !== 'ACTIONABLE') result.warnings.push('REVIEW_CANDIDATE_HYPOTHETICAL_ENTRY');
  let minPrice = closing.close;
  let maxPrice = closing.close;
  let expectedBarTime = seconds(followingSession.open);
  for (const bar of following) {
    if (seconds(bar.time) > expectedBarTime && expectedBarTime < seconds(timeExit)) {
      return { ...result, status: 'DATA_MISSING', warnings: [...result.warnings, 'INTRADAY_PATH_GAP'] };
    }
    expectedBarTime = seconds(bar.time) + 60;
    const exitAtOpen = bar.time >= timeExit;
    minPrice = Math.min(minPrice, bar.open);
    maxPrice = Math.max(maxPrice, bar.open);
    if (bar.open <= plan.invalidation) {
      result.exit = bar.open;
      result.exitReason = 'GAP_STOP_AT_OBSERVED_OPEN';
    } else if (bar.open >= plan.target) {
      result.exit = bar.open;
      result.exitReason = 'GAP_TARGET_AT_OBSERVED_OPEN';
    } else if (exitAtOpen) {
      result.exit = bar.open;
      result.exitReason = `TIME_STOP_FIRST_OPEN_AT_OR_AFTER_${timeExit.replaceAll(':', '').slice(0, 4)}`;
    } else if (bar.low <= plan.invalidation) {
      result.exit = plan.invalidation;
      result.exitReason = bar.high >= plan.target ? 'STOP_FIRST_SAME_BAR_AMBIGUITY' : 'STRUCTURAL_STOP';
      minPrice = Math.min(minPrice, result.exit);
      if (bar.high >= plan.target) result.warnings.push('SAME_BAR_BOTH_LEVELS_STOP_FIRST');
      result.warnings.push('INTRABAR_EXTREMES_ORDER_UNKNOWN');
    } else if (bar.high >= plan.target) {
      result.exit = plan.target;
      result.exitReason = 'TARGET';
      maxPrice = Math.max(maxPrice, result.exit);
      result.warnings.push('INTRABAR_EXTREMES_ORDER_UNKNOWN');
    } else {
      minPrice = Math.min(minPrice, bar.low);
      maxPrice = Math.max(maxPrice, bar.high);
    }
    if (positive(result.exit)) break;
  }
  if (!positive(result.exit)) return { ...result, status: 'DATA_MISSING', warnings: [...result.warnings, 'EXIT_WINDOW_INCOMPLETE'] };
  result.status = 'SIMULATED';
  result.netReturnPct = percent(result.exit, result.entry) - costBps / 100;
  result.maePct = percent(minPrice, result.entry);
  result.mfePct = percent(maxPrice, result.entry);
  result.warnings = [...new Set(result.warnings)];
  return result;
}
