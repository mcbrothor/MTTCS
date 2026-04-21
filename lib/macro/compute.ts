export type MacroRegime = 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';

export interface MacroScoreBreakdown {
  label: string;
  weight: number;
  score: number;
  description: string;
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

// Component weights (total = 100)
const W_TREND = 25;
const W_CREDIT = 25;
const W_VOL = 15;
const W_DOLLAR_RATE = 15;
const W_ECON = 10;
const W_BREADTH = 10;

export function computeMacroScore(quotes: Record<string, QuoteData>): MacroComputeResult {
  const get = (sym: string) => quotes[sym] ?? quotes[sym.replace('^', '')] ?? null;

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

  // 1. 주가 추세 (25점) — SPY vs 50MA + 200MA
  let trendScore = 0;
  let spyAbove50ma = false;
  if (spy) {
    spyAbove50ma = spy.regularMarketPrice > spy.fiftyDayAverage;
    // SPY above 50MA: 15pt, 50MA trend direction (change% proxy): 10pt
    if (spyAbove50ma) trendScore += 15;
    if (spy.regularMarketChangePercent > 0) trendScore += 5;
    // Positive momentum adds remaining points
    if (spy.regularMarketChangePercent > 0.5) trendScore += 5;
  }
  trendScore = Math.min(trendScore, W_TREND);

  // 2. 크레딧 스프레드 (25점) — HYG outperforms IEF = Risk-On
  let creditScore = 0;
  let hygIefDiff = 0;
  if (hyg && ief) {
    hygIefDiff = hyg.regularMarketChangePercent - ief.regularMarketChangePercent;
    if (hygIefDiff > 0.5) creditScore = W_CREDIT;
    else if (hygIefDiff > 0) creditScore = Math.round(W_CREDIT * 0.7);
    else if (hygIefDiff > -0.5) creditScore = Math.round(W_CREDIT * 0.4);
    else creditScore = 0;
  }

  // 3. 변동성 (15점) — VIX 레벨
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

  // 4. 달러/금리 (15점) — DXY (UUP) weak + TLT not surging = Risk-On
  let dollarRateScore = 0;
  if (uup && tlt) {
    const uupAbove50 = uup.regularMarketPrice > uup.fiftyDayAverage;
    const tltAbove50 = tlt.regularMarketPrice > tlt.fiftyDayAverage;
    // Weak dollar (UUP below 50MA) = good for risk assets (+8)
    if (!uupAbove50) dollarRateScore += 8;
    else dollarRateScore += 3;
    // TLT not above 50MA (no flight-to-safety in bonds) = good (+7)
    if (!tltAbove50) dollarRateScore += 7;
    else dollarRateScore += 2;
  } else if (uup) {
    dollarRateScore = uup.regularMarketPrice <= uup.fiftyDayAverage ? Math.round(W_DOLLAR_RATE * 0.7) : Math.round(W_DOLLAR_RATE * 0.3);
  }
  dollarRateScore = Math.min(dollarRateScore, W_DOLLAR_RATE);

  // 5. 경기 민감도 (10점) — CPER outperforms GLD
  let econSensitivityScore = 0;
  if (cper && gld) {
    const diff = cper.regularMarketChangePercent - gld.regularMarketChangePercent;
    if (diff > 0.3) econSensitivityScore = W_ECON;
    else if (diff > 0) econSensitivityScore = Math.round(W_ECON * 0.6);
    else econSensitivityScore = 0;
  }

  // 6. 시장 폭 (10점) — IWM/SPY + RSP/SPY 평균
  let breadthScore = 0;
  if (iwm && spy && rsp) {
    const iwmSpyDiff = iwm.regularMarketChangePercent - spy.regularMarketChangePercent;
    const rspSpyDiff = rsp.regularMarketChangePercent - spy.regularMarketChangePercent;
    const avgBreadth = (iwmSpyDiff + rspSpyDiff) / 2;
    if (avgBreadth > 0.3) breadthScore = W_BREADTH;
    else if (avgBreadth > 0) breadthScore = Math.round(W_BREADTH * 0.6);
    else breadthScore = 0;
  }

  const macroScore = trendScore + creditScore + volatilityScore + dollarRateScore + econSensitivityScore + breadthScore;

  let regime: MacroRegime = 'NEUTRAL';
  if (macroScore >= RISK_ON_THRESHOLD) regime = 'RISK_ON';
  else if (macroScore < RISK_OFF_THRESHOLD) regime = 'RISK_OFF';

  const breakdown: MacroScoreBreakdown[] = [
    { label: '주가 추세', weight: W_TREND, score: trendScore, description: `SPY 50MA ${spyAbove50ma ? '위' : '아래'} · 일간 모멘텀` },
    { label: '크레딧 스프레드', weight: W_CREDIT, score: creditScore, description: `HYG/IEF 상대강도 ${hygIefDiff > 0 ? '+' : ''}${hygIefDiff.toFixed(2)}%p` },
    { label: '변동성', weight: W_VOL, score: volatilityScore, description: `VIX ${vixLevel.toFixed(1)}` },
    { label: '달러/금리', weight: W_DOLLAR_RATE, score: dollarRateScore, description: `DXY(UUP) + 장기금리(TLT) 방향` },
    { label: '경기 민감도', weight: W_ECON, score: econSensitivityScore, description: `구리(CPER) vs 금(GLD) 상대강도` },
    { label: '시장 폭', weight: W_BREADTH, score: breadthScore, description: `IWM/SPY + RSP/SPY 평균 상대강도` },
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
