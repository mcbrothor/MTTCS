/**
 * FRED (Federal Reserve Economic Data) API 클라이언트
 *
 * 주요 시리즈:
 *   BAMLH0A0HYM2  — ICE BofA US High Yield OAS (FRED 원자료 %, 내부 bps)
 *   T5YIE         — 5-Year Breakeven Inflation Rate (%, 높을수록 경기 기대 좋음)
 *   DGS10         — 10-Year Treasury Constant Maturity Rate
 *   DGS2          — 2-Year Treasury Constant Maturity Rate
 *   DFII10        — 10-Year Treasury Inflation-Indexed Security, Constant Maturity
 *   DTWEXBGS      — Nominal Broad U.S. Dollar Index
 *
 * API 키: FRED_API_KEY (.env.local)
 */

import { fredApiKeyOptional } from '../env.ts';

export interface FredObservation {
  date: string;   // YYYY-MM-DD
  value: number;
}

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';
const FRED_CSV_BASE = 'https://fred.stlouisfed.org/graph/fredgraph.csv';

export function parseFredCsv(csv: string, limit: number): FredObservation[] {
  const rows = csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const [date, rawValue] = line.split(',');
      const normalizedValue = rawValue?.trim();
      return {
        date: date?.trim() || '',
        value:
          normalizedValue && normalizedValue !== '.'
            ? Number(normalizedValue)
            : Number.NaN,
      };
    })
    .filter((row) =>
      /^\d{4}-\d{2}-\d{2}$/.test(row.date)
      && Number.isFinite(row.value),
    );
  return rows.slice(-Math.max(1, limit));
}

async function getFredCsvSeries(seriesId: string, limit: number) {
  if (!/^[A-Z0-9_]+$/i.test(seriesId)) return [];
  try {
    const url = new URL(FRED_CSV_BASE);
    url.searchParams.set('id', seriesId);
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) return [];
    return parseFredCsv(await response.text(), limit);
  } catch {
    return [];
  }
}

/**
 * FRED 시리즈 최근 N개 관측값을 반환.
 * API 키가 없거나 JSON API 요청이 실패하면 공식 FRED CSV로 fallback.
 * 두 공식 경로가 모두 실패하면 빈 배열을 반환한다 (non-throwing).
 */
export async function getFredSeries(
  seriesId: string,
  limit = 30
): Promise<FredObservation[]> {
  const apiKey = fredApiKeyOptional();
  if (!apiKey) return getFredCsvSeries(seriesId, limit);

  try {
    const url = new URL(FRED_BASE);
    url.searchParams.set('series_id', seriesId);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('file_type', 'json');
    url.searchParams.set('sort_order', 'desc');
    url.searchParams.set('limit', String(limit));

    const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
    if (!res.ok) {
      console.warn(`FRED API ${seriesId} 응답 오류: ${res.status}`);
      return getFredCsvSeries(seriesId, limit);
    }

    const json = await res.json();
    const observations: { date: string; value: string }[] = json?.observations ?? [];

    return observations
      .filter((o) => o.value !== '.' && o.value !== '')
      .map((o) => ({ date: o.date, value: parseFloat(o.value) }))
      .filter((o) => Number.isFinite(o.value))
      .reverse(); // 최신 우선 → 오래된 순으로 정렬
  } catch (err) {
    console.warn(`FRED API ${seriesId} 요청 실패:`, err);
    return getFredCsvSeries(seriesId, limit);
  }
}

/** HY OAS (bps) 최근값 — 낮을수록 Risk-On */
export async function getHyOas(): Promise<FredObservation[]> {
  return (await getFredSeries('BAMLH0A0HYM2', 30)).map((row) => ({ ...row, value: percentToBasisPoints(row.value) }));
}

export function percentToBasisPoints(value: number) {
  return value * 100;
}

/** 5Y Breakeven Inflation (%) */
export async function get5yBreakeven(): Promise<FredObservation[]> {
  return getFredSeries('T5YIE', 30);
}

/** 10Y Treasury Rate (%) */
export async function getDgs10(): Promise<FredObservation[]> {
  return getFredSeries('DGS10', 30);
}

/** 2Y Treasury Rate (%) */
export async function getDgs2(): Promise<FredObservation[]> {
  return getFredSeries('DGS2', 30);
}

/** 3-Month Treasury Rate (%) — 현금 대기 수익률 백테스트 기준 */
export async function getDgs3mo(limit = 260): Promise<FredObservation[]> {
  return getFredSeries('DGS3MO', Math.max(30, limit));
}

/** 10Y TIPS 실질금리 (%) — 금 기회비용 신호 */
export async function getDfii10(limit = 260): Promise<FredObservation[]> {
  return getFredSeries('DFII10', Math.max(30, limit));
}

/** 광의 달러지수 (2006=100) — 금의 달러 역풍/순풍 신호 */
export async function getBroadDollarIndex(limit = 260): Promise<FredObservation[]> {
  return getFredSeries('DTWEXBGS', Math.max(30, limit));
}

/** Fed 총자산 WALCL (Millions) — 이미지 핵심 4·8주 절대변화 */
export async function getWalcl(limit = 60): Promise<FredObservation[]> {
  return getFredSeries('WALCL', Math.max(30, limit));
}

/** 재무부 일반계정 TGA WTREGEN (Millions) */
export async function getWtreGen(limit = 60): Promise<FredObservation[]> {
  return getFredSeries('WTREGEN', Math.max(30, limit));
}

/** O/N RRP RRPONTSYD (Billions) — FRED는 10억 단위, WALCL/WTREGEN과 단위 맞춤 필요 */
export async function getRrpontsyd(limit = 60): Promise<FredObservation[]> {
  return getFredSeries('RRPONTSYD', Math.max(30, limit));
}

/**
 * Net Liquidity = Fed Assets - TGA - RRP
 * WALCL(백만) - WTREGEN(백만) - RRPONTSYD(십억*1000)
 * 이미지: 절대값보다 4주+8주 변화 우선
 */
export function computeNetLiquidity(
  walcl: FredObservation[],
  tga: FredObservation[],
  rrp: FredObservation[],
): { observations: FredObservation[]; latest: number | null; change4w: number | null; change8w: number | null } {
  if (!walcl.length || !tga.length || !rrp.length) return { observations: [], latest: null, change4w: null, change8w: null };
  // 가장 최근 날짜 기준으로 세 시리즈 교집합 찾기 — 가장 짧은 시리즈 길이에 맞춤
  const byDate = new Map<string, { walcl?: number; tga?: number; rrp?: number }>();
  for (const r of walcl) byDate.set(r.date, { ...byDate.get(r.date), walcl: r.value });
  for (const r of tga) byDate.set(r.date, { ...byDate.get(r.date), tga: r.value });
  for (const r of rrp) {
    // RRPONTSYD는 Billions, 나머지는 Millions → *1000 변환
    byDate.set(r.date, { ...byDate.get(r.date), rrp: r.value * 1000 });
  }
  const obs: FredObservation[] = [];
  for (const [date, v] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (v.walcl !== undefined && v.tga !== undefined && v.rrp !== undefined) {
      obs.push({ date, value: v.walcl - v.tga - v.rrp });
    }
  }
  if (obs.length < 9) return { observations: obs, latest: obs.at(-1)?.value ?? null, change4w: null, change8w: null };
  const latest = obs.at(-1)!.value;
  // FRED WALCL은 주간이라 4주=4 obs, 8주=8 obs 근사
  const obs4wAgo = obs.length >= 5 ? obs[obs.length - 5].value : null;
  const obs8wAgo = obs.length >= 9 ? obs[obs.length - 9].value : null;
  return {
    observations: obs,
    latest,
    change4w: obs4wAgo !== null ? latest - obs4wAgo : null,
    change8w: obs8wAgo !== null ? latest - obs8wAgo : null,
  };
}

export function netLiquidityToScore(change4w: number | null, change8w: number | null, maxScore: number): number {
  if (change4w === null || change8w === null) return Math.round(maxScore * 0.5);
  const combined = change4w + change8w; // 이미지: 4주+8주 변화 우선
  // WALCL 단위 Millions → 100B = 100,000 Millions
  if (combined > 200_000) return maxScore; // +200B 이상 강한 유동성 증가
  if (combined > 50_000) return Math.round(maxScore * 0.7);
  if (combined > -50_000) return Math.round(maxScore * 0.4);
  if (combined > -200_000) return Math.round(maxScore * 0.15);
  return 0;
}

/**
 * HY OAS → 크레딧 점수 변환
 * OAS (basis points): 낮을수록 Risk-On
 *   < 300bps → 만점
 *   < 400bps → 70%
 *   < 500bps → 35%
 *   ≥ 500bps → 0
 */
export function hyOasToScore(oasBps: number, maxScore: number): number {
  if (oasBps < 300) return maxScore;
  if (oasBps < 400) return Math.round(maxScore * 0.7);
  if (oasBps < 500) return Math.round(maxScore * 0.35);
  return 0;
}

/**
 * HY OAS 20일 추세 방향 (음수 = 스프레드 축소 = Risk-On 호재)
 * 최신 값과 20일 전 값의 차이를 반환 (bps).
 */
export function hyOasTrend(observations: FredObservation[]): number | null {
  if (observations.length < 20) return null;
  const latestObs = observations.at(-1);
  const prev20Obs = observations[observations.length - 20];
  if (!latestObs || !prev20Obs) return null;
  return latestObs.value - prev20Obs.value; // 음수 = 축소 = 좋은 신호
}
