import { GoogleGenerativeAI } from '@google/generative-ai';
import type { MasterFilterMetricDetail } from '@/types';

const API_KEY = process.env.GEMINI_API_KEY || '';
const PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const FALLBACK_MODEL = process.env.GEMMA_MODEL || 'gemma-4-31b';

const genAI = new GoogleGenerativeAI(API_KEY);

export interface MarketAnalysisInput {
  marketState: string;
  metrics: {
    trend: MasterFilterMetricDetail;
    breadth: MasterFilterMetricDetail;
    liquidity: MasterFilterMetricDetail;
    volatility: MasterFilterMetricDetail;
    leadership: MasterFilterMetricDetail;
    totalScore: number;
  };
  macroData: Record<string, unknown>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function errorStatus(error: unknown) {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = Number((error as { status?: unknown }).status);
    return Number.isFinite(status) ? status : null;
  }
  return null;
}

async function callModelWithRetry(modelId: string, prompt: string, retries = 2): Promise<string> {
  const model = genAI.getGenerativeModel({ model: modelId });

  for (let i = 0; i <= retries; i += 1) {
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error: unknown) {
      const isRateLimit = errorMessage(error).includes('429') || errorStatus(error) === 429;
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
  if (!API_KEY) {
    return 'GEMINI_API_KEY is not configured. Use the numeric master-filter metrics as the primary signal.';
  }

  const prompt = [
    'You are MTN, a concise market-regime analyst for a Mark Minervini SEPA/VCP trader.',
    'Write in Korean. Explain the current market state, macro risk, and practical trading posture.',
    '',
    `Market State: ${input.marketState} (Score: ${input.metrics.totalScore}/5)`,
    `Trend: ${input.metrics.trend.value} (${input.metrics.trend.status}) - ${input.metrics.trend.description}`,
    `Breadth: ${input.metrics.breadth.value} / threshold ${input.metrics.breadth.threshold}`,
    `Liquidity: ${input.metrics.liquidity.value} distribution days / threshold ${input.metrics.liquidity.threshold}`,
    `Volatility: ${input.metrics.volatility.value} (${input.metrics.volatility.status})`,
    `Leadership: ${input.metrics.leadership.value}`,
    '',
    'Macro context:',
    JSON.stringify(input.macroData, null, 2),
    '',
    'Return a short Markdown note with: 1) summary, 2) risk-on/risk-off evidence, 3) action guideline.',
  ].join('\n');

  try {
    return await callModelWithRetry(PRIMARY_MODEL, prompt);
  } catch (error: unknown) {
    console.error(`[AI Error] Primary model (${PRIMARY_MODEL}) failed:`, errorMessage(error));
    try {
      return await callModelWithRetry(FALLBACK_MODEL, prompt);
    } catch (fallbackError: unknown) {
      const message = errorMessage(fallbackError);
      console.error(`[AI Error] Fallback model (${FALLBACK_MODEL}) also failed:`, message);
      if (message.includes('429')) return 'AI analysis is temporarily unavailable because the model quota was exceeded.';
      if (message.includes('404')) return 'AI analysis is unavailable because the configured model was not found.';
      return 'AI analysis is unavailable. Use the master-filter metrics and macro dashboard as the decision basis.';
    }
  }
}
