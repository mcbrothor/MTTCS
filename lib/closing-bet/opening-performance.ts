import { CLOSING_OPENING_POLICY as POLICY, CLOSING_POLICY } from './config';
import type { ClosingCandidate, ClosingEvaluation, ClosingOpeningExit, ClosingPricePoint, ClosingSnapshot, ClosingVenue } from './types';

export function validClosingPoint(point: ClosingPricePoint | null | undefined, venue: ClosingVenue, date: string, time: string): boolean {
  const bar = point?.bar;
  return Boolean(point && point.venue === venue && point.date === date && point.time === time
    && bar && bar.date === date && bar.time === time && Number.isFinite(bar.close) && bar.close > 0
    && Number.isFinite(bar.volume) && bar.volume > 0);
}
export function openingPointDue(date: string, time: string, now = new Date()): boolean {
  return Date.parse(`${date}T${time}+09:00`) + POLICY.barDurationMs <= now.getTime();
}

export function evaluateOpeningPerformance(snapshot: ClosingSnapshot, candidate: ClosingCandidate, input: {
  nextTradeDate: string;
  basis: ClosingPricePoint | null;
  nxt: ClosingPricePoint | null;
  krx: ClosingPricePoint | null;
  now?: Date;
  nextSession?: { open: string; close: string };
  costBps?: number;
}): ClosingEvaluation {
  const now = input.now ?? new Date();
  const costBps = input.costBps ?? CLOSING_POLICY.costBps;
  if (!Number.isFinite(costBps) || costBps < 0) throw new Error('Closing performance cost must be non-negative');
  const basisTime = snapshot.session?.close ?? CLOSING_POLICY.close;
  const matches = candidate.market === snapshot.market && snapshot.candidates.some((row) => row.ticker === candidate.ticker);
  const basis = matches && validClosingPoint(input.basis, 'KRX', snapshot.tradeDate, basisTime) ? input.basis : null;
  const basisPrice = basis?.bar?.close ?? null;
  const validNextDate = /^\d{4}-\d{2}-\d{2}$/.test(input.nextTradeDate) && input.nextTradeDate > snapshot.tradeDate;
  const measure = (venue: ClosingVenue, time: string, point: ClosingPricePoint | null): ClosingOpeningExit => {
    const result: ClosingOpeningExit = { venue, time, status: 'PENDING', price: null, returnPct: null, netReturnPct: null, point: null, warnings: [] };
    if (!matches || !validNextDate) return { ...result, status: 'DATA_MISSING', warnings: ['추천 종목 또는 다음 거래일 확인 실패'] };
    if (!openingPointDue(input.nextTradeDate, time, now)) return result;
    if (venue === 'KRX' && input.nextSession && (time < input.nextSession.open || time > input.nextSession.close)) {
      return { ...result, status: 'NOT_APPLICABLE', warnings: ['해당일 KRX 거래시간에 09:05가 포함되지 않습니다.'] };
    }
    if (!validClosingPoint(point, venue, input.nextTradeDate, time)) {
      return { ...result, status: 'DATA_MISSING', warnings: [point?.error || `${venue} ${time.slice(0, 5)} 실거래 분봉 미확인. 다른 시각·거래소 가격으로 대체하지 않습니다.`] };
    }
    result.point = point;
    result.price = point!.bar!.close;
    if (!basisPrice) return { ...result, status: 'DATA_MISSING', warnings: ['추천일 KRX 종가 미확인: 수익률 계산 대기'] };
    result.status = 'AVAILABLE';
    result.returnPct = (result.price / basisPrice - 1) * 100;
    result.netReturnPct = result.returnPct - costBps / 100;
    return result;
  };
  const nxt = measure('NXT', POLICY.nxtTime, input.nxt);
  const krx = measure('KRX', POLICY.krxTime, input.krx);
  return {
    snapshotId: snapshot.id, ticker: candidate.ticker, market: snapshot.market, tradeDate: snapshot.tradeDate,
    nextTradeDate: input.nextTradeDate, close: basisPrice, entry: null, exit: null, exitReason: null,
    benchmarkReturnPct: null, netReturnPct: null, maePct: null, mfePct: null, costBps,
    status: [nxt, krx].some((row) => row.status === 'AVAILABLE') ? 'MEASURED'
      : [nxt, krx].some((row) => row.status === 'PENDING') ? 'PENDING' : 'DATA_MISSING',
    warnings: ['추천일 KRX 종가 매수 가정의 가격 비교이며 실제 체결 성과가 아닙니다.',
      ...(snapshot.mode === 'REPLAY' ? ['과거 재현 후보의 참고 성과입니다.'] : []),
      ...(basis ? [] : [input.basis?.error || '추천일 KRX 종가 미확인'])],
    opening: { version: POLICY.version, basisPrice, basis, measuredAt: now.toISOString(), nxt, krx },
  };
}
