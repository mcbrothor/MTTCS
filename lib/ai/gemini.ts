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
const MODEL_TIMEOUT_MS = Number(process.env.CENTAUR_MODEL_TIMEOUT_MS || (process.env.VERCEL === '1' ? 4500 : 9000));

export const LOCAL_LLM_ENABLED = process.env.LOCAL_LLM_ENABLED?.toLowerCase() === 'true';
export const LOCAL_LLM_API_URL = process.env.LOCAL_LLM_API_URL || 'http://localhost:11434/v1';
export const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL || 'qwen3.6:14b';
const LOCAL_LLM_PROXY_SECRET = process.env.LOCAL_LLM_PROXY_SECRET || process.env.TOSS_PROXY_SECRET || '';

export interface MarketAnalysisInput {
  marketState: string;
  metrics: {
    trend: MasterFilterMetricDetail;
    breadth: MasterFilterMetricDetail;
    volatility: MasterFilterMetricDetail;
    adr?: MasterFilterMetricDetail;
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

export async function settleModelInsightsUntilFirstSuccess(tasks: Promise<AiModelInsight>[]) {
  const modelInsights: AiModelInsight[] = [];
  let selected: { index: number; insight: AiModelInsight } | null = null;
  const pending = new Map(
    tasks.map((task, index) => [
      index,
      task
        .then((insight) => ({ index, insight }))
        .catch((error: unknown) => ({
          index,
          insight: attemptToInsight({
            provider: 'rules',
            label: 'internal-error',
            model: 'insight-router',
            status: 'failed',
            message: compactMessage(error),
            priority: 98,
          }),
        })),
    ]),
  );

  while (pending.size > 0) {
    const { index, insight } = await Promise.race(pending.values());
    pending.delete(index);
    modelInsights.push(insight);

    if (insight.status === 'success' && insight.text) {
      if (!selected || insight.priority < selected.insight.priority) selected = { index, insight };
    }

    const chosen = selected;
    if (chosen) {
      const hasHigherPriorityPending = Array.from(pending.keys()).some((pendingIndex) => pendingIndex < chosen.index);
      if (!hasHigherPriorityPending) {
        for (const task of pending.values()) {
          void task.catch(() => {});
        }
        return {
          selected: chosen.insight,
          modelInsights: modelInsights.sort((a, b) => a.priority - b.priority),
        };
      }
    }
  }

  return {
    selected: null,
    modelInsights: modelInsights.sort((a, b) => a.priority - b.priority),
  };
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
    input.metrics.adr ? `ADR: ${input.metrics.adr.value}${input.metrics.adr.unit} (${input.metrics.adr.status}) - ${input.metrics.adr.description}` : null,
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
  ].filter(Boolean).join('\n');
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

export async function callGeminiModel(
  modelId: string,
  prompt: string,
  retries = 2,
  maxOutputTokens?: number,
): Promise<string> {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: modelId,
    ...(maxOutputTokens ? { generationConfig: { maxOutputTokens } } : {}),
  });

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

export async function callGroqModel(
  modelId: string,
  prompt: string,
  systemPrompt = 'You are a concise Korean market-regime analyst.',
  maxOutputTokens = 900
): Promise<string> {
  const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${GROQ_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: maxOutputTokens,
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

export async function callCerebrasModel(
  modelId: string,
  prompt: string,
  systemPrompt = 'You are a concise Korean market-regime analyst.',
  maxOutputTokens = 900
): Promise<string> {
  const response = await fetch(CEREBRAS_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${CEREBRAS_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: maxOutputTokens,
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

function withProviderSummaries(insights: AiModelInsight[]) {
  const hasLocalLlm = insights.some((item) => item.provider === 'local-llm');
  if (!hasLocalLlm) {
    insights.push(attemptToInsight({
      provider: 'local-llm',
      label: 'local-llm',
      model: LOCAL_LLM_MODEL,
      status: 'skipped',
      message: LOCAL_LLM_ENABLED
        ? 'Local LLM is enabled; skipped waiting after a higher-priority model succeeded.'
        : 'Local LLM is not enabled.',
      priority: 4,
    }));
  }
  return insights.sort((a, b) => a.priority - b.priority);
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

async function collectLocalLlm(prompt: string, chain: AiFallbackAttempt[], priority: number): Promise<AiModelInsight> {
  if (!LOCAL_LLM_ENABLED) {
    const message = 'Local LLM is not enabled.';
    chain.push({ provider: 'local-llm', model: LOCAL_LLM_MODEL, status: 'skipped', message });
    return attemptToInsight({ provider: 'local-llm', label: 'local-llm', model: LOCAL_LLM_MODEL, status: 'skipped', message, priority });
  }

  try {
    const raw = await withTimeout(callLocalLlmModel(prompt, 'You are a concise Korean market-regime analyst.', 900), `local-llm/${LOCAL_LLM_MODEL}`);
    const { structured, text } = parseStructuredInsight(raw);
    chain.push({ provider: 'local-llm', model: LOCAL_LLM_MODEL, status: 'success' });
    return attemptToInsight({ provider: 'local-llm', label: 'local-llm', model: LOCAL_LLM_MODEL, status: 'success', text, ...structured, priority });
  } catch (error: unknown) {
    const message = compactMessage(error);
    chain.push({ provider: 'local-llm', model: LOCAL_LLM_MODEL, status: 'failed', message });
    return attemptToInsight({ provider: 'local-llm', label: 'local-llm', model: LOCAL_LLM_MODEL, status: 'failed', message, priority });
  }
}

async function collectCodexCli(prompt: string, chain: AiFallbackAttempt[], priority: number): Promise<AiModelInsight> {
  const isVercel = process.env.VERCEL === '1';
  if (isVercel) {
    const message = 'Codex CLI is not available on Vercel environment.';
    chain.push({ provider: 'codex-cli', model: 'codex', status: 'skipped', message });
    return attemptToInsight({ provider: 'codex-cli', label: 'codex-cli', model: 'codex', status: 'skipped', message, priority });
  }

  try {
    const raw = await withTimeout(callCodexCli(prompt), `codex-cli/codex`, 25000);
    const { structured, text } = parseStructuredInsight(raw);
    chain.push({ provider: 'codex-cli', model: 'codex', status: 'success' });
    return attemptToInsight({ provider: 'codex-cli', label: 'codex-cli', model: 'codex', status: 'success', text, ...structured, priority });
  } catch (error: unknown) {
    const message = compactMessage(error);
    chain.push({ provider: 'codex-cli', model: 'codex', status: 'failed', message });
    return attemptToInsight({ provider: 'codex-cli', label: 'codex-cli', model: 'codex', status: 'failed', message, priority });
  }
}

export async function generateMarketInsight(input: MarketAnalysisInput): Promise<MarketInsightResult> {
  const prompt = buildPrompt(input);
  const chain: AiFallbackAttempt[] = [];
  const tasks: Promise<AiModelInsight>[] = [
    collectGemini(GEMINI_PRIMARY_MODEL, prompt, chain, 'gemini-primary', 0),
  ];

  if (GEMINI_FALLBACK_MODEL && GEMINI_FALLBACK_MODEL !== GEMINI_PRIMARY_MODEL) {
    tasks.push(collectGemini(GEMINI_FALLBACK_MODEL, prompt, chain, 'gemini-fallback', 1));
  } else {
    const model = GEMINI_FALLBACK_MODEL || '(not configured)';
    const message = 'GEMINI_FALLBACK_MODEL is not configured.';
    chain.push({ provider: 'gemini-fallback', model, status: 'skipped', message });
    tasks.push(Promise.resolve(attemptToInsight({ provider: 'gemini', label: 'gemini-fallback', model, status: 'skipped', message, priority: 1 })));
  }

  tasks.push(
    collectGroq(prompt, chain, 2),
    collectCerebras(prompt, chain, 3),
    collectLocalLlm(prompt, chain, 4),
    collectCodexCli(prompt, chain, 5)
  );

  const { selected, modelInsights } = await settleModelInsightsUntilFirstSuccess(tasks);
  const priorityByChainKey = new Map<string, number>();
  for (const item of modelInsights) {
    priorityByChainKey.set(item.label, item.priority);
    priorityByChainKey.set(item.provider, Math.min(item.priority, priorityByChainKey.get(item.provider) ?? 99));
  }
  chain.sort((a, b) => (priorityByChainKey.get(a.provider) ?? 99) - (priorityByChainKey.get(b.provider) ?? 99));

  if (selected) {
    const selectedInsights = withProviderSummaries(modelInsights)
      .map((item) => ({ ...item, selected: item.id === selected.id }));
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

/**
 * 로컬 Ollama LLM(기본 qwen3.6:14b)의 OpenAI 호환 completions 엔드포인트를 호출합니다.
 */
export async function callLocalLlmModel(
  prompt: string,
  systemPrompt = 'You are a Senior Investment Bank Committee Member.',
  maxOutputTokens = 8192,
  forceLargeTimeout = false
): Promise<string> {
  const isVercel = process.env.VERCEL === '1';
  // Vercel 환경이고 forceLargeTimeout이 아닐 때만 5.5초 타임아웃 적용 (로컬 전용 강제 호출 시에는 10분/600초 적용)
  const timeoutMs = (isVercel && !forceLargeTimeout) ? 5500 : 600000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${LOCAL_LLM_API_URL.replace(/\/$/, '')}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(LOCAL_LLM_PROXY_SECRET ? { authorization: `Bearer ${LOCAL_LLM_PROXY_SECRET}` } : {}),
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: LOCAL_LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: maxOutputTokens,
        options: {
          num_ctx: 16384, // 6인 대가의 긴 복기 리포트 생성을 위해 컨텍스트 윈도우 16k 확장
          num_predict: 8192 // Ollama 엔진 출력 토큰 강제 제한 해제 (글 끊김 방지)
        }
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Local LLM ${response.status}: ${body.slice(0, 500) || response.statusText}`);
    }

    const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Local LLM returned an empty response.');
    return text;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Local LLM call timed out after ${timeoutMs}ms (Vercel Serverless limit defense).`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Codex CLI를 로컬 프로세스로 직접 호출합니다.
 */
export async function callCodexCli(prompt: string, timeoutMs = 25000): Promise<string> {
  const { spawn } = await import('node:child_process');
  const { mkdir, readFile, rm } = await import('node:fs/promises');
  const path = await import('node:path');
  const os = await import('node:os');

  const cwd = path.join(os.tmpdir(), 'mtn-codex-market');
  await mkdir(cwd, { recursive: true }).catch(() => {});
  const outputPath = path.join(cwd, `market-${Date.now()}-${process.pid}.json`);

  return new Promise((resolve, reject) => {
    const args = [
      'exec',
      '--ephemeral',
      '--sandbox', 'read-only',
      '--skip-git-repo-check',
      '--cd', cwd,
      '--output-last-message', outputPath,
    ];

    if (process.env.CODEX_CLI_MODEL) {
      args.push('--model', process.env.CODEX_CLI_MODEL);
    }
    args.push('-');

    const child = spawn('codex', args, {
      env: { ...process.env, TERM: 'dumb' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Codex CLI timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', async (code) => {
      clearTimeout(timer);
      try {
        let finalMessage = stdout.trim();
        try {
          const fileMessage = await readFile(outputPath, 'utf8');
          if (fileMessage.trim()) finalMessage = fileMessage.trim();
        } catch {
          // ignore
        }
        await rm(outputPath, { force: true }).catch(() => {});

        if (code === 0 || finalMessage.includes('{')) {
          resolve(finalMessage);
        } else {
          reject(new Error(`Codex CLI exited with code ${code}: ${(stderr || stdout).slice(0, 500)}`));
        }
      } catch (err) {
        reject(err);
      }
    });

    // Write prompt
    child.stdin.write(prompt);
    child.stdin.end();
  });
}
