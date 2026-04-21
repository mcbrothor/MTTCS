import { NextResponse } from 'next/server';
import { generateMarketInsight } from '@/lib/ai/gemini';
import { sendTelegramMessage } from '@/lib/telegram';
import { formatDetailedMarketReport } from '@/lib/telegram/format';
import { MasterFilterResponse, MasterFilterMetrics } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const mockData = {
      state: 'GREEN' as const,
      market: 'US' as const,
      p3Score: 92,
      mainPrice: 520.4,
      vixLevel: 14.5,
      trend: { status: 'PASS' as const, value: '상승장 (이평 정배열)', threshold: 'Price > 200MA', description: '50/150/200일 이평선 위에 위치', label: '추세', unit: 'binary', source: 'yahoo' },
      breadth: { status: 'PASS' as const, value: 85, threshold: 60, description: '상승 참여 종목 다수', label: '폭', unit: '%', source: 'yahoo' },
      liquidity: { status: 'PASS' as const, value: 2, threshold: 5, description: '분산일 5일 미만', label: '유동성', unit: 'days', source: 'yahoo' },
      volatility: { status: 'PASS' as const, value: '안정', threshold: 20, description: 'VIX 20 이하', label: '변동성', unit: 'level', source: 'yahoo' },
      leadership: { status: 'PASS' as const, value: '순항 중', threshold: 'Risk-ON sectors in top 3', description: '주도 섹터 포지션 유지', label: '주도성', unit: 'rank', source: 'yahoo' },
      newHighLow: { status: 'PASS' as const, value: '+150', threshold: 0, description: '신고가 종목수 압도적', label: '신고가', unit: 'count', source: 'yahoo' },
      sectorRotation: { status: 'PASS' as const, value: 'Risk-ON', threshold: 'Growth > Value', description: '기술/금융 섹터 강세', label: '섹터', unit: 'status', source: 'yahoo' },
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

    return NextResponse.json({ success: true, message: '상세 리포트가 발송되었습니다. 텔레그램을 확인하세요.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
