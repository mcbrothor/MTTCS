import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = process.env.GEMINI_API_KEY || '';
const PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const FALLBACK_MODEL = process.env.GEMMA_MODEL || 'gemma-4-31b';

const genAI = new GoogleGenerativeAI(API_KEY);

export interface MarketAnalysisInput {
  marketState: string;
  metrics: {
    trend: any; // MasterFilterMetricDetail
    breadth: any;
    liquidity: any;
    volatility: any;
    leadership: any;
    totalScore: number;
  };
  macroData: Record<string, unknown>;
}

/**
 * 지연(Sleep) 유틸리티
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 재시도를 지원하는 모델 호출 함수
 */
async function callModelWithRetry(modelId: string, prompt: string, retries = 2): Promise<string> {
  const model = genAI.getGenerativeModel({ model: modelId });
  
  for (let i = 0; i <= retries; i++) {
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error: any) {
      const isRateLimit = error?.message?.includes('429') || error?.status === 429;
      
      if (isRateLimit && i < retries) {
        const waitTime = (i + 1) * 2000;
        console.warn(`[AI Warning] Rate limit hit for ${modelId}. Retrying in ${waitTime}ms... (${i + 1}/${retries})`);
        await sleep(waitTime);
        continue;
      }
      
      throw error;
    }
  }
  throw new Error(`Failed to call model ${modelId} after ${retries} retries.`);
}

export async function generateMarketInsight(input: MarketAnalysisInput): Promise<string> {
  const prompt = `
당신은 베테랑 퀀트 트레이더이자 시장 전략가인 'Centaur' AI입니다. 
제공된 '마스터 필터' 데이터와 '매크로 분석' 지표를 바탕으로 현재 시장 국면에 대한 전문적이고 통찰력 있는 분석 리포트를 작성하세요.

### 현재 시장 데이터 (Navigator Metrics):
- **전체 국면 (Market State):** ${input.marketState} (Score: ${input.metrics.totalScore}/5)
- **핵심 지표:**
  - 추세 (Trend): ${input.metrics.trend.value} (${input.metrics.trend.status}) - ${input.metrics.trend.description}
  - 시장 폭 (Breadth): ${input.metrics.breadth.value}% (Threshold: ${input.metrics.breadth.threshold})
  - 수급 (Liquidity): ${input.metrics.liquidity.value} Distribution Days (Max: ${input.metrics.liquidity.threshold})
  - 변동성 (VIX): ${input.metrics.volatility.value} (${input.metrics.volatility.status})
  - 주도 섹터 (Leadership): ${input.metrics.leadership.value}

### 매크로 상황 (Macro Context):
${JSON.stringify(input.macroData, null, 2)}

### 작성 가이드라인:
1. **분석 개요:** 현재 시장의 지배적인 테마와 위험 요소를 한 문장으로 정의하세요.
2. **세부 분석:** 마스터 필터 수치와 매크로 지표(금리, 채권, 유동성 등)를 유기적으로 결합하여 현재 국면이 도출된 논리적 근거를 설명하세요. (전고점 탈환 시도 여부 등 포함)
3. **트레이딩 전략:** 현재 국면에서 SEPA 전략(VCP 점진적 매수 등)을 어떻게 운용해야 하는지(공격/방어/관망) 구체적인 리스크 관리 기준을 제시하세요.
4. **결론:** 트레이더가 오늘 바로 실행하거나 명심해야 할 핵심 포인트 한 가지를 강조하세요.

**톤앤매너:** 냉철하고 분석적이며, 트레이더에게 실질적인 리스크 관리 기준을 제시하는 전문적인 어조를 유지하세요. 마크다운 형식을 사용하여 가독성 있게 작성하고, 모든 내용은 한국어로 작성하세요.
`;

  if (!API_KEY) {
    return "API 키가 설정되지 않았습니다. .env.local 파일을 확인하십시오.";
  }

  try {
    // 1차 시도: Primary Model (Gemini 3.1 Flash Lite)
    return await callModelWithRetry(PRIMARY_MODEL, prompt);
  } catch (error: any) {
    console.error(`[AI Error] Primary model (${PRIMARY_MODEL}) failed:`, error.message);
    
    try {
      // 2차 시도: Fallback Model (Gemma 4 31B)
      console.log(`[AI Info] Attempting fallback to ${FALLBACK_MODEL}...`);
      return await callModelWithRetry(FALLBACK_MODEL, prompt);
    } catch (fallbackError: any) {
      console.error(`[AI Error] Fallback model (${FALLBACK_MODEL}) also failed:`, fallbackError.message);
      
      let errorMsg = "지능형 분석 엔진(AI)과의 연결에 실패했습니다.";
      if (fallbackError.message?.includes('429')) {
        errorMsg += " (일일 할당량 초과)";
      } else if (fallbackError.message?.includes('404')) {
        errorMsg += " (모델명을 찾을 수 없음)";
      }
      
      return `${errorMsg} 현재 수치 데이터를 바탕으로 원칙에 근거한 매매를 진행하시기 바랍니다.`;
    }
  }
}
