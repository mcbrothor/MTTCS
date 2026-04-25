import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AiFallbackAttempt, AiInsightProvider, AiModelInsight, MasterFilterMetricDetail } from '@/types';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';
const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY || '';
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || 'qwen-3-235b-a22b-instruct-2507';
const CEREBRAS_CHAT_COMPLETIONS_URL = 'https://api.cerebras.ai/v1/chat/completions';
const MODEL_TIMEOUT_MS = Number(process.env.CENTAUR_MODEL_TIMEOUT_MS || 9000);

export interface MarketAnalysisInput {
  marketState: string;
  metrics: {
    trend: MasterFilterMetricDetail;
    breadth: MasterFilterMetricDetail;
    volatility: MasterFilterMetricDetail;
    distribution: MasterFilterMetricDetail;
    ftd: MasterFilterMetricDetail;
    newHighLow: MasterFilterMetricDetail;
    sectorRotation: MasterFilterMetricDetail;
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
  modelInsights: AiModelInsight[];
  errorSummary: string | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function parseJsonCandidate(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function extractStructuredJson(raw: string) {
  const trimmed = raw.trim();
  const direct = parseJsonCandidate(trimmed);
  if (direct) return direct;

  const fences = Array.from(trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi));
  for (const fence of fences) {
    const parsed = parseJsonCandidate((fence[1] || '').trim());
    if (parsed) return parsed;
  }

  for (let start = 0; start < trimmed.length; start += 1) {
    const open = trimmed[start];
    if (open !== '{' && open !== '[') continue;
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < trimmed.length; index += 1) {
      const char = trimmed[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === open) depth += 1;
      if (char === close) depth -= 1;
      if (depth === 0) {
        const parsed = parseJsonCandidate(trimmed.slice(start, index + 1));
        if (parsed) return parsed;
        break;
      }
    }
  }

  throw new Error('Model response must include a valid JSON object or JSON code block.');
}

export function parseStructuredJsonResponse<T>(raw: string, validate: (payload: unknown) => T) {
  return validate(extractStructuredJson(raw));
}

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = MODEL_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

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
    'Write in Korean. Do not invent live data. Use only the supplied metrics and macro context.',
    '',
    `Market State: ${input.marketState} (Score: ${input.metrics.totalScore})`,
    `Trend: ${input.metrics.trend.value} (${input.metrics.trend.status}) - ${input.metrics.trend.description}`,
    `Breadth: ${input.metrics.breadth.value} / threshold ${input.metrics.breadth.threshold}`,
    `Distribution: ${input.metrics.distribution.value} days / threshold ${input.metrics.distribution.threshold}`,
    `Volatility: ${input.metrics.volatility.value} (${input.metrics.volatility.status})`,
    `FTD: ${input.metrics.ftd.value}`,
    `NH/NL Proxy: ${input.metrics.newHighLow.value}`,
    `Sector Leadership: ${input.metrics.sectorRotation.value}`,
    '',
    'Macro context:',
    JSON.stringify(input.macroData, null, 2),
    '',
    'Respond ONLY with a JSON object (no markdown fences) in this exact shape:',
    '{',
    '  "headline": "<한 줄 핵심 판단, 20자 이내>",',
    '  "bullets": ["<핵심 포인트 1>", "<핵심 포인트 2>", "<핵심 포인트 3>"],',
    '  "detail": "<상세 서술: 시장 추세 근거, 매크로 리스크, 실전 행동 지침>"',
    '}',
  ].join('\n');
}

interface StructuredInsight {
  headline?: string;
  bullets?: string[];
  detail?: string;
}

function parseStructuredInsight(raw: string): { structured: StructuredInsight; text: string } {
  try {
    const parsed = extractStructuredJson(raw);
    if (parsed && typeof parsed === 'object' && 'headline' in parsed) {
      const s = parsed as StructuredInsight;
      const fallbackText = [
        s.headline,
        ...(s.bullets ?? []).map((b: string) => `• ${b}`),
        s.detail,
      ].filter(Boolean).join('\n\n');
      return { structured: s, text: fallbackText };
    }
  } catch {
    // parsing failed — fall through to raw text
  }
  return { structured: {}, text: raw };
}

export async function callGeminiModel(modelId: string, prompt: string, retries = 2): Promise<string> {
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

export async function callGroqModel(modelId: string, prompt: string): Promise<string> {
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

export async function callCerebrasModel(modelId: string, prompt: string): Promise<string> {
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

function makeInsightId(provider: string, model: string, priority: number) {
  return `${priority}-${provider}-${model}`.replace(/[^a-zA-Z0-9._-]/g, '-');
}

function attemptToInsight(input: {
  provider: AiInsightProvider;
  label: string;
  model: string;
  status: AiModelInsight['status'];
  priority: number;
  text?: string;
  headline?: string;
  bullets?: string[];
  detail?: string;
  cachedAt?: string;
  message?: string;
}): AiModelInsight {
  const now = new Date().toISOString();
  return {
    id: makeInsightId(input.label, input.model, input.priority),
    provider: input.provider,
    label: input.label,
    model: input.model,
    status: input.status,
    text: input.text,
    headline: input.headline,
    bullets: input.bullets,
    detail: input.detail,
    cachedAt: input.cachedAt ?? now,
    message: input.message,
    selected: false,
    priority: input.priority,
    generatedAt: now,
  };
}

async function collectGemini(
  model: string,
  prompt: string,
  chain: AiFallbackAttempt[],
  label: string,
  priority: number
): Promise<AiModelInsight> {
  if (!GEMINI_API_KEY) {
    const message = 'GEMINI_API_KEY is not configured.';
    chain.push({ provider: label, model, status: 'skipped', message });
    return attemptToInsight({ provider: 'gemini', label, model, status: 'skipped', message, priority });
  }

  try {
    const raw = await withTimeout(callGeminiModel(model, prompt), `${label}/${model}`);
    const { structured, text } = parseStructuredInsight(raw);
    chain.push({ provider: label, model, status: 'success' });
    return attemptToInsight({ provider: 'gemini', label, model, status: 'success', text, ...structured, priority });
  } catch (error: unknown) {
    const message = compactMessage(error);
    chain.push({ provider: label, model, status: 'failed', message });
    return attemptToInsight({ provider: 'gemini', label, model, status: 'failed', message, priority });
  }
}

async function collectGroq(prompt: string, chain: AiFallbackAttempt[], priority: number): Promise<AiModelInsight> {
  if (!GROQ_API_KEY) {
    const message = 'GROQ_API_KEY is not configured.';
    chain.push({ provider: 'groq', model: GROQ_MODEL, status: 'skipped', message });
    return attemptToInsight({ provider: 'groq', label: 'groq', model: GROQ_MODEL, status: 'skipped', message, priority });
  }

  try {
    const raw = await withTimeout(callGroqModel(GROQ_MODEL, prompt), `groq/${GROQ_MODEL}`);
    const { structured, text } = parseStructuredInsight(raw);
    chain.push({ provider: 'groq', model: GROQ_MODEL, status: 'success' });
    return attemptToInsight({ provider: 'groq', label: 'groq', model: GROQ_MODEL, status: 'success', text, ...structured, priority });
  } catch (error: unknown) {
    const message = compactMessage(error);
    chain.push({ provider: 'groq', model: GROQ_MODEL, status: 'failed', message });
    return attemptToInsight({ provider: 'groq', label: 'groq', model: GROQ_MODEL, status: 'failed', message, priority });
  }
}

async function collectCerebras(prompt: string, chain: AiFallbackAttempt[], priority: number): Promise<AiModelInsight> {
  if (!CEREBRAS_API_KEY) {
    const message = 'CEREBRAS_API_KEY is not configured.';
    chain.push({ provider: 'cerebras', model: CEREBRAS_MODEL, status: 'skipped', message });
    return attemptToInsight({ provider: 'cerebras', label: 'cerebras', model: CEREBRAS_MODEL, status: 'skipped', message, priority });
  }

  try {
    const raw = await withTimeout(callCerebrasModel(CEREBRAS_MODEL, prompt), `cerebras/${CEREBRAS_MODEL}`);
    const { structured, text } = parseStructuredInsight(raw);
    chain.push({ provider: 'cerebras', model: CEREBRAS_MODEL, status: 'success' });
    return attemptToInsight({ provider: 'cerebras', label: 'cerebras', model: CEREBRAS_MODEL, status: 'success', text, ...structured, priority });
  } catch (error: unknown) {
    const message = compactMessage(error);
    chain.push({ provider: 'cerebras', model: CEREBRAS_MODEL, status: 'failed', message });
    return attemptToInsight({ provider: 'cerebras', label: 'cerebras', model: CEREBRAS_MODEL, status: 'failed', message, priority });
  }
}

export async function generateMarketInsight(input: MarketAnalysisInput): Promise<MarketInsightResult> {
  const prompt = buildPrompt(input);
  const chain: AiFallbackAttempt[] = [];
  const tasks: Promise<AiModelInsight>[] = [
    collectGemini(GEMINI_PRIMARY_MODEL, prompt, chain, 'gemini-primary', 1),
    collectGroq(prompt, chain, 3),
    collectCerebras(prompt, chain, 4),
  ];

  if (GEMINI_FALLBACK_MODEL && GEMINI_FALLBACK_MODEL !== GEMINI_PRIMARY_MODEL) {
    tasks.push(collectGemini(GEMINI_FALLBACK_MODEL, prompt, chain, 'gemini-fallback', 2));
  } else {
    const model = GEMINI_FALLBACK_MODEL || '(not configured)';
    const message = 'GEMINI_FALLBACK_MODEL is not configured.';
    chain.push({ provider: 'gemini-fallback', model, status: 'skipped', message });
    tasks.push(Promise.resolve(attemptToInsight({ provider: 'gemini', label: 'gemini-fallback', model, status: 'skipped', message, priority: 2 })));
  }

  const modelInsights = (await Promise.all(tasks)).sort((a, b) => a.priority - b.priority);
  const priorityByProvider = new Map(modelInsights.map((item) => [item.label, item.priority]));
  chain.sort((a, b) => (priorityByProvider.get(a.provider) || 99) - (priorityByProvider.get(b.provider) || 99));

  const selected = modelInsights
    .filter((item) => item.status === 'success' && item.text)
    .sort((a, b) => a.priority - b.priority)[0];

  if (selected) {
    const selectedInsights = modelInsights.map((item) => ({ ...item, selected: item.id === selected.id }));
    return {
      text: selected.text || '',
      isAiGenerated: true,
      providerUsed: selected.provider,
      modelUsed: selected.model,
      fallbackChain: chain,
      modelInsights: selectedInsights,
      errorSummary: null,
    };
  }

  const failedMessages = chain
    .filter((item) => item.status === 'failed')
    .map((item) => `${item.provider}/${item.model}: ${item.message}`)
    .join(' | ');

  chain.push({ provider: 'rules', model: 'mtn-rule-based', status: 'success' });
  const ruleInsight = attemptToInsight({
    provider: 'rules',
    label: 'rules',
    model: 'mtn-rule-based',
    status: 'success',
    text: ruleBasedInsight(input),
    priority: 99,
  });
  return {
    text: ruleInsight.text || '',
    isAiGenerated: false,
    providerUsed: 'rules',
    modelUsed: 'mtn-rule-based',
    fallbackChain: chain,
    modelInsights: [...modelInsights, { ...ruleInsight, selected: true }],
    errorSummary: failedMessages || 'No LLM provider was configured.',
  };
}
