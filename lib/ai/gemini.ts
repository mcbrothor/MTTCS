import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  AiFallbackAttempt,
  AiInsightErrorCode,
  AiInsightEvidence,
  AiInsightProvider,
  AiModelInsight,
  EarlyWarningMatrix,
  GroundedMarketInsight,
  GroundedMarketInsightValidation,
  MasterFilterMetricDetail,
} from '@/types';
import { friendlyMetricLabel } from '../market-display.ts';
import {
  buildMarketInsightEvidenceCatalog,
  buildRuleBasedGroundedInsight,
  normalizeGroundedMarketInsightPayload,
  renderGroundedMarketInsight,
  validateGroundedMarketInsight,
  validationResult,
} from './grounded-market-insight.ts';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';
const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY || '';
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || 'gpt-oss-120b';
const CEREBRAS_CHAT_COMPLETIONS_URL = 'https://api.cerebras.ai/v1/chat/completions';
const LEGACY_MODEL_TIMEOUT_MS = positiveEnvNumber('CENTAUR_MODEL_TIMEOUT_MS', process.env.VERCEL === '1' ? 7000 : 9000);
const GEMINI_TIMEOUT_MS = positiveEnvNumber('CENTAUR_GEMINI_TIMEOUT_MS', LEGACY_MODEL_TIMEOUT_MS);
const FAST_MODEL_TIMEOUT_MS = positiveEnvNumber('CENTAUR_FAST_MODEL_TIMEOUT_MS', 5000);
const LOCAL_MODEL_TIMEOUT_MS = positiveEnvNumber('CENTAUR_LOCAL_MODEL_TIMEOUT_MS', 8000);

export const LOCAL_LLM_ENABLED = process.env.LOCAL_LLM_ENABLED?.toLowerCase() === 'true';
export const LOCAL_LLM_API_URL = process.env.LOCAL_LLM_API_URL || 'http://localhost:11434/v1';
export const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL || 'qwen2.5:7b';
const LOCAL_LLM_PROXY_SECRET = process.env.LOCAL_LLM_PROXY_SECRET || process.env.TOSS_PROXY_SECRET || '';

function positiveEnvNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

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
    displayScoreLabel?: string;
    displaySections?: string[];
    earlyWarnings?: EarlyWarningMatrix;
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
  aiInsight: GroundedMarketInsight;
  aiValidation: GroundedMarketInsightValidation;
  aiEvidence: AiInsightEvidence[];
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

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs: number): Promise<T> {
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

export function classifyAiInsightError(value: unknown): { errorCode: AiInsightErrorCode; message: string } {
  const raw = compactMessage(value);
  const lower = raw.toLowerCase();

  if (lower.includes('timed out') || lower.includes('timeout') || lower.includes('aborterror')) {
    return { errorCode: 'TIMEOUT', message: 'Provider response timed out.' };
  }
  if (lower.includes('429') || lower.includes('rate limit')) {
    return { errorCode: 'RATE_LIMITED', message: 'Provider rate limit exceeded.' };
  }
  if (lower.includes('model does not exist') || lower.includes('model_not_found') || lower.includes('model not found')) {
    return { errorCode: 'MODEL_NOT_FOUND', message: 'Provider model is unavailable or access is denied.' };
  }
  if (lower.includes('not available on vercel') || lower.includes('not enabled') || lower.includes('not configured')) {
    return { errorCode: 'UNAVAILABLE', message: raw };
  }
  if (
    lower.includes('must be a json object')
    || lower.includes('valid json object')
    || lower.includes('schema mismatch')
    || lower.includes('schemaversion')
    || lower.includes('evidencekeys')
    || lower.includes('numeric claims')
    || lower.includes('empty response')
  ) {
    return { errorCode: 'INVALID_RESPONSE', message: raw };
  }
  if (lower.includes('<!doctype html') || lower.includes('<html') || lower.includes('ngrok')) {
    return { errorCode: 'PROXY_ERROR', message: 'Provider proxy returned a non-JSON error response.' };
  }
  return { errorCode: 'PROVIDER_ERROR', message: 'Provider request failed.' };
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
  const warningSummary = input.metrics.earlyWarnings
    ? [
        `조기경보 상태: ${input.metrics.earlyWarnings.summary}`,
        `조기경보 행동: ${input.metrics.earlyWarnings.action}`,
        ...input.metrics.earlyWarnings.signals.map((signal) => `${signal.title}: ${signal.status} - ${signal.action}`),
      ]
    : [];
  return [
    'You are MTN Centaur, a concise market risk analyst.',
    'Write in Korean. Do not invent live data. Use only the supplied metrics and macro context.',
    'Use plain language. Never write a number in commentary; cite evidenceKeys for every factual claim.',
    '',
    `시장 상태: ${input.marketState} (${input.metrics.displayScoreLabel ?? '종합 점수'}: ${input.metrics.totalScore})`,
    `${friendlyMetricLabel(input.metrics.trend.label)}: ${input.metrics.trend.value} (${input.metrics.trend.status}) - ${input.metrics.trend.description}`,
    `${friendlyMetricLabel(input.metrics.breadth.label)}: ${input.metrics.breadth.value} / 기준 ${input.metrics.breadth.threshold}`,
    `${friendlyMetricLabel(input.metrics.distribution.label)}: ${input.metrics.distribution.value}일 / 기준 ${input.metrics.distribution.threshold}`,
    `${friendlyMetricLabel(input.metrics.volatility.label)}: ${input.metrics.volatility.value} (${input.metrics.volatility.status})`,
    input.metrics.adr ? `${friendlyMetricLabel(input.metrics.adr.label)}: ${input.metrics.adr.value}${input.metrics.adr.unit} (${input.metrics.adr.status}) - ${input.metrics.adr.description}` : null,
    `${friendlyMetricLabel(input.metrics.ftd.label)}: ${input.metrics.ftd.value}`,
    `${friendlyMetricLabel(input.metrics.newHighLow.label)}: ${input.metrics.newHighLow.value}`,
    `${friendlyMetricLabel(input.metrics.sectorRotation.label)}: ${input.metrics.sectorRotation.value}`,
    ...warningSummary,
    '',
    '시장 밖 위험과 원천 데이터:',
    JSON.stringify(input.macroData, null, 2),
    '',
    'Respond ONLY with a JSON object (no markdown fences and no extra keys) in this exact shape:',
    '{',
    '  "schemaVersion": "1",',
    '  "headline": "<한 줄 핵심 판단>",',
    '  "stance": "NORMAL | CAUTIOUS | DEFENSIVE",',
    '  "evidenceKeys": ["trend | breadth | volatility | adr | distribution | ftd | newHighLow | sectorRotation | totalScore"],',
    '  "actionCode": "SCAN_NORMALLY | REDUCE_POSITION_SIZE | PAUSE_NEW_BUYS",',
    '  "commentary": "<숫자를 쓰지 않은 정성적 설명>"',
    '}',
  ].filter(Boolean).join('\n');
}

export function parseGroundedInsightResponse(raw: string, evidenceCatalog: AiInsightEvidence[]) {
  const knownKeys = new Set(evidenceCatalog.map((item) => item.key));
  const normalizedPayload = normalizeGroundedMarketInsightPayload(extractStructuredJson(raw));
  const groundedInsight = validateGroundedMarketInsight(normalizedPayload, knownKeys);
  const selectedEvidence = groundedInsight.evidenceKeys
    .map((key) => evidenceCatalog.find((item) => item.key === key))
    .filter((item): item is AiInsightEvidence => Boolean(item));
  const text = renderGroundedMarketInsight(groundedInsight, selectedEvidence);
  return {
    groundedInsight,
    selectedEvidence,
    text,
    headline: groundedInsight.headline,
    detail: [groundedInsight.commentary, ...text.split('\n\n').slice(2)].join('\n\n'),
  };
}

export async function callGeminiModel(
  modelId: string,
  prompt: string,
  retries = 2,
  maxOutputTokens = 900,
): Promise<string> {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: modelId,
    generationConfig: {
      maxOutputTokens,
      responseMimeType: 'application/json',
    },
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
      response_format: { type: 'json_object' },
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
      response_format: { type: 'json_object' },
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
  groundedInsight?: GroundedMarketInsight;
  cachedAt?: string;
  message?: string;
  errorCode?: AiInsightErrorCode;
  latencyMs?: number;
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
    groundedInsight: input.groundedInsight,
    cachedAt: input.cachedAt ?? now,
    message: input.message,
    errorCode: input.errorCode,
    latencyMs: input.latencyMs,
    selected: false,
    priority: input.priority,
    generatedAt: now,
  };
}

function logInsightAttempt(insight: AiModelInsight) {
  console.info('[market-insight-provider]', JSON.stringify({
    provider: insight.label,
    model: insight.model,
    status: insight.status,
    latencyMs: insight.latencyMs ?? 0,
    errorCode: insight.errorCode ?? null,
  }));
  return insight;
}

function fallbackAttempt(insight: AiModelInsight): AiFallbackAttempt {
  return {
    provider: insight.label,
    model: insight.model,
    status: insight.status,
    message: insight.message,
    errorCode: insight.errorCode,
    latencyMs: insight.latencyMs,
  };
}

function withProviderSummaries(insights: AiModelInsight[]) {
  const expected = [
    { provider: 'gemini' as const, label: 'gemini-primary', model: GEMINI_PRIMARY_MODEL, priority: 0 },
    { provider: 'gemini' as const, label: 'gemini-fallback', model: GEMINI_FALLBACK_MODEL || '(not configured)', priority: 1 },
    { provider: 'groq' as const, label: 'groq', model: GROQ_MODEL, priority: 2 },
    { provider: 'cerebras' as const, label: 'cerebras', model: CEREBRAS_MODEL, priority: 3 },
    { provider: 'local-llm' as const, label: 'local-llm', model: LOCAL_LLM_MODEL, priority: 4 },
    { provider: 'codex-cli' as const, label: 'codex-cli', model: 'codex', priority: 5 },
  ];
  const byLabel = new Map(insights.map((item) => [item.label, item]));
  return expected.map((item) => byLabel.get(item.label) || attemptToInsight({
    ...item,
    status: 'skipped',
    message: 'Skipped waiting after a higher-priority model succeeded.',
    latencyMs: 0,
  }));
}

function skippedInsight(input: {
  provider: AiInsightProvider;
  label: string;
  model: string;
  message: string;
  priority: number;
}) {
  return logInsightAttempt(attemptToInsight({
    ...input,
    status: 'skipped',
    errorCode: 'UNAVAILABLE',
    latencyMs: 0,
  }));
}

function failedInsight(input: {
  provider: AiInsightProvider;
  label: string;
  model: string;
  error: unknown;
  priority: number;
  startedAt: number;
}) {
  const normalized = classifyAiInsightError(input.error);
  return logInsightAttempt(attemptToInsight({
    ...input,
    status: 'failed',
    message: normalized.message,
    errorCode: normalized.errorCode,
    latencyMs: Date.now() - input.startedAt,
  }));
}

async function collectGemini(
  model: string,
  prompt: string,
  evidenceCatalog: AiInsightEvidence[],
  label: string,
  priority: number
): Promise<AiModelInsight> {
  if (!GEMINI_API_KEY) {
    return skippedInsight({ provider: 'gemini', label, model, message: 'GEMINI_API_KEY is not configured.', priority });
  }

  const startedAt = Date.now();
  try {
    const raw = await withTimeout(callGeminiModel(model, prompt), `${label}/${model}`, GEMINI_TIMEOUT_MS);
    const structured = parseGroundedInsightResponse(raw, evidenceCatalog);
    return logInsightAttempt(attemptToInsight({
      provider: 'gemini', label, model, status: 'success', ...structured, priority, latencyMs: Date.now() - startedAt,
    }));
  } catch (error: unknown) {
    return failedInsight({ provider: 'gemini', label, model, error, priority, startedAt });
  }
}

async function collectGroq(prompt: string, evidenceCatalog: AiInsightEvidence[], priority: number): Promise<AiModelInsight> {
  if (!GROQ_API_KEY) {
    return skippedInsight({ provider: 'groq', label: 'groq', model: GROQ_MODEL, message: 'GROQ_API_KEY is not configured.', priority });
  }

  const startedAt = Date.now();
  try {
    const raw = await withTimeout(callGroqModel(GROQ_MODEL, prompt), `groq/${GROQ_MODEL}`, FAST_MODEL_TIMEOUT_MS);
    const structured = parseGroundedInsightResponse(raw, evidenceCatalog);
    return logInsightAttempt(attemptToInsight({
      provider: 'groq', label: 'groq', model: GROQ_MODEL, status: 'success', ...structured, priority, latencyMs: Date.now() - startedAt,
    }));
  } catch (error: unknown) {
    return failedInsight({ provider: 'groq', label: 'groq', model: GROQ_MODEL, error, priority, startedAt });
  }
}

async function collectCerebras(prompt: string, evidenceCatalog: AiInsightEvidence[], priority: number): Promise<AiModelInsight> {
  if (!CEREBRAS_API_KEY) {
    return skippedInsight({ provider: 'cerebras', label: 'cerebras', model: CEREBRAS_MODEL, message: 'CEREBRAS_API_KEY is not configured.', priority });
  }

  const startedAt = Date.now();
  try {
    const raw = await withTimeout(callCerebrasModel(CEREBRAS_MODEL, prompt), `cerebras/${CEREBRAS_MODEL}`, FAST_MODEL_TIMEOUT_MS);
    const structured = parseGroundedInsightResponse(raw, evidenceCatalog);
    return logInsightAttempt(attemptToInsight({
      provider: 'cerebras', label: 'cerebras', model: CEREBRAS_MODEL, status: 'success', ...structured, priority, latencyMs: Date.now() - startedAt,
    }));
  } catch (error: unknown) {
    return failedInsight({ provider: 'cerebras', label: 'cerebras', model: CEREBRAS_MODEL, error, priority, startedAt });
  }
}

async function collectLocalLlm(prompt: string, evidenceCatalog: AiInsightEvidence[], priority: number): Promise<AiModelInsight> {
  if (!LOCAL_LLM_ENABLED) {
    return skippedInsight({ provider: 'local-llm', label: 'local-llm', model: LOCAL_LLM_MODEL, message: 'Local LLM is not enabled.', priority });
  }

  const startedAt = Date.now();
  try {
    const raw = await withTimeout(
      callLocalLlmModel(prompt, 'You are a concise Korean market-regime analyst.', 900),
      `local-llm/${LOCAL_LLM_MODEL}`,
      LOCAL_MODEL_TIMEOUT_MS,
    );
    const structured = parseGroundedInsightResponse(raw, evidenceCatalog);
    return logInsightAttempt(attemptToInsight({
      provider: 'local-llm', label: 'local-llm', model: LOCAL_LLM_MODEL, status: 'success', ...structured, priority, latencyMs: Date.now() - startedAt,
    }));
  } catch (error: unknown) {
    return failedInsight({ provider: 'local-llm', label: 'local-llm', model: LOCAL_LLM_MODEL, error, priority, startedAt });
  }
}

async function collectCodexCli(prompt: string, evidenceCatalog: AiInsightEvidence[], priority: number): Promise<AiModelInsight> {
  if (process.env.VERCEL === '1') {
    return skippedInsight({
      provider: 'codex-cli', label: 'codex-cli', model: 'codex',
      message: 'Codex CLI is not available on Vercel environment.', priority,
    });
  }

  const startedAt = Date.now();
  try {
    const raw = await withTimeout(callCodexCli(prompt), 'codex-cli/codex', 25000);
    const structured = parseGroundedInsightResponse(raw, evidenceCatalog);
    return logInsightAttempt(attemptToInsight({
      provider: 'codex-cli', label: 'codex-cli', model: 'codex', status: 'success', ...structured, priority, latencyMs: Date.now() - startedAt,
    }));
  } catch (error: unknown) {
    return failedInsight({ provider: 'codex-cli', label: 'codex-cli', model: 'codex', error, priority, startedAt });
  }
}

export async function generateMarketInsight(input: MarketAnalysisInput): Promise<MarketInsightResult> {
  const prompt = buildPrompt(input);
  const evidenceCatalog = buildMarketInsightEvidenceCatalog(input.metrics);
  const tasks: Promise<AiModelInsight>[] = [
    collectGemini(GEMINI_PRIMARY_MODEL, prompt, evidenceCatalog, 'gemini-primary', 0),
  ];

  if (GEMINI_FALLBACK_MODEL && GEMINI_FALLBACK_MODEL !== GEMINI_PRIMARY_MODEL) {
    tasks.push(collectGemini(GEMINI_FALLBACK_MODEL, prompt, evidenceCatalog, 'gemini-fallback', 1));
  } else {
    const model = GEMINI_FALLBACK_MODEL || '(not configured)';
    const message = 'GEMINI_FALLBACK_MODEL is not configured.';
    tasks.push(Promise.resolve(skippedInsight({ provider: 'gemini', label: 'gemini-fallback', model, message, priority: 1 })));
  }

  tasks.push(
    collectGroq(prompt, evidenceCatalog, 2),
    collectCerebras(prompt, evidenceCatalog, 3),
    collectLocalLlm(prompt, evidenceCatalog, 4),
    collectCodexCli(prompt, evidenceCatalog, 5)
  );

  const { selected, modelInsights } = await settleModelInsightsUntilFirstSuccess(tasks);

  if (selected?.groundedInsight) {
    const selectedInsights = withProviderSummaries(modelInsights)
      .map((item) => ({ ...item, selected: item.id === selected.id }));
    const selectedEvidence = selected.groundedInsight.evidenceKeys
      .map((key) => evidenceCatalog.find((item) => item.key === key))
      .filter((item): item is AiInsightEvidence => Boolean(item));
    return {
      text: selected.text || '',
      isAiGenerated: true,
      providerUsed: selected.provider,
      modelUsed: selected.model,
      fallbackChain: selectedInsights.map(fallbackAttempt),
      modelInsights: selectedInsights,
      errorSummary: null,
      aiInsight: selected.groundedInsight,
      aiValidation: validationResult('VALID'),
      aiEvidence: selectedEvidence,
    };
  }

  const failedMessages = modelInsights
    .filter((item) => item.status === 'failed')
    .map((item) => `${item.label}/${item.model}: ${item.errorCode || 'PROVIDER_ERROR'}: ${item.message}`)
    .join(' | ');

  const groundedInsight = buildRuleBasedGroundedInsight(input.marketState);
  const selectedEvidence = groundedInsight.evidenceKeys
    .map((key) => evidenceCatalog.find((item) => item.key === key))
    .filter((item): item is AiInsightEvidence => Boolean(item));
  const text = renderGroundedMarketInsight(groundedInsight, selectedEvidence);
  const ruleInsight = attemptToInsight({
    provider: 'rules',
    label: 'rules',
    model: 'mtn-rule-based',
    status: 'success',
    text,
    headline: groundedInsight.headline,
    detail: [groundedInsight.commentary, ...text.split('\n\n').slice(2)].join('\n\n'),
    groundedInsight,
    priority: 99,
    latencyMs: 0,
  });
  const completedInsights = [...modelInsights, { ...ruleInsight, selected: true }];
  return {
    text: ruleInsight.text || '',
    isAiGenerated: false,
    providerUsed: 'rules',
    modelUsed: 'mtn-rule-based',
    fallbackChain: completedInsights.map(fallbackAttempt),
    modelInsights: completedInsights,
    errorSummary: failedMessages || 'No LLM provider was configured.',
    aiInsight: groundedInsight,
    aiValidation: validationResult('FALLBACK', failedMessages ? failedMessages.split(' | ') : ['No LLM provider was configured.']),
    aiEvidence: selectedEvidence,
  };
}

/**
 * 로컬 Ollama LLM(기본 qwen2.5:7b)의 OpenAI 호환 completions 엔드포인트를 호출합니다.
 */
export async function callLocalLlmModel(
  prompt: string,
  systemPrompt = 'You are a Senior Investment Bank Committee Member.',
  maxOutputTokens = 8192,
  forceLargeTimeout = false
): Promise<string> {
  const isVercel = process.env.VERCEL === '1';
  // Vercel 호출은 공급자별 제한을 따르고, 로컬 전용 강제 호출은 장시간 모델 로드를 허용합니다.
  const timeoutMs = (isVercel && !forceLargeTimeout) ? LOCAL_MODEL_TIMEOUT_MS : 600000;

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
