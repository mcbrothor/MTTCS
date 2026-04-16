import { NextResponse } from 'next/server';
import { getYahooDailyPrice, getYahooQuotes } from '@/lib/finance/yahoo-api';
import { generateMarketInsight } from '@/lib/ai/gemini';
import type { MarketState, MasterFilterMetricDetail, MasterFilterResponse } from '@/types';

export const revalidate = 3600;

const MACRO_SYMBOLS = [
  '^VIX',
  'UUP',
  'DX-Y.NYB',
  'KRW=X',
  '^TNX',
  '^IRX',
  'SHY',
  'TLT',
  'HYG',
  'IEF',
  'QQQ',
  'SPY',
  'DIA',
  'IWM',
  'RSP',
  'XLK',
  'XLY',
  'XLC',
  'XLI',
  'XLF',
  'XLV',
  'XLE',
  'XLP',
  'XLU',
  'XLB',
  'GLD',
  'CPER',
  'USO',
  'UNG',
  'BTC-USD',
];

const SECTOR_ETFS = ['XLK', 'XLY', 'XLC', 'XLI', 'XLF', 'XLV', 'XLE', 'XLP', 'XLU', 'XLB'];
const BREADTH_ETFS = ['SPY', 'QQQ', 'DIA', 'IWM', 'RSP'];
const RISK_ON_SECTORS = new Set(['XLK', 'XLY', 'XLC', 'XLI', 'XLF']);

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function movingAverage(data: { close: number }[], period: number) {
  if (data.length < period) return null;
  return average(data.slice(-period).map((item) => item.close));
}

function percentReturn(data: { close: number }[], lookback: number) {
  if (data.length <= lookback) return null;
  const start = data[data.length - lookback - 1]?.close;
  const end = data.at(-1)?.close;
  if (!start || !end) return null;
  return ((end - start) / start) * 100;
}

function statusFromScore(score: number) {
  if (score >= 16) return 'PASS' as const;
  if (score >= 10) return 'WARNING' as const;
  return 'FAIL' as const;
}

function createMetric(input: MasterFilterMetricDetail): MasterFilterMetricDetail {
  return input;
}

function calculateDistributionDays(data: { close: number; volume: number }[], lookback = 25) {
  let count = 0;
  for (let i = Math.max(1, data.length - lookback); i < data.length; i += 1) {
    const prev = data[i - 1];
    const curr = data[i];
    if (curr.close < prev.close && curr.volume > prev.volume) count += 1;
  }
  return count;
}

function detectFollowThroughDay(data: { close: number; high: number; volume: number }[]) {
  const lookback = data.slice(-20);
  if (lookback.length < 10) return { found: false, daysAgo: null as number | null };

  const recentHigh = Math.max(...lookback.map((item) => item.high));
  const lastClose = lookback.at(-1)?.close || recentHigh;
  const correctionPct = ((recentHigh - lastClose) / recentHigh) * 100;

  for (let i = lookback.length - 1; i >= 4; i -= 1) {
    const prev = lookback[i - 1];
    const curr = lookback[i];
    const gainPct = ((curr.close - prev.close) / prev.close) * 100;
    if (correctionPct >= 4 && gainPct >= 1.25 && curr.volume > prev.volume) {
      return { found: true, daysAgo: lookback.length - 1 - i };
    }
  }

  return { found: false, daysAgo: null };
}

async function safeDaily(symbol: string) {
  return getYahooDailyPrice(symbol).catch(() => []);
}

export async function GET() {
  try {
    const [spyData, vixData, macroQuotes, breadthSeries, sectorSeries] = await Promise.all([
      safeDaily('SPY'),
      safeDaily('^VIX'),
      getYahooQuotes(MACRO_SYMBOLS).catch(() => []),
      Promise.all(BREADTH_ETFS.map(async (symbol) => [symbol, await safeDaily(symbol)] as const)),
      Promise.all(SECTOR_ETFS.map(async (symbol) => [symbol, await safeDaily(symbol)] as const)),
    ]);

    if (spyData.length < 200) {
      throw new Error('SPY 200일 가격 데이터를 충분히 확보하지 못했습니다.');
    }

    const lastClose = spyData.at(-1)!.close;
    const ma50 = movingAverage(spyData, 50) || 0;
    const ma150 = movingAverage(spyData, 150) || 0;
    const ma200 = movingAverage(spyData, 200) || 0;
    const currentVix = vixData.at(-1)?.close || 20;
    const distributionDays = calculateDistributionDays(spyData);
    const ftd = detectFollowThroughDay(spyData);

    const breadthRows = breadthSeries
      .filter(([, data]) => data.length >= 200)
      .map(([symbol, data]) => ({
        symbol,
        above200: data.at(-1)!.close > (movingAverage(data, 200) || Infinity),
        return20: percentReturn(data, 20) || 0,
      }));
    const above200Pct = breadthRows.length
      ? (breadthRows.filter((row) => row.above200).length / breadthRows.length) * 100
      : 0;
    const newHighLowProxy = Math.max(
      0,
      Math.min(3, above200Pct / 33 + ((percentReturn(spyData, 20) || 0) > 0 ? 0.5 : -0.5))
    );

    const sectorRows = sectorSeries
      .filter(([, data]) => data.length >= 21)
      .map(([symbol, data]) => ({ symbol, return20: percentReturn(data, 20) || 0 }))
      .sort((a, b) => b.return20 - a.return20);
    const leadingSectors = sectorRows.slice(0, 3);
    const sectorRiskOnCount = leadingSectors.filter((row) => RISK_ON_SECTORS.has(row.symbol)).length;

    const ftdScore = ftd.found ? 20 : 8;
    const distributionScore = distributionDays <= 3 ? 20 : distributionDays <= 5 ? 12 : 4;
    const newHighLowScore = newHighLowProxy >= 1.8 ? 20 : newHighLowProxy >= 1.2 ? 12 : 5;
    const above200Score = above200Pct >= 60 ? 20 : above200Pct >= 40 ? 12 : 5;
    const sectorScore = sectorRiskOnCount >= 2 ? 20 : sectorRiskOnCount === 1 ? 12 : 5;
    const p3Score = ftdScore + distributionScore + newHighLowScore + above200Score + sectorScore;

    const trendScore = (lastClose > ma200 ? 1 : 0) + (lastClose > ma50 ? 0.5 : 0) + (ma50 > ma200 ? 0.5 : 0);
    const volatilityScore = currentVix < 20 ? 0.5 : 0;
    const legacyScore =
      trendScore +
      (above200Pct >= 40 ? 1 : 0) +
      (distributionDays < 5 ? 1 : 0) +
      volatilityScore +
      (sectorRiskOnCount >= 1 ? 0.5 : 0);

    let marketState: MarketState = 'RED';
    if (p3Score >= 75) marketState = 'GREEN';
    else if (p3Score >= 50) marketState = 'YELLOW';

    const trendMetric = createMetric({
      label: 'Trend Alignment',
      value: Number(lastClose.toFixed(2)),
      threshold: Number(ma200.toFixed(2)),
      status: lastClose > ma200 && ma50 > ma200 ? 'PASS' : lastClose > ma200 ? 'WARNING' : 'FAIL',
      unit: 'pts',
      description: 'SPY가 50일선과 200일선 위에 있는지, 50일선이 200일선보다 높은지 확인합니다.',
      source: 'Yahoo Finance SPY',
    });
    const breadthMetric = createMetric({
      label: 'Market Breadth',
      value: Number(above200Pct.toFixed(0)),
      threshold: 50,
      status: above200Pct >= 60 ? 'PASS' : above200Pct >= 40 ? 'WARNING' : 'FAIL',
      unit: '%',
      description: 'SPY, QQQ, DIA, IWM, RSP 중 200일선 위에 있는 ETF 비율입니다.',
      source: 'Yahoo Finance ETF proxy',
    });
    const liquidityMetric = createMetric({
      label: 'Distribution Days',
      value: distributionDays,
      threshold: 5,
      status: distributionDays <= 3 ? 'PASS' : distributionDays <= 5 ? 'WARNING' : 'FAIL',
      unit: 'days',
      description: '최근 25거래일 중 하락일이면서 전일보다 거래량이 증가한 날을 누적합니다.',
      source: 'Yahoo Finance SPY volume',
    });
    const volatilityMetric = createMetric({
      label: 'Volatility (VIX)',
      value: Number(currentVix.toFixed(2)),
      threshold: 20,
      status: currentVix < 17 ? 'PASS' : currentVix < 22 ? 'WARNING' : 'FAIL',
      unit: 'pts',
      description: 'VIX가 낮을수록 위험선호 환경으로 해석합니다.',
      source: 'CBOE via Yahoo',
    });
    const leadershipMetric = createMetric({
      label: 'Sector Leadership',
      value: leadingSectors.map((row) => row.symbol).join(', ') || 'N/A',
      threshold: 'Risk-on top 3',
      status: statusFromScore(sectorScore),
      unit: '',
      description: '최근 20거래일 수익률 상위 섹터가 성장/경기민감 섹터인지 확인합니다.',
      source: 'SPDR sector ETF proxy',
    });

    const p3Metrics = {
      ftd: createMetric({
        label: 'Follow-Through Day',
        value: ftd.found ? `${ftd.daysAgo}일 전` : '미확인',
        threshold: '최근 20일',
        status: statusFromScore(ftdScore),
        unit: '',
        description: '조정 이후 1.25% 이상 상승과 거래량 증가가 동반된 시장 재개 신호입니다.',
        source: 'SPY proxy',
        score: ftdScore,
        weight: 20,
      }),
      distribution: createMetric({
        label: 'Distribution Pressure',
        value: distributionDays,
        threshold: 5,
        status: statusFromScore(distributionScore),
        unit: 'days',
        description: '기관 매도 압력이 과도하게 누적되는지 확인합니다.',
        source: 'SPY volume proxy',
        score: distributionScore,
        weight: 20,
      }),
      newHighLow: createMetric({
        label: 'NH/NL Proxy',
        value: Number(newHighLowProxy.toFixed(2)),
        threshold: 1.8,
        status: statusFromScore(newHighLowScore),
        unit: 'ratio',
        description: '실시간 NH/NL 데이터 대신 주요 ETF의 200일선 참여율과 20일 수익률로 내부 강도를 추정합니다.',
        source: 'ETF breadth proxy',
        score: newHighLowScore,
        weight: 20,
      }),
      above200d: createMetric({
        label: 'Above 200D',
        value: Number(above200Pct.toFixed(0)),
        threshold: 60,
        status: statusFromScore(above200Score),
        unit: '%',
        description: '주요 지수 ETF 중 200일선 위에 있는 비율입니다.',
        source: 'Yahoo Finance ETF proxy',
        score: above200Score,
        weight: 20,
      }),
      sectorRotation: createMetric({
        label: 'Sector Rotation',
        value: leadingSectors.map((row) => row.symbol).join(', ') || 'N/A',
        threshold: 'Risk-on top 3',
        status: statusFromScore(sectorScore),
        unit: '',
        description: '자금이 성장/경기민감 섹터로 이동하는지 확인합니다.',
        source: 'SPDR sector ETF proxy',
        score: sectorScore,
        weight: 20,
      }),
    };

    const spyHistory = spyData.slice(-50).map((item) => ({ date: item.date, close: item.close }));
    const vixHistory = vixData.slice(-50).map((item) => ({ date: item.date, close: item.close }));
    const macroMap = macroQuotes.reduce((acc, quote) => {
      acc[quote.symbol] = quote;
      return acc;
    }, {} as Record<string, unknown>);

    const insightInput = {
      marketState,
      metrics: {
        trend: trendMetric,
        breadth: breadthMetric,
        liquidity: liquidityMetric,
        volatility: volatilityMetric,
        leadership: leadershipMetric,
        totalScore: legacyScore,
      },
      macroData: { ...macroMap, p3Score, leadingSectors, breadthRows },
    };

    let insightLog = '';
    let isAiGenerated = false;
    let aiModelUsed = '';
    if (process.env.GEMINI_API_KEY) {
      try {
        insightLog = await generateMarketInsight(insightInput);
        isAiGenerated = true;
        aiModelUsed = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
      } catch (error) {
        console.error('AI market insight failed:', error);
      }
    }

    if (!insightLog) {
      insightLog = {
        GREEN: '시장 내부 강도와 섹터 로테이션이 우호적입니다. 핵심 후보는 피벗 근처의 거래량 확인을 우선하세요.',
        YELLOW: '상승 시도는 가능하지만 분산일, 변동성, 참여율 중 일부가 불완전합니다. 포지션 크기를 줄이고 실패한 돌파는 빠르게 정리하세요.',
        RED: '시장 압력이 높습니다. 신규 진입보다 현금 비중과 기존 포지션 방어를 우선하세요.',
      }[marketState];
    }

    const responseData: MasterFilterResponse = {
      state: marketState,
      metrics: {
        trend: trendMetric,
        breadth: breadthMetric,
        liquidity: liquidityMetric,
        volatility: volatilityMetric,
        leadership: leadershipMetric,
        ...p3Metrics,
        score: legacyScore,
        p3Score,
        spyPrice: lastClose,
        ma50,
        ma150,
        ma200,
        spyHistory,
        vixHistory,
        macroData: { ...macroMap, leadingSectors, breadthRows },
        regimeHistory: [
          { date: new Date().toISOString(), state: marketState, score: p3Score, reason: `P3 score ${p3Score}/100` },
        ],
        updatedAt: new Date().toISOString(),
      },
      insightLog,
      isAiGenerated,
      aiModelUsed,
    };

    return NextResponse.json(responseData);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '마스터 필터 분석 중 오류가 발생했습니다.';
    console.error('Master Filter Engine Error:', error);
    return NextResponse.json({ message, code: 'API_ERROR', recoverable: false }, { status: 500 });
  }
}
