import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = process.env.GEMINI_API_KEY || '';
const PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const FALLBACK_MODEL = process.env.GEMMA_MODEL || 'gemma-4-31b';

const genAI = new GoogleGenerativeAI(API_KEY);

export interface MarketAnalysisInput {
  marketState: string;
  metrics: {
    trend: string;
    breadth: number;
    liquidity: string;
    vix: number | null;
    leadership: string;
  };
  macroData: Record<string, unknown>;
}

export async function generateMarketInsight(input: MarketAnalysisInput): Promise<string> {
  const prompt = `
당신은 베테랑 퀀트 트레이더이자 시장 전략가인 'Centaur' AI입니다. 
제공된 '마스터 필터' 데이터와 '매크로 분석' 지표를 바탕으로 현재 시장 국면에 대한 전문적이고 통찰력 있는 분석 리포트를 작성하세요.

### 현재 시장 데이터:
- **전체 국면 (Market State):** ${input.marketState}
- **5대 지표:**
  - 추세 (Trend): ${input.metrics.trend}
  - 시장 폭 (Breadth): ${input.metrics.breadth}점 (50점 이상 시 긍정)
  - 수급 (Liquidity): ${input.metrics.liquidity}
  - 변동성 (VIX): ${input.metrics.vix ?? 'N/A'}
  - 주도 섹터 (Leadership): ${input.metrics.leadership}
- **매크로 상황 (Macro Context):**
  ${JSON.stringify(input.macroData, null, 2)}

### 작성 가이드라인:
1. **분석 개요:** 현재 시장의 지배적인 테마와 위험 요소를 한 문장으로 정의하세요.
2. **세부 분석:** 마스터 필터 수치와 매크로 지표(금리, 유동성 등)를 결합하여 왜 현재 국면이 도출되었는지 논리적으로 설명하세요.
3. **트레이딩 전략:** 현재 국면에서 SEPA 전략을 어떻게 운용해야 하는지(공격/방어/관망) 구체적으로 조언하세요.
4. **결론:** 트레이더가 오늘 바로 명심해야 할 핵심 포인트 한 가지를 강조하세요.

**톤앤매너:** 냉철하고 분석적이며, 트레이더에게 실질적인 리스크 관리 기준을 제시하는 전문적인 어조를 유지하세요. 모든 내용은 한국어로 작성하세요.
`;

  try {
    // 1차 시도: Primary Model (Gemini 3.1 Flash Lite)
    const model = genAI.getGenerativeModel({ model: PRIMARY_MODEL });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error(`Primary model (${PRIMARY_MODEL}) failed, attempting fallback:`, error);
    
    try {
      // 2차 시도: Fallback Model (Gemma 4 31B)
      const fallbackModel = genAI.getGenerativeModel({ model: FALLBACK_MODEL });
      const result = await fallbackModel.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (fallbackError) {
      console.error(`Fallback model (${FALLBACK_MODEL}) also failed:`, fallbackError);
      return "지능형 분석 엔진(AI)과의 연결에 실패했습니다. 현재 수치 데이터를 바탕으로 원칙에 근거한 매매를 진행하시기 바랍니다.";
    }
  }
}
