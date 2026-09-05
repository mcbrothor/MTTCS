import { getSupabaseAdmin } from '@/lib/supabase/server';
import { CLOSING_LABELS, CLOSING_MARKETS, CLOSING_POLICY, CLOSING_VERSION } from './config';
import { collectClosingInputs, closingMinutes, koreanDate, prepareClosingInputs } from './data';
import { buildClosingSnapshot } from './engine';
import { collectOpeningEvaluations } from './opening-collection';
import { getClosingOrderbook, getClosingQuote, getClosingSession } from './kis';
import { ClosingRepository } from './repository';
import { deliverClosingText, sendClosingSnapshot } from './telegram';
import type { ClosingMarket, ClosingMode, ClosingPhase, ClosingSnapshot } from './types';

export function closingClock(clock: string, deltaMinutes: number) {
  const [h, m, s] = clock.split(':').map(Number);
  const total = h * 3600 + m * 60 + s + deltaMinutes * 60;
  return `${String(Math.floor(total / 3600)).padStart(2, '0')}:${String(Math.floor(total / 60) % 60).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
function currentClock() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date());
}
async function cachedSession(date: string, dryRun = true) {
  const repo = new ClosingRepository(getSupabaseAdmin());
  const key = `session:${date}:${process.env.CLOSING_BET_SESSION_OVERRIDES_JSON || 'regular'}`;
  const saved = await repo.cache<{ isOpen: boolean; open: string; close: string }>(key);
  if (saved) return saved.payload;
  const session = await getClosingSession(date);
  if (!dryRun) await repo.putCache(key, session, 24);
  return session;
}
function pruneCharts(snapshot: ClosingSnapshot) {
  const keep = new Set([...snapshot.picks, ...snapshot.reviewCandidates].map((row) => row.ticker));
  for (const candidate of snapshot.candidates) if (!keep.has(candidate.ticker)) candidate.chart = [];
  return snapshot;
}

export async function runClosingBet(input: {
  market: ClosingMarket; date: string; mode: ClosingMode; phase?: ClosingPhase; dryRun?: boolean;
  send?: boolean; collectBaselines?: boolean; progress?: (message: string) => void;
}) {
  const repo = new ClosingRepository(getSupabaseAdmin());
  const dryRun = input.dryRun ?? true;
  const phase = input.phase ?? 'FINAL';
  const session = await cachedSession(input.date, dryRun);
  if (!session.isOpen) return { skipped: true, reason: 'KRX 휴장일', snapshot: null };
  if (input.mode === 'LIVE' && input.date !== koreanDate()) throw new Error('과거 날짜는 REPLAY 모드만 허용됩니다.');
  const cutoff = phase === 'WATCH' && input.mode === 'LIVE' ? currentClock() : closingClock(session.close, -12);
  const deadline = new Date(`${input.date}T${closingClock(session.close, -10)}+09:00`).getTime();
  if (input.mode === 'LIVE' && (Date.now() >= deadline || (phase === 'FINAL' && Date.now() < new Date(`${input.date}T${closingClock(session.close, -13)}+09:00`).getTime()))) {
    return { skipped: true, reason: '추천 발행 시간대 밖', snapshot: null };
  }
  const execute = async () => {
    const existing = phase === 'FINAL' ? (await repo.list(input.date, input.mode)).find((row) => row.market === input.market && row.phase === phase && row.modelVersion === CLOSING_VERSION) : null;
    if (existing) {
      const delivery = input.send ? await sendClosingSnapshot(repo, existing, await repo.evaluations([existing.id]), dryRun) : null;
      return { skipped: false, snapshot: existing, delivery, reused: true };
    }
    const collected = await collectClosingInputs({ repo, market: input.market, date: input.date, mode: input.mode,
      cutoff, dryRun, collectBaselines: input.collectBaselines, progress: input.progress, awaitCutoff: phase === 'FINAL' });
    const benchmarkTicker = input.market === 'KOSPI200' ? '069500' : '229200';
    let benchmarkLateReturnPct: number | null = null;
    let regime: ClosingSnapshot['regime'] = 'UNKNOWN';
    try {
      const bars = await closingMinutes(repo, benchmarkTicker, input.date, cutoff, input.mode === 'REPLAY', dryRun);
      const late = bars.find((bar) => bar.time?.replaceAll(':', '') === closingClock(session.close, -60).replaceAll(':', ''));
      const latest = bars.at(-1);
      const volume = bars.reduce((sum, bar) => sum + bar.volume, 0);
      const turnover = bars.every((bar) => bar.turnover !== null) ? bars.reduce((sum, bar) => sum + (bar.turnover ?? 0), 0) : null;
      const vwap = volume && turnover ? turnover / volume : null;
      if (late && latest && vwap) {
        benchmarkLateReturnPct = (latest.close / late.open - 1) * 100;
        regime = latest.close < vwap && benchmarkLateReturnPct < -0.3 ? 'RED'
          : latest.close >= vwap && benchmarkLateReturnPct >= 0 ? 'GREEN' : 'YELLOW';
      }
      collected.warnings.push(`시장 상태·후반 상대강도는 ${benchmarkTicker} ETF를 ${input.market} 지수 대용으로 사용합니다.`);
    } catch { collected.warnings.push('시장 기준 분봉 수집 실패: 공식 추천 차단'); }
    const finishedAt = Date.now();
    const createdAt = new Date(finishedAt).toISOString();
    const asOf = input.mode === 'REPLAY' ? `${input.date}T${cutoff}+09:00` : new Date(Math.min(finishedAt, deadline - 1)).toISOString();
    let snapshot = pruneCharts(buildClosingSnapshot({ market: input.market, tradeDate: input.date, mode: input.mode, phase,
      asOf, createdAt, ...collected, benchmarkLateReturnPct, regime, session }));
    if (!dryRun) snapshot = await repo.save(snapshot);
    const delivery = input.send ? await sendClosingSnapshot(repo, snapshot, [], dryRun) : null;
    if (delivery?.failed) throw new Error('종가베팅 텔레그램 일부 발송 실패: 영수증 확인 필요');
    return { skipped: false, snapshot, delivery, reused: false };
  };
  return dryRun ? execute() : repo.withLock(`${input.date}:${input.market}:${input.mode}:${phase}`, execute);
}

export async function prepareClosingBet(market: ClosingMarket, dryRun = true) {
  const date = koreanDate();
  const session = await cachedSession(date, dryRun);
  if (!session.isOpen || currentClock() < session.open || currentClock() >= closingClock(session.close, -60)) return { skipped: true, reason: '준비 시간대 밖 또는 휴장일' };
  const repo = new ClosingRepository(getSupabaseAdmin());
  return dryRun ? prepareClosingInputs(repo, date, market, true)
    : repo.withLock(`prepare:${date}:${market}`, () => prepareClosingInputs(repo, date, market, false));
}

async function nextSession(date: string, dryRun: boolean) {
  for (let offset = 1; offset <= 20; offset++) {
    const day = new Date(`${date}T00:00:00+09:00`);
    day.setUTCDate(day.getUTCDate() + offset);
    const nextDate = koreanDate(day);
    const session = await cachedSession(nextDate, dryRun);
    if (session.isOpen) return { date: nextDate, ...session };
  }
  throw new Error('다음 거래일을 확인할 수 없습니다.');
}

export async function evaluateClosingBet(snapshot: ClosingSnapshot, dryRun = true) {
  const repo = new ClosingRepository(getSupabaseAdmin());
  const next = await nextSession(snapshot.tradeDate, dryRun);
  return collectOpeningEvaluations(snapshot, { repo, next, dryRun });
}

export async function monitorClosingBet(market: ClosingMarket, dryRun = true) {
  const repo = new ClosingRepository(getSupabaseAdmin());
  const date = koreanDate();
  const snapshot = (await repo.list(date, 'LIVE')).find((row) => row.market === market && row.phase === 'FINAL');
  if (!snapshot) return { skipped: true, reason: '당일 발행 없음' };
  const session = await cachedSession(date, dryRun);
  if (currentClock() < closingClock(session.close, -10) || currentClock() > closingClock(session.close, 10)) return { skipped: true, reason: '마감 점검 시간대 밖' };
  const changes: string[] = [];
  for (const candidate of snapshot.picks) {
    const quote = await getClosingQuote(candidate.ticker);
    const book = await getClosingOrderbook(candidate.ticker);
    const price = book.expectedPrice ?? quote.price;
    const reasons = [...quote.blockedReasons];
    if (!quote.statusKnown) reasons.push('거래 상태 확인 불가');
    if (candidate.plan.entryMax !== null && price > candidate.plan.entryMax) reasons.push('예상 가격이 매수 상한 초과');
    if (candidate.plan.invalidation !== null && price < candidate.plan.invalidation) reasons.push('무효화 가격 이탈');
    if (!reasons.length) continue;
    const observedAt = new Date().toISOString();
    if (!dryRun && !await repo.cache(`withdrawn:${snapshot.id}:${candidate.ticker}`)) await repo.putCache(`withdrawn:${snapshot.id}:${candidate.ticker}`, { observedAt, reasons }, 24 * 45);
    const message = `[MTN 종가베팅 조건 이탈]\n${date} ${CLOSING_LABELS[market]} · ${candidate.name} (${candidate.ticker})\n${reasons.join(' / ')}\n신규 진입 보류. 이미 체결된 주문의 취소 알림이 아닙니다.\n${observedAt}`;
    const result = await deliverClosingText(repo, snapshot, message, `WITHDRAWAL:${candidate.ticker}`, dryRun);
    if (result.failed) throw new Error('추천 조건 이탈 알림 발송 실패');
    changes.push(candidate.ticker);
  }
  return { changes };
}

export async function reviewClosingBet(market: ClosingMarket, dryRun = true) {
  const repo = new ClosingRepository(getSupabaseAdmin());
  const snapshot = (await repo.list(undefined, 'LIVE')).find((row) => row.market === market && row.phase === 'FINAL' && row.tradeDate < koreanDate());
  if (!snapshot) return { skipped: true, reason: '평가할 실전 추천 없음' };
  const values = await evaluateClosingBet(snapshot, dryRun);
  if (values.some((row) => row.status === 'PENDING')) return { pending: true };
  const text = `[MTN 종가베팅 익일 복기]\n${snapshot.tradeDate} · ${CLOSING_LABELS[market]}\n추천일 KRX 종가 매수 가정 / 익일 NXT 08:05·KRX 09:05 분봉 종가 매도 기준 / 비용 ${CLOSING_POLICY.costBps}bp 가정\n`
    + values.map((row) => {
      const name = snapshot.picks.find((pick) => pick.ticker === row.ticker)?.name ?? row.ticker;
      const opening = row.opening;
      const format = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)}%` : '미확인';
      return `${name}: ${row.status} · NXT 08:05 ${format(opening?.nxt.returnPct)} · KRX 09:05 ${format(opening?.krx.returnPct)}`;
    }).join('\n');
  const delivery = await deliverClosingText(repo, snapshot, text, 'NEXT_DAY_REVIEW', dryRun);
  if (delivery.failed) throw new Error('익일 복기 발송 실패');
  return { evaluated: values.length, delivery };
}

export { CLOSING_MARKETS };
