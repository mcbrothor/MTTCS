import type { OHLCData } from '../../types/index.ts';
import type { FredObservation } from '../data/fred.ts';
import { computeNetLiquidity, hyOasToScore, hyOasTrend, netLiquidityToScore } from '../data/fred.ts';

export type MacroRegime = 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';

export interface MacroScoreBreakdown {
  label: string;
  weight: number;
  score: number;
  description: string;
  rawValue: string;
  threshold: string;
}

export interface MacroComputeResult {
  macroScore: number;
  regime: MacroRegime;
  breakdown: MacroScoreBreakdown[];
  spyAbove50ma: boolean;
  hygIefDiff: number;
  vixLevel: number;
  componentScores: {
    trendScore: number;
    liquidityScore: number;
    creditScore: number;
    volatilityScore: number;
    dollarRateScore: number;
    yieldCurveScore: number;
    econSensitivityScore: number;
    breadthScore: number;
  };
}

interface QuoteData {
  regularMarketPrice: number;
  regularMarketChangePercent: number;
  fiftyDayAverage: number;
}

// Thresholds — kept as named constants for future backtesting adjustment
const RISK_ON_THRESHOLD = 70;
const RISK_OFF_THRESHOLD = 45;

/**
 * Component weights (total = 100)
 *
 * 이미지 가이드: Net Liquidity 1순위 절대 4·8주 변화 우선
 * SPY Trend 제거 — Master Filter 중복 방지
 *
 * Wave 3 (Net Liquidity 도입):
 * Liquidity 20 + Credit 20 + VOL 15 + Dollar/Rate 15 + Yield Curve 10 + Econ 10 + Breadth 10 = 100
 */
const W_LIQUIDITY = 20;     // Net Liquidity (WALCL-TGA-RRP) 4주+8주 절대변화 — 1순위
const W_CREDIT = 20;        // 크레딧 스프레드 (HYG/IEF)
const W_VOL = 15;           // 변동성 (VIX)
const W_DOLLAR_RATE = 15;   // 달러/금리 (UUP+TLT+DXY 4주 추세)
const W_YIELD_CURVE = 10;   // 수익률 곡선 (10Y-2Y)
const W_ECON = 10;          // 경기 민감도 (CPER/GLD)
const W_BREADTH = 10;       // 시장 폭 (IWM/SPY)

// ─── 롤링 계산 헬퍼 ────────────────────────────────────────────────────────

/**
 * 두 자산 비율(numerator/denominator)의 N일 슬로프를 % 변화율로 반환.
 * 양수 = 비율 상승(Risk-On), 음수 = 비율 하락(Risk-Off).
 */
function rollingRatioSlope(
  numerator: OHLCData[],
  denominator: OHLCData[],
  days: number
): number | null {
  const len = Math.min(numerator.length, denominator.length);
  if (len < days) return null;
  const n = numerator.slice(-days);
  const d = denominator.slice(-days);
  const ratioStart = n[0].close / d[0].close;
  const ratioEnd = n[n.length - 1].close / d[d.length - 1].close;
  if (ratioStart === 0) return null;
  return ((ratioEnd - ratioStart) / ratioStart) * 100;
}

/**
 * 단일 자산의 N일 수익률(%)을 반환.
 */
function nDayReturn(data: OHLCData[], days: number): number | null {
  if (data.length < days + 1) return null;
  const start = data[data.length - days - 1].close;
  const end = data[data.length - 1].close;
  if (start === 0) return null;
  return ((end - start) / start) * 100;
}

interface FredInputData {
  hyOas?: FredObservation[];
  breakeven5y?: FredObservation[];
  dgs10?: FredObservation[];
  dgs2?: FredObservation[];
  dfii10?: FredObservation[];
  walcl?: FredObservation[];
  wtreGen?: FredObservation[];
  rrpontsyd?: FredObservation[];
}

export function computeMacroScore(
  quotes: Record<string, QuoteData>,
  histories?: Record<string, OHLCData[]>,
  fredData?: FredInputData
): MacroComputeResult {
  const get = (sym: string) => quotes[sym] ?? quotes[sym.replace('^', '')] ?? null;

  // SPY는 하위 호환을 위해 여전히 읽되, 점수 계산에는 사용하지 않는다.
  const spy = get('SPY');
  const hyg = get('HYG');
  const ief = get('IEF');
  const vixQuote = get('^VIX') ?? get('UVXY');
  const uup = get('UUP');
  const tlt = get('TLT');
  const cper = get('CPER');
  const gld = get('GLD');
  const iwm = get('IWM');
  const rsp = get('RSP');

  // SPY 50MA 여부: 하위 호환용 필드. 점수에는 미사용.
  const spyAbove50ma = spy ? spy.regularMarketPrice > spy.fiftyDayAverage : false;
  const trendScore = 0; // SPY trend 제거 — liquidity로 대체

  // 0. Net Liquidity (20점) — 1순위 절대 4주+8주 변화 (이미지 가이드)
  let liquidityScore = 0;
  let netLiquidityLatest: number | null = null;
  let netLiquidityChange4w: number | null = null;
  let netLiquidityChange8w: number | null = null;
  if (fredData?.walcl && fredData?.wtreGen && fredData?.rrpontsyd) {
    const nl = computeNetLiquidity(fredData.walcl, fredData.wtreGen, fredData.rrpontsyd);
    netLiquidityLatest = nl.latest;
    netLiquidityChange4w = nl.change4w;
    netLiquidityChange8w = nl.change8w;
    liquidityScore = netLiquidityToScore(nl.change4w, nl.change8w, W_LIQUIDITY);
  } else {
    // 데이터 부족 시 중립 50%
    liquidityScore = Math.round(W_LIQUIDITY * 0.5);
  }

  // 1. 크레딧 스프레드 (25점)
  // 우선순위: FRED HY OAS(직접 스프레드) > HYG/IEF 20일 롤링 기울기 > 일간 fallback
  let creditScore = 0;
  let hygIefDiff = 0;
  let fredHyOasValue: number | null = null;
  let fredHyOasTrendVal: number | null = null;

  // 하위 호환: hygIefDiff는 일간 차이 유지 (UI 표시용)
  if (hyg && ief) {
    hygIefDiff = hyg.regularMarketChangePercent - ief.regularMarketChangePercent;
  }

  // FRED HY OAS 사용 (가장 정확한 크레딧 신호)
  if (fredData?.hyOas && fredData.hyOas.length > 0) {
    const latestObs = fredData.hyOas.at(-1);
    if (latestObs) {
      fredHyOasValue = latestObs.value;
      fredHyOasTrendVal = hyOasTrend(fredData.hyOas);
      // OAS 레벨로 기본 점수 (낮을수록 Risk-On)
      const levelScore = hyOasToScore(fredHyOasValue, W_CREDIT);
      // 20일 추세 보정: 스프레드 축소(음수) = Risk-On 호재
      let trendBonus = 0;
      if (fredHyOasTrendVal !== null) {
        if (fredHyOasTrendVal < -30) trendBonus = Math.round(W_CREDIT * 0.15);   // 축소 강함
        else if (fredHyOasTrendVal < 0) trendBonus = Math.round(W_CREDIT * 0.05); // 소폭 축소
        else if (fredHyOasTrendVal > 30) trendBonus = -Math.round(W_CREDIT * 0.15); // 확대 강함
      }
      creditScore = Math.min(W_CREDIT, Math.max(0, levelScore + trendBonus));
    }
  } else if (histories?.HYG && histories?.IEF) {
    const slope = rollingRatioSlope(histories.HYG, histories.IEF, 20);
    if (slope !== null) {
      if (slope > 1.5) creditScore = W_CREDIT;
      else if (slope > 0) creditScore = Math.round(W_CREDIT * 0.7);
      else if (slope > -1.5) creditScore = Math.round(W_CREDIT * 0.35);
      else creditScore = 0;
    } else if (hyg && ief) {
      // 히스토리 부족 시 일간 fallback
      if (hygIefDiff > 0.5) creditScore = W_CREDIT;
      else if (hygIefDiff > 0) creditScore = Math.round(W_CREDIT * 0.7);
      else if (hygIefDiff > -0.5) creditScore = Math.round(W_CREDIT * 0.4);
    }
  } else if (hyg && ief) {
    if (hygIefDiff > 0.5) creditScore = W_CREDIT;
    else if (hygIefDiff > 0) creditScore = Math.round(W_CREDIT * 0.7);
    else if (hygIefDiff > -0.5) creditScore = Math.round(W_CREDIT * 0.4);
  }

  // 2. 변동성 (20점) — VIX 레벨
  let vixLevel = 20;
  let volatilityScore = 0;
  if (vixQuote) {
    vixLevel = vixQuote.regularMarketPrice;
    if (vixLevel < 15) volatilityScore = W_VOL;
    else if (vixLevel < 20) volatilityScore = Math.round(W_VOL * 0.8);
    else if (vixLevel < 25) volatilityScore = Math.round(W_VOL * 0.5);
    else if (vixLevel < 30) volatilityScore = Math.round(W_VOL * 0.25);
    else volatilityScore = 0;
  }

  // 3. 달러/금리 (15점) — DXY 4주 추세 + UUP/TLT 50MA (이미지: DXY 4주)
  let dollarRateScore = 0;
  const dxyHistory = (histories as Record<string, OHLCData[]>)?.['DX-Y.NYB'] || (histories as Record<string, OHLCData[]>)?.['DXY'] || null;
  const dxyQuote = get('DX-Y.NYB') || get('DXY');
  let dxyChange4w: number | null = null;
  if (dxyHistory && dxyHistory.length >= 20) dxyChange4w = nDayReturn(dxyHistory, 20);
  else if (dxyQuote) dxyChange4w = null; // quote만으론 4주 산출 불가
  if (uup && tlt) {
    const uupAbove50 = uup.regularMarketPrice > uup.fiftyDayAverage;
    const tltAbove50 = tlt.regularMarketPrice > tlt.fiftyDayAverage;
    if (!uupAbove50) dollarRateScore += 7;
    else dollarRateScore += 2;
    if (!tltAbove50) dollarRateScore += 5;
    else dollarRateScore += 2;
    // DXY 4주 하락 = 유동성 우호
    if (dxyChange4w !== null) {
      if (dxyChange4w < -1.5) dollarRateScore += 3;
      else if (dxyChange4w < 0) dollarRateScore += 1;
      else if (dxyChange4w > 1.5) dollarRateScore = Math.max(0, dollarRateScore - 2);
    } else {
      dollarRateScore += 1; // 데이터 없으면 중립 보정
    }
  } else if (uup) {
    dollarRateScore = uup.regularMarketPrice <= uup.fiftyDayAverage
      ? Math.round(W_DOLLAR_RATE * 0.6)
      : Math.round(W_DOLLAR_RATE * 0.3);
    if (dxyChange4w !== null && dxyChange4w < -1) dollarRateScore += 2;
  }
  dollarRateScore = Math.min(dollarRateScore, W_DOLLAR_RATE);

  // 4. 수익률 곡선 (10점) — 스프레드(6) + 10Y 실질금리·국채 4주 변화(4) (이미지 2·3·4·5순위)
  let yieldCurveScore = 0;
  const dgs10 = fredData?.dgs10?.at(-1)?.value ?? null;
  const dgs2 = fredData?.dgs2?.at(-1)?.value ?? null;
  const dfii10Series = fredData?.dfii10 || [];
  let yieldSpread: number | null = null;
  let realRateChange4w: number | null = null;
  if (dfii10Series.length >= 21) {
    const latest = dfii10Series.at(-1)!.value;
    const prev = dfii10Series[dfii10Series.length - 21].value;
    realRateChange4w = latest - prev;
  }
  if (dgs10 !== null && dgs2 !== null) {
    yieldSpread = dgs10 - dgs2;
    let spreadScore = 0;
    if (yieldSpread > 1.0) spreadScore = 6;
    else if (yieldSpread > 0) spreadScore = 4;
    else if (yieldSpread > -0.5) spreadScore = 2;
    else spreadScore = 0;
    let realScore = 2; // 중립
    if (realRateChange4w !== null) {
      if (realRateChange4w < -0.2) realScore = 4; // 실질금리 하락 = 우호
      else if (realRateChange4w < 0) realScore = 3;
      else if (realRateChange4w > 0.2) realScore = 0; // 상승 = 부담
      else if (realRateChange4w > 0) realScore = 1;
    }
    yieldCurveScore = spreadScore + realScore;
  } else if (realRateChange4w !== null) {
    yieldCurveScore = realRateChange4w < -0.1 ? 6 : realRateChange4w < 0 ? 4 : 2;
  }

  // 5Y 브레이크이븐 인플레이션 (표시용, 점수에는 미영향 — 경기 기대 참고치)
  const breakeven5yLatest = fredData?.breakeven5y?.at(-1)?.value ?? null;

  // 5. 경기 민감도 (10점) — CPER/GLD 20일 롤링 기울기
  let econSensitivityScore = 0;
  if (histories?.CPER && histories?.GLD) {
    const slope = rollingRatioSlope(histories.CPER, histories.GLD, 20);
    if (slope !== null) {
      if (slope > 1.5) econSensitivityScore = W_ECON;
      else if (slope > 0) econSensitivityScore = Math.round(W_ECON * 0.6);
      else econSensitivityScore = 0;
    } else if (cper && gld) {
      // 히스토리 부족 시 일간 fallback
      const diff = cper.regularMarketChangePercent - gld.regularMarketChangePercent;
      if (diff > 0.3) econSensitivityScore = W_ECON;
      else if (diff > 0) econSensitivityScore = Math.round(W_ECON * 0.6);
    }
  } else if (cper && gld) {
    const diff = cper.regularMarketChangePercent - gld.regularMarketChangePercent;
    if (diff > 0.3) econSensitivityScore = W_ECON;
    else if (diff > 0) econSensitivityScore = Math.round(W_ECON * 0.6);
  }

  // 6. 시장 폭 (10점) — IWM/SPY 5일 상대 모멘텀
  let breadthScore = 0;
  if (histories?.IWM && histories?.SPY) {
    const iwmRet5 = nDayReturn(histories.IWM, 5);
    const spyRet5 = nDayReturn(histories.SPY, 5);
    if (iwmRet5 !== null && spyRet5 !== null) {
      const relPerf = iwmRet5 - spyRet5;
      if (relPerf > 0.5) breadthScore = W_BREADTH;
      else if (relPerf > 0) breadthScore = Math.round(W_BREADTH * 0.6);
      else breadthScore = 0;
    }
  } else if (iwm && spy && rsp) {
    // 히스토리 부족 시 일간 fallback
    const iwmSpyDiff = iwm.regularMarketChangePercent - spy.regularMarketChangePercent;
    const rspSpyDiff = rsp.regularMarketChangePercent - spy.regularMarketChangePercent;
    const avgBreadth = (iwmSpyDiff + rspSpyDiff) / 2;
    if (avgBreadth > 0.3) breadthScore = W_BREADTH;
    else if (avgBreadth > 0) breadthScore = Math.round(W_BREADTH * 0.6);
  }

  const macroScore = liquidityScore + creditScore + volatilityScore + dollarRateScore + yieldCurveScore + econSensitivityScore + breadthScore;

  let regime: MacroRegime = 'NEUTRAL';
  if (macroScore >= RISK_ON_THRESHOLD) regime = 'RISK_ON';
  else if (macroScore < RISK_OFF_THRESHOLD) regime = 'RISK_OFF';

  const avgBreadthVal = (iwm && spy && rsp)
    ? ((iwm.regularMarketChangePercent - spy.regularMarketChangePercent) + (rsp.regularMarketChangePercent - spy.regularMarketChangePercent)) / 2
    : null;
  const econDiff = (cper && gld) ? cper.regularMarketChangePercent - gld.regularMarketChangePercent : null;

  const breakdown: MacroScoreBreakdown[] = [
    {
      label: 'Net Liquidity', weight: W_LIQUIDITY, score: liquidityScore,
      description: netLiquidityLatest !== null
        ? `Net Liquidity ${Math.round(netLiquidityLatest/1000).toLocaleString()}B · 4주 ${netLiquidityChange4w !== null ? `${netLiquidityChange4w>0?'+':''}${Math.round(netLiquidityChange4w/1000)}B` : 'n/a'} + 8주 ${netLiquidityChange8w !== null ? `${netLiquidityChange8w>0?'+':''}${Math.round(netLiquidityChange8w/1000)}B` : 'n/a'}`
        : 'WALCL/TGA/RRP 데이터 없음',
      rawValue: netLiquidityLatest !== null ? `Fed Assets-WALCL - TGA-WTREGEN - RRP-RRPONTSYD = ${Math.round(netLiquidityLatest/1000).toLocaleString()}B` : '데이터 없음',
      threshold: '+200B 만점 · >+50B 70% · >-50B 40% · >-200B 15% · 이하 0 (총 20점) · 절대 4주+8주 변화 우선',
    },
    {
      label: '크레딧 스프레드', weight: W_CREDIT, score: creditScore,
      description: fredHyOasValue !== null
        ? `FRED HY OAS ${fredHyOasValue.toFixed(0)}bps${fredHyOasTrendVal !== null ? ` · 20일 추세 ${fredHyOasTrendVal >= 0 ? '+' : ''}${fredHyOasTrendVal.toFixed(0)}bps` : ''}`
        : `HYG/IEF 20일 비율 추세 (일간 참조: ${hygIefDiff >= 0 ? '+' : ''}${hygIefDiff.toFixed(2)}%p)`,
      rawValue: fredHyOasValue !== null
        ? `FRED BAMLH0A0HYM2 ${fredHyOasValue.toFixed(0)}bps`
        : `HYG/IEF 20일 슬로프 기반`,
      threshold: fredHyOasValue !== null
        ? '<300bps 만점 · <400bps 70% · <500bps 35% · ≥500bps 0 + 20일 추세 보정 (총 20점)'
        : '20일 기울기 >+1.5% 만점 · >0 부분 · 음수 0 (총 20점)',
    },
    {
      label: '변동성', weight: W_VOL, score: volatilityScore,
      description: `VIX ${vixLevel.toFixed(1)}`,
      rawValue: `VIX ${vixLevel.toFixed(1)}`,
      threshold: '<15 만점 · <20 +12 · <25 +8 · <30 +4 · 이상 0 (총 15점)',
    },
    {
      label: '달러/금리', weight: W_DOLLAR_RATE, score: dollarRateScore,
      description: `DXY ${dxyChange4w !== null ? `${dxyChange4w>0?'+':''}${dxyChange4w.toFixed(1)}% 4주` : 'n/a'} + UUP/TLT 50MA`,
      rawValue: uup && tlt
        ? `UUP 50MA ${uup.regularMarketPrice > uup.fiftyDayAverage ? '상회' : '하회'} · TLT 50MA ${tlt.regularMarketPrice > tlt.fiftyDayAverage ? '상회' : '하회'}${dxyQuote ? ` · DXY ${dxyQuote.regularMarketPrice.toFixed(1)}` : ''}`
        : '데이터 없음',
      threshold: 'UUP 하회 +7/+2 | TLT 하회 +5/+2 + DXY 4주 -1.5% +3 / -0% +1 (총 15점) · DXY 4주 추세 이미지 1순위 보조',
    },
    {
      label: '수익률 곡선', weight: W_YIELD_CURVE, score: yieldCurveScore,
      description: `10Y−2Y ${yieldSpread !== null ? `${yieldSpread>=0?'+':''}${yieldSpread.toFixed(2)}%p` : 'n/a'} · 실질금리 4주 ${realRateChange4w !== null ? `${realRateChange4w>0?'+':''}${realRateChange4w.toFixed(2)}%p` : 'n/a'}`,
      rawValue: yieldSpread !== null ? `DGS10(${dgs10?.toFixed(2)}%) − DGS2(${dgs2?.toFixed(2)}%) = ${yieldSpread.toFixed(2)}%p` : 'FRED DGS10/DGS2 데이터 없음',
      threshold: '스프레드 6점(>+1 +6 · >0 +4 · >-0.5 +2) + 실질금리 4주 4점(하락 -0.2% +4) (총 10점) · 이미지 2·3·4·5순위',
    },
    {
      label: '경기 민감도', weight: W_ECON, score: econSensitivityScore,
      description: `구리(CPER)/금(GLD) 20일 비율 추세${breakeven5yLatest !== null ? ` · 5Y 인플레이션 기대 ${breakeven5yLatest.toFixed(2)}%` : ''}`,
      rawValue: econDiff !== null ? `CPER−GLD 일간 ${econDiff >= 0 ? '+' : ''}${econDiff.toFixed(2)}%p (20일 슬로프 기반)` : '데이터 없음',
      threshold: '20일 기울기 >+1.5% 만점 · >0 부분 · 음수 0 (총 10점)',
    },
    {
      label: '시장 폭', weight: W_BREADTH, score: breadthScore,
      description: `IWM vs SPY 5일 상대 모멘텀`,
      rawValue: avgBreadthVal !== null ? `IWM·RSP vs SPY 일간 평균 ${avgBreadthVal >= 0 ? '+' : ''}${avgBreadthVal.toFixed(2)}%p` : '데이터 없음',
      threshold: 'IWM 5일 상대강도 >+0.5% 만점 · >0 부분 · 이하 0 (총 10점)',
    },
  ];

  return {
    macroScore,
    regime,
    breakdown,
    spyAbove50ma,
    hygIefDiff,
    vixLevel,
    componentScores: {
      trendScore,
      liquidityScore,
      creditScore,
      volatilityScore,
      dollarRateScore,
      yieldCurveScore,
      econSensitivityScore,
      breadthScore,
    },
  };
}

export function regimeToMarketState(regime: MacroRegime): 'GREEN' | 'YELLOW' | 'RED' {
  if (regime === 'RISK_ON') return 'GREEN';
  if (regime === 'RISK_OFF') return 'RED';
  return 'YELLOW';
}
