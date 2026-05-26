import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

// .env.local 변수들 (node --env-file=.env.local 로 주입됨)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;
const LOCAL_LLM_API_URL = process.env.LOCAL_LLM_API_URL || 'http://127.0.0.1:11434/v1';
const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL || 'qwen3.6:14b';

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

function parseIbResponse(text) {
  let reportMarkdown = text;
  let metadata = null;
  let parseFailed = false;

  const jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/);
  if (jsonMatch) {
    try {
      metadata = JSON.parse(jsonMatch[1]);
      reportMarkdown = text.replace(jsonMatch[0], '').trim();
    } catch {
      parseFailed = true;
    }
  } else {
    parseFailed = true;
  }
  return { metadata, reportMarkdown, parseFailed };
}

async function processQueue() {
  const { data: pending, error } = await supabase
    .from('beauty_contest_sessions')
    .select('id, ib_raw_response')
    .eq('ib_provider', 'pending-local-llm')
    .order('updated_at', { ascending: true })
    .limit(1);

  if (error) {
    console.error('[Worker] Error checking queue:', error.message);
    return;
  }
  
  if (!pending || pending.length === 0) return;

  const session = pending[0];
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
  console.log('[Worker] 🟢 MTN Local LLM Queue Worker Started');
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
