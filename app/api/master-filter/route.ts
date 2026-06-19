import { NextResponse } from 'next/server';
import { generateMarketInsight } from '@/lib/ai/gemini';
import type { AiInsightProvider, AiFallbackAttempt, AiModelInsight } from '@/types';
import { getYahooDailyPrice, getYahooQuotes } from '@/lib/finance/providers/yahoo-api';
import type { YahooQuote } from '@/lib/finance/providers/yahoo-api';
import { getKisMarketForeignNetBuy } from '@/lib/finance/providers/kis-api';
import { computeP3 } from '@/lib/master-filter/compute';
import type { MasterFilterResponse, OHLCData, MasterFilterMetricDetail } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // Cache for 1 hour

interface CachedInsight {
  text: string;
  providerUsed: AiInsightProvider;
  modelUsed: string;
  isAiGenerated: boolean;
  fallbackChain: AiFallbackAttempt[];
  modelInsights: AiModelInsight[];
  errorSummary?: string | null;
  cachedAt: number;
}
const insightCache = new Map<string, CachedInsight>();
const INSIGHT_CACHE_TTL_MS = Number(process.env.MARKET_INSIGHT_CACHE_TTL_MS || 60 * 60 * 1000);
const INSIGHT_RESPONSE_TIMEOUT_MS = process.env.VERCEL === '1'
  ? 9000 // Vercel 서버리스 기본 타임아웃(10초) 직전까지 대기
  : Number(process.env.MARKET_INSIGHT_TIMEOUT_MS || 30000);

const US_MACRO_SYMBOLS = [
  '^VIX', 'UUP', 'DX-Y.NYB', 'KRW=X', '^TNX', '^IRX', 'SHY', 'TLT', 'HYG', 'IEF',
  'QQQ', 'SPY', 'DIA', 'IWM', 'RSP', 'XLK', 'XLY', 'XLC', 'XLI', 'XLF', 'XLV',
  'XLE', 'XLP', 'XLU', 'XLB', 'GLD', 'CPER', 'USO', 'UNG', 'BTC-USD',
];

const KR_MACRO_SYMBOLS = [
  '^KS200', '^KQ150', '^KS11', '^KQ11', 'KRW=X', '069500.KS', '233740.KS',
  '139230.KS', '455850.KS', '305720.KS', '123310.KS', '244580.KS', '091220.KS',
  '117680.KS', '117700.KS', '139260.KS', '139280.KS',
];

const US_SECTOR_ETFS = ['XLK', 'XLY', 'XLC', 'XLI', 'XLF', 'XLV', 'XLE', 'XLP', 'XLU', 'XLB'];
const US_BREADTH_ETFS = ['SPY', 'QQQ', 'DIA', 'IWM', 'RSP'];
const US_SECTOR_NAMES: Record<string, string> = {
  XLK: 'Technology', XLY: 'Consumer Discretionary', XLC: 'Communication Services',
  XLI: 'Industrials', XLF: 'Financials', XLV: 'Health Care', XLE: 'Energy',
  XLP: 'Consumer Staples', XLU: 'Utilities', XLB: 'Materials',
};

// KOSPI 전용
const KOSPI_SECTOR_ETFS = ['455850.KS', '305720.KS', '123310.KS', '244580.KS', '091220.KS', '117680.KS', '117700.KS', '139260.KS'];
const KOSPI_BREADTH_ETFS = ['^KS200', '^KQ150', '069500.KS'];
const KOSPI_SECTOR_NAMES: Record<string, string> = {
  '455850.KS': '반도체', '305720.KS': '2차전지', '123310.KS': '자동차',
  '244580.KS': '바이오', '091220.KS': '은행', '117680.KS': '철강',
  '117700.KS': '화학/건설', '139260.KS': 'IT',
};

// KOSDAQ 전용
const KOSDAQ_SECTOR_ETFS = ['244580.KS', '455850.KS', '305720.KS', '139260.KS', '091220.KS'];
const KOSDAQ_BREADTH_ETFS = ['^KQ150', '^KQ11', '229200.KS'];
const KOSDAQ_SECTOR_NAMES: Record<string, string> = {
  '244580.KS': '바이오', '455850.KS': '반도체', '305720.KS': '2차전지',
  '139260.KS': 'IT', '091220.KS': '은행',
};

// 하위 호환: 'KR' → KOSPI
const KR_SECTOR_ETFS = KOSPI_SECTOR_ETFS;
const KR_BREADTH_ETFS = KOSPI_BREADTH_ETFS;
const KR_SECTOR_NAMES = KOSPI_SECTOR_NAMES;

const US_RISK_ON_SECTORS = new Set(['XLK', 'XLY', 'XLC', 'XLI', 'XLF']);
const KR_RISK_ON_SECTORS = new Set(['455850.KS', '305720.KS', '123310.KS', '139260.KS']);
const KOSDAQ_RISK_ON_SECTORS = new Set(['244580.KS', '455850.KS', '305720.KS', '139260.KS']);

async function safeDaily(symbol: string): Promise<OHLCData[]> {
  return getYahooDailyPrice(symbol).catch((err: unknown) => {
    console.error(`[master-filter] safeDaily(${symbol}) failed:`, err instanceof Error ? err.message : err);
    return [];
  });
}

function fallbackInsight(message: string, staleInsight?: CachedInsight): CachedInsight {
  if (staleInsight?.isAiGenerated) {
    return {
      ...staleInsight,
      errorSummary: 'LLM insight refresh timed out; showing the last successful LLM briefing.',
    };
  }

  const generatedAt = new Date().toISOString();
  return {
    text: message,
    providerUsed: 'rules',
    modelUsed: 'mtn-rule-timeout',
    isAiGenerated: false,
    fallbackChain: [
      { provider: 'rules', model: 'mtn-rule-timeout', status: 'success', message: 'LLM insight timed out.' },
    ],
    modelInsights: [
      {
        id: '99-rules-mtn-rule-timeout',
        provider: 'rules',
        label: 'rules',
        model: 'mtn-rule-timeout',
        status: 'success',
        text: message,
        selected: true,
        priority: 99,
        generatedAt,
      },
    ],
    errorSummary: 'LLM insight timed out; market data returned with rule-based commentary.',
    cachedAt: Date.now(),
  };
}

async function generateInsightWithTimeout(input: Parameters<typeof generateMarketInsight>[0], staleInsight?: CachedInsight) {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<CachedInsight>((resolve) => {
    timer = setTimeout(() => {
      resolve(fallbackInsight('시장 데이터 계산은 완료되었으나 LLM 인사이트 생성이 지연되고 있습니다. 잠시 후 새로고침하면 실제 LLM 브리핑을 다시 요청합니다.', staleInsight));
    }, INSIGHT_RESPONSE_TIMEOUT_MS);
  });

  const generated = generateMarketInsight(input)
    .then((fresh) => ({ ...fresh, cachedAt: Date.now() }))
    .catch((error: unknown) => fallbackInsight(error instanceof Error ? error.message : 'LLM insight generation failed.'));

  return Promise.race([generated, timeout]).finally(() => clearTimeout(timer));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawMarket = (searchParams.get('market')?.toUpperCase() || 'US');
    // 'KR'은 하위 호환: KOSPI로 처리
    const market = (rawMarket === 'KR' ? 'KR_KOSPI' : rawMarket) as 'US' | 'KR_KOSPI' | 'KR_KOSDAQ';
    const isKR = market === 'KR_KOSPI' || market === 'KR_KOSDAQ';
    const isKosdaq = market === 'KR_KOSDAQ';

    const symbols = isKR ? KR_MACRO_SYMBOLS : US_MACRO_SYMBOLS;
    const sectorEtfs = isKosdaq ? KOSDAQ_SECTOR_ETFS : isKR ? KR_SECTOR_ETFS : US_SECTOR_ETFS;
    const breadthEtfs = isKosdaq ? KOSDAQ_BREADTH_ETFS : isKR ? KR_BREADTH_ETFS : US_BREADTH_ETFS;
    const riskOnSectors = isKosdaq ? KOSDAQ_RISK_ON_SECTORS : isKR ? KR_RISK_ON_SECTORS : US_RISK_ON_SECTORS;
    const sectorNames = isKosdaq ? KOSDAQ_SECTOR_NAMES : isKR ? KR_SECTOR_NAMES : US_SECTOR_NAMES;
    const mainSymbol = isKosdaq ? '^KQ11' : isKR ? '^KS200' : 'SPY';
    const vixSymbol = '^VIX';

    const kisMarket = isKosdaq ? 'KOSDAQ' : 'KOSPI';
    const [mainData, vixData, vix3mData, macroQuotes, breadthSeries, sectorSeries, foreignNetBuy] = await Promise.all([
      safeDaily(mainSymbol),
      safeDaily(vixSymbol),
      safeDaily('^VIX3M'),
      getYahooQuotes(symbols).catch(() => []),
      Promise.all(breadthEtfs.map(async (sym) => [sym, await safeDaily(sym)] as const)),
      Promise.all(sectorEtfs.map(async (sym) => [sym, await safeDaily(sym)] as const)),
      // KR 시장에서만 외국인 순매수 조회, US는 빈 배열
      isKR ? getKisMarketForeignNetBuy(kisMarket, 20).catch(() => []) : Promise.resolve([]),
    ]);

    if (mainData.length < 200) {
      console.warn(`${mainSymbol} 200일 가격 데이터를 충분히 확보하지 못했습니다. GREY 상태를 반환합니다.`);
      const emptyMetric = (label: string): MasterFilterMetricDetail => ({
        value: null,
        threshold: '-',
        status: 'WARNING',
        label,
        unit: '',
        description: '데이터 부족으로 판정 불가',
        source: '시스템',
        score: 0,
      });

      const responseData: MasterFilterResponse = {
        state: 'GREY',
        market,
        metrics: {
          trend: emptyMetric('장기 추세'),
          breadth: emptyMetric('시장 폭'),
          volatility: emptyMetric('변동성'),
          adr: emptyMetric('ADR 변동폭'),
          ftd: emptyMetric('팔로스루데이'),
          distribution: emptyMetric('분배일'),
          newHighLow: emptyMetric('신고가/신저가'),
          sectorRotation: emptyMetric('섹터 로테이션'),
          score: 0,
          p3Score: 0, // 하위 호환
          mainPrice: mainData.at(-1)?.close || 0,
          ma50: 0,
          ma150: 0,
          ma200: 0,
          mainHistory: [],
          movingAverageHistory: [],
          vixHistory: [],
          sectorRows: [],
          ftdReason: `${mainSymbol} 데이터 부족`,
          distributionDetails: [],
          macroData: {
            leadingSectors: [],
            sectorRows: [],
            breadthRows: [],
            ftdReason: `${mainSymbol} 데이터 부족`,
          },
          regimeHistory: [],
          meta: {
            asOf: new Date().toISOString(),
            source: 'Market Analysis Engine',
            provider: 'MTN Aggregator',
            delay: 'EOD',
            fallbackUsed: false,
            warnings: ['Insufficient data for 200ma'],
          },
          updatedAt: new Date().toISOString(),
        },
        insightLog: '데이터 부족으로 인한 GREY 상태 반환',
        isAiGenerated: false,

        aiFallbackChain: [],
        aiModelInsights: [],
      };
      return NextResponse.json(responseData);
    }

    // 외국인 순매수 5일 누적 (양수=순매수, 음수=순매도)
    const foreignNetBuy5d = foreignNetBuy.slice(0, 5).reduce((sum, r) => sum + r.netBuyAmount, 0);

    // 1. 공통 로직으로 계산 위임
    const breadthRows = breadthSeries
      .filter(([, data]) => data.length >= 200)
      .map(([sym, data]) => {
        const last = data.at(-1)!.close;
        const ma200 = data.slice(-200).reduce((s, d) => s + d.close, 0) / 200;
        // 52주 고가/저가 (실제 데이터 사용)
        const year = data.slice(-252);
        const high52 = Math.max(...year.map((d) => d.high ?? d.close));
        const low52 = Math.min(...year.map((d) => d.low ?? d.close));
        return {
          symbol: sym,
          above200: last > ma200,
          return20: data.length > 21
            ? ((last - data[data.length - 21].close) / data[data.length - 21].close) * 100
            : 0,
          nearHigh52: last >= high52 * 0.97,  // 52주 고가 3% 이내
          nearLow52: last <= low52 * 1.03,    // 52주 저가 3% 이내
        };
      });

    const sectorRows = sectorSeries
      .filter(([, data]) => data.length >= 21)
      .map(([sym, data]) => ({
        symbol: sym,
        name: sectorNames[sym] || sym,
        return20: ((data.at(-1)!.close - data[data.length - 21].close) / data[data.length - 21].close) * 100,
        riskOn: riskOnSectors.has(sym),
        rank: 0,
      }))
      .sort((a, b) => b.return20 - a.return20)
      .map((row, idx) => ({ ...row, rank: idx + 1 }));

    const res = computeP3(mainData, vixData, breadthRows, sectorRows, mainSymbol, breadthEtfs, vix3mData, foreignNetBuy5d);

    // 2. 외부 연동을 위한 매핑 (AI 인사이트용)
    const macroMap = macroQuotes.reduce<Record<string, YahooQuote>>((acc, quote) => {
      acc[quote.symbol] = quote;
      return acc;
    }, {});

    const insightInput = {
      marketState: res.state,
      market,
      metrics: {
        ...res.metrics,
        totalScore: res.p3Score,
      },
      macroData: {
        ...macroMap,
        p3Score: res.p3Score,
        leadingSectors: sectorRows.slice(0, 3),
        sectorRows,
        breadthRows,
        ftdReason: res.ftd.reason,
        market,
      },
    };

    const cacheKey = market;
    const cached = insightCache.get(cacheKey);
    const now = Date.now();
    let insight: CachedInsight;
    if (cached && now - cached.cachedAt < INSIGHT_CACHE_TTL_MS) {
      insight = cached;
    } else {
      insight = await generateInsightWithTimeout(insightInput, cached);
      if (insight.isAiGenerated) {
        insightCache.set(cacheKey, insight);
      } else {
        insightCache.delete(cacheKey);
      }
    }

    // 3. 최종 응답 구조 생성 (기존 호환성 유지)
    const responseData: MasterFilterResponse = {
      state: res.state,
      market,
      metrics: {
        ...res.metrics,
        // 하위 호환성 필드
        score: res.p3Score,
        mainPrice: res.lastClose,
        ma50: res.ma50,
        ma150: res.ma150,
        ma200: res.ma200,
        mainHistory: res.mainHistory,
        movingAverageHistory: res.movingAverageHistory,
        vixHistory: res.vixHistory,
        sectorRows,
        ftdReason: res.ftd.reason,
        distributionDetails: res.distributionDetails,
        macroData: {
          ...macroMap,
          leadingSectors: sectorRows.slice(0, 3),
          sectorRows,
          breadthRows,
          ftdReason: res.ftd.reason,
        },
        regimeHistory: [
          { date: new Date().toISOString(), state: res.state, score: res.p3Score, reason: `P3 score ${res.p3Score}/100` },
        ],
        meta: {
          asOf: new Date().toISOString(),
          source: 'Market Analysis Engine',
          provider: 'MTN Aggregator',
          delay: 'EOD',
          fallbackUsed: false,
          warnings: [],
        },
        updatedAt: new Date().toISOString(),
      },
      insightLog: insight.text,
      isAiGenerated: insight.isAiGenerated,
      aiProviderUsed: insight.providerUsed,
      aiModelUsed: insight.modelUsed,
      aiFallbackChain: insight.fallbackChain,
      aiModelInsights: insight.modelInsights,
      aiErrorSummary: insight.errorSummary,
    };

    return NextResponse.json(responseData);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '마스터 필터 분석 중 오류가 발생했습니다.';
    console.error('Master Filter Engine Error:', error);
    return NextResponse.json({ message, code: 'API_ERROR', recoverable: false }, { status: 500 });
  }
}
