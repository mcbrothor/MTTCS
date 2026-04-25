/**
 * FRED (Federal Reserve Economic Data) API 클라이언트
 *
 * 주요 시리즈:
 *   BAMLH0A0HYM2  — ICE BofA US High Yield OAS (basis points, 낮을수록 Risk-On)
 *   T5YIE         — 5-Year Breakeven Inflation Rate (%, 높을수록 경기 기대 좋음)
 *   DGS10         — 10-Year Treasury Constant Maturity Rate
 *   DGS2          — 2-Year Treasury Constant Maturity Rate
 *
 * API 키: FRED_API_KEY (.env.local)
 */

import { fredApiKeyOptional } from '@/lib/env';

export interface FredObservation {
  date: string;   // YYYY-MM-DD
  value: number;
}

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

/**
 * FRED 시리즈 최근 N개 관측값을 반환.
 * API 키가 없거나 요청 실패 시 빈 배열 반환 (non-throwing).
 */
export async function getFredSeries(
  seriesId: string,
  limit = 30
): Promise<FredObservation[]> {
  const apiKey = fredApiKeyOptional();
  if (!apiKey) return [];

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
      return [];
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
    return [];
  }
}

/** HY OAS (bps) 최근값 — 낮을수록 Risk-On */
export async function getHyOas(): Promise<FredObservation[]> {
  return getFredSeries('BAMLH0A0HYM2', 30);
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
  const latest = observations.at(-1)!.value;
  const prev20 = observations[observations.length - 20].value;
  return latest - prev20; // 음수 = 축소 = 좋은 신호
}
