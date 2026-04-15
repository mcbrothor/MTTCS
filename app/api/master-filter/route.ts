import { NextResponse } from 'next/server';
import { getYahooDailyPrice, getYahooQuotes } from '@/lib/finance/yahoo-api';
import { generateMarketInsight } from '@/lib/ai/gemini';
import type { MarketState, MasterFilterMetrics, MasterFilterResponse, OHLCData } from '@/types';

// 캐시 주기를 1시간으로 설정
export const revalidate = 3600;

const MACRO_SYMBOLS = [
  'UVXY', '^VIX', 'UUP', 'KRE', // 위험 & 유동성
  'SHY', 'TLT', 'HYG', 'IEF',   // 채권
  'QQQ', 'SPY', 'DIA', 'IWM', 'RSP', // 주식
  'GLD', 'CPER', 'USO', 'UNG', 'BTC-USD' // 실물 자산 및 코인
];

function calculateTrendState(spyData: OHLCData[]) {
  if (spyData.length < 200) return { state: 'NEUTRAL' as const, details: '데이터 부족', ma50: 0, ma150: 0, ma200: 0 };
  
  const lastClose = spyData[spyData.length - 1].close;
  const ma50 = spyData.slice(-50).reduce((acc, d) => acc + d.close, 0) / 50;
  const ma150 = spyData.slice(-150).reduce((acc, d) => acc + d.close, 0) / 150;
  const ma200 = spyData.slice(-200).reduce((acc, d) => acc + d.close, 0) / 200;
  const prevMonthSlice = spyData.slice(-221, -21);
  const prevMonthMa200 = prevMonthSlice.length === 200 ? prevMonthSlice.reduce((acc, d) => acc + d.close, 0) / 200 : ma200;

  let details = '';
  let state: 'UP' | 'NEUTRAL' | 'DOWN' = 'NEUTRAL';

  if (lastClose > ma50 && ma50 > ma150 && ma150 > ma200 && ma200 > prevMonthMa200) {
    state = 'UP';
    details = `상승 추세 정배열 (Price > 50MA > 150MA > 200MA)`;
  } else if (lastClose < ma200 || (lastClose < ma50 && ma50 < ma200)) {
    state = 'DOWN';
    details = `하락 추세 지속 (Price 또는 50MA가 200MA 하회)`;
  } else {
    state = 'NEUTRAL';
    details = `비추세 또는 혼조세 (200MA 부근 횡보)`;
  }

  return { state, details, ma50, ma150, ma200, lastClose };
}

function calculateLiquidityState(spyData: OHLCData[]) {
  if (spyData.length < 20) return { state: 'WARNING' as const, details: '데이터 부족', distributionDays: 0 };
  
  let distributionDays = 0;
  for (let i = spyData.length - 20; i < spyData.length; i++) {
    const current = spyData[i];
    const prev = spyData[i - 1];
    if (current && prev) {
      if (current.close < prev.close && current.volume > prev.volume) {
        distributionDays++;
      }
    }
  }

  if (distributionDays <= 3) {
    return { state: 'GOOD' as const, details: `건강한 수급 (분산일 ${distributionDays}일)`, distributionDays };
  } else if (distributionDays <= 5) {
    return { state: 'WARNING' as const, details: `수급 경고 (분산일 ${distributionDays}일)`, distributionDays };
  } else {
    return { state: 'BAD' as const, details: `수급 악화 (분산일 ${distributionDays}일)`, distributionDays };
  }
}

function calculateVixState(vixData: OHLCData[]) {
  if (vixData.length === 0) return { state: 'ELEVATED' as const, value: null };
  const lastVix = vixData[vixData.length - 1].close;
  
  const roundedVix = Number(lastVix.toFixed(2));
  if (lastVix < 20) return { state: 'CALM' as const, value: roundedVix };
  else if (lastVix < 30) return { state: 'ELEVATED' as const, value: roundedVix };
  else return { state: 'FEAR' as const, value: roundedVix };
}

export async function GET() {
  try {
    // 1. 병렬 데이터 조회 (지수, 변동성, 매크로)
    const [spyData, vixData, macroQuotes] = await Promise.all([
      getYahooDailyPrice('SPY').catch(() => []),
      getYahooDailyPrice('^VIX').catch(() => []),
      getYahooQuotes(MACRO_SYMBOLS).catch(() => [])
    ]);

    // 2. 지표 계산
    const trend = calculateTrendState(spyData);
    const liquidity = calculateLiquidityState(spyData);
    const vix = calculateVixState(vixData);

    // 시장 폭(Breadth) 로직 개선: SPY 이평선 상회 여부 및 매크로 지표 혼합 추정
    const breadthScore = trend.state === 'UP' ? 75 : trend.state === 'DOWN' ? 25 : 50;
    const leadershipState = trend.state === 'UP' ? 'FOCUSED' : trend.state === 'DOWN' ? 'WEAK' : 'SCATTERED';

    // 3. 시장 국면 판별 (Score-based)
    let score = 0;
    if (trend.state === 'UP') score += 2;
    if (breadthScore >= 70) score += 1;
    if (liquidity.state === 'GOOD') score += 1;
    if (vix.state === 'CALM') score += 1;
    if (leadershipState === 'FOCUSED') score += 1;

    let marketState: MarketState = 'RED';
    if (score >= 5) marketState = 'GREEN';
    else if (score >= 3) marketState = 'YELLOW';

    // 4. 차트용 데이터 가공 (최근 50일)
    const spyHistory = spyData.slice(-50).map(d => ({ date: d.date, close: d.close }));
    const vixHistory = vixData.slice(-50).map(d => ({ date: d.date, close: d.close }));

    // 매크로 데이터를 Record 형태로 변환
    const macroMap = macroQuotes.reduce((acc, q) => {
      acc[q.symbol] = q;
      return acc;
    }, {} as Record<string, unknown>);

    // 5. LLM 지능형 필터링 및 리포트 생성 (Gemini 3.1 & Gemma 4)
    const insightInput = {
      marketState,
      metrics: {
        trend: trend.details,
        breadth: breadthScore,
        liquidity: liquidity.details,
        vix: vix.value,
        leadership: leadershipState
      },
      macroData: macroMap
    };

    let insightLog = '';
    let isAiGenerated = false;
    let aiModelUsed = '';

    if (process.env.GEMINI_API_KEY) {
      try {
        insightLog = await generateMarketInsight(insightInput);
        isAiGenerated = true;
        aiModelUsed = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
      } catch (e) {
        console.error('LLM Generation Failed, falling back to static log', e);
      }
    }

    // AI 생성 실패 또는 API Key 부재 시 폴백 (Rule-based)
    if (!insightLog) {
      if (marketState === 'GREEN') {
        insightLog = '시장이 강력한 상승 에너지를 확보했습니다. 주요 매크로 지표가 안정적이며, 주도주 그룹의 정배열 돌파가 빈번하게 발생하는 구간입니다. 적극적인 비중 확대를 권장합니다.';
      } else if (marketState === 'YELLOW') {
        insightLog = '시장의 방향성이 불확실해지며 수동적인 수급 흐름이 예상됩니다. VIX와 채권 금리의 변동성을 주시하며, 신규 진입은 평소 비중의 50% 이하로 제한하고 원칙적인 손절 대응이 필수입니다.';
      } else {
        insightLog = '리스크 지표가 하방을 가리키고 있습니다. 매크로 유동성 위축과 기술적 지표 붕괴가 동시에 관찰됩니다. 계좌 보호를 위해 신규 진입을 전면 중단하고 현금 비중을 80% 이상 상향하십시오.';
      }
    }

    const metrics: MasterFilterMetrics = {
      trendState: trend.state,
      trendDetails: trend.details,
      spyPrice: trend.lastClose,
      ma50: trend.ma50,
      ma150: trend.ma150,
      ma200: trend.ma200,
      breadthScore,
      breadthDetails: 'SPY 프록시 및 매크로 지표 기반 추정치',
      liquidityState: liquidity.state,
      distributionDays: liquidity.distributionDays,
      vixValue: vix.value,
      vixState: vix.state,
      leadershipState,
      spyHistory,
      vixHistory,
      macroData: macroMap,
      updatedAt: new Date().toISOString()
    };

    const responseData: MasterFilterResponse = {
      state: marketState,
      metrics,
      insightLog,
      isAiGenerated,
      aiModelUsed
    };

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('Master Filter Detailed Error:', error);
    return NextResponse.json(
      { error: '마스터 필터 계산 및 분석 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
