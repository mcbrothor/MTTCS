import { Bot, InlineKeyboard, InputFile, webhookCallback, type Context } from 'grammy';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { readTelegramWebhookConfig, secretsMatch } from '@/lib/security/secrets';
import { POST as getMarketDataForCron } from '@/app/api/market-data/route';
import { buildRuleBasedTechnicalAnalysis } from '@/lib/ai/technical-chart-analysis';
import { renderTelegramChartPng, telegramChartCaption } from '@/lib/telegram/chart-image';
import {
  buildTelegramChartCallback,
  flattenLatestRecommendationCharts,
  parseTelegramChartCallback,
  parseTelegramChartCommand,
  selectTelegramChartMenuOptions,
  type TelegramChartRequest,
  type TelegramRecommendationChartOption,
} from '@/lib/telegram/chart-request';
import type { MarketAnalysisResponse } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const webhookConfig = readTelegramWebhookConfig();
const bot = webhookConfig ? new Bot(webhookConfig.token) : null;

async function loadLatestRecommendationChartOptions() {
  const { data, error } = await getSupabaseAdmin()
    .from('recommendation_publications')
    .select('run_date, category, recommendation_picks(ticker, exchange, name, rank, candidate_snapshot)')
    .eq('is_official', true)
    .eq('status', 'PUBLISHED')
    .order('run_date', { ascending: false })
    .limit(8);
  if (error) throw new Error(`추천 종목 조회 실패: ${error.message}`);
  return flattenLatestRecommendationCharts(
    (data || []) as unknown as Parameters<typeof flattenLatestRecommendationCharts>[0],
  );
}

function selectRequestedOption(options: TelegramRecommendationChartOption[], request: TelegramChartRequest) {
  return options.find((option) => option.ticker === request.ticker && (!request.exchange || option.exchange === request.exchange)) || null;
}

async function loadMarketAnalysis(option: TelegramRecommendationChartOption) {
  const cronSecret = process.env.CRON_SECRET || '';
  if (!cronSecret) throw new Error('차트 분석용 내부 인증이 설정되지 않았습니다.');
  const target = new URL('/api/market-data', 'http://mtn.internal');
  target.searchParams.set('ticker', option.ticker);
  target.searchParams.set('exchange', option.exchange);
  target.searchParams.set('includeFundamentals', 'false');
  target.searchParams.set('skipStandardMetrics', 'false');
  const response = await getMarketDataForCron(new Request(target, {
    method: 'POST',
    headers: { authorization: `Bearer ${cronSecret}` },
  }));
  const payload = await response.json() as MarketAnalysisResponse & { data?: MarketAnalysisResponse; message?: string };
  if (!response.ok) throw new Error(payload.message || `차트 분석 실패 (${response.status})`);
  return payload.data || payload;
}

async function replyWithRequestedChart(ctx: Context, request: TelegramChartRequest) {
  const options = await loadLatestRecommendationChartOptions();
  const option = selectRequestedOption(options, request);
  if (!option) {
    await ctx.reply(`${request.ticker}는 최신 공식 추천 목록에서 찾을 수 없습니다. /chart 를 입력해 선택 가능한 종목을 확인해 주세요.`);
    return;
  }
  if (ctx.chat) await ctx.api.sendChatAction(ctx.chat.id, 'upload_photo');
  const analysis = await loadMarketAnalysis(option);
  const technical = buildRuleBasedTechnicalAnalysis(analysis);
  const imageInput = {
    ticker: option.ticker,
    exchange: option.exchange,
    name: option.name,
    rank: option.rank,
    analysis,
    technical,
    rangeBars: 252,
  };
  const png = renderTelegramChartPng(imageInput);
  const caption = `${option.category} · ${option.runDate}\n${telegramChartCaption(imageInput)}`.slice(0, 1024);
  await ctx.replyWithPhoto(new InputFile(png, `${option.ticker.toLowerCase()}-professional-chart.png`), { caption });
}

async function replyWithChartMenu(ctx: Context) {
  const options = selectTelegramChartMenuOptions(await loadLatestRecommendationChartOptions());
  if (options.length === 0) {
    await ctx.reply('현재 차트 전송이 가능한 공식 추천 종목이 없습니다.');
    return;
  }
  const keyboard = new InlineKeyboard();
  options.forEach((option, index) => {
    keyboard.text(`${option.category} #${option.rank} ${option.ticker}`, buildTelegramChartCallback(option));
    if (index % 2 === 1) keyboard.row();
  });
  await ctx.reply(
    `최신 공식 추천 중 차트 검증을 통과한 종목입니다.\n한 종목을 누르면 해당 종목만 전문 차트로 생성합니다.\n직접 요청: /chart AAPL`,
    { reply_markup: keyboard },
  );
}

function parseCommand(text: string, command: string) {
  return text
    .replace(command, '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
}

if (bot && webhookConfig) {
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id.toString();
    if (!chatId || !webhookConfig.allowedChatIds.includes(chatId)) {
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
        '/chart - 최신 추천 종목 차트 선택',
        '/chart AAPL - 해당 추천 종목 차트 요청',
        '/close 티커 / 손익 / 규율점수 / 메모 - 매매 완료 기록',
        '예: /close AAPL / 500 / 95 / 계획대로 청산',
        '/cancel 티커 / 사유 - 계획 취소',
      ].join('\n'),
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('chart', async (ctx) => {
    try {
      const request = parseTelegramChartCommand(ctx.message?.text || '');
      if (!request) {
        await replyWithChartMenu(ctx);
        return;
      }
      await replyWithRequestedChart(ctx, request);
    } catch (error) {
      console.error('[Telegram] Chart request failed:', error);
      await ctx.reply(`차트 생성에 실패했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  });

  bot.callbackQuery(/^chart\|/, async (ctx) => {
    const request = parseTelegramChartCallback(ctx.callbackQuery.data);
    if (!request) {
      await ctx.answerCallbackQuery({ text: '유효하지 않은 차트 요청입니다.' });
      return;
    }
    await ctx.answerCallbackQuery({ text: `${request.ticker} 차트를 생성합니다.` });
    try {
      await replyWithRequestedChart(ctx, request);
    } catch (error) {
      console.error('[Telegram] Chart callback failed:', error);
      await ctx.reply(`차트 생성에 실패했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  });

  bot.command('status', async (ctx) => {
    const { data, error } = await getSupabaseAdmin()
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

    const { data, error } = await getSupabaseAdmin()
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

    const { error: updateError } = await getSupabaseAdmin()
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

    const { data, error } = await getSupabaseAdmin()
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

    const { error: updateError } = await getSupabaseAdmin()
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
function validateWebhookRequest(req: Request): Response | null {
  if (!webhookConfig) {
    return new Response('Telegram webhook is not configured', { status: 503 });
  }
  const headerSecret = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!secretsMatch(headerSecret, webhookConfig.webhookSecret)) {
    return new Response('Unauthorized', { status: 401 });
  }
  return null;
}

export async function POST(req: Request) {
  const unauthorized = validateWebhookRequest(req);
  if (unauthorized) return unauthorized;
  if (!bot) return new Response('Telegram webhook is not configured', { status: 503 });
  return webhookCallback(bot, 'std/http')(req);
}
