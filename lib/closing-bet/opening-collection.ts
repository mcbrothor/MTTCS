import { CLOSING_OPENING_POLICY as POLICY } from './config';
import { evaluateOpeningPerformance, openingPointDue, validClosingPoint } from './opening-performance';
import type { ClosingRepository } from './repository';
import type { ClosingPricePoint, ClosingSnapshot, ClosingVenue } from './types';

type ReadClosingPoint = (ticker: string, date: string, time: string, venue: ClosingVenue) => Promise<ClosingPricePoint>;

export async function collectOpeningEvaluations(snapshot: ClosingSnapshot, input: {
  repo: Pick<ClosingRepository, 'evaluations' | 'cache' | 'putCache' | 'saveEvaluations'>;
  next: { date: string; open: string; close: string };
  dryRun: boolean;
  now?: Date;
  readPoint?: ReadClosingPoint;
}) {
  const now = input.now ?? new Date();
  const readPoint = input.readPoint ?? (await import('./kis')).getClosingPricePoint;
  const saved = await input.repo.evaluations([snapshot.id]);
  const candidates = snapshot.mode === 'REPLAY' || snapshot.phase === 'WATCH' ? snapshot.reviewCandidates : snapshot.picks;
  const rows = await Promise.all(candidates.slice(0, 5).map(async (candidate) => {
    const previous = saved.find((row) => row.ticker === candidate.ticker && row.nextTradeDate === input.next.date)?.opening;
    const old = previous?.version === POLICY.version ? previous : null;
    const read = async (venue: ClosingVenue, date: string, time: string, prior?: ClosingPricePoint | null): Promise<ClosingPricePoint> => {
      const empty: ClosingPricePoint = { venue, date, time, bar: null };
      if (!openingPointDue(date, time, now)) return empty;
      if (validClosingPoint(prior, venue, date, time)) return prior!;
      const key = `opening-point:${POLICY.version}:${venue}:${candidate.ticker}:${date}:${time}`;
      try {
        const cached = await input.repo.cache<ClosingPricePoint>(key);
        if (validClosingPoint(cached?.payload, venue, date, time)) return cached!.payload;
        const point = await readPoint(candidate.ticker, date, time, venue);
        if (validClosingPoint(point, venue, date, time) && !input.dryRun) await input.repo.putCache(key, point, 24 * 45);
        return point;
      } catch {
        return { ...empty, error: `${venue} ${date} ${time.slice(0, 5)} 가격 조회 실패. 다음 수집에서 재시도합니다.` };
      }
    };
    const [basis, nxt, krx] = await Promise.all([
      read('KRX', snapshot.tradeDate, snapshot.session?.close ?? '15:30:00', old?.basis),
      read('NXT', input.next.date, POLICY.nxtTime, old?.nxt.point),
      POLICY.krxTime >= input.next.open && POLICY.krxTime <= input.next.close
        ? read('KRX', input.next.date, POLICY.krxTime, old?.krx.point) : Promise.resolve(null),
    ]);
    return evaluateOpeningPerformance(snapshot, candidate, { basis, nxt, krx, nextTradeDate: input.next.date, nextSession: input.next, now });
  }));
  if (!input.dryRun) await input.repo.saveEvaluations(rows);
  return rows;
}
