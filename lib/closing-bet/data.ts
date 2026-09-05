import { getScannerUniverse } from '@/lib/finance/market/scanner-universes';
import { getDartRecentFilings } from '@/lib/finance/providers/dart-api';
import { CLOSING_POLICY } from './config';
import { getClosingDaily, getClosingFlow, getClosingMinutes, getClosingOrderbook, getClosingQuote } from './kis';
import { ClosingRepository } from './repository';
import type { ClosingBar, ClosingEvidence, ClosingInput, ClosingMarket, ClosingMode, ClosingSnapshot } from './types';

interface Pool { items: { ticker: string; name: string }[]; observedAt: string; name: string }
const missingFlow: ClosingInput['flow'] = { foreignNet: null, institutionNet: null, unit: 'SHARES', asOf: null, kind: 'MISSING', venue: 'UNKNOWN' };
const errorLabel = (error: unknown) => error instanceof Error ? error.message.slice(0, 180) : '데이터 조회 실패';
export const koreanDate = (now = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now);

export async function mapClosing<T, R>(items: T[], run: (item: T, index: number) => Promise<R>, concurrency = CLOSING_POLICY.scanConcurrency): Promise<R[]> {
  const result = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; result[index] = await run(items[index], index); }
  }));
  return result;
}

export async function closingPool(repo: ClosingRepository, market: ClosingMarket, date: string, dryRun = false): Promise<Pool> {
  const historical = await repo.cache<Pool>(`pool:${market}:${date}`);
  const expected = market === 'KOSPI200' ? 200 : 150;
  if (historical?.payload.items.length === expected) return historical.payload;
  const today = koreanDate();
  const cached = await repo.cache<Pool>(`pool:${market}:${today}`);
  if (cached?.payload.items.length === expected) return cached.payload;
  const source = await getScannerUniverse(market);
  const items = source.items.filter((item) => /^\d{6}$/.test(item.ticker)).slice(0, expected);
  if (new Set(items.map((item) => item.ticker)).size !== items.length) throw new Error('종목 풀에 중복 코드가 있습니다.');
  const pool: Pool = { items: items.map(({ ticker, name }) => ({ ticker, name })), observedAt: source.asOf, name: source.label };
  if (!dryRun) await repo.putCache(`pool:${market}:${today}`, pool, 24 * 45);
  return pool;
}

async function daily(repo: ClosingRepository, ticker: string, date: string, dryRun: boolean) {
  const key = `daily:${ticker}:${date}`;
  const cached = await repo.cache<ClosingBar[]>(key);
  if (cached) return cached.payload;
  const rows = await getClosingDaily(ticker, date, 100);
  if (!dryRun && rows.length) await repo.putCache(key, rows, 24 * CLOSING_POLICY.cacheDays);
  return rows;
}

export async function closingMinutes(repo: ClosingRepository, ticker: string, date: string, cutoff: string, historical: boolean, dryRun = false) {
  const key = `minutes:${ticker}:${date}:${cutoff}`;
  if (historical) {
    const cached = await repo.cache<ClosingBar[]>(key);
    if (cached?.payload.length && cached.payload.every((bar) => bar.turnover !== null)) return cached.payload;
  }
  const rows = await getClosingMinutes(ticker, date, cutoff);
  if (historical && rows.length && !dryRun) await repo.putCache(key, rows, 24 * CLOSING_POLICY.cacheDays);
  return rows;
}

async function baselines(repo: ClosingRepository, ticker: string, dates: string[], cutoff: string, dryRun: boolean, collect: boolean, deadline = Infinity, warnings: string[] = []) {
  const values: number[] = [];
  const saved = await repo.caches<number>(dates.slice(-20).map((date) => `baseline:${ticker}:${date}:${cutoff}`));
  const savedMinutes = await repo.caches<ClosingBar[]>(dates.slice(-20).map((date) => `minutes:${ticker}:${date}:${cutoff}`));
  for (const date of dates.slice(-20)) {
    const key = `baseline:${ticker}:${date}:${cutoff}`;
    if (saved.has(key)) { values.push(saved.get(key)!); continue; }
    if (!collect || Date.now() >= deadline) continue;
    // 기준선은 집계값만 저장해 전 종목 20일 분봉의 DB 중복 저장을 피한다.
    let rows: ClosingBar[];
    try { rows = savedMinutes.get(`minutes:${ticker}:${date}:${cutoff}`) ?? await getClosingMinutes(ticker, date, cutoff); }
    catch (error) { warnings.push(`${ticker} ${date} 기준선: ${errorLabel(error)}`); continue; }
    if (!rows.length || !rows.some((bar) => bar.time?.replaceAll(':', '') === '090000')) continue;
    const volume = rows.reduce((sum, bar) => sum + bar.volume, 0);
    if (volume > 0) {
      values.push(volume);
      if (!dryRun) await repo.putCache(key, volume, 24 * 45);
    }
  }
  return values;
}

async function evidence(repo: ClosingRepository, ticker: string, date: string, mode: ClosingMode, dryRun: boolean): Promise<ClosingEvidence[]> {
  const key = `filings:${ticker}:${koreanDate()}`;
  const cached = await repo.cache<ClosingEvidence[]>(key);
  if (cached) return cached.payload.filter((item) => mode !== 'REPLAY' || item.availableAt.slice(0, 10) < date);
  const receivedAt = new Date().toISOString();
  const filings: { title: string; occurred_at: string; source_url: string }[] = await getDartRecentFilings(ticker, 14);
  const rows: ClosingEvidence[] = filings.flatMap((item) => {
    const risk = /유상증자|전환사채권발행결정|횡령|배임|회생절차|상장폐지|감사의견/.test(item.title);
    const catalyst = /단일판매.*공급계약.*체결|영업.*잠정.*실적/.test(item.title);
    if (!risk && !catalyst) return [];
    // DART 목록은 게시 날짜만 제공한다. 자정에 알려졌다고 간주하지 않는다.
    const filingDate = item.occurred_at.slice(0, 10);
    const availableAt = filingDate < koreanDate() ? `${filingDate}T23:59:59+09:00` : receivedAt;
    return [{ title: item.title, url: item.source_url, availableAt, kind: risk ? 'RISK' as const : 'CATALYST' as const }];
  });
  if (!dryRun) await repo.putCache(key, rows, 1);
  return rows.filter((item) => mode !== 'REPLAY' || item.availableAt.slice(0, 10) < date);
}

export async function collectClosingInputs(options: {
  repo: ClosingRepository; market: ClosingMarket; date: string; mode: ClosingMode;
  cutoff: string; dryRun?: boolean; collectBaselines?: boolean;
  awaitCutoff?: boolean;
  progress?: (message: string) => void;
}) {
  const { repo, market, date, mode, cutoff, progress } = options;
  const dryRun = options.dryRun ?? false;
  const pool = await closingPool(repo, market, date, dryRun);
  const warnings: string[] = [];
  const scanStartedAt = new Date().toISOString();
  const successfulTickers: string[] = [];
  const inputs = await mapClosing(pool.items, async (stock, index): Promise<ClosingInput> => {
    const input: ClosingInput = { ...stock, market, daily: [], minutes: [], quote: null, flow: { ...missingFlow }, historicalSameTimeVolumes: [], evidence: [], warnings: [] };
    try {
      if (mode === 'LIVE') {
        input.quote = await getClosingQuote(stock.ticker);
        successfulTickers.push(stock.ticker);
      }
      else {
        input.daily = await daily(repo, stock.ticker, date, dryRun);
        input.minutes = await closingMinutes(repo, stock.ticker, date, cutoff, true, dryRun);
      }
    } catch (error) { input.warnings.push(errorLabel(error)); }
    if ((index + 1) % 20 === 0) progress?.(`${market} 기본 수집 ${index + 1}/${pool.items.length}`);
    return input;
  });
  const basicScan = { startedAt: scanStartedAt, completedAt: new Date().toISOString(), successfulTickers };
  const turnover = (input: ClosingInput) => mode === 'LIVE' ? input.quote?.turnover ?? 0 : input.minutes.reduce((sum, row) => sum + (row.turnover ?? 0), 0);
  const detail = [...inputs].filter((input) => turnover(input) >= CLOSING_POLICY.minTurnover)
    .sort((a, b) => turnover(b) - turnover(a)).slice(0, CLOSING_POLICY.detailLimit);
  if (mode === 'LIVE' && options.awaitCutoff) {
    const waitMs = new Date(`${date}T${cutoff}+09:00`).getTime() - Date.now();
    if (waitMs > 90_000) throw new Error('종가 확정 수집은 기준시각 90초 전부터 실행 가능합니다.');
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  await mapClosing(detail, async (input, index) => {
    try {
      if (!input.daily.length) input.daily = await daily(repo, input.ticker, date, dryRun);
      if (mode === 'LIVE') input.minutes = await closingMinutes(repo, input.ticker, date, cutoff, false, dryRun);
      const dates = input.daily.filter((bar) => bar.date < date).map((bar) => bar.date);
      input.historicalSameTimeVolumes = await baselines(repo, input.ticker, dates, cutoff, dryRun, options.collectBaselines ?? false, Infinity, input.warnings);
      if (input.historicalSameTimeVolumes.length < 20) input.warnings.push(`동일시각 기준선 ${input.historicalSameTimeVolumes.length}/20일: 부족 시 상대거래량 가점 없음`);
    } catch (error) { input.warnings.push(errorLabel(error)); }
    if (mode === 'LIVE') {
      try { input.flow = await getClosingFlow(input.ticker, date, new Date().toISOString()); }
      catch (error) { input.warnings.push(`수급: ${errorLabel(error)}`); }
      try { if (input.quote) Object.assign(input.quote, await getClosingOrderbook(input.ticker)); }
      catch (error) { input.warnings.push(`호가: ${errorLabel(error)}`); }
    } else input.warnings.push('과거 장중 가집계·호가·종목 상태는 복원하지 않음');
    try { input.evidence = await evidence(repo, input.ticker, date, mode, dryRun); }
    catch (error) { input.warnings.push(`공시: ${errorLabel(error)}`); }
    progress?.(`${market} 상세 검증 ${index + 1}/${detail.length}: ${input.ticker}`);
  });
  if (mode === 'LIVE') {
    // 가격·호가를 같은 시각에 가까운 마지막 스냅샷으로 검증한다.
    await mapClosing(detail, async (input) => {
      try {
        const quote = await getClosingQuote(input.ticker);
        input.quote = { ...quote, ...await getClosingOrderbook(input.ticker) };
      } catch (error) { input.quote = null; input.warnings.push(errorLabel(error)); }
    });
  }
  const universe: ClosingSnapshot['universe'] = {
    name: pool.name, observedAt: pool.observedAt, count: pool.items.length,
    expectedCount: market === 'KOSPI200' ? 200 : 150,
    historicalMembership: new Date(pool.observedAt).getTime() <= new Date(`${date}T15:18:00+09:00`).getTime() && koreanDate(new Date(pool.observedAt)) === date,
  };
  if (mode === 'REPLAY' && !universe.historicalMembership) warnings.push('당시 편입 명단이 없어 현재의 기존 KOSPI200/KOSDAQ150 풀을 고정 적용한 재현입니다. 편입 변경·생존 편향 가능성이 있습니다.');
  if (detail.length === CLOSING_POLICY.detailLimit) warnings.push(`거래대금 기준 상세 분석 상위 ${CLOSING_POLICY.detailLimit}개; 미분석 종목은 관찰로 표시합니다.`);
  return { inputs, universe, warnings, basicScan };
}

export async function prepareClosingInputs(repo: ClosingRepository, date: string, market: ClosingMarket, dryRun = false) {
  const pool = await closingPool(repo, market, date, dryRun);
  const deadline = Date.now() + 180_000;
  const result = { prepared: 0, remaining: 0, warnings: [] as string[] };
  const ready = await repo.caches<boolean>(pool.items.map((item) => `prepared:${item.ticker}:${date}`));
  for (const item of pool.items) {
    if (ready.has(`prepared:${item.ticker}:${date}`)) continue;
    if (Date.now() >= deadline || result.prepared >= 10) { result.remaining++; continue; }
    try {
      const bars = await daily(repo, item.ticker, date, dryRun);
      const values = await baselines(repo, item.ticker, bars.filter((bar) => bar.date < date).map((bar) => bar.date), CLOSING_POLICY.cutoff, dryRun, true, deadline, result.warnings);
      if (values.length >= 20) {
        if (!dryRun) await repo.putCache(`prepared:${item.ticker}:${date}`, true, 24);
        result.prepared++;
      } else result.remaining++;
    } catch (error) { result.warnings.push(`${item.ticker}: ${errorLabel(error)}`); result.remaining++; }
  }
  return result;
}
