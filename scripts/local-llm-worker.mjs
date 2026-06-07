import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCodexIbPrompt, parseCodexCliOutput, parseIbResponse } from './lib/codex-cli-worker-utils.mjs';

// .env.local 변수들 (node --env-file=.env.local 로 주입됨)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;
const LOCAL_LLM_API_URL = process.env.LOCAL_LLM_API_URL || 'http://127.0.0.1:11434/v1';
const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL || 'qwen3.6:14b';
const CODEX_CLI_ENABLED = process.env.CODEX_CLI_ENABLED?.toLowerCase() !== 'false';
const CODEX_CLI_BIN = process.env.CODEX_CLI_BIN || 'codex';
const CODEX_CLI_MODEL = process.env.CODEX_CLI_MODEL || '';
const CODEX_CLI_TIMEOUT_MS = Number(process.env.CODEX_CLI_TIMEOUT_MS || 15 * 60 * 1000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CODEX_CLI_CWD = process.env.CODEX_CLI_CWD || path.join(process.env.TMPDIR || '/tmp', 'mtn-codex-worker');
const CODEX_OUTPUT_SCHEMA = process.env.CODEX_OUTPUT_SCHEMA || path.join(PROJECT_ROOT, 'schemas', 'ib-validation-result.schema.json');

if (!supabaseUrl || !supabaseKey) {
  console.error('[Worker] Missing Supabase environment variables. Exiting.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function sendTelegramMessage(text) {
  if (!telegramBotToken || !telegramChatId) {
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
    try {
      await axios.post(url, {
        chat_id: telegramChatId,
        text: chunks[i],
        parse_mode: 'Markdown'
      });
      // Add a small delay between chunks to avoid rate limiting
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.error(`[Worker] Telegram sending failed on chunk ${i+1}/${chunks.length}:`, e.response?.data || e.message);
    }
  }
}

function runProcess(command, args, input, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: PROJECT_ROOT,
      env: { ...process.env, TERM: process.env.TERM || 'dumb' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${command} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} exited with code ${code}: ${(stderr || stdout).slice(0, 1200)}`));
    });

    child.stdin.end(input);
  });
}

async function callCodexCli(prompt) {
  await mkdir(CODEX_CLI_CWD, { recursive: true });
  const outputPath = path.join(CODEX_CLI_CWD, `mtn-codex-${Date.now()}-${process.pid}.json`);
  const args = [
    'exec',
    '--ephemeral',
    '--sandbox', 'read-only',
    '--ask-for-approval', 'never',
    '--skip-git-repo-check',
    '--cd', CODEX_CLI_CWD,
    '--output-schema', CODEX_OUTPUT_SCHEMA,
    '--output-last-message', outputPath,
  ];

  if (CODEX_CLI_MODEL) args.push('--model', CODEX_CLI_MODEL);
  args.push('-');

  const codexPrompt = buildCodexIbPrompt(prompt);
  const { stdout, stderr } = await runProcess(CODEX_CLI_BIN, args, codexPrompt, CODEX_CLI_TIMEOUT_MS);

  let finalMessage = stdout.trim();
  try {
    const fileMessage = await readFile(outputPath, 'utf8');
    if (fileMessage.trim()) finalMessage = fileMessage.trim();
  } finally {
    await rm(outputPath, { force: true }).catch(() => {});
  }

  return { ...parseCodexCliOutput(finalMessage), stderr };
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

async function processQueue() {
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
  console.log(`[Worker] Waiting for tasks from Vercel...`);
  console.log('============================================');
  
  while (true) {
    await processQueue();
    // 10초마다 큐 확인
    await new Promise(r => setTimeout(r, 10000));
  }
}

loop();
