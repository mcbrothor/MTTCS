import type { OHLCData } from '@/types';
import type { FredObservation } from '@/lib/data/fred';
import { hyOasToScore, hyOasTrend } from '@/lib/data/fred';

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
 * SPY Trend 컴포넌트 제거됨 — Master Filter와 중복 가중을 방지.
 * 매크로는 equity trend가 아닌 risk-asset 외 자산군(채권·통화·원자재)에서 신호를 추출한다.
 *
 * 최종 가중치 (Wave 2 확정):
 * Credit 25 + VOL 20 + Dollar/Rate 20 + Yield Curve 15 + Econ 10 + Breadth 10 = 100
 */
const W_CREDIT = 25;        // 크레딧 스프레드 (HYG/IEF 20일 롤링 기울기)
const W_VOL = 20;           // 변동성 (VIX 레벨)
const W_DOLLAR_RATE = 20;   // 달러/금리 (UUP + TLT 50MA 방향)
const W_YIELD_CURVE = 15;   // 수익률 곡선 (10Y-2Y 스프레드, ^TNX - ^IRX)
const W_ECON = 10;          // 경기 민감도 (CPER/GLD 20일 롤링 기울기)
const W_BREADTH = 10;       // 시장 폭 (IWM/SPY 5일 상대 모멘텀)

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
  const trendScore = 0; // SPY trend 컴포넌트 제거됨 — Wave 2에서 yield curve로 대체 예정

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
    const latest = fredData.hyOas.at(-1)!;
    fredHyOasValue = latest.value;
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

  // 3. 달러/금리 (20점) — DXY(UUP) weak + TLT not surging = Risk-On
  let dollarRateScore = 0;
  if (uup && tlt) {
    const uupAbove50 = uup.regularMarketPrice > uup.fiftyDayAverage;
    const tltAbove50 = tlt.regularMarketPrice > tlt.fiftyDayAverage;
    if (!uupAbove50) dollarRateScore += 11;
    else dollarRateScore += 4;
    if (!tltAbove50) dollarRateScore += 9;
    else dollarRateScore += 3;
  } else if (uup) {
    dollarRateScore = uup.regularMarketPrice <= uup.fiftyDayAverage
      ? Math.round(W_DOLLAR_RATE * 0.7)
      : Math.round(W_DOLLAR_RATE * 0.3);
  }
  dollarRateScore = Math.min(dollarRateScore, W_DOLLAR_RATE);

  // 4. 수익률 곡선 (15점) — 10Y(^TNX) - 2Y(^IRX) 스프레드
  // 정상 곡선(양수 스프레드) = Risk-On, 역전(음수) = Risk-Off 신호
  let yieldCurveScore = 0;
  const tnx = get('^TNX');
  const irx = get('^IRX');
  let yieldSpread: number | null = null;
  if (tnx && irx) {
    // Yahoo에서 ^TNX, ^IRX는 % 단위로 반환 (e.g. 4.25 = 4.25%)
    yieldSpread = tnx.regularMarketPrice - irx.regularMarketPrice;
    if (yieldSpread > 1.0) yieldCurveScore = W_YIELD_CURVE;          // 정상: 스프레드 충분
    else if (yieldSpread > 0) yieldCurveScore = Math.round(W_YIELD_CURVE * 0.65);  // 완만한 정상
    else if (yieldSpread > -0.5) yieldCurveScore = Math.round(W_YIELD_CURVE * 0.25); // 미미한 역전
    else yieldCurveScore = 0;                                          // 명백한 역전 = Risk-Off
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

  const macroScore = creditScore + volatilityScore + dollarRateScore + yieldCurveScore + econSensitivityScore + breadthScore;

  let regime: MacroRegime = 'NEUTRAL';
  if (macroScore >= RISK_ON_THRESHOLD) regime = 'RISK_ON';
  else if (macroScore < RISK_OFF_THRESHOLD) regime = 'RISK_OFF';

  const avgBreadthVal = (iwm && spy && rsp)
    ? ((iwm.regularMarketChangePercent - spy.regularMarketChangePercent) + (rsp.regularMarketChangePercent - spy.regularMarketChangePercent)) / 2
    : null;
  const econDiff = (cper && gld) ? cper.regularMarketChangePercent - gld.regularMarketChangePercent : null;

  const breakdown: MacroScoreBreakdown[] = [
    {
      label: '크레딧 스프레드', weight: W_CREDIT, score: creditScore,
      description: fredHyOasValue !== null
        ? `FRED HY OAS ${fredHyOasValue.toFixed(0)}bps${fredHyOasTrendVal !== null ? ` · 20일 추세 ${fredHyOasTrendVal >= 0 ? '+' : ''}${fredHyOasTrendVal.toFixed(0)}bps` : ''}`
        : `HYG/IEF 20일 비율 추세 (일간 참조: ${hygIefDiff >= 0 ? '+' : ''}${hygIefDiff.toFixed(2)}%p)`,
      rawValue: fredHyOasValue !== null
        ? `FRED BAMLH0A0HYM2 ${fredHyOasValue.toFixed(0)}bps`
        : `HYG/IEF 20일 슬로프 기반`,
      threshold: fredHyOasValue !== null
        ? '<300bps 만점 · <400bps 70% · <500bps 35% · ≥500bps 0 + 20일 추세 보정 (총 25점)'
        : '20일 기울기 >+1.5% 만점 · >0 부분 · 음수 0 (총 25점)',
    },
    {
      label: '변동성', weight: W_VOL, score: volatilityScore,
      description: `VIX ${vixLevel.toFixed(1)}`,
      rawValue: `VIX ${vixLevel.toFixed(1)}`,
      threshold: '<15 만점 · <20 +16 · <25 +10 · <30 +5 · 이상 0 (총 20점)',
    },
    {
      label: '달러/금리', weight: W_DOLLAR_RATE, score: dollarRateScore,
      description: `DXY(UUP) + 장기금리(TLT) 50MA 방향`,
      rawValue: uup && tlt
        ? `UUP 50MA ${uup.regularMarketPrice > uup.fiftyDayAverage ? '상회' : '하회'} · TLT 50MA ${tlt.regularMarketPrice > tlt.fiftyDayAverage ? '상회' : '하회'}`
        : '데이터 없음',
      threshold: 'UUP 50MA 하회 +11 · 상회 +4 | TLT 50MA 하회 +9 · 상회 +3 (총 20점)',
    },
    {
      label: '수익률 곡선', weight: W_YIELD_CURVE, score: yieldCurveScore,
      description: `10Y−2Y 스프레드${yieldSpread !== null ? ` ${yieldSpread >= 0 ? '+' : ''}${yieldSpread.toFixed(2)}%p` : ' (데이터 없음)'}`,
      rawValue: yieldSpread !== null ? `10Y(${tnx?.regularMarketPrice.toFixed(2)}%) − 2Y(${irx?.regularMarketPrice.toFixed(2)}%) = ${yieldSpread.toFixed(2)}%p` : '데이터 없음',
      threshold: '>+1%p 만점 · >0 +10 · >−0.5% +4 · 역전 0 (총 15점)',
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
