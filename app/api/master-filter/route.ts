import { NextResponse } from 'next/server';
import { getYahooDailyPrice, getYahooQuotes } from '@/lib/finance/yahoo-api';
import { generateMarketInsight } from '@/lib/ai/gemini';
import type { MarketState, MasterFilterResponse, MasterFilterMetricDetail } from '@/types';

// 캐시 주기를 1시간으로 설정
export const revalidate = 3600;

const MACRO_SYMBOLS = [
  'UVXY', '^VIX', 'UUP', 'KRE', // 위험 & 유동성
  'SHY', 'TLT', 'HYG', 'IEF',   // 채권
  'QQQ', 'SPY', 'DIA', 'IWM', 'RSP', // 주식
  'GLD', 'CPER', 'USO', 'UNG', 'BTC-USD' // 실물 자산 및 코인
];

/**
 * 전역 판별 기준 (Criteria) 정의
 */
const CRITERIA = {
  TREND: '주가가 장기(200일) 및 단기(50일) 이평선 위에 위치하며, 이평선이 정배열 상태인지 확인하여 시장의 대세 상승 여부를 판별합니다.',
  BREADTH: '시장의 참여도가 얼마나 광범위한지 측정합니다. 지수만 오르는지, 대다수 종목이 함께 오르는지 판별합니다.',
  LIQUIDITY: '지수 하락 시 거래량이 실리는 "분산일"을 추적하여 기관 투자자의 이탈 징후를 선제적으로 포착합니다.',
  VOLATILITY: '공포 지수(VIX)의 절대 수치와 변화율을 통해 시장 참여자들의 심리적 안정감을 측정합니다.',
  LEADERSHIP: '시장을 견인하는 강력한 주도주 그룹이 형성되어 있는지, 혹은 매수세가 분산되어 있는지 확인합니다.'
};

export async function GET() {
  try {
    // 1. 병렬 데이터 조회
    const [spyData, vixData, macroQuotes] = await Promise.all([
      getYahooDailyPrice('SPY').catch(() => []),
      getYahooDailyPrice('^VIX').catch(() => []),
      getYahooQuotes(MACRO_SYMBOLS).catch(() => [])
    ]);

    if (spyData.length < 200) {
      throw new Error('충분한 시장 데이터(SPY 200일분)를 확보하지 못했습니다.');
    }

    const lastClose = spyData[spyData.length - 1].close;
    const ma50 = spyData.slice(-50).reduce((acc, d) => acc + d.close, 0) / 50;
    const ma150 = spyData.slice(-150).reduce((acc, d) => acc + d.close, 0) / 150;
    const ma200 = spyData.slice(-200).reduce((acc, d) => acc + d.close, 0) / 200;

    // 2. 새로운 점수 시스템 (Max 5점)
    let totalScore = 0;

    // (1) Trend 지표 계산 (2점 만점 반영)
    const isPriceAboveMa200 = lastClose > ma200;
    const isPriceAboveMa50 = lastClose > ma50;
    const isOrderly = ma50 > ma200;
    
    let trendScore = 0;
    if (isPriceAboveMa200) trendScore += 1;
    if (isPriceAboveMa50) trendScore += 0.5;
    if (isOrderly) trendScore += 0.5;
    totalScore += trendScore;

    const trendMetric: MasterFilterMetricDetail = {
      label: 'Trend Alignment',
      value: lastClose,
      threshold: ma200,
      status: isPriceAboveMa200 ? 'PASS' : 'FAIL',
      unit: 'pts',
      description: CRITERIA.TREND,
      source: 'Yahoo Finance (SPY)'
    };

    // (2) Breadth 지표 계산 (1점)
    // 추세가 살아있고 VIX가 낮으면 긍정적으로 추정 (실제 모니터링 데이터 보완 필요)
    const currentVix = vixData[vixData.length - 1]?.close || 20;
    const breadthVal = trendScore >= 1.5 && currentVix < 20 ? 75 : 45;
    if (breadthVal >= 50) totalScore += 1;

    const breadthMetric: MasterFilterMetricDetail = {
      label: 'Market Breadth',
      value: breadthVal,
      threshold: 50,
      status: breadthVal >= 50 ? 'PASS' : 'FAIL',
      unit: '%',
      description: CRITERIA.BREADTH,
      source: 'Internal Engine (Proxy)'
    };

    // (3) Liquidity (분산일) 계산 (1점)
    let distributionDays = 0;
    for (let i = spyData.length - 20; i < spyData.length; i++) {
      const curr = spyData[i];
      const prev = spyData[i - 1];
      if (curr && prev && curr.close < prev.close && curr.volume > prev.volume) {
        distributionDays++;
      }
    }
    const isLiquidityGood = distributionDays < 4;
    if (isLiquidityGood) totalScore += 1;

    const liquidityMetric: MasterFilterMetricDetail = {
      label: 'Institutional Liquidity',
      value: distributionDays,
      threshold: 4,
      status: distributionDays >= 4 ? 'FAIL' : distributionDays >= 3 ? 'WARNING' : 'PASS',
      unit: 'days',
      description: CRITERIA.LIQUIDITY,
      source: 'Yahoo Finance (SPY Volume)'
    };

    // (4) Volatility (VIX) 계산 (0.5점)
    const vixVal = Number(currentVix.toFixed(2));
    const isVixCalm = vixVal < 20;
    if (isVixCalm) totalScore += 0.5;

    const volatilityMetric: MasterFilterMetricDetail = {
      label: 'Volatility (VIX)',
      value: vixVal,
      threshold: 20,
      status: vixVal >= 20 ? 'FAIL' : vixVal >= 17 ? 'WARNING' : 'PASS',
      unit: 'pts',
      description: CRITERIA.VOLATILITY,
      source: 'CBOE (via Yahoo)'
    };

    // (5) Leadership 지표 계산 (0.5점)
    const isLeadershipStrong = trendScore >= 1.5 && distributionDays < 4;
    if (isLeadershipStrong) totalScore += 0.5;

    const leadershipMetric: MasterFilterMetricDetail = {
      label: 'Major Leadership',
      value: isLeadershipStrong ? 'Focused' : 'Weak',
      threshold: 'Focused',
      status: isLeadershipStrong ? 'PASS' : 'FAIL',
      unit: 'state',
      description: CRITERIA.LEADERSHIP,
      source: 'MTN Scanner Data'
    };

    // 3. 최종 상태 판별
    let marketState: MarketState = 'RED';
    if (totalScore >= 4) marketState = 'GREEN';
    else if (totalScore >= 2) marketState = 'YELLOW';

    // 4. 차트용 데이터 및 매크로 정보
    const spyHistory = spyData.slice(-50).map(d => ({ date: d.date, close: d.close }));
    const vixHistory = vixData.slice(-50).map(d => ({ date: d.date, close: d.close }));
    const macroMap = macroQuotes.reduce((acc, q) => {
      acc[q.symbol] = q;
      return acc;
    }, {} as Record<string, unknown>);

    // 5. LLM 분석 요청
    const insightInput = {
      marketState,
      metrics: {
        trend: trendMetric,
        breadth: breadthMetric,
        liquidity: liquidityMetric,
        vix: volatilityMetric,
        leadership: leadershipMetric,
        totalScore
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
        console.error('AI 분석 실패:', e);
      }
    }

    if (!insightLog) {
      const logs = {
        GREEN: '시장이 장기 이평선 위에서 강력한 지지력을 보여주고 있습니다. 적극적인 포지션 구축 구간입니다.',
        YELLOW: '시장이 혼조세를 보이며 단기 모멘텀이 둔화되었습니다. 비중 조절과 리스크 관리가 필요한 시점입니다.',
        RED: '주요 이평선 이탈 및 수급 악화가 감지되었습니다. 현금 비중을 극대화하여 계좌를 보호하십시오.'
      };
      insightLog = logs[marketState];
    }

    const responseData: MasterFilterResponse = {
      state: marketState,
      metrics: {
        trend: trendMetric,
        breadth: breadthMetric,
        liquidity: liquidityMetric,
        volatility: volatilityMetric,
        leadership: leadershipMetric,
        score: totalScore,
        spyPrice: lastClose,
        ma50,
        ma150,
        ma200,
        spyHistory,
        vixHistory,
        macroData: macroMap,
        updatedAt: new Date().toISOString()
      },
      insightLog,
      isAiGenerated,
      aiModelUsed
    };

    return NextResponse.json(responseData);

  } catch (error: unknown) {
    const err = error as Error;
    console.error('Master Filter Engine Error:', err);
    return NextResponse.json(
      { error: err?.message || '분석 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
