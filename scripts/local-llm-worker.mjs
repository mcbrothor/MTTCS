import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { createJiti } from 'jiti';
import { spawn } from 'node:child_process';
import { unlinkSync } from 'node:fs';
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DAILY_TOP5_PROVIDER_ORDER,
  buildCodexDailyTop5Prompt,
  buildCodexIbPrompt,
  getTelegramChatIds,
  parseCodexCliJsonOutput,
  parseCodexCliOutput,
  parseIbResponse,
} from './lib/codex-cli-worker-utils.mjs';
import {
  DEFAULT_TECHNICAL_CHART_FALLBACKS,
  DEFAULT_TECHNICAL_CHART_MODEL,
  discoverTechnicalChartModels,
  parseModelFallbacks,
} from './lib/technical-chart-model-router.mjs';
import {
  deliverCategoriesIndependently,
  isTradingSession,
  resolveRecommendationPolicies,
} from './lib/daily-recommendation-worker-utils.mjs';
import {
  createTelegramReceiptLedger,
  telegramReceiptKey,
} from './lib/telegram-delivery-receipts.mjs';

// Supabase 2.110 initializes Realtime even when this REST-only worker never subscribes.
// Node 20 has no native WebSocket; a guard keeps the unused transport dormant.
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class UnsupportedWorkerWebSocket {
    constructor() {
      throw new Error('WebSocket is unavailable in the MTN REST worker.');
    }
  };
}

// .env.local 변수들 (node --env-file=.env.local 로 주입됨)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatIds = getTelegramChatIds();
const LOCAL_LLM_API_URL = process.env.LOCAL_LLM_API_URL || 'http://127.0.0.1:11434/v1';
const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL || 'qwen3.6:14b';
const LOCAL_LLM_ENABLED = process.env.LOCAL_LLM_ENABLED?.toLowerCase() === 'true';
const CODEX_CLI_ENABLED = process.env.CODEX_CLI_ENABLED?.toLowerCase() !== 'false';
const CODEX_CLI_BIN = process.env.CODEX_CLI_BIN || 'codex';
const CODEX_CLI_MODEL = process.env.CODEX_CLI_MODEL || '';
const CODEX_CLI_TIMEOUT_MS = Number(process.env.CODEX_CLI_TIMEOUT_MS || 15 * 60 * 1000);
const DAILY_TOP5_TIMEOUT_MS = Number(process.env.DAILY_TOP5_TIMEOUT_MS || 10 * 60 * 1000);
const DAILY_TOP5_MAX_TOKENS = Number(process.env.DAILY_TOP5_MAX_TOKENS || 8000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY || '';
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || 'qwen-3-235b-a22b-instruct-2507';
const CRON_SECRET = process.env.CRON_SECRET || '';
const MTN_BASE_URL = (process.env.MTN_CHART_ANALYSIS_BASE_URL || process.env.MTN_BASE_URL || 'https://mttcs.vercel.app').replace(/\/$/, '');
const DAILY_TELEGRAM_CHARTS_ENABLED = process.env.DAILY_TELEGRAM_CHARTS_ENABLED?.toLowerCase() === 'true';
const DAILY_TELEGRAM_CHARTS_AUTO_ENABLED = process.env.DAILY_TELEGRAM_CHARTS_AUTO_ENABLED?.toLowerCase() === 'true';
const dailyChartLimit = Number(process.env.DAILY_TELEGRAM_CHARTS_PER_CATEGORY || 3);
const DAILY_TELEGRAM_CHARTS_PER_CATEGORY = Number.isInteger(dailyChartLimit)
  ? Math.min(10, Math.max(1, dailyChartLimit))
  : 3;
const DAILY_TELEGRAM_CHART_RANGE = process.env.DAILY_TELEGRAM_CHART_RANGE === 'ALL' ? 'ALL' : '1Y';
const DAILY_TELEGRAM_CHART_AI_TIMEOUT_MS = Math.max(5_000, Number(process.env.DAILY_TELEGRAM_CHART_AI_TIMEOUT_MS || 60_000));
const DAILY_TELEGRAM_CHARTS_AI_ENABLED = process.env.DAILY_TELEGRAM_CHARTS_AI_ENABLED?.toLowerCase() !== 'false';
const TECHNICAL_CHART_LOCAL_MODEL = process.env.TECHNICAL_CHART_LOCAL_MODEL || DEFAULT_TECHNICAL_CHART_MODEL;
const TECHNICAL_CHART_MODEL_FALLBACKS = parseModelFallbacks(process.env.TECHNICAL_CHART_MODEL_FALLBACKS || DEFAULT_TECHNICAL_CHART_FALLBACKS);
const TECHNICAL_CHART_EXTERNAL_FALLBACK_ENABLED = process.env.TECHNICAL_CHART_EXTERNAL_FALLBACK_ENABLED?.toLowerCase() === 'true';
const DAILY_RECOMMENDATION_CHART_GATE_ENABLED = process.env.DAILY_RECOMMENDATION_CHART_GATE_ENABLED?.toLowerCase() !== 'false';
const dailyRecommendationChartGateConcurrency = Number(process.env.DAILY_RECOMMENDATION_CHART_GATE_CONCURRENCY || 3);
const DAILY_RECOMMENDATION_CHART_GATE_CONCURRENCY = Number.isInteger(dailyRecommendationChartGateConcurrency)
  ? Math.min(5, Math.max(1, dailyRecommendationChartGateConcurrency))
  : 3;
const DAILY_SCREENER_STALE_AFTER_MS = Math.max(10 * 60_000, Number(process.env.DAILY_SCREENER_STALE_AFTER_MS || 30 * 60_000));
const DAILY_TELEGRAM_RETRY_DELAY_MS = Math.max(60_000, Number(process.env.DAILY_TELEGRAM_RETRY_DELAY_MS || 5 * 60_000));
const DAILY_TELEGRAM_RETRY_LOOKBACK_DAYS = Math.max(0, Math.min(7, Number(process.env.DAILY_TELEGRAM_RETRY_LOOKBACK_DAYS || 2)));
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const WORKER_LOCK_PATH = process.env.MTN_CODEX_WORKER_LOCK_PATH || '/tmp/mtn-codex-worker.lock';
const TELEGRAM_RECEIPT_PATH = process.env.MTN_TELEGRAM_RECEIPT_PATH
  || path.join(homedir(), 'Library', 'Application Support', 'MTN', 'telegram-delivery-receipts.jsonl');
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': PROJECT_ROOT } });
const dailyScreeners = jiti('../lib/daily-screeners/index.ts');
const recommendationPersistence = jiti('../lib/recommendations/persistence.ts');
const recommendationPrices = jiti('../lib/recommendations/prices.ts');
const krInvestorFlow = jiti('../lib/recommendations/kr-investor-flow.ts');
const krRiskRanking = jiti('../lib/recommendations/kr-risk-ranking.ts');
const recommendationConfig = jiti('../lib/recommendations/config.ts');
const recommendationChartGate = jiti('../lib/recommendations/chart-gate.ts');
const technicalChartAnalysis = jiti('../lib/ai/technical-chart-analysis.ts');
const telegramChartImage = jiti('../lib/telegram/chart-image.ts');
const CODEX_CLI_CWD = process.env.CODEX_CLI_CWD || path.join(process.env.TMPDIR || '/tmp', 'mtn-codex-worker');
const CODEX_OUTPUT_SCHEMA = process.env.CODEX_OUTPUT_SCHEMA || path.join(PROJECT_ROOT, 'schemas', 'ib-validation-result.schema.json');
const DAILY_TOP5_OUTPUT_SCHEMA = process.env.DAILY_TOP5_OUTPUT_SCHEMA || path.join(PROJECT_ROOT, 'schemas', 'daily-screener-top5.schema.json');
const SUPPRESSED_TELEGRAM_MARKERS = [
  'MTN 시장 리포트:',
  'MTN 매크로 레짐 리포트',
];
let technicalChartModelCache = { expiresAt: 0, routes: [] };

if (!supabaseUrl || !supabaseKey) {
  console.error('[Worker] Missing Supabase environment variables. Exiting.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const telegramReceipts = createTelegramReceiptLedger(TELEGRAM_RECEIPT_PATH);

async function postTelegramPayload(url, payload) {
  const curlArgs = [
    '-sS', '--connect-timeout', '15', '--max-time', '30',
    '--write-out', '\n__MTN_CURL_META__:%{http_code}:%{size_upload}:%{time_connect}',
    '-X', 'POST', url, '-H', 'content-type: application/json', '--data-binary', '@-',
  ];
  let output;
  try {
    output = await runProcess('/usr/bin/curl', curlArgs, JSON.stringify(payload), 35_000);
  } catch (error) {
    const meta = parseTelegramCurlOutput(error?.stdout || '').meta;
    if (error?.processTimedOut || Number(meta?.sizeUpload || 0) > 0) {
      const uncertain = new Error(`Telegram delivery outcome is uncertain: ${compactError(error)}`);
      uncertain.deliveryUncertain = true;
      uncertain.cause = error;
      throw uncertain;
    }
    throw error;
  }
  const { body } = parseTelegramCurlOutput(output.stdout);
  const parsed = JSON.parse(body || '{}');
  if (!parsed.ok) {
    const error = new Error(`Telegram API error: ${parsed.description || JSON.stringify(parsed).slice(0, 800)}`);
    error.response = { status: parsed.error_code || 500, data: parsed };
    throw error;
  }
  return parsed.result;
}

function parseTelegramCurlOutput(stdout) {
  const marker = '\n__MTN_CURL_META__:';
  const markerIndex = String(stdout || '').lastIndexOf(marker);
  if (markerIndex < 0) return { body: String(stdout || ''), meta: null };
  const body = stdout.slice(0, markerIndex);
  const [httpCode, sizeUpload, timeConnect] = stdout.slice(markerIndex + marker.length).trim().split(':');
  return { body, meta: { httpCode, sizeUpload, timeConnect } };
}

function isTelegramMarkdownRejection(error) {
  const description = String(error?.response?.data?.description || '');
  return error?.response?.status === 400 && /parse entities|can't parse/i.test(description);
}

async function sendTelegramMessage(text, { publicationId = null } = {}) {
  if (SUPPRESSED_TELEGRAM_MARKERS.some((marker) => text.includes(marker))) {
    console.log('[Worker] Suppressed Telegram report by marker.');
    return { skipped: true, suppressed: true };
  }
  if (!telegramBotToken || telegramChatIds.length === 0) {
    throw new Error('Telegram credentials are missing.');
  }
  const url = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
  
  // Telegram has a strict 4096 character limit. Chunk the message safely.
  const MAX_LEN = 4000;
  const chunks = [];
  for (let i = 0; i < text.length; i += MAX_LEN) {
    chunks.push(text.substring(i, i + MAX_LEN));
  }

  for (let i = 0; i < chunks.length; i++) {
    for (const chatId of telegramChatIds) {
      const receiptKey = publicationId ? telegramReceiptKey(publicationId, chatId, i) : null;
      if (receiptKey && await telegramReceipts.has(receiptKey)) {
        console.log(`[Worker] Telegram receipt already exists; skipping duplicate: ${publicationId} chunk ${i + 1}/${chunks.length}.`);
        continue;
      }
      try {
        const telegramResult = await postTelegramPayload(url, {
          chat_id: chatId,
          text: chunks[i],
          parse_mode: 'Markdown'
        });
        if (receiptKey) await telegramReceipts.record({
          key: receiptKey,
          publicationId,
          chatId,
          chunkIndex: i,
          chunkCount: chunks.length,
          text: chunks[i],
          messageId: telegramResult?.message_id,
        });
        // Add a small delay between chunks/recipients to avoid rate limiting.
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        if (!isTelegramMarkdownRejection(e)) throw e;
        console.warn(`[Worker] Telegram Markdown failed for chat ${chatId} on chunk ${i+1}/${chunks.length}; retrying plain text:`, e.response?.data || e.message);
        try {
          const telegramResult = await postTelegramPayload(url, {
            chat_id: chatId,
            text: chunks[i],
          });
          if (receiptKey) await telegramReceipts.record({
            key: receiptKey,
            publicationId,
            chatId,
            chunkIndex: i,
            chunkCount: chunks.length,
            text: chunks[i],
            messageId: telegramResult?.message_id,
          });
          await new Promise(r => setTimeout(r, 500));
        } catch (retryError) {
          console.error(`[Worker] Telegram sending failed for chat ${chatId} on chunk ${i+1}/${chunks.length}:`, retryError.response?.data || retryError.message);
          throw retryError;
        }
      }
    }
  }
  return { skipped: false };
}

async function sendTelegramPhoto(png, caption, filename) {
  if (!telegramBotToken || telegramChatIds.length === 0) return { skipped: true };
  const url = `https://api.telegram.org/bot${telegramBotToken}/sendPhoto`;
  for (const chatId of telegramChatIds) {
    const tempFile = path.join(process.env.TMPDIR || '/tmp', `mtn-chart-${process.pid}-${Date.now()}-${filename}`);
    await writeFile(tempFile, png);
    const post = async (markdown) => {
      const args = ['-sS', '-X', 'POST', url, '-F', `chat_id=${chatId}`, '-F', `photo=@${tempFile};type=image/png`, '-F', `caption=${caption.slice(0, 1024)}`];
      if (markdown) args.push('-F', 'parse_mode=Markdown');
      const { stdout } = await runProcess('curl', args, '', 45_000);
      const payload = JSON.parse(stdout || '{}');
      if (!payload?.ok) throw new Error(`Telegram photo upload failed: ${JSON.stringify(payload).slice(0, 500)}`);
    };
    try {
      await post(true);
    } catch (markdownError) {
      console.warn(`[Worker] Telegram photo Markdown caption failed, retrying plain text: ${compactError(markdownError)}`);
      await post(false);
    } finally {
      await rm(tempFile, { force: true });
    }
  }
  return { skipped: false };
}

function runProcess(command, args, input, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    }

    const child = spawn(command, args, {
      cwd: PROJECT_ROOT,
      env: { ...process.env, TERM: process.env.TERM || 'dumb' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      const error = new Error(`${command} timed out after ${timeoutMs}ms.`);
      error.processTimedOut = true;
      error.stdout = stdout;
      error.stderr = stderr;
      finish(error);
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      finish(error);
    });
    child.stdin.on('error', (error) => {
      finish(error);
    });
    child.on('close', (code) => {
      if (code === 0) {
        finish(null, { stdout, stderr });
        return;
      }
      const error = new Error(`${command} exited with code ${code}: ${(stderr || stdout).slice(0, 1200)}`);
      error.exitCode = code;
      error.stdout = stdout;
      error.stderr = stderr;
      finish(error);
    });

    child.stdin.end(input);
  });
}

async function callCodexCli(prompt, options = {}) {
  const {
    outputSchema = CODEX_OUTPUT_SCHEMA,
    buildPrompt = buildCodexIbPrompt,
    timeoutMs = CODEX_CLI_TIMEOUT_MS,
    parseOutput = parseCodexCliOutput,
  } = options;
  await mkdir(CODEX_CLI_CWD, { recursive: true });
  const outputPath = path.join(CODEX_CLI_CWD, `mtn-codex-${Date.now()}-${process.pid}.json`);
  const args = [
    'exec',
    '--ephemeral',
    '--sandbox', 'read-only',
    '--skip-git-repo-check',
    '--cd', CODEX_CLI_CWD,
    '--output-schema', outputSchema,
    '--output-last-message', outputPath,
  ];

  if (CODEX_CLI_MODEL) args.push('--model', CODEX_CLI_MODEL);
  args.push('-');

  const codexPrompt = buildPrompt(prompt);
  const { stdout, stderr } = await runProcess(CODEX_CLI_BIN, args, codexPrompt, timeoutMs);

  let finalMessage = stdout.trim();
  try {
    const fileMessage = await readFile(outputPath, 'utf8');
    if (fileMessage.trim()) finalMessage = fileMessage.trim();
  } finally {
    await rm(outputPath, { force: true }).catch(() => {});
  }

  return { ...parseOutput(finalMessage), stderr };
}

async function processCodexTask(session) {
  if (!CODEX_CLI_ENABLED) {
    await supabase
      .from('beauty_contest_sessions')
      .update({
        ib_provider: 'pending-local-llm',
        ib_analysis: {
          parse_failed: true,
          error_message: 'Codex CLI provider disabled; falling back to local LLM.',
          failed_at: new Date().toISOString(),
          fallback_provider: 'local-llm',
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.id);
    return;
  }

  console.log(`\n[Worker] 🚀 Found pending Codex CLI task for session ${session.id}`);
  await supabase
    .from('beauty_contest_sessions')
    .update({ ib_provider: 'processing-codex-cli', updated_at: new Date().toISOString() })
    .eq('id', session.id);

  try {
    const prompt = session.ib_raw_response;
    if (!prompt || prompt.length < 10) throw new Error('Prompt missing or too short.');

    console.log(`[Worker] ⏳ Executing Codex CLI${CODEX_CLI_MODEL ? ` (${CODEX_CLI_MODEL})` : ''}...`);
    const { metadata, reportMarkdown, rawResponse } = await callCodexCli(prompt);
    const modelLabel = CODEX_CLI_MODEL || 'default-chatgpt-login';
    const bgIbAnalysis = {
      ...(metadata || {}),
      report_markdown: reportMarkdown,
      schema_version: '1.0.0',
      prompt_version: 'v4',
      generated_at: new Date().toISOString(),
      parse_failed: false,
      provider_chain: [{ provider: 'codex-cli', model: modelLabel, status: 'success' }],
    };

    await supabase
      .from('beauty_contest_sessions')
      .update({
        ib_raw_response: rawResponse,
        ib_analysis: bgIbAnalysis,
        ib_provider: `codex-cli (${modelLabel})`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.id);

    console.log('[Worker] 💾 Codex CLI result saved successfully.');

    if (reportMarkdown) {
      const fullText = `📊 *[MTN Codex CLI 투자위원회 브리핑]*\n\n${reportMarkdown}\n\n---------------------------------------\n*세션 ID*: \`${session.id}\`\n*엔진*: \`codex-cli (${modelLabel})\`\n[대시보드 바로가기](https://mttcs.vercel.app)`;
      await sendTelegramMessage(fullText);
    }
  } catch (error) {
    const message = error.message || String(error);
    console.error('[Worker] ❌ Codex CLI failed; falling back to Local LLM:', message);
    await supabase
      .from('beauty_contest_sessions')
      .update({
        ib_provider: 'pending-local-llm',
        ib_analysis: {
          parse_failed: true,
          error_message: message,
          failed_at: new Date().toISOString(),
          fallback_provider: 'local-llm',
          provider_chain: [{ provider: 'codex-cli', model: CODEX_CLI_MODEL || 'default-chatgpt-login', status: 'failed', message }],
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.id);
  }
}

function compactError(error, max = 600) {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === 'object'
      ? JSON.stringify(error)
      : String(error);
  return message.length > max ? `${message.slice(0, max)}...` : message;
}

async function acquireWorkerLock(retrying = false) {
  try {
    const handle = await open(WORKER_LOCK_PATH, 'wx', 0o600);
    await handle.writeFile(`${process.pid}\n`);
    await handle.close();
    process.once('exit', () => {
      try {
        unlinkSync(WORKER_LOCK_PATH);
      } catch (error) {
        if (error?.code !== 'ENOENT') console.error(`[Worker] Failed to remove lock: ${compactError(error)}`);
      }
    });
    return handle;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    let ownerPid = 0;
    try {
      ownerPid = Number((await readFile(WORKER_LOCK_PATH, 'utf8')).trim());
    } catch {
      ownerPid = 0;
    }
    let ownerAlive = false;
    if (Number.isInteger(ownerPid) && ownerPid > 0) {
      try {
        process.kill(ownerPid, 0);
        ownerAlive = true;
      } catch (signalError) {
        ownerAlive = signalError?.code === 'EPERM';
      }
    }
    if (ownerAlive || retrying) {
      throw new Error(`Another MTN worker is already running (pid ${ownerPid || 'unknown'}).`);
    }
    unlinkSync(WORKER_LOCK_PATH);
    return acquireWorkerLock(true);
  }
}

function scopeArray(scope, key, fallback) {
  const value = scope && typeof scope === 'object' ? scope[key] : null;
  return Array.isArray(value) && value.length > 0 ? value : fallback;
}

function scopePositiveNumber(scope, key, fallback) {
  const value = scope && typeof scope === 'object' ? scope[key] : null;
  if (value === null) return null;
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function dailyProviderModel(provider) {
  if (provider === 'codex-cli') return CODEX_CLI_MODEL || 'default-chatgpt-login';
  if (provider === 'local-llm') return LOCAL_LLM_MODEL;
  if (provider === 'gemini') return GEMINI_MODEL;
  if (provider === 'groq') return GROQ_MODEL;
  if (provider === 'cerebras') return CEREBRAS_MODEL;
  return 'mtn-rule-based';
}

async function callOpenAiCompatibleProvider({ url, apiKey, provider, model, prompt, systemPrompt, maxTokens, timeoutMs, responseFormat, extraBody }) {
  const response = await axios.post(url, {
    model,
    messages: [
      { role: 'system', content: systemPrompt || 'You are MTN Daily Screener category Top10 analyst. Return JSON only.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    max_tokens: maxTokens || DAILY_TOP5_MAX_TOKENS,
    ...(responseFormat ? { response_format: responseFormat } : {}),
    ...(extraBody || {}),
  }, {
    timeout: timeoutMs || DAILY_TOP5_TIMEOUT_MS,
    headers: {
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      'content-type': 'application/json',
    },
  });

  const text = response.data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`${provider} returned an empty response.`);
  return text;
}

async function callGeminiDailyTop5(prompt) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured.');
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: { maxOutputTokens: DAILY_TOP5_MAX_TOKENS, temperature: 0.2 },
  });
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  if (!text) throw new Error('Gemini returned an empty response.');
  return text;
}

async function callGeminiTechnicalChart(prompt) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured.');
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: { maxOutputTokens: 900, temperature: 0.2 },
  });
  let timer;
  const result = await Promise.race([
    model.generateContent(prompt),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Gemini technical chart analysis timed out after ${DAILY_TELEGRAM_CHART_AI_TIMEOUT_MS}ms.`)), DAILY_TELEGRAM_CHART_AI_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
  const text = result.response.text().trim();
  if (!text) throw new Error('Gemini returned an empty technical chart analysis.');
  return text;
}

async function callOllamaTechnicalChart({ model, prompt }) {
  const root = LOCAL_LLM_API_URL.replace(/\/v1\/?$/, '').replace(/\/$/, '');
  const response = await axios.post(`${root}/api/chat`, {
    model,
    messages: [
      { role: 'system', content: 'You are MTN technical chart analyst. Write Korean and return JSON only.' },
      { role: 'user', content: prompt },
    ],
    stream: false,
    format: technicalChartAnalysis.technicalChartNarrativeSchema,
    think: false,
    options: {
      temperature: 0.2,
      num_ctx: 4096,
      num_predict: 360,
    },
  }, {
    timeout: DAILY_TELEGRAM_CHART_AI_TIMEOUT_MS,
    headers: { 'content-type': 'application/json' },
  });
  const text = response.data?.message?.content?.trim();
  if (!text) throw new Error('Ollama returned an empty technical chart analysis.');
  return text;
}

async function fetchCronMarketAnalysis(ticker, exchange, includeFundamentals = false) {
  if (!CRON_SECRET) throw new Error('CRON_SECRET is not configured for chart analysis.');
  const url = new URL('/api/cron/chart-analysis', MTN_BASE_URL);
  url.searchParams.set('ticker', ticker);
  url.searchParams.set('exchange', exchange);
  url.searchParams.set('includeFundamentals', String(includeFundamentals));
  const response = await fetch(url, { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) throw new Error(`Chart analysis API failed: ${response.status}`);
  return payload.data || payload;
}

async function resolveTechnicalChartLocalModels() {
  if (!LOCAL_LLM_ENABLED) return [];
  if (technicalChartModelCache.expiresAt > Date.now()) return technicalChartModelCache.routes;
  try {
    const routes = await discoverTechnicalChartModels({
      baseUrl: LOCAL_LLM_API_URL,
      preferredModel: TECHNICAL_CHART_LOCAL_MODEL,
      fallbackModels: TECHNICAL_CHART_MODEL_FALLBACKS,
      request: (url) => axios.get(url, { timeout: 3_000 }),
    });
    technicalChartModelCache = { expiresAt: Date.now() + 10 * 60 * 1000, routes };
    if (routes.length) console.log(`[Worker] Technical chart model routes: ${routes.map((route) => `${route.model} (${route.tier})`).join(' -> ')}.`);
    else console.warn('[Worker] No compatible local technical chart model is installed; using deterministic analysis.');
    return routes;
  } catch (error) {
    technicalChartModelCache = { expiresAt: Date.now() + 60 * 1000, routes: [] };
    console.warn(`[Worker] Local technical chart model discovery failed: ${compactError(error)}`);
    return [];
  }
}

async function runTechnicalChartAnalysis(marketAnalysis) {
  if (!DAILY_TELEGRAM_CHARTS_AI_ENABLED) {
    return { technical: technicalChartAnalysis.buildRuleBasedTechnicalAnalysis(marketAnalysis), provider: 'rules', model: 'professional-chart-plan-v1' };
  }
  const prompt = technicalChartAnalysis.buildTechnicalChartAnalysisPrompt(marketAnalysis);
  const allowedPatternIds = (marketAnalysis.chartPatterns || []).map((pattern) => pattern.id);
  const localRoutes = await resolveTechnicalChartLocalModels();
  const providers = [
    ...localRoutes.map((localRoute) => ({
      provider: 'local-llm',
      model: localRoute.model,
    })),
    ...(TECHNICAL_CHART_EXTERNAL_FALLBACK_ENABLED ? [
    ...(GEMINI_API_KEY ? [{ provider: 'gemini', model: GEMINI_MODEL }] : []),
    ...(GROQ_API_KEY ? [{ provider: 'groq', model: GROQ_MODEL, url: 'https://api.groq.com/openai/v1/chat/completions', apiKey: GROQ_API_KEY }] : []),
    ...(CEREBRAS_API_KEY ? [{ provider: 'cerebras', model: CEREBRAS_MODEL, url: 'https://api.cerebras.ai/v1/chat/completions', apiKey: CEREBRAS_API_KEY }] : []),
    ] : []),
  ];
  for (const item of providers) {
    try {
      const raw = item.provider === 'local-llm'
        ? await callOllamaTechnicalChart({ model: item.model, prompt })
        : item.provider === 'gemini'
          ? await callGeminiTechnicalChart(prompt)
          : await callOpenAiCompatibleProvider({
          ...item,
          prompt,
          systemPrompt: 'You are MTN technical chart analyst. Write Korean and return JSON only.',
          maxTokens: 900,
          timeoutMs: DAILY_TELEGRAM_CHART_AI_TIMEOUT_MS,
        });
      const narrative = technicalChartAnalysis.parseTechnicalChartAnalysisResponse(raw, allowedPatternIds);
      return { technical: technicalChartAnalysis.finalizeTechnicalChartAnalysis(marketAnalysis, narrative), provider: item.provider, model: item.model };
    } catch (error) {
      console.warn(`[Worker] Technical chart AI failed: ${item.provider} - ${compactError(error)}`);
    }
  }
  return { technical: technicalChartAnalysis.buildRuleBasedTechnicalAnalysis(marketAnalysis), provider: 'rules', model: 'professional-chart-plan-v1' };
}

function chartCandidateForPick(pick, category, candidates) {
  return candidates.find((candidate) => candidate.ticker === pick.ticker && dailyScreeners.categoryForDailyCandidate(candidate) === category)
    || candidates.find((candidate) => candidate.ticker === pick.ticker)
    || null;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function analyzeRecommendationChartGate({ category, pick, candidates }) {
  const candidate = chartCandidateForPick(pick, category, candidates);
  const exchange = candidate?.exchange || pick.exchange || (dailyScreeners.marketForDailyCategory(category) === 'KR' ? 'KOSPI' : 'NAS');
  try {
    const analysis = await fetchCronMarketAnalysis(pick.ticker, exchange, true);
    if (!Array.isArray(analysis.priceData) || analysis.priceData.length < 200) {
      throw new Error('insufficient price history for integrated chart gate');
    }
    const technical = technicalChartAnalysis.buildRuleBasedTechnicalAnalysis(analysis);
    return recommendationChartGate.buildRecommendationChartGate(analysis, technical);
  } catch (error) {
    console.warn(`[Worker] Recommendation chart gate unavailable: ${category} ${pick.ticker} - ${compactError(error)}`);
    return recommendationChartGate.buildUnverifiedRecommendationChartGate('차트 또는 공식 펀더멘털 데이터 확인 실패');
  }
}

async function applyDailyRecommendationChartGate({ categories, candidates }) {
  if (!DAILY_RECOMMENDATION_CHART_GATE_ENABLED) return { categories, snapshots: {} };
  const entries = Object.entries(categories).flatMap(([category, picks]) => (picks || []).map((pick) => ({ category, pick })));
  const checks = await mapWithConcurrency(entries, DAILY_RECOMMENDATION_CHART_GATE_CONCURRENCY, async ({ category, pick }) => {
    const chartGate = await analyzeRecommendationChartGate({ category, pick, candidates });
    return { category, ticker: pick.ticker, chartGate };
  });
  const gates = new Map(checks.map((item) => [`${item.category}:${item.ticker}`, item.chartGate]));
  const snapshots = {};
  const gatedCategories = Object.fromEntries(Object.entries(categories).map(([category, picks]) => {
    const gated = recommendationChartGate.rankChartGatedPicks((picks || []).map((pick) => {
      const chartGate = gates.get(`${category}:${pick.ticker}`)
        || recommendationChartGate.buildUnverifiedRecommendationChartGate('통합 검증 결과가 없습니다.');
      const snapshot = { chart_gate: chartGate };
      snapshots[`${category}:${pick.ticker}`] = snapshot;
      snapshots[pick.ticker] = snapshots[pick.ticker] || snapshot;
      return { ...pick, chartGate };
    }));
    const eligible = gated.filter((pick) => pick.chartGate?.eligible).length;
    console.log(`[Worker] Recommendation chart gate: ${category} ${eligible}/${gated.length} eligible.`);
    return [category, gated];
  }));
  return { categories: gatedCategories, snapshots };
}

async function sendDailyTelegramCharts({ category, picks, candidates }) {
  if (!DAILY_TELEGRAM_CHARTS_ENABLED) return { skipped: true, attempted: 0, sent: 0 };
  const selected = telegramChartImage.selectTelegramChartPicks(picks || [], 10);
  let attempted = 0;
  let sent = 0;
  for (const pick of selected) {
    if (sent >= DAILY_TELEGRAM_CHARTS_PER_CATEGORY) break;
    attempted += 1;
    try {
      const candidate = chartCandidateForPick(pick, category, candidates);
      const exchange = candidate?.exchange || pick.exchange || (dailyScreeners.marketForDailyCategory(category) === 'KR' ? 'KOSPI' : 'NAS');
      const marketAnalysis = await fetchCronMarketAnalysis(pick.ticker, exchange);
      if (!Array.isArray(marketAnalysis.priceData) || marketAnalysis.priceData.length < 20) {
        console.warn(`[Worker] Skipped chart image for ${pick.ticker}: insufficient price data.`);
        continue;
      }
      const { technical, provider, model } = await runTechnicalChartAnalysis(marketAnalysis);
      if (!telegramChartImage.isTelegramChartAnalysisSendable(technical)) {
        console.warn(`[Worker] Skipped chart image for ${category} ${pick.ticker}: ${technical.verdict}/${technical.readiness}.`);
        continue;
      }
      const imageInput = {
        ticker: pick.ticker,
        exchange,
        name: pick.name || candidate?.name,
        rank: pick.rank,
        analysis: marketAnalysis,
        technical,
        rangeBars: DAILY_TELEGRAM_CHART_RANGE === 'ALL' ? null : 252,
      };
      const png = telegramChartImage.renderTelegramChartPng(imageInput);
      await sendTelegramPhoto(png, telegramChartImage.telegramChartCaption(imageInput), `${pick.ticker.toLowerCase()}-chart.png`);
      sent += 1;
      console.log(`[Worker] Telegram chart sent: ${category} ${pick.ticker} (${provider}/${model}).`);
    } catch (error) {
      const cause = error && typeof error === 'object' && 'cause' in error
        ? `; cause=${compactError(error.cause)}`
        : '';
      console.error(`[Worker] Telegram chart failed: ${category} ${pick.ticker} - ${compactError(error)}${cause}`);
    }
  }
  return { skipped: false, attempted, sent };
}

async function callDailyTop5Provider(provider, prompt, candidates) {
  if (provider === 'codex-cli') {
    if (!CODEX_CLI_ENABLED) throw new Error('Codex CLI provider disabled.');
    const { payload, rawResponse } = await callCodexCli(prompt, {
      outputSchema: DAILY_TOP5_OUTPUT_SCHEMA,
      buildPrompt: buildCodexDailyTop5Prompt,
      timeoutMs: DAILY_TOP5_TIMEOUT_MS,
      parseOutput: (raw) => ({ payload: parseCodexCliJsonOutput(raw), rawResponse: raw }),
    });
    const result = dailyScreeners.parseDailyCategoryTop10Response(JSON.stringify(payload), candidates);
    return { ...result, rawResponse };
  }

  if (provider === 'local-llm') {
    if (!LOCAL_LLM_ENABLED) throw new Error('Local LLM is not enabled.');
    const raw = await callOpenAiCompatibleProvider({
      url: `${LOCAL_LLM_API_URL.replace(/\/$/, '')}/chat/completions`,
      provider,
      model: LOCAL_LLM_MODEL,
      prompt,
    });
    return dailyScreeners.parseDailyCategoryTop10Response(raw, candidates);
  }

  if (provider === 'gemini') {
    const raw = await callGeminiDailyTop5(prompt);
    return dailyScreeners.parseDailyCategoryTop10Response(raw, candidates);
  }

  if (provider === 'groq') {
    if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY is not configured.');
    const raw = await callOpenAiCompatibleProvider({
      url: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: GROQ_API_KEY,
      provider,
      model: GROQ_MODEL,
      prompt,
    });
    return dailyScreeners.parseDailyCategoryTop10Response(raw, candidates);
  }

  if (provider === 'cerebras') {
    if (!CEREBRAS_API_KEY) throw new Error('CEREBRAS_API_KEY is not configured.');
    const raw = await callOpenAiCompatibleProvider({
      url: 'https://api.cerebras.ai/v1/chat/completions',
      apiKey: CEREBRAS_API_KEY,
      provider,
      model: CEREBRAS_MODEL,
      prompt,
    });
    return dailyScreeners.parseDailyCategoryTop10Response(raw, candidates);
  }

  return dailyScreeners.ruleBasedDailyCategoryTop10(candidates);
}

async function runDailyTop5Chain(prompt, candidates, onProviderFailure) {
  const chain = [];

  for (const provider of DAILY_TOP5_PROVIDER_ORDER) {
    const model = dailyProviderModel(provider);
    try {
      console.log(`[Worker] ⏳ Daily Top5 provider: ${provider} (${model})`);
      const result = await callDailyTop5Provider(provider, prompt, candidates);
      const counts = Object.fromEntries(dailyScreeners.DAILY_SCREENER_CATEGORIES.map((category) => [category, result.categories?.[category]?.length ?? 0]));
      if (dailyScreeners.DAILY_SCREENER_CATEGORIES.some((category) => counts[category] !== 10)) {
        throw new Error(`Provider returned invalid category Top10 counts: ${JSON.stringify(counts)}.`);
      }
      chain.push({ provider, model, status: 'success' });
      return { provider, model, result, chain };
    } catch (error) {
      const message = compactError(error);
      chain.push({ provider, model, status: 'failed', message });
      console.warn(`[Worker] Daily Top5 provider failed: ${provider} - ${message}`);
      if (onProviderFailure) await onProviderFailure({ provider, model, message });
    }
  }

  throw new Error('Daily Top5 provider chain exhausted.');
}

function rankLookup(topGroups) {
  const ranks = new Map();
  for (const source of dailyScreeners.DAILY_SCREENER_SOURCES) {
    const sourceRows = Array.isArray(topGroups[source]) ? topGroups[source] : [];
    for (const candidate of sourceRows) {
      ranks.set(`${candidate.source}:${candidate.universe}:${candidate.ticker}`, candidate.rank ?? null);
    }
  }
  return ranks;
}

function rankLookupBySourceMarket(topGroups) {
  const ranks = new Map();
  for (const source of dailyScreeners.DAILY_SCREENER_SOURCES) {
    for (const market of ['US', 'KR']) {
      const sourceRows = !Array.isArray(topGroups[source]) ? topGroups[source]?.[market] || [] : [];
      for (const candidate of sourceRows) {
        ranks.set(`${candidate.source}:${candidate.universe}:${candidate.ticker}`, candidate.rank ?? null);
      }
    }
  }
  return ranks;
}

function rankLookupBySourceCategory(topGroups) {
  const ranks = new Map();
  for (const source of dailyScreeners.DAILY_SCREENER_SOURCES) {
    for (const category of dailyScreeners.DAILY_SCREENER_CATEGORIES) {
      const sourceRows = !Array.isArray(topGroups[source]) ? topGroups[source]?.[category] || [] : [];
      for (const candidate of sourceRows) {
        ranks.set(`${candidate.source}:${candidate.universe}:${candidate.ticker}`, candidate.rank ?? null);
      }
    }
  }
  return ranks;
}

async function loadPersistedDailyCandidates(runId) {
  const { data, error } = await supabase
    .from('daily_screener_candidates')
    .select('*')
    .eq('run_id', runId)
    .order('source', { ascending: true })
    .order('score', { ascending: false });
  if (error) throw error;

  return (data || []).map((row) => ({
    source: row.source,
    universe: row.universe,
    ticker: row.ticker,
    exchange: row.exchange,
    name: row.name,
    score: Number(row.score),
    grade: row.grade,
    rank: row.source_rank ?? undefined,
    price: row.price === null ? null : Number(row.price),
    priceAsOf: row.price_as_of,
    reason: row.reason || '',
    metrics: row.raw_metrics || {},
    raw: row.raw || {},
  }));
}

async function insertDailyCandidates(run, candidates, topBySource) {
  const categoryRanks = rankLookupBySourceCategory(topBySource);
  const marketRanks = categoryRanks.size > 0 ? categoryRanks : rankLookupBySourceMarket(topBySource);
  const ranks = marketRanks.size > 0 ? marketRanks : rankLookup(topBySource);
  const rows = candidates.map((candidate) => ({
    run_id: run.id,
    run_date: run.run_date,
    source: candidate.source,
    universe: candidate.universe,
    ticker: candidate.ticker,
    exchange: candidate.exchange,
    name: candidate.name,
    score: candidate.score,
    grade: candidate.grade,
    source_rank: ranks.get(`${candidate.source}:${candidate.universe}:${candidate.ticker}`) ?? null,
    price: candidate.price,
    price_as_of: candidate.priceAsOf,
    reason: candidate.reason,
    raw_metrics: candidate.metrics,
    raw: candidate.raw,
  }));

  await supabase.from('daily_screener_candidates').delete().eq('run_id', run.id);
  for (let index = 0; index < rows.length; index += 500) {
    const { error } = await supabase
      .from('daily_screener_candidates')
      .insert(rows.slice(index, index + 500));
    if (error) throw error;
  }
}

async function loadRecommendationMarketContext(runDate) {
  const isFresh = (calcDate) => {
    if (!calcDate) return false;
    const ageDays = Math.floor((Date.parse(`${runDate}T00:00:00Z`) - Date.parse(`${calcDate}T00:00:00Z`)) / 86_400_000);
    return ageDays >= 0 && ageDays <= 3;
  };
  const macroQuery = await supabase
    .from('macro_snapshot')
    .select('calc_date, macro_score, regime, vix_level')
    .lte('calc_date', runDate)
    .order('calc_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (macroQuery.error) throw macroQuery.error;

  const contexts = {};
  for (const market of ['US', 'KR']) {
    const marketQuery = await supabase
      .from('master_filter_snapshot')
      .select('calc_date, p3_score, state, trend_score, breadth_score, volatility_score, sector_score')
      .eq('market', market)
      .lte('calc_date', runDate)
      .order('calc_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (marketQuery.error) throw marketQuery.error;
    contexts[market] = {
      market_state: isFresh(marketQuery.data?.calc_date) ? marketQuery.data : null,
      market_state_quality: marketQuery.data ? (isFresh(marketQuery.data.calc_date) ? 'FULL' : 'STALE') : 'MISSING',
      macro: isFresh(macroQuery.data?.calc_date) ? macroQuery.data : null,
      macro_quality: macroQuery.data ? (isFresh(macroQuery.data.calc_date) ? 'FULL' : 'STALE') : 'MISSING',
    };
  }
  return contexts;
}

async function loadRecentKrRecommendations(runDate, category) {
  const from = new Date(`${runDate}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 30);
  let query = supabase
    .from('recommendation_picks')
    .select('ticker, signal_price, recommendation_publications!inner(run_date, market, category, is_official, status)')
    .eq('recommendation_publications.market', 'KR')
    .eq('recommendation_publications.is_official', true)
    .eq('recommendation_publications.status', 'PUBLISHED')
    .gte('recommendation_publications.run_date', from.toISOString().slice(0, 10))
    .lt('recommendation_publications.run_date', runDate)
    .limit(500);
  if (category) query = query.eq('recommendation_publications.category', category);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row) => ({
    ticker: row.ticker,
    signalPrice: row.signal_price === null ? null : Number(row.signal_price),
    runDate: row.recommendation_publications.run_date,
  }));
}

async function processDailyScreenerRun(run) {
  console.log(`\n[Worker] 🚀 Found pending Daily Screener run ${run.id} (${run.run_date})`);
  const now = new Date().toISOString();
  const lock = await supabase
    .from('daily_screener_runs')
    .update({ status: 'processing', updated_at: now })
    .eq('id', run.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (lock.error) throw lock.error;
  if (!lock.data) {
    console.log(`[Worker] Daily Screener run ${run.id} was already claimed.`);
    return;
  }

  try {
    const sources = scopeArray(run.scope, 'sources', dailyScreeners.DAILY_SCREENER_SOURCES);
    const universes = scopeArray(run.scope, 'universes', dailyScreeners.DAILY_SCREENER_UNIVERSES);
    const maxPerUniverse = scopePositiveNumber(run.scope, 'max_per_universe', 40);
    const persistedCount = Number(run.scan_summary?.candidate_count || 0);
    let scan;
    let topCandidates;
    let resumedFromCandidates = false;

    if (persistedCount > 0) {
      const persisted = await loadPersistedDailyCandidates(run.id);
      if (persisted.length > 0) {
        const topBySource = dailyScreeners.groupTopCandidatesBySource(persisted, 10);
        const topBySourceMarket = dailyScreeners.groupTopCandidatesBySourceMarket(persisted, 10);
        const topBySourceCategory = dailyScreeners.groupTopCandidatesBySourceCategory(persisted, 10);
        scan = {
          runDate: run.run_date,
          candidates: persisted,
          topBySource,
          topBySourceMarket,
          topBySourceCategory,
          errors: Array.isArray(run.scan_summary?.errors) ? run.scan_summary.errors : [],
          maxPerUniverse: run.scan_summary?.max_per_universe ?? maxPerUniverse,
        };
        topCandidates = dailyScreeners.flattenTopCandidatesBySourceCategory(topBySourceCategory);
        resumedFromCandidates = true;
        console.log(`[Worker] ↩️ Resuming Daily Screener run from ${persisted.length} persisted candidates.`);
      }
    }

    if (!scan) {
      scan = await dailyScreeners.scanDailyScreeners({
        runDate: run.run_date,
        sources,
        universes,
        maxPerUniverse,
      });
      await insertDailyCandidates(run, scan.candidates, scan.topBySourceCategory);
      topCandidates = dailyScreeners.flattenTopCandidatesBySourceCategory(scan.topBySourceCategory);
    }

    const categoryTopCandidateCount = Object.fromEntries(dailyScreeners.DAILY_SCREENER_CATEGORIES.map((category) => [
      category,
      topCandidates.filter((candidate) => dailyScreeners.categoryForDailyCandidate(candidate) === category).length,
    ]));
    if (dailyScreeners.DAILY_SCREENER_CATEGORIES.some((category) => categoryTopCandidateCount[category] < 10)) {
      throw new Error(`Daily screener produced fewer than 10 top candidates for a category: ${JSON.stringify(categoryTopCandidateCount)}.`);
    }

    const scanSummary = {
      run_date: run.run_date,
      sources,
      universes,
      max_per_universe: scan.maxPerUniverse,
      candidate_count: scan.candidates.length,
      top_candidate_count: topCandidates.length,
      category_top_candidate_count: categoryTopCandidateCount,
      errors: scan.errors,
      generated_at: new Date().toISOString(),
    };

    const { error: scanSummaryError } = await supabase
      .from('daily_screener_runs')
      .update({ scan_summary: scanSummary, updated_at: new Date().toISOString() })
      .eq('id', run.id);
    if (scanSummaryError) throw new Error(`daily screener scan summary update failed: ${scanSummaryError.message}`);

    if (resumedFromCandidates) {
      console.log('[Worker] Persisted candidates found; rebuilding category Top10 from saved screener candidates.');
    }

    const marketContextByMarket = await loadRecommendationMarketContext(run.run_date);
    let krSessionOpen = false;
    let krBenchmark = null;
    try {
      krBenchmark = await recommendationPrices.fetchRecommendationBenchmarkBars('^KS200');
      const tradeDates = krBenchmark.bars.map((bar) => bar.date);
      const latestTradeDate = tradeDates.at(-1) || null;
      krSessionOpen = isTradingSession(tradeDates, run.run_date);
      marketContextByMarket.KR = {
        ...marketContextByMarket.KR,
        benchmark_latest_trade_date: latestTradeDate,
        publication_eligible: krSessionOpen,
      };
    } catch (error) {
      marketContextByMarket.KR = {
        ...marketContextByMarket.KR,
        benchmark_latest_trade_date: null,
        publication_eligible: false,
        benchmark_error: compactError(error),
      };
    }
    const krTopTickers = [...new Set(topCandidates
      .filter((candidate) => dailyScreeners.marketForDailyCandidate(candidate) === 'KR')
      .map((candidate) => candidate.ticker))].slice(0, 40);
    const flowFeatures = new Map();
    const flowSnapshotByTicker = {};
    if (krSessionOpen) {
      const flowCollection = await krInvestorFlow.collectKrInvestorFlows({ tickers: krTopTickers, asOfDate: run.run_date });
      const flowRows = [...flowCollection.results.values()].flat();
      await krInvestorFlow.upsertKrInvestorFlowDaily(supabase, flowRows);
      const flowFeatureCutoff = new Date().toISOString();
      for (const ticker of krTopTickers) {
        const rows = flowCollection.results.get(ticker) || [];
        const feature = krInvestorFlow.buildKrInvestorFlowFeatures({
          ticker,
          asOfDate: run.run_date,
          recommendationAt: flowFeatureCutoff,
          rows,
          benchmarkTradeDates: krBenchmark?.bars.map((bar) => bar.date) || [],
        });
        flowFeatures.set(ticker, feature);
        const snapshot = {
          investor_flow: {
            as_of_date: run.run_date,
            recommendation_at: flowFeatureCutoff,
            provider: feature.provider,
            quality: feature.quality,
            feature,
            daily: rows.filter((row) => row.tradeDate <= run.run_date).slice(-5),
            error: flowCollection.errors.get(ticker) || null,
          },
        };
        flowSnapshotByTicker[ticker] = snapshot;
        for (const category of [...new Set(topCandidates
          .filter((candidate) => candidate.ticker === ticker && dailyScreeners.marketForDailyCandidate(candidate) === 'KR')
          .map((candidate) => dailyScreeners.categoryForDailyCandidate(candidate)))]) {
          flowSnapshotByTicker[`${category}:${ticker}`] = snapshot;
        }
      }
      marketContextByMarket.KR = {
        ...marketContextByMarket.KR,
        investor_flow_provider: flowCollection.provider,
        investor_flow_coverage: krTopTickers.length
          ? [...flowFeatures.values()].filter((feature) => feature.quality !== 'MISSING').length / krTopTickers.length
          : 0,
        investor_flow_errors: flowCollection.errors.size,
      };
    }
    const marketContextByCategory = Object.fromEntries(dailyScreeners.DAILY_SCREENER_CATEGORIES.map((category) => {
      const market = dailyScreeners.marketForDailyCategory(category);
      return [category, {
        ...marketContextByMarket[market],
        category,
        category_label: dailyScreeners.categoryLabel(category),
        scan_summary: scanSummary,
      }];
    }));
    await touchDailyScreenerRun(run.id);
    const prompt = dailyScreeners.buildDailyCategoryTop10Prompt({
      runDate: run.run_date,
      candidates: topCandidates,
      marketContext: {
        ...marketContextByMarket,
        ...marketContextByCategory,
      },
    });
    const top5Attempt = await runDailyTop5Chain(prompt, topCandidates, () => touchDailyScreenerRun(run.id));
    const chartGated = await applyDailyRecommendationChartGate({
      categories: top5Attempt.result.categories,
      candidates: topCandidates,
    });
    const gatedResult = {
      ...top5Attempt.result,
      categories: chartGated.categories,
    };
    const top5Result = {
      provider: top5Attempt.provider,
      model: top5Attempt.model,
      categories: gatedResult.categories,
      report_markdown: top5Attempt.result.reportMarkdown,
      raw_response: top5Attempt.result.rawResponse,
      generated_at: new Date().toISOString(),
    };
    await touchDailyScreenerRun(run.id);

    const usCategories = recommendationConfig.RECOMMENDATION_CATEGORIES
      .filter((category) => recommendationConfig.RECOMMENDATION_CATEGORY_MARKET[category] === 'US');
    const krCategories = recommendationConfig.RECOMMENDATION_CATEGORIES
      .filter((category) => recommendationConfig.RECOMMENDATION_CATEGORY_MARKET[category] === 'KR');
    const recommendationPublications = await recommendationPersistence.persistRecommendationPublications({
      client: supabase,
      runId: run.id,
      runDate: run.run_date,
      generatedAt: top5Result.generated_at,
      provider: top5Attempt.provider,
      model: top5Attempt.model,
      result: gatedResult,
      candidates: scan.candidates,
      marketContext: {
        scan_summary: scanSummary,
        provider_chain: top5Attempt.chain,
      },
      marketContextByMarket: Object.fromEntries(Object.entries(marketContextByMarket).map(([market, context]) => [market, {
        ...context,
        scan_summary: scanSummary,
        provider_chain: top5Attempt.chain,
      }])),
      marketContextByCategory: Object.fromEntries(Object.entries(marketContextByCategory).map(([category, context]) => [category, {
        ...context,
        provider_chain: top5Attempt.chain,
      }])),
      categories: usCategories,
      candidateSnapshotByTicker: { ...flowSnapshotByTicker, ...chartGated.snapshots },
    });
    const officialResultByCategory = Object.fromEntries(recommendationPublications
      .filter((publication) => publication.is_official)
      .map((publication) => [publication.category, storedRecommendationPicks(publication)]));
    const { data: existingKrPublications, error: existingKrPublicationsError } = await supabase
      .from('recommendation_publications')
      .select('*, recommendation_picks(ticker, exchange, name, rank, universe, source, score, grade, confidence, reason, risk, candidate_snapshot)')
      .eq('screener_run_id', run.id)
      .eq('is_official', true)
      .eq('status', 'PUBLISHED')
      .in('category', krCategories);
    if (existingKrPublicationsError) throw existingKrPublicationsError;
    const existingKrPublicationByCategory = new Map((existingKrPublications || [])
      .map((publication) => [publication.category, publication]));
    const policyFailures = [];
    if (krSessionOpen) {
      const marketState = marketContextByMarket.KR?.market_state || 'YELLOW';
      const allowedPolicies = [
        recommendationConfig.RECOMMENDATION_ENGINE_VERSION,
        recommendationConfig.KR_RISK_ENGINE_VERSION,
        recommendationConfig.KR_RISK_FLOW_ENGINE_VERSION,
      ];
      const activePolicy = allowedPolicies.includes(recommendationConfig.KR_RECOMMENDATION_POLICY)
        ? recommendationConfig.KR_RECOMMENDATION_POLICY
        : recommendationConfig.RECOMMENDATION_ENGINE_VERSION;
      for (const category of krCategories) {
        const existingOfficialPublication = existingKrPublicationByCategory.get(category);
        if (existingOfficialPublication) {
          recommendationPublications.push(existingOfficialPublication);
          officialResultByCategory[category] = storedRecommendationPicks(existingOfficialPublication);
          console.log(`[Worker] Preserving published official recommendation: ${run.run_date} ${category}.`);
          await touchDailyScreenerRun(run.id);
          continue;
        }
        const recentRecommendations = await loadRecentKrRecommendations(run.run_date, category);
        const selection = resolveRecommendationPolicies({
          basePolicy: {
            engineVersion: recommendationConfig.RECOMMENDATION_ENGINE_VERSION,
            picks: gatedResult.categories[category],
            ranked: null,
          },
          requestedEngineVersion: activePolicy,
          optionalPolicies: [
            {
              engineVersion: recommendationConfig.KR_RISK_ENGINE_VERSION,
              build: () => {
                const ranked = krRiskRanking.selectKrRiskAdjustedTop10({
                  candidates: topCandidates,
                  category,
                  recentRecommendations,
                  marketState,
                  useFlow: false,
                });
                return { picks: ranked.map((row) => row.pick), ranked };
              },
            },
            {
              engineVersion: recommendationConfig.KR_RISK_FLOW_ENGINE_VERSION,
              build: () => {
                const ranked = krRiskRanking.selectKrRiskAdjustedTop10({
                  candidates: topCandidates,
                  category,
                  recentRecommendations,
                  marketState,
                  flowFeatures,
                  useFlow: true,
                });
                return { picks: ranked.map((row) => row.pick), ranked };
              },
            },
          ],
        });
        for (const failure of selection.failures) {
          const finding = { category, phase: 'policy_selection', ...failure };
          policyFailures.push(finding);
          console.warn(`[Worker] KR policy unavailable; continuing with fallback: ${category} ${failure.engineVersion} - ${failure.message}`);
        }
        if (selection.effectiveEngineVersion !== activePolicy) {
          console.warn(`[Worker] KR official policy fallback: ${category} ${activePolicy} -> ${selection.effectiveEngineVersion}`);
        }
        const officialPolicy = selection.policies.find((policy) => policy.isOfficial);
        if (officialPolicy?.ranked) {
          const gatedOfficialPolicy = await applyDailyRecommendationChartGate({
            categories: { [category]: officialPolicy.picks },
            candidates: topCandidates,
          });
          officialPolicy.picks = gatedOfficialPolicy.categories[category];
          officialPolicy.chartGateSnapshots = gatedOfficialPolicy.snapshots;
        }
        officialResultByCategory[category] = officialPolicy.picks;
        for (const policy of selection.policies) {
          const deterministicSnapshots = policy.ranked
            ? Object.fromEntries(policy.ranked.flatMap((row) => {
              const snapshot = {
                ...flowSnapshotByTicker[`${category}:${row.pick.ticker}`],
                deterministic_ranking: {
                  aggregate_score: row.aggregateScore,
                  source_score: row.sourceScore,
                  flow_score: row.flowScore,
                  sources: row.sources,
                  risk_flags: row.riskFlags,
                },
              };
              return [[row.pick.ticker, snapshot], [`${category}:${row.pick.ticker}`, snapshot]];
            }))
            : flowSnapshotByTicker;
          try {
            const publication = await recommendationPersistence.persistRecommendationPolicy({
              client: supabase,
              runId: run.id,
              runDate: run.run_date,
              generatedAt: top5Result.generated_at,
              provider: top5Attempt.provider,
              model: top5Attempt.model,
              result: { ...gatedResult, categories: { ...gatedResult.categories, [category]: policy.picks } },
              candidates: scan.candidates,
              category,
              engineVersion: policy.engineVersion,
              isOfficial: policy.isOfficial,
              marketContextByCategory: {
                [category]: {
                  ...marketContextByCategory[category],
                  scan_summary: scanSummary,
                  provider_chain: top5Attempt.chain,
                  policy_selection: {
                    requested_engine_version: activePolicy,
                    effective_engine_version: selection.effectiveEngineVersion,
                    failures: selection.failures,
                  },
                },
              },
              candidateSnapshotByTicker: { ...deterministicSnapshots, ...chartGated.snapshots, ...(policy.chartGateSnapshots || {}) },
            });
            recommendationPublications.push(publication);
          } catch (error) {
            if (policy.isOfficial) throw error;
            const message = compactError(error);
            policyFailures.push({ category, phase: 'policy_persistence', engineVersion: policy.engineVersion, message });
            console.warn(`[Worker] KR shadow policy persistence failed; continuing: ${category} ${policy.engineVersion} - ${message}`);
          }
        }
        await touchDailyScreenerRun(run.id);
      }
    }
    const publicationByCategory = new Map(recommendationPublications
      .filter((publication) => publication.is_official)
      .map((publication) => [publication.category, publication]));
    const deliveryCategories = krSessionOpen ? recommendationConfig.RECOMMENDATION_CATEGORIES : usCategories;
    const deliveryResult = await deliverCategoriesIndependently({
      categories: deliveryCategories,
      publicationByCategory,
      picksByCategory: officialResultByCategory,
      formatMessage: ({ category, picks }) => dailyScreeners.formatDailyCategoryTop10TelegramMessage({
        runDate: run.run_date,
        category,
        top10: picks,
        provider: `${top5Attempt.provider} (${top5Attempt.model})`,
      }),
      sendMessage: sendTelegramMessage,
      markStatus: markRecommendationTelegramStatusWithRetry,
      afterSent: DAILY_TELEGRAM_CHARTS_AUTO_ENABLED ? async ({ category, picks }) => {
          const chartDelivery = await sendDailyTelegramCharts({
            category,
            picks,
            candidates: topCandidates,
          });
          if (!chartDelivery.skipped) {
            console.log(`[Worker] Telegram chart delivery: ${category} ${chartDelivery.sent}/${chartDelivery.attempted}.`);
          }
        } : null,
    });
    for (const failure of deliveryResult.failures) {
      console.error(`[Worker] Telegram category delivery failed; continuing: ${failure.category} - ${failure.message}`);
    }
    for (const failure of deliveryResult.postDeliveryFailures) {
      console.warn(`[Worker] Telegram post-delivery task failed: ${failure.category} - ${failure.message}`);
    }

    const deliveredCategoryCount = deliveryResult.sentCategories.length + deliveryResult.alreadySentCategories.length;
    const allTelegramSent = deliveredCategoryCount === deliveryCategories.length;
    const findings = [
      ...scan.errors,
      ...policyFailures,
      ...deliveryResult.failures.map((failure) => ({ ...failure, phase: 'telegram_delivery' })),
      ...deliveryResult.skippedCategories.map((category) => ({ category, phase: 'telegram_delivery', message: 'Delivery was skipped.' })),
      ...deliveryResult.postDeliveryFailures.map((failure) => ({ ...failure, phase: 'telegram_post_delivery' })),
    ];
    const completedAt = new Date().toISOString();
    const { error: completionError } = await supabase
      .from('daily_screener_runs')
      .update({
        status: 'completed',
        scan_summary: { ...scanSummary, delivery_categories: deliveryCategories },
        llm_provider_chain: top5Attempt.chain,
        top5_result: top5Result,
        error_summary: findings.length ? JSON.stringify(findings).slice(0, 2000) : null,
        telegram_sent_at: allTelegramSent ? completedAt : null,
        completed_at: completedAt,
        updated_at: completedAt,
      })
      .eq('id', run.id);
    if (completionError) throw new Error(`daily screener completion update failed: ${completionError.message}`);

    console.log(`[Worker] 🟢 Daily Screener run completed: ${run.id} (telegram ${deliveredCategoryCount}/${deliveryCategories.length})`);
  } catch (error) {
    const message = compactError(error, 2000);
    console.error(`[Worker] ❌ Daily Screener run failed: ${message}`);
    const { error: statusError } = await supabase
      .from('daily_screener_runs')
      .update({
        status: 'failed',
        error_summary: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', run.id);
    if (statusError) {
      throw new Error(`${message}; failed to persist run failure: ${statusError.message}`);
    }
  }
}

let lastStaleRecoveryCheckAt = 0;

function kstDateDaysAgo(days) {
  const shifted = new Date(Date.now() + 9 * 60 * 60 * 1000);
  shifted.setUTCDate(shifted.getUTCDate() - days);
  return shifted.toISOString().slice(0, 10);
}

async function touchDailyScreenerRun(runId) {
  const { error } = await supabase
    .from('daily_screener_runs')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', runId)
    .eq('status', 'processing');
  if (error) throw error;
}

async function recoverStaleDailyScreenerRuns() {
  const now = Date.now();
  if (now - lastStaleRecoveryCheckAt < 60_000) return [];
  lastStaleRecoveryCheckAt = now;
  const recoveredAt = new Date(now).toISOString();
  const staleBefore = new Date(now - DAILY_SCREENER_STALE_AFTER_MS).toISOString();
  const { data, error } = await supabase
    .from('daily_screener_runs')
    .update({
      status: 'pending',
      error_summary: `Automatically recovered stale processing run at ${recoveredAt}.`,
      updated_at: recoveredAt,
    })
    .eq('status', 'processing')
    .gte('run_date', kstDateDaysAgo(DAILY_TELEGRAM_RETRY_LOOKBACK_DAYS))
    .lt('updated_at', staleBefore)
    .select('id, run_date');
  if (error) throw new Error(`stale daily screener recovery failed: ${error.message}`);
  for (const run of data || []) {
    console.warn(`[Worker] Requeued stale Daily Screener run ${run.id} (${run.run_date}).`);
  }
  return data || [];
}

function storedRecommendationPicks(publication) {
  const rows = Array.isArray(publication.picks)
    ? publication.picks
    : Array.isArray(publication.recommendation_picks) ? publication.recommendation_picks : [];
  return rows
    .sort((left, right) => left.rank - right.rank)
    .map((pick) => ({
      ...pick,
      category: publication.category,
      market: publication.market,
      chartGate: pick.candidate_snapshot?.chart_gate,
    }));
}

async function syncRunTelegramCompletion(runId) {
  const { data: run, error: runError } = await supabase
    .from('daily_screener_runs')
    .select('id, status, scope, scan_summary')
    .eq('id', runId)
    .maybeSingle();
  if (runError) throw runError;
  if (!run || run.status !== 'completed') return;
  const { data: publications, error: publicationsError } = await supabase
    .from('recommendation_publications')
    .select('category, telegram_status, telegram_sent_at')
    .eq('screener_run_id', runId)
    .eq('is_official', true)
    .eq('status', 'PUBLISHED');
  if (publicationsError) throw publicationsError;
  const expectedCategories = scopeArray(
    run.scan_summary,
    'delivery_categories',
    scopeArray(run.scope, 'universes', recommendationConfig.RECOMMENDATION_CATEGORIES),
  )
    .filter((category) => recommendationConfig.RECOMMENDATION_CATEGORIES.includes(category));
  const publicationCategories = new Set((publications || []).map((publication) => publication.category));
  if (!expectedCategories.length
    || expectedCategories.some((category) => !publicationCategories.has(category))
    || publications.some((publication) => publication.telegram_status !== 'SENT')) return;
  const sentAt = publications
    .map((publication) => publication.telegram_sent_at)
    .filter(Boolean)
    .sort()
    .at(-1) || new Date().toISOString();
  const { error: updateError } = await supabase
    .from('daily_screener_runs')
    .update({ telegram_sent_at: sentAt, updated_at: new Date().toISOString() })
    .eq('id', runId);
  if (updateError) throw updateError;
}

async function markRecommendationTelegramStatusWithRetry(publicationId, status, sentAt = null) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await recommendationPersistence.markRecommendationTelegramStatus(supabase, publicationId, status, sentAt);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw lastError;
}

async function claimRecommendationTelegramPublication(publication) {
  const claimedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('recommendation_publications')
    .update({ telegram_status: 'FAILED', telegram_sent_at: null, updated_at: claimedAt })
    .eq('id', publication.id)
    .eq('telegram_status', publication.telegram_status)
    .eq('updated_at', publication.updated_at)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`recommendation telegram claim failed: ${error.message}`);
  return Boolean(data);
}

async function deliverStoredRecommendationPublication(publication) {
  const picks = storedRecommendationPicks(publication);
  if (picks.length === 0) {
    await markRecommendationTelegramStatusWithRetry(publication.id, 'FAILED');
    throw new Error(`${publication.category} publication ${publication.id} has no persisted picks.`);
  }
  let telegramAccepted = false;
  try {
    await sendTelegramMessage(dailyScreeners.formatDailyCategoryTop10TelegramMessage({
      runDate: publication.run_date,
      category: publication.category,
      top10: picks,
      provider: `${publication.llm_provider || 'unknown'} (${publication.llm_model || 'unknown'})`,
    }), { publicationId: publication.id });
    telegramAccepted = true;
    const sentAt = new Date().toISOString();
    await markRecommendationTelegramStatusWithRetry(publication.id, 'SENT', sentAt);
    await syncRunTelegramCompletion(publication.screener_run_id);
    console.log(`[Worker] Telegram outbox delivered: ${publication.run_date} ${publication.category} ${publication.id}.`);
  } catch (error) {
    if (!telegramAccepted) {
      await markRecommendationTelegramStatusWithRetry(
        publication.id,
        error?.deliveryUncertain ? 'SKIPPED' : 'FAILED',
      );
    } else {
      console.error(`[Worker] Telegram was accepted but its SENT receipt could not be finalized: ${publication.id}.`);
    }
    throw error;
  }
}

async function processPendingRecommendationTelegramQueue() {
  const minRunDate = kstDateDaysAgo(DAILY_TELEGRAM_RETRY_LOOKBACK_DAYS);
  const retryBefore = Date.now() - DAILY_TELEGRAM_RETRY_DELAY_MS;
  const { data, error } = await supabase
    .from('recommendation_publications')
    .select('id, screener_run_id, run_date, market, category, telegram_status, updated_at, llm_provider, llm_model, recommendation_picks(ticker, exchange, name, rank, universe, source, score, grade, confidence, reason, risk, candidate_snapshot)')
    .eq('is_official', true)
    .eq('status', 'PUBLISHED')
    .in('telegram_status', ['PENDING', 'FAILED'])
    .gte('run_date', minRunDate)
    .order('run_date', { ascending: false })
    .order('category', { ascending: true })
    .limit(20);
  if (error) throw new Error(`recommendation telegram outbox query failed: ${error.message}`);
  const publication = (data || []).find((item) => item.telegram_status === 'PENDING'
    || Date.parse(item.updated_at || '') <= retryBefore);
  if (!publication) return false;
  if (!await claimRecommendationTelegramPublication(publication)) return true;
  try {
    await deliverStoredRecommendationPublication(publication);
  } catch (deliveryError) {
    console.error(`[Worker] Telegram outbox delivery failed: ${publication.run_date} ${publication.category} - ${compactError(deliveryError)}`);
  }
  return true;
}

async function processDailyScreenerQueue() {
  const { data, error } = await supabase
    .from('daily_screener_runs')
    .select('id, run_date, status, scope, scan_summary')
    .eq('status', 'pending')
    .order('run_date', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    throw new Error(`daily screener queue query failed: ${error.message}`);
  }
  if (!data || data.length === 0) return false;
  await processDailyScreenerRun(data[0]);
  return true;
}

async function replayDailyTelegrams(runDate, categories = []) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(runDate)) throw new Error('Replay date must be YYYY-MM-DD.');
  const { data, error } = await supabase
    .from('recommendation_publications')
    .select('id, screener_run_id, run_date, market, category, telegram_status, updated_at, llm_provider, llm_model, recommendation_picks(ticker, exchange, name, rank, universe, source, score, grade, confidence, reason, risk, candidate_snapshot)')
    .eq('run_date', runDate)
    .eq('is_official', true)
    .eq('status', 'PUBLISHED')
    .in('telegram_status', ['PENDING', 'FAILED'])
    .order('category', { ascending: true });
  if (error) throw error;
  const publications = categories.length
    ? (data || []).filter((publication) => categories.includes(publication.category))
    : data || [];
  if (!publications.length) throw new Error(`No pending official recommendation telegrams found for ${runDate}.`);
  for (const publication of publications) {
    if (!await claimRecommendationTelegramPublication(publication)) {
      console.warn(`[Worker] Telegram replay skipped because publication was claimed elsewhere: ${publication.id}.`);
      continue;
    }
    await deliverStoredRecommendationPublication(publication);
  }
}

async function replayDailyTelegramCharts(runDate, categories = [], tickers = []) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(runDate)) throw new Error('Replay date must be YYYY-MM-DD.');
  if (!DAILY_TELEGRAM_CHARTS_ENABLED) throw new Error('DAILY_TELEGRAM_CHARTS_ENABLED=true is required for chart replay.');
  const { data: publications, error } = await supabase
    .from('recommendation_publications')
    .select('category, recommendation_picks(id, ticker, exchange, name, rank, candidate_snapshot)')
    .eq('run_date', runDate)
    .eq('is_official', true)
    .eq('status', 'PUBLISHED');
  if (error) throw error;
  const selectedPublications = categories.length
    ? (publications || []).filter((publication) => categories.includes(publication.category))
    : publications || [];
  if (!selectedPublications.length) throw new Error(`No official recommendation publications found for ${runDate}.`);
  for (const publication of selectedPublications) {
    const storedPicks = (Array.isArray(publication.recommendation_picks) ? publication.recommendation_picks : [])
      .filter((pick) => tickers.length === 0 || tickers.includes(pick.ticker));
    const picks = await mapWithConcurrency(storedPicks, DAILY_RECOMMENDATION_CHART_GATE_CONCURRENCY, async (pick) => {
      const chartGate = await analyzeRecommendationChartGate({ category: publication.category, pick, candidates: [] });
      const candidateSnapshot = { ...(pick.candidate_snapshot || {}), chart_gate: chartGate };
      const { error: updateError } = await supabase
        .from('recommendation_picks')
        .update({ candidate_snapshot: candidateSnapshot })
        .eq('id', pick.id);
      if (updateError) {
        console.warn(`[Worker] Replay chart gate persistence failed: ${publication.category} ${pick.ticker} - ${updateError.message}`);
      }
      return { ...pick, candidate_snapshot: candidateSnapshot, chartGate };
    });
    const eligible = picks.filter((pick) => pick.chartGate?.eligible).length;
    console.log(`[Worker] Replay chart gate refreshed: ${publication.category} ${eligible}/${picks.length} eligible.`);
    const delivery = await sendDailyTelegramCharts({ category: publication.category, picks, candidates: [] });
    console.log(`[Worker] Replay chart delivery: ${publication.category} ${delivery.sent}/${delivery.attempted}.`);
  }
}

async function processQueue() {
  await recoverStaleDailyScreenerRuns();
  if (await processPendingRecommendationTelegramQueue()) return;
  if (await processDailyScreenerQueue()) return;

  const { data: pending, error } = await supabase
    .from('beauty_contest_sessions')
    .select('id, ib_provider, ib_raw_response')
    .in('ib_provider', ['pending-codex-cli', 'pending-local-llm'])
    .order('updated_at', { ascending: true })
    .limit(1);

  if (error) {
    throw new Error(`analysis queue query failed: ${error.message}`);
  }
  
  if (!pending || pending.length === 0) return;

  const session = pending[0];
  if (session.ib_provider === 'pending-codex-cli') {
    await processCodexTask(session);
    return;
  }

  console.log(`\n[Worker] 🚀 Found pending Local LLM task for session ${session.id}`);

  // Lock row by setting it to processing
  await supabase
    .from('beauty_contest_sessions')
    .update({ ib_provider: 'processing-local-llm' })
    .eq('id', session.id);

  try {
    const prompt = session.ib_raw_response; // API route temporarily stored the prompt here
    if (!prompt || prompt.length < 10) throw new Error('Prompt missing or too short.');

    console.log(`[Worker] ⏳ Executing Local LLM (${LOCAL_LLM_MODEL})... This may take 5-10 minutes. Please wait...`);
    
    const url = `${LOCAL_LLM_API_URL.replace(/\/$/, '')}/chat/completions`;
    
    // axios를 사용하여 Node.js 내장 fetch의 5분 타임아웃(HeadersTimeoutError)을 무력화
    const response = await axios.post(url, {
      model: LOCAL_LLM_MODEL,
      messages: [
        { role: 'system', content: 'You are a Senior Investment Bank Committee Member.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 8192,
      options: { num_ctx: 16384, num_predict: 8192 } // Ollama 엔진 토큰 제한 명시적 해제
    }, {
      timeout: 0 // Timeout 무제한
    });
    
    const rawResponse = response.data.choices?.[0]?.message?.content?.trim();
    if (!rawResponse) throw new Error('Empty response from LLM');

    console.log(`[Worker] ✅ LLM execution finished. Parsing and saving to DB...`);
    
    const { metadata, reportMarkdown, parseFailed } = parseIbResponse(rawResponse);
    
    const bgIbAnalysis = {
      ...(metadata || {}),
      report_markdown: reportMarkdown,
      schema_version: '1.0.0',
      prompt_version: 'v4', // using latest prompt version string
      generated_at: new Date().toISOString(),
      parse_failed: parseFailed,
      ...(parseFailed ? { raw_text: rawResponse } : {})
    };

    await supabase
      .from('beauty_contest_sessions')
      .update({
        ib_raw_response: rawResponse,
        ib_analysis: bgIbAnalysis,
        ib_provider: `local-llm (${LOCAL_LLM_MODEL})`,
        updated_at: new Date().toISOString()
      })
      .eq('id', session.id);

    console.log(`[Worker] 💾 Database updated successfully.`);

    if (reportMarkdown) {
      console.log(`[Worker] 📱 Sending Telegram message...`);
      const fullText = `📊 *[MTN 실전 AI 수석 비서 브리핑]*\n\n${reportMarkdown}\n\n---------------------------------------\n*세션 ID*: \`${session.id}\`\n*엔진*: \`local-llm (${LOCAL_LLM_MODEL})\`\n[대시보드 바로가기](https://mttcs.vercel.app)`;
      await sendTelegramMessage(fullText);
      console.log(`[Worker] 🟢 Task Complete for session ${session.id}\n`);
    }

  } catch (error) {
    console.error('[Worker] ❌ Error processing task:', error.message || error);
    await supabase
      .from('beauty_contest_sessions')
      .update({
        ib_provider: 'failed-local-llm',
        ib_analysis: {
          parse_failed: true,
          error_message: error.message || String(error),
          failed_at: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', session.id);
  }
}

async function loop() {
  await acquireWorkerLock();
  console.log('============================================');
  console.log('[Worker] 🟢 MTN Codex/Local LLM Queue Worker Started');
  console.log(`[Worker] Codex CLI: ${CODEX_CLI_ENABLED ? CODEX_CLI_BIN : 'disabled'}`);
  console.log(`[Worker] Using LLM API: ${LOCAL_LLM_API_URL}`);
  console.log(`[Worker] Daily Top5 providers: ${DAILY_TOP5_PROVIDER_ORDER.join(' → ')}`);
  console.log(`[Worker] Waiting for tasks from Vercel...`);
  console.log('============================================');

  const telegramReplayArg = process.argv.find((arg) => arg.startsWith('--replay-telegrams='));
  if (telegramReplayArg) {
    const categoryArg = process.argv.find((arg) => arg.startsWith('--replay-categories='));
    const categories = categoryArg
      ? categoryArg.slice('--replay-categories='.length).split(',').map((item) => item.trim()).filter(Boolean)
      : [];
    await replayDailyTelegrams(telegramReplayArg.slice('--replay-telegrams='.length), categories);
    console.log('[Worker] Telegram replay completed.');
    return;
  }

  const replayArg = process.argv.find((arg) => arg.startsWith('--replay-charts='));
  if (replayArg) {
    const categoryArg = process.argv.find((arg) => arg.startsWith('--replay-categories='));
    const categories = categoryArg
      ? categoryArg.slice('--replay-categories='.length).split(',').map((item) => item.trim()).filter(Boolean)
      : [];
    const tickerArg = process.argv.find((arg) => arg.startsWith('--replay-tickers='));
    const tickers = tickerArg
      ? tickerArg.slice('--replay-tickers='.length).split(',').map((item) => item.trim().toUpperCase()).filter(Boolean)
      : [];
    await replayDailyTelegramCharts(replayArg.slice('--replay-charts='.length), categories, tickers);
    console.log('[Worker] Chart replay completed.');
    return;
  }

  if (process.env.WORKER_ONCE === 'true') {
    await processQueue();
    console.log('[Worker] WORKER_ONCE=true, exiting after one queue pass.');
    return;
  }
  
  let consecutiveQueueFailures = 0;
  while (true) {
    try {
      await processQueue();
      consecutiveQueueFailures = 0;
    } catch (error) {
      consecutiveQueueFailures += 1;
      console.error(`[Worker] Queue pass failed (${consecutiveQueueFailures}/3): ${compactError(error, 1200)}`);
      if (consecutiveQueueFailures >= 3) throw error;
    }
    await new Promise(r => setTimeout(r, 10000));
  }
}

loop().catch((error) => {
  console.error('[Worker] Fatal error:', compactError(error, 2000));
  process.exit(1);
});
