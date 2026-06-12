import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { createJiti } from 'jiti';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
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
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY || '';
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || 'qwen-3-235b-a22b-instruct-2507';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': PROJECT_ROOT } });
const dailyScreeners = jiti('../lib/daily-screeners/index.ts');
const CODEX_CLI_CWD = process.env.CODEX_CLI_CWD || path.join(process.env.TMPDIR || '/tmp', 'mtn-codex-worker');
const CODEX_OUTPUT_SCHEMA = process.env.CODEX_OUTPUT_SCHEMA || path.join(PROJECT_ROOT, 'schemas', 'ib-validation-result.schema.json');
const DAILY_TOP5_OUTPUT_SCHEMA = process.env.DAILY_TOP5_OUTPUT_SCHEMA || path.join(PROJECT_ROOT, 'schemas', 'daily-screener-top5.schema.json');

if (!supabaseUrl || !supabaseKey) {
  console.error('[Worker] Missing Supabase environment variables. Exiting.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function postTelegramPayload(url, payload) {
  try {
    await axios.post(url, payload, { timeout: 15000 });
    return;
  } catch (error) {
    console.warn('[Worker] Telegram axios request failed; retrying with curl:', error.code || error.message);
  }

  const { stdout } = await runProcess(
    'curl',
    ['-sS', '-X', 'POST', url, '-H', 'content-type: application/json', '--data-binary', '@-'],
    JSON.stringify(payload),
    30000,
  );
  const parsed = JSON.parse(stdout || '{}');
  if (!parsed.ok) {
    throw new Error(`Telegram API error: ${JSON.stringify(parsed).slice(0, 800)}`);
  }
}

async function sendTelegramMessage(text) {
  if (!telegramBotToken || telegramChatIds.length === 0) {
    console.log('[Worker] Telegram credentials missing, skipping telegram notification.');
    return;
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
      try {
        await postTelegramPayload(url, {
          chat_id: chatId,
          text: chunks[i],
          parse_mode: 'Markdown'
        });
        // Add a small delay between chunks/recipients to avoid rate limiting.
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        console.warn(`[Worker] Telegram Markdown failed for chat ${chatId} on chunk ${i+1}/${chunks.length}; retrying plain text:`, e.response?.data || e.message);
        try {
          await postTelegramPayload(url, {
            chat_id: chatId,
            text: chunks[i],
          });
          await new Promise(r => setTimeout(r, 500));
        } catch (retryError) {
          console.error(`[Worker] Telegram sending failed for chat ${chatId} on chunk ${i+1}/${chunks.length}:`, retryError.response?.data || retryError.message);
          throw retryError;
        }
      }
    }
  }
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
      finish(new Error(`${command} timed out after ${timeoutMs}ms.`));
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
      finish(new Error(`${command} exited with code ${code}: ${(stderr || stdout).slice(0, 1200)}`));
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
  const message = error instanceof Error ? error.message : String(error);
  return message.length > max ? `${message.slice(0, max)}...` : message;
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

async function callOpenAiCompatibleProvider({ url, apiKey, provider, model, prompt }) {
  const response = await axios.post(url, {
    model,
    messages: [
      { role: 'system', content: 'You are MTN Daily Screener Top5 analyst. Return JSON only.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 2200,
  }, {
    timeout: DAILY_TOP5_TIMEOUT_MS,
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
    generationConfig: { maxOutputTokens: 2200, temperature: 0.2 },
  });
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  if (!text) throw new Error('Gemini returned an empty response.');
  return text;
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
    const result = dailyScreeners.parseDailyMarketTop10Response(JSON.stringify(payload), candidates);
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
    return dailyScreeners.parseDailyMarketTop10Response(raw, candidates);
  }

  if (provider === 'gemini') {
    const raw = await callGeminiDailyTop5(prompt);
    return dailyScreeners.parseDailyMarketTop10Response(raw, candidates);
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
    return dailyScreeners.parseDailyMarketTop10Response(raw, candidates);
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
    return dailyScreeners.parseDailyMarketTop10Response(raw, candidates);
  }

  return dailyScreeners.ruleBasedDailyMarketTop10(candidates);
}

async function runDailyTop5Chain(prompt, candidates) {
  const chain = [];

  for (const provider of DAILY_TOP5_PROVIDER_ORDER) {
    const model = dailyProviderModel(provider);
    try {
      console.log(`[Worker] ⏳ Daily Top5 provider: ${provider} (${model})`);
      const result = await callDailyTop5Provider(provider, prompt, candidates);
      if (!Array.isArray(result.markets?.US) || !Array.isArray(result.markets?.KR) || result.markets.US.length !== 10 || result.markets.KR.length !== 10) {
        throw new Error(`Provider returned invalid market Top10 counts: US=${result.markets?.US?.length ?? 0}, KR=${result.markets?.KR?.length ?? 0}.`);
      }
      chain.push({ provider, model, status: 'success' });
      return { provider, model, result, chain };
    } catch (error) {
      const message = compactError(error);
      chain.push({ provider, model, status: 'failed', message });
      console.warn(`[Worker] Daily Top5 provider failed: ${provider} - ${message}`);
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
  const marketRanks = rankLookupBySourceMarket(topBySource);
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
        scan = {
          runDate: run.run_date,
          candidates: persisted,
          topBySource,
          topBySourceMarket,
          errors: Array.isArray(run.scan_summary?.errors) ? run.scan_summary.errors : [],
          maxPerUniverse: run.scan_summary?.max_per_universe ?? maxPerUniverse,
        };
        topCandidates = dailyScreeners.flattenTopCandidates(topBySource);
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
      await insertDailyCandidates(run, scan.candidates, scan.topBySource);
      topCandidates = dailyScreeners.flattenTopCandidates(scan.topBySource);
    }

    const usTopCandidateCount = topCandidates.filter((candidate) => dailyScreeners.marketForDailyCandidate(candidate) === 'US').length;
    const krTopCandidateCount = topCandidates.filter((candidate) => dailyScreeners.marketForDailyCandidate(candidate) === 'KR').length;
    if (usTopCandidateCount < 10 || krTopCandidateCount < 10) {
      throw new Error(`Daily screener produced fewer than 10 top candidates for a market (US=${usTopCandidateCount}, KR=${krTopCandidateCount}).`);
    }

    const scanSummary = {
      run_date: run.run_date,
      sources,
      universes,
      max_per_universe: scan.maxPerUniverse,
      candidate_count: scan.candidates.length,
      top_candidate_count: topCandidates.length,
      market_top_candidate_count: { US: usTopCandidateCount, KR: krTopCandidateCount },
      errors: scan.errors,
      generated_at: new Date().toISOString(),
    };

    await supabase
      .from('daily_screener_runs')
      .update({ scan_summary: scanSummary, updated_at: new Date().toISOString() })
      .eq('id', run.id);

    if (resumedFromCandidates) {
      console.log('[Worker] Persisted candidates found; rebuilding market Top10 from saved screener candidates.');
    }

    const prompt = dailyScreeners.buildDailyMarketTop10Prompt({ runDate: run.run_date, candidates: topCandidates });
    const top5Attempt = await runDailyTop5Chain(prompt, topCandidates);
    const top5Result = {
      provider: top5Attempt.provider,
      model: top5Attempt.model,
      markets: top5Attempt.result.markets,
      report_markdown: top5Attempt.result.reportMarkdown,
      raw_response: top5Attempt.result.rawResponse,
      generated_at: new Date().toISOString(),
    };

    for (const market of ['US', 'KR']) {
      await sendTelegramMessage(dailyScreeners.formatDailyMarketTop10TelegramMessage({
        runDate: run.run_date,
        market,
        top10: top5Attempt.result.markets[market],
        provider: `${top5Attempt.provider} (${top5Attempt.model})`,
      }));
    }

    await supabase
      .from('daily_screener_runs')
      .update({
        status: 'completed',
        llm_provider_chain: top5Attempt.chain,
        top5_result: top5Result,
        error_summary: scan.errors.length ? JSON.stringify(scan.errors).slice(0, 2000) : null,
        telegram_sent_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    console.log(`[Worker] 🟢 Daily Screener run completed: ${run.id}`);
  } catch (error) {
    const message = compactError(error, 2000);
    console.error(`[Worker] ❌ Daily Screener run failed: ${message}`);
    await supabase
      .from('daily_screener_runs')
      .update({
        status: 'failed',
        error_summary: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', run.id);
  }
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
    console.error('[Worker] Error checking Daily Screener queue:', error.message);
    return false;
  }
  if (!data || data.length === 0) return false;
  await processDailyScreenerRun(data[0]);
  return true;
}

async function processQueue() {
  if (await processDailyScreenerQueue()) return;

  const { data: pending, error } = await supabase
    .from('beauty_contest_sessions')
    .select('id, ib_provider, ib_raw_response')
    .in('ib_provider', ['pending-codex-cli', 'pending-local-llm'])
    .order('updated_at', { ascending: true })
    .limit(1);

  if (error) {
    console.error('[Worker] Error checking queue:', error.message);
    return;
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
  console.log('============================================');
  console.log('[Worker] 🟢 MTN Codex/Local LLM Queue Worker Started');
  console.log(`[Worker] Codex CLI: ${CODEX_CLI_ENABLED ? CODEX_CLI_BIN : 'disabled'}`);
  console.log(`[Worker] Using LLM API: ${LOCAL_LLM_API_URL}`);
  console.log(`[Worker] Daily Top5 providers: ${DAILY_TOP5_PROVIDER_ORDER.join(' → ')}`);
  console.log(`[Worker] Waiting for tasks from Vercel...`);
  console.log('============================================');

  if (process.env.WORKER_ONCE === 'true') {
    await processQueue();
    console.log('[Worker] WORKER_ONCE=true, exiting after one queue pass.');
    return;
  }
  
  while (true) {
    await processQueue();
    // 10초마다 큐 확인
    await new Promise(r => setTimeout(r, 10000));
  }
}

loop();
