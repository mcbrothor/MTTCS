import { NextResponse } from 'next/server';
import { getYahooDailyPrice } from '@/lib/finance/yahoo-api';
import type { MarketState, MasterFilterMetrics, MasterFilterResponse, OHLCData } from '@/types';

// 캐시 주기를 1시간으로 설정
export const revalidate = 3600;

function calculateTrendState(spyData: OHLCData[]) {
  if (spyData.length < 200) return { state: 'NEUTRAL' as const, details: '데이터 부족' };
  
  const lastClose = spyData[spyData.length - 1].close;
  const ma50 = spyData.slice(-50).reduce((acc, d) => acc + d.close, 0) / 50;
  const ma150 = spyData.slice(-150).reduce((acc, d) => acc + d.close, 0) / 150;
  const ma200 = spyData.slice(-200).reduce((acc, d) => acc + d.close, 0) / 200;
  const prevMonthSlice = spyData.slice(-221, -21);
  const prevMonthMa200 = prevMonthSlice.length === 200 ? prevMonthSlice.reduce((acc, d) => acc + d.close, 0) / 200 : ma200;

  if (lastClose > ma50 && ma50 > ma150 && ma150 > ma200 && ma200 > prevMonthMa200) {
    return { state: 'UP' as const, details: '완벽한 정배열 상승 추세 (MA50 > MA150 > MA200)' };
  } else if (lastClose < ma200 && ma50 < ma200) {
    return { state: 'DOWN' as const, details: '장기 이평선 하회 (MA200선 붕괴)' };
  } else {
    return { state: 'NEUTRAL' as const, details: '비추세 또는 혼조세' };
  }
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
    return { state: 'GOOD' as const, details: `건강한 수급 (최근 20일간 분산일 ${distributionDays}일)`, distributionDays };
  } else if (distributionDays <= 5) {
    return { state: 'WARNING' as const, details: `수급 경고 (최근 20일간 분산일 ${distributionDays}일)`, distributionDays };
  } else {
    return { state: 'BAD' as const, details: `수급 악화 (최근 20일간 분산일 ${distributionDays}일)`, distributionDays };
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
    // 병렬로 SPY(지수 프록시)와 ^VIX 데이터 조회
    const [spyData, vixData] = await Promise.all([
      getYahooDailyPrice('SPY').catch(() => []),
      getYahooDailyPrice('^VIX').catch(() => [])
    ]);

    const trend = calculateTrendState(spyData);
    const liquidity = calculateLiquidityState(spyData);
    const vix = calculateVixState(vixData);

    // 시장 폭(Breadth)과 주도 섹터(Leadership)는 별도 연산 비용이 크므로 SPY 추세 기반 휴리스틱 매핑 (대안 1 적용)
    const breadthScore = trend.state === 'UP' ? 65 : trend.state === 'DOWN' ? 20 : 45;
    const leadershipState = trend.state === 'UP' ? 'FOCUSED' : trend.state === 'DOWN' ? 'WEAK' : 'SCATTERED';

    let greenCount = 0;
    if (trend.state === 'UP') greenCount++;
    if (breadthScore >= 50) greenCount++;
    if (liquidity.state === 'GOOD') greenCount++;
    if (vix.state === 'CALM') greenCount++;
    if (leadershipState === 'FOCUSED') greenCount++;

    let marketState: MarketState;
    if (greenCount >= 4) {
      marketState = 'GREEN';
    } else if (greenCount >= 2) {
      marketState = 'YELLOW';
    } else {
      marketState = 'RED';
    }

    let insightLog = '';
    if (marketState === 'GREEN') {
      insightLog = '시장이 전반적으로 강한 호조를 보이고 있습니다. SEPA 타점에 도달한 종목이 있다면 공격적으로 비중을 실어 매매할 수 있는 순풍(BULL) 구간입니다.';
    } else if (marketState === 'YELLOW') {
      insightLog = '시장의 힘이 분산되고 혼조세를 보이고 있습니다. VCP가 잘 형성된 종목이 있더라도 평소 투자 비중의 절반 이하로 줄이고, 보유 종목의 손절선을 타이트하게 상향 조정할 것을 권장합니다.';
    } else {
      insightLog = '강력한 하락 위험이 감지되었습니다. 추세가 꺾이고 매도 압력이 높습니다. 계좌 방어를 최우선으로 하여 일체 신규 매수를 멈추고 현금을 확보하십시오.';
    }

    const metrics: MasterFilterMetrics = {
      trendState: trend.state,
      trendDetails: trend.details,
      breadthScore,
      breadthDetails: 'SPY 지수 프록시 기반 추정',
      liquidityState: liquidity.state,
      distributionDays: liquidity.distributionDays,
      vixValue: vix.value,
      vixState: vix.state,
      leadershipState,
      updatedAt: new Date().toISOString()
    };

    const responseData: MasterFilterResponse = {
      state: marketState,
      metrics,
      insightLog
    };

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('Master Filter Error:', error);
    return NextResponse.json(
      { error: '마스터 필터 계산 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
