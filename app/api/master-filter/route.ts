import { NextResponse } from 'next/server';
import { generateMarketInsight } from '@/lib/ai/gemini';
import { getYahooDailyPrice, getYahooQuotes } from '@/lib/finance/yahoo-api';
import type { MarketState, MasterFilterMetricDetail, MasterFilterResponse, OHLCData } from '@/types';

export const dynamic = 'force-dynamic';

const US_MACRO_SYMBOLS = [
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

const KR_MACRO_SYMBOLS = [
  '^KS200',
  '^KQ150',
  '^KS11',
  '^KQ11',
  'KRW=X',
  '069500.KS',
  '233740.KS',
  '139230.KS',
  '455850.KS',
  '305720.KS',
  '123310.KS',
  '244580.KS',
  '091220.KS',
  '117680.KS',
  '117700.KS',
  '139260.KS',
  '139280.KS',
];

const US_SECTOR_ETFS = ['XLK', 'XLY', 'XLC', 'XLI', 'XLF', 'XLV', 'XLE', 'XLP', 'XLU', 'XLB'];
const US_BREADTH_ETFS = ['SPY', 'QQQ', 'DIA', 'IWM', 'RSP'];
const US_RISK_ON_SECTORS = new Set(['XLK', 'XLY', 'XLC', 'XLI', 'XLF']);
const US_SECTOR_NAMES: Record<string, string> = {
  XLK: 'Technology',
  XLY: 'Consumer Discretionary',
  XLC: 'Communication Services',
  XLI: 'Industrials',
  XLF: 'Financials',
  XLV: 'Health Care',
  XLE: 'Energy',
  XLP: 'Consumer Staples',
  XLU: 'Utilities',
  XLB: 'Materials',
};

const KR_SECTOR_ETFS = ['455850.KS', '305720.KS', '123310.KS', '244580.KS', '091220.KS', '117680.KS', '117700.KS', '139260.KS'];
const KR_BREADTH_ETFS = ['^KS200', '^KQ150', '069500.KS'];
const KR_RISK_ON_SECTORS = new Set(['455850.KS', '305720.KS', '123310.KS', '139260.KS']);
const KR_SECTOR_NAMES: Record<string, string> = {
  '455850.KS': '반도체',
  '305720.KS': '2차전지',
  '123310.KS': '자동차',
  '244580.KS': '바이오',
  '091220.KS': '은행',
  '117680.KS': '철강',
  '117700.KS': '화학/건설',
  '139260.KS': 'IT',
};

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function movingAverage(data: { close: number }[], period: number) {
  if (data.length < period) return null;
  return average(data.slice(-period).map((item) => item.close));
}

function movingAverageAt(data: { close: number }[], endIndex: number, period: number) {
  if (endIndex + 1 < period) return null;
  return average(data.slice(endIndex + 1 - period, endIndex + 1).map((item) => item.close));
}

function percentReturn(data: { close: number }[], lookback: number) {
  if (data.length <= lookback) return null;
  const start = data[data.length - lookback - 1]?.close;
  const end = data.at(-1)?.close;
  if (!start || !end) return null;
  return ((end - start) / start) * 100;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
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
  for (let index = Math.max(1, data.length - lookback); index < data.length; index += 1) {
    const prev = data[index - 1];
    const curr = data[index];
    if (curr.close < prev.close && curr.volume > prev.volume) count += 1;
  }
  return count;
}

function detectFollowThroughDay(data: Pick<OHLCData, 'close' | 'high' | 'low' | 'volume'>[]) {
  const lookback = data.slice(-30);
  if (lookback.length < 10) {
    return { found: false, daysAgo: null as number | null, reason: 'FTD 확인에 필요한 최근 거래일 데이터가 부족합니다.' };
  }

  let peak = lookback[0].high;
  let correctionLowIndex = -1;
  let correctionDepth = 0;

  for (let index = 1; index < lookback.length; index += 1) {
    peak = Math.max(peak, lookback[index].high);
    const drawdownPct = peak > 0 ? ((peak - lookback[index].low) / peak) * 100 : 0;
    if (drawdownPct >= 4 && drawdownPct >= correctionDepth) {
      correctionDepth = drawdownPct;
      correctionLowIndex = index;
    }
  }

  if (correctionLowIndex < 0) {
    return { found: false, daysAgo: null, reason: '최근 30거래일 안에서 4% 이상 조정 저점을 찾지 못했습니다.' };
  }

  const startIndex = correctionLowIndex + 4;
  if (startIndex >= lookback.length) {
    return { found: false, daysAgo: null, reason: '조정 저점 이후 FTD 확인 기준인 4거래일차가 아직 지나지 않았습니다.' };
  }

  let hadPriceGain = false;
  for (let index = startIndex; index < lookback.length; index += 1) {
    const prev = lookback[index - 1];
    const curr = lookback[index];
    const gainPct = ((curr.close - prev.close) / prev.close) * 100;
    if (gainPct >= 1.25) hadPriceGain = true;
    if (gainPct >= 1.25 && curr.volume > prev.volume) {
      return {
        found: true,
        daysAgo: lookback.length - 1 - index,
        reason: `${lookback.length - 1 - index}거래일 전 1.25% 이상 상승과 거래량 증가가 확인되었습니다.`,
      };
    }
  }

  return {
    found: false,
    daysAgo: null,
    reason: hadPriceGain
      ? '1.25% 이상 상승일은 있었지만 전일 대비 거래량 증가가 동반되지 않았습니다.'
      : '조정 저점 이후 4거래일차부터 1.25% 이상 상승일을 찾지 못했습니다.',
  };
}

async function safeDaily(symbol: string): Promise<OHLCData[]> {
  return getYahooDailyPrice(symbol).catch(() => []);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const market = (searchParams.get('market')?.toUpperCase() || 'US') as 'US' | 'KR';

    const symbols = market === 'KR' ? KR_MACRO_SYMBOLS : US_MACRO_SYMBOLS;
    const sectorEtfs = market === 'KR' ? KR_SECTOR_ETFS : US_SECTOR_ETFS;
    const breadthEtfs = market === 'KR' ? KR_BREADTH_ETFS : US_BREADTH_ETFS;
    const riskOnSectors = market === 'KR' ? KR_RISK_ON_SECTORS : US_RISK_ON_SECTORS;
    const sectorNames = market === 'KR' ? KR_SECTOR_NAMES : US_SECTOR_NAMES;
    const mainSymbol = market === 'KR' ? '^KS200' : 'SPY';
    const vixSymbol = '^VIX';

    const [mainData, vixData, macroQuotes, breadthSeries, sectorSeries] = await Promise.all([
      safeDaily(mainSymbol),
      safeDaily(vixSymbol),
      getYahooQuotes(symbols).catch(() => []),
      Promise.all(breadthEtfs.map(async (symbol) => [symbol, await safeDaily(symbol)] as const)),
      Promise.all(sectorEtfs.map(async (symbol) => [symbol, await safeDaily(symbol)] as const)),
    ]);

    if (mainData.length < 200) {
      throw new Error(`${mainSymbol} 200일 가격 데이터를 충분히 확보하지 못했습니다.`);
    }

    const lastClose = mainData.at(-1)!.close;
    const ma50 = movingAverage(mainData, 50) || 0;
    const ma150 = movingAverage(mainData, 150) || 0;
    const ma200 = movingAverage(mainData, 200) || 0;
    const currentVix = vixData.at(-1)?.close || 20;
    const distributionDays = calculateDistributionDays(mainData);
    const ftd = detectFollowThroughDay(mainData);

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
      Math.min(3, above200Pct / 33 + ((percentReturn(mainData, 20) || 0) > 0 ? 0.5 : -0.5))
    );

    const sectorRows = sectorSeries
      .filter(([, data]) => data.length >= 21)
      .map(([symbol, data]) => ({
        symbol,
        name: sectorNames[symbol] || symbol,
        return20: round(percentReturn(data, 20) || 0),
        riskOn: riskOnSectors.has(symbol),
        rank: 0,
      }))
      .sort((a, b) => b.return20 - a.return20)
      .map((row, index) => ({ ...row, rank: index + 1 }));
    const leadingSectors = sectorRows.slice(0, 3);
    const sectorRiskOnCount = leadingSectors.filter((row) => row.riskOn).length;

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
      value: `${round(ma50)} / ${round(ma200)}`,
      threshold: '50D > 200D, price > 50D/200D',
      status: lastClose > ma200 && ma50 > ma200 && lastClose > ma50 ? 'PASS' : lastClose > ma200 ? 'WARNING' : 'FAIL',
      unit: '',
      description: `${mainSymbol} 현재가가 50일/200일 이평선 위에 있는지, 50일선이 200일선 위에 있는지 확인합니다. 현재가 ${round(lastClose)}.`,
      source: `Yahoo Finance ${mainSymbol}`,
    });
    const breadthMetric = createMetric({
      label: 'Market Breadth',
      value: Number(above200Pct.toFixed(0)),
      threshold: 50,
      status: above200Pct >= 60 ? 'PASS' : above200Pct >= 40 ? 'WARNING' : 'FAIL',
      unit: '%',
      description: `${breadthEtfs.join(', ')} 중 200일선 위에 있는 비율입니다.`,
      source: 'Yahoo Finance ETF proxy',
    });
    const liquidityMetric = createMetric({
      label: 'Distribution Days',
      value: distributionDays,
      threshold: 5,
      status: distributionDays <= 3 ? 'PASS' : distributionDays <= 5 ? 'WARNING' : 'FAIL',
      unit: 'days',
      description: '최근 25거래일 중 하락일이면서 전일보다 거래량이 증가한 날을 누적합니다.',
      source: `Yahoo Finance ${mainSymbol} volume`,
    });
    const volatilityMetric = createMetric({
      label: 'Volatility (VIX)',
      value: Number(currentVix.toFixed(2)),
      threshold: 20,
      status: currentVix < 20 ? 'PASS' : currentVix < 25 ? 'WARNING' : 'FAIL',
      unit: 'pts',
      description: 'VIX 20 미만은 정상 변동성, 20~25는 주의, 25 이상은 위험 구간으로 해석합니다.',
      source: 'CBOE via Yahoo',
    });
    const leadershipMetric = createMetric({
      label: 'Sector Leadership',
      value: sectorRows.length ? `${sectorRows.length} sectors ranked` : 'N/A',
      threshold: 'Risk-on sectors in leadership',
      status: statusFromScore(sectorScore),
      unit: '',
      description: '전체 섹터 ETF를 20거래일 수익률순으로 보고 성장/경기민감 섹터 주도 여부를 확인합니다.',
      source: 'Sector ETF proxy',
    });

    const p3Metrics = {
      ftd: createMetric({
        label: 'Follow-Through Day',
        value: ftd.found ? `${ftd.daysAgo} days ago` : 'Unconfirmed',
        threshold: 'Recent correction + day 4 rally',
        status: statusFromScore(ftdScore),
        unit: '',
        description: ftd.reason,
        source: `${mainSymbol} proxy`,
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
        source: `${mainSymbol} volume proxy`,
        score: distributionScore,
        weight: 20,
      }),
      newHighLow: createMetric({
        label: 'NH/NL Proxy',
        value: Number(newHighLowProxy.toFixed(2)),
        threshold: 1.8,
        status: statusFromScore(newHighLowScore),
        unit: 'ratio',
        description: '주요 ETF의 200일선 참여 폭과 20일 수익률로 시장 내부 강도를 추정합니다.',
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
        description: '주요 지수/ETF 중 200일선 위에 있는 비율입니다.',
        source: 'Yahoo Finance ETF proxy',
        score: above200Score,
        weight: 20,
      }),
      sectorRotation: createMetric({
        label: 'Sector Rotation',
        value: sectorRows.length ? `${sectorRows.length} sectors ranked` : 'N/A',
        threshold: 'Risk-on sectors in leadership',
        status: statusFromScore(sectorScore),
        unit: '',
        description: '전체 섹터를 20거래일 수익률순으로 비교해 성장/경기민감 섹터 주도 여부를 확인합니다.',
        source: 'Sector ETF proxy',
        score: sectorScore,
        weight: 20,
      }),
    };

    const mainHistory = mainData.slice(-50).map((item) => ({ date: item.date, close: item.close }));
    const vixHistory = vixData.slice(-50).map((item) => ({ date: item.date, close: item.close }));
    const movingAverageHistory = mainData.slice(-80).map((item) => {
      const index = mainData.indexOf(item);
      return {
        date: item.date,
        ma50: movingAverageAt(mainData, index, 50),
        ma200: movingAverageAt(mainData, index, 200),
      };
    });
    const macroMap = macroQuotes.reduce((acc, quote) => {
      acc[quote.symbol] = quote;
      return acc;
    }, {} as Record<string, unknown>);

    const insightInput = {
      marketState,
      market,
      metrics: {
        trend: trendMetric,
        breadth: breadthMetric,
        liquidity: liquidityMetric,
        volatility: volatilityMetric,
        leadership: leadershipMetric,
        totalScore: p3Score,
      },
      macroData: { ...macroMap, p3Score, leadingSectors, sectorRows, breadthRows, ftdReason: ftd.reason, market },
    };

    const insight = await generateMarketInsight(insightInput);

    const responseData: MasterFilterResponse = {
      state: marketState,
      market,
      metrics: {
        trend: trendMetric,
        breadth: breadthMetric,
        liquidity: liquidityMetric,
        volatility: volatilityMetric,
        leadership: leadershipMetric,
        ...p3Metrics,
        score: legacyScore,
        p3Score,
        mainPrice: lastClose,
        ma50,
        ma150,
        ma200,
        mainHistory,
        movingAverageHistory,
        vixHistory,
        sectorRows,
        ftdReason: ftd.reason,
        macroData: { ...macroMap, leadingSectors, sectorRows, breadthRows, ftdReason: ftd.reason },
        regimeHistory: [
          { date: new Date().toISOString(), state: marketState, score: p3Score, reason: `P3 score ${p3Score}/100` },
        ],
        meta: {
          asOf: new Date().toISOString(),
          source: 'Market Analysis Engine',
          provider: 'MTN Aggregator',
          delay: 'EOD',
          fallbackUsed: insight.providerUsed !== 'gemini',
          warnings: insight.errorSummary ? [insight.errorSummary] : [],
        },
        updatedAt: new Date().toISOString(),
      },
      insightLog: insight.text,
      isAiGenerated: insight.isAiGenerated,
      aiProviderUsed: insight.providerUsed,
      aiModelUsed: insight.modelUsed,
      aiFallbackChain: insight.fallbackChain,
      aiErrorSummary: insight.errorSummary,
    };

    return NextResponse.json(responseData);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '마스터 필터 분석 중 오류가 발생했습니다.';
    console.error('Master Filter Engine Error:', error);
    return NextResponse.json({ message, code: 'API_ERROR', recoverable: false }, { status: 500 });
  }
}
