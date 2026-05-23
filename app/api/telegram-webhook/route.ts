import { Bot, webhookCallback } from 'grammy';
import { supabaseServer } from '@/lib/supabase/server';
import { telegramWebhookSecret } from '@/lib/env';

const token = process.env.TELEGRAM_BOT_TOKEN;
const allowedChatIds = process.env.TELEGRAM_ALLOWED_CHAT_IDS?.split(',').map((id) => id.trim()).filter(Boolean) || [];
const webhookSecret = (() => { try { return telegramWebhookSecret(); } catch { return ''; } })();
const bot = token ? new Bot(token) : null;

function parseCommand(text: string, command: string) {
  return text
    .replace(command, '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
}

if (bot) {
  bot.use(async (ctx, next) => {
    if (allowedChatIds.length === 0) {
      await next();
      return;
    }

    const chatId = ctx.chat?.id.toString();
    if (!chatId || !allowedChatIds.includes(chatId)) {
      console.log(`Unauthorized Telegram access from chat id: ${chatId}`);
      return;
    }
    await next();
  });

  bot.command('help', (ctx) => {
    ctx.reply(
      [
        '*MTN v4.0 명령어*',
        '',
        '/status - 진행 중인 매매 계획 확인',
        '/close 티커 / 손익 / 규율점수 / 메모 - 매매 완료 기록',
        '예: /close AAPL / 500 / 95 / 계획대로 청산',
        '/cancel 티커 / 사유 - 계획 취소',
      ].join('\n'),
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('status', async (ctx) => {
    const { data, error } = await supabaseServer
      .from('trades')
      .select('ticker, entry_price, total_shares, status')
      .in('status', ['PLANNED', 'ACTIVE'])
      .order('created_at', { ascending: false });

    if (error) {
      return ctx.reply(`진행 계획 조회 실패: ${error.message}`);
    }
    if (!data || data.length === 0) {
      return ctx.reply('진행 중인 매매 계획이 없습니다.');
    }

    const messages = data
      .map((trade, index) => {
        const entry = trade.entry_price ? `$${Number(trade.entry_price).toFixed(2)}` : 'N/A';
        const shares = trade.total_shares ? `${trade.total_shares}주` : 'N/A';
        return `${index + 1}. *${trade.ticker}* · 진입 ${entry} · 수량 ${shares}`;
      })
      .join('\n');

    return ctx.reply(`*진행 중인 계획 ${data.length}건*\n${messages}`, { parse_mode: 'Markdown' });
  });

  bot.command('close', async (ctx) => {
    const text = ctx.message?.text || '';
    const parts = parseCommand(text, '/close');

    if (parts.length < 3) {
      return ctx.reply('형식 오류: /close 티커 / 손익 / 규율점수 / 메모');
    }

    const ticker = parts[0].toUpperCase();
    const resultAmount = Number(parts[1]);
    const discipline = Number(parts[2]);
    const note = parts.slice(3).join(' / ');

    if (!Number.isFinite(resultAmount)) {
      return ctx.reply('손익은 숫자로 입력해 주세요.');
    }
    if (!Number.isInteger(discipline) || discipline < 0 || discipline > 100) {
      return ctx.reply('규율점수는 0부터 100 사이의 정수여야 합니다.');
    }

    const { data, error } = await supabaseServer
      .from('trades')
      .select('id')
      .eq('ticker', ticker)
      .in('status', ['PLANNED', 'ACTIVE'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return ctx.reply(`${ticker}의 진행 중인 계획을 찾을 수 없습니다.`);
    }

    const { error: updateError } = await supabaseServer
      .from('trades')
      .update({
        status: 'COMPLETED',
        result_amount: resultAmount,
        final_discipline: discipline,
        emotion_note: note,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id);

    if (updateError) {
      return ctx.reply(`기록 실패: ${updateError.message}`);
    }

    return ctx.reply(
      `*${ticker}* 매매 완료 기록\n손익: $${resultAmount.toFixed(2)}\n규율점수: ${discipline}점`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('cancel', async (ctx) => {
    const text = ctx.message?.text || '';
    const parts = parseCommand(text, '/cancel');

    if (parts.length < 1) {
      return ctx.reply('형식 오류: /cancel 티커 / 사유');
    }

    const ticker = parts[0].toUpperCase();
    const note = parts.slice(1).join(' / ');

    const { data, error } = await supabaseServer
      .from('trades')
      .select('id')
      .eq('ticker', ticker)
      .in('status', ['PLANNED', 'ACTIVE'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return ctx.reply(`${ticker}의 진행 중인 계획을 찾을 수 없습니다.`);
    }

    const { error: updateError } = await supabaseServer
      .from('trades')
      .update({
        status: 'CANCELLED',
        emotion_note: note,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id);

    if (updateError) {
      return ctx.reply(`취소 실패: ${updateError.message}`);
    }

    return ctx.reply(`*${ticker}* 계획을 취소했습니다.`, { parse_mode: 'Markdown' });
  });
}

// I-4: Webhook 보안 — secret token 헤더 검증
async function validateWebhookRequest(req: Request): Promise<Response | null> {
  if (!webhookSecret) return null; // secret 미설정이면 스킵
  const headerSecret = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (headerSecret !== webhookSecret) {
    return new Response('Unauthorized', { status: 401 });
  }
  return null;
}

export const POST = bot
  ? async (req: Request) => {
      const unauthorized = await validateWebhookRequest(req);
      if (unauthorized) return unauthorized;
      return webhookCallback(bot, 'std/http')(req);
    }
  : async () => new Response('Telegram bot is not configured', { status: 500 });
