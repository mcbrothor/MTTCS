import { generateMarketInsight } from './lib/ai/gemini.ts';
import { sendTelegramMessage } from './lib/telegram.ts';
import { formatDetailedMarketReport } from './lib/telegram/format.ts';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// 테스트용 가상 데이터 (어제/오늘의 대략적인 시장 상황)
const mockData = {
  state: 'GREEN',
  market: 'US',
  p3Score: 92,
  mainPrice: 520.4,
  vixLevel: 14.5,
  trend: { status: 'PASS', value: '상승장 (이평 정배열)', description: '50/150/200일 이평선 위에 위치' },
  breadth: { status: 'PASS', value: 85, threshold: 60, description: '상승 참여 종목 다수' },
  liquidity: { status: 'PASS', value: 2, threshold: 5, description: '분산일 5일 미만' },
  volatility: { status: 'PASS', value: '안정', description: 'VIX 20 이하' },
  leadership: { status: 'PASS', value: '순항 중', description: '주도 섹터 포지션 유지' },
  newHighLow: { status: 'PASS', value: '+150', description: '신고가 종목수 압도적' },
  sectorRotation: { status: 'PASS', value: 'Risk-ON', description: '기술/금융 섹터 강세' },
  updatedAt: new Date().toISOString(),
};

async function test() {
  console.log('1. AI 인사이트 생성 중...');
  try {
    const aiRes = await generateMarketInsight({
      marketState: mockData.state,
      market: mockData.market,
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

    console.log('2. 리포트 포맷팅 중...');
    const report = formatDetailedMarketReport({
      ...mockData,
      insightLog: aiRes.text,
      isAiGenerated: aiRes.isAiGenerated,
      aiProviderUsed: aiRes.providerUsed,
      aiModelUsed: aiRes.modelUsed,
    });

    console.log('3. 텔레그램 발송 중...');
    await sendTelegramMessage(report);
    console.log('✅ 테스트 완료! 텔레그램을 확인하세요.');
  } catch (err) {
    console.error('❌ 테스트 실패:', err);
  }
}

test();
