import { NextResponse } from 'next/server';
import { generateMarketInsight } from '@/lib/ai/gemini';
import { sendTelegramMessage } from '@/lib/telegram';
import { formatDetailedMarketReport } from '@/lib/telegram/format';
import { MasterFilterResponse, MasterFilterMetrics } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const markets = ['US', 'KR'] as const;
    const results = [];

    for (const market of markets) {
      const isKr = market === 'KR';
      const mockData = {
        state: 'GREEN' as const,
        market: market,
        p3Score: isKr ? 88 : 92,
        mainPrice: isKr ? 2550.4 : 520.4,
        vixLevel: isKr ? 16.2 : 14.5,
        trend: { status: 'PASS' as const, value: isKr ? 'KOSPI 정배열' : '상승장 (이평 정배열)', threshold: 'Price > 200MA', description: isKr ? '코스피 지수가 주요 이평선 위에 안착함' : '50/150/200일 이평선 위에 위치', label: '추세', unit: 'binary', source: 'yahoo' },
        breadth: { status: 'PASS' as const, value: isKr ? 72 : 85, threshold: 60, description: isKr ? '상승 종목수 우세' : '상승 참여 종목 다수', label: '폭', unit: '%', source: 'yahoo' },
        liquidity: { status: 'PASS' as const, value: isKr ? 3 : 2, threshold: 5, description: isKr ? '매물 소화 완료' : '분산일 5일 미만', label: '유동성', unit: 'days', source: 'yahoo' },
        volatility: { status: 'PASS' as const, value: '안정', threshold: 20, description: 'VIX 20 이하', label: '변동성', unit: 'level', source: 'yahoo' },
        leadership: { status: 'PASS' as const, value: '반도체/바이오 주도', threshold: 'Risk-ON sectors in top 3', description: isKr ? '시가총액 상위 주도주군 강세' : '주도 섹터 포지션 유지', label: '주도성', unit: 'rank', source: 'yahoo' },
        newHighLow: { status: 'PASS' as const, value: isKr ? '+85' : '+150', threshold: 0, description: '신고가 종목수 증가세', label: '신고가', unit: 'count', source: 'yahoo' },
        sectorRotation: { status: 'PASS' as const, value: 'Risk-ON', threshold: 'Growth > Value', description: isKr ? '성장 섹터로의 자금 유입 확인' : '기술/금융 섹터 강세', label: '섹터', unit: 'status', source: 'yahoo' },
        updatedAt: new Date().toISOString(),
      };

      const aiRes = await generateMarketInsight({
        marketState: mockData.state,
        metrics: {
          trend: mockData.trend,
          breadth: mockData.breadth,
          liquidity: mockData.liquidity,
          volatility: mockData.volatility,
          leadership: mockData.leadership,
          totalScore: mockData.p3Score,
        },
        macroData: {
          mainPrice: mockData.mainPrice,
          vix: mockData.vixLevel,
        }
      });

      const reportData: MasterFilterResponse = {
        state: mockData.state,
        market: mockData.market,
        metrics: {
          ...mockData,
        } as unknown as MasterFilterMetrics,
        insightLog: aiRes.text,
        isAiGenerated: aiRes.isAiGenerated,
        aiProviderUsed: aiRes.providerUsed,
        aiModelUsed: aiRes.modelUsed,
      };

      const report = formatDetailedMarketReport(reportData);
      await sendTelegramMessage(report);
      results.push({ market, success: true });
    }

    return NextResponse.json({ success: true, results, message: '미국 및 한국 시장 상세 리포트가 모두 발송되었습니다.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
