import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AiFallbackAttempt, AiInsightProvider, MasterFilterMetricDetail } from '@/types';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';
const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY || '';
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || 'qwen-3-235b-a22b-instruct-2507';
const CEREBRAS_CHAT_COMPLETIONS_URL = 'https://api.cerebras.ai/v1/chat/completions';

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

export interface MarketInsightResult {
  text: string;
  isAiGenerated: boolean;
  providerUsed: AiInsightProvider;
  modelUsed: string;
  fallbackChain: AiFallbackAttempt[];
  errorSummary: string | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function compactMessage(value: unknown, max = 500) {
  const message = value instanceof Error ? value.message : String(value);
  return message.length > max ? `${message.slice(0, max)}...` : message;
}

function errorStatus(error: unknown) {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = Number((error as { status?: unknown }).status);
    return Number.isFinite(status) ? status : null;
  }
  return null;
}

function isRateLimit(error: unknown) {
  return compactMessage(error).includes('429') || errorStatus(error) === 429;
}

function buildPrompt(input: MarketAnalysisInput) {
  return [
    'You are MTN Centaur, a concise market-regime analyst for a Mark Minervini SEPA/VCP trader.',
    'Write in Korean. Explain the current market state, macro risk, and practical trading posture.',
    'Do not invent live data. Use only the supplied metrics and macro context.',
    '',
    `Market State: ${input.marketState} (Score: ${input.metrics.totalScore})`,
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
}

async function callGeminiModel(modelId: string, prompt: string, retries = 2): Promise<string> {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: modelId });

  for (let index = 0; index <= retries; index += 1) {
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error: unknown) {
      if (isRateLimit(error) && index < retries) {
        await sleep((index + 1) * 2000);
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Gemini model ${modelId} failed after ${retries} retries.`);
}

async function callGroqModel(modelId: string, prompt: string): Promise<string> {
  const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${GROQ_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: 'You are a concise Korean market-regime analyst.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 900,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Groq ${response.status}: ${body.slice(0, 500) || response.statusText}`);
  }

  const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Groq returned an empty response.');
  return text;
}

async function callCerebrasModel(modelId: string, prompt: string): Promise<string> {
  const response = await fetch(CEREBRAS_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${CEREBRAS_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: 'You are a concise Korean market-regime analyst.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 900,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Cerebras ${response.status}: ${body.slice(0, 500) || response.statusText}`);
  }

  const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Cerebras returned an empty response.');
  return text;
}

function ruleBasedInsight(input: MarketAnalysisInput) {
  const byState = {
    GREEN: '시장 내부 강도와 섹터 로테이션이 우호적입니다. 돌파 후보는 피벗 근처 거래량 확인을 우선하세요.',
    YELLOW: '상승 시도는 가능하지만 변동성, 참여 폭, 분산일 중 일부가 불완전합니다. 포지션 크기를 줄이고 실패 돌파는 빠르게 정리하세요.',
    RED: '시장 압력이 높습니다. 신규 진입보다 현금 비중과 기존 포지션 방어를 우선하세요.',
  };

  return byState[input.marketState as keyof typeof byState] || byState.YELLOW;
}

async function tryGemini(
  model: string,
  prompt: string,
  chain: AiFallbackAttempt[],
  label = 'gemini'
): Promise<MarketInsightResult | null> {
  if (!GEMINI_API_KEY) {
    chain.push({ provider: label, model, status: 'skipped', message: 'GEMINI_API_KEY is not configured.' });
    return null;
  }

  try {
    const text = await callGeminiModel(model, prompt);
    chain.push({ provider: label, model, status: 'success' });
    return {
      text,
      isAiGenerated: true,
      providerUsed: 'gemini',
      modelUsed: model,
      fallbackChain: chain,
      errorSummary: null,
    };
  } catch (error: unknown) {
    chain.push({ provider: label, model, status: 'failed', message: compactMessage(error) });
    return null;
  }
}

async function tryGroq(prompt: string, chain: AiFallbackAttempt[]): Promise<MarketInsightResult | null> {
  if (!GROQ_API_KEY) {
    chain.push({ provider: 'groq', model: GROQ_MODEL, status: 'skipped', message: 'GROQ_API_KEY is not configured.' });
    return null;
  }

  try {
    const text = await callGroqModel(GROQ_MODEL, prompt);
    chain.push({ provider: 'groq', model: GROQ_MODEL, status: 'success' });
    return {
      text,
      isAiGenerated: true,
      providerUsed: 'groq',
      modelUsed: GROQ_MODEL,
      fallbackChain: chain,
      errorSummary: null,
    };
  } catch (error: unknown) {
    chain.push({ provider: 'groq', model: GROQ_MODEL, status: 'failed', message: compactMessage(error) });
    return null;
  }
}

async function tryCerebras(prompt: string, chain: AiFallbackAttempt[]): Promise<MarketInsightResult | null> {
  if (!CEREBRAS_API_KEY) {
    chain.push({ provider: 'cerebras', model: CEREBRAS_MODEL, status: 'skipped', message: 'CEREBRAS_API_KEY is not configured.' });
    return null;
  }

  try {
    const text = await callCerebrasModel(CEREBRAS_MODEL, prompt);
    chain.push({ provider: 'cerebras', model: CEREBRAS_MODEL, status: 'success' });
    return {
      text,
      isAiGenerated: true,
      providerUsed: 'cerebras',
      modelUsed: CEREBRAS_MODEL,
      fallbackChain: chain,
      errorSummary: null,
    };
  } catch (error: unknown) {
    chain.push({ provider: 'cerebras', model: CEREBRAS_MODEL, status: 'failed', message: compactMessage(error) });
    return null;
  }
}

export async function generateMarketInsight(input: MarketAnalysisInput): Promise<MarketInsightResult> {
  const prompt = buildPrompt(input);
  const chain: AiFallbackAttempt[] = [];

  const primary = await tryGemini(GEMINI_PRIMARY_MODEL, prompt, chain, 'gemini-primary');
  if (primary) return primary;

  if (GEMINI_FALLBACK_MODEL && GEMINI_FALLBACK_MODEL !== GEMINI_PRIMARY_MODEL) {
    const fallback = await tryGemini(GEMINI_FALLBACK_MODEL, prompt, chain, 'gemini-fallback');
    if (fallback) return fallback;
  } else {
    chain.push({
      provider: 'gemini-fallback',
      model: GEMINI_FALLBACK_MODEL || '(not configured)',
      status: 'skipped',
      message: 'GEMINI_FALLBACK_MODEL is not configured.',
    });
  }

  const groq = await tryGroq(prompt, chain);
  if (groq) return groq;

  const cerebras = await tryCerebras(prompt, chain);
  if (cerebras) return cerebras;

  const failedMessages = chain
    .filter((item) => item.status === 'failed')
    .map((item) => `${item.provider}/${item.model}: ${item.message}`)
    .join(' | ');

  chain.push({ provider: 'rules', model: 'mtn-rule-based', status: 'success' });
  return {
    text: ruleBasedInsight(input),
    isAiGenerated: false,
    providerUsed: 'rules',
    modelUsed: 'mtn-rule-based',
    fallbackChain: chain,
    errorSummary: failedMessages || 'No LLM provider was configured.',
  };
}
