import { Bot } from 'grammy';

const token = process.env.TELEGRAM_BOT_TOKEN;
const allowedChatIds = process.env.TELEGRAM_ALLOWED_CHAT_IDS?.split(',').map((id) => id.trim()).filter(Boolean) || [];

export async function sendTelegramMessage(text: string) {
  if (!token || allowedChatIds.length === 0) {
    return { sent: 0, skipped: true };
  }

  const bot = new Bot(token);
  let sent = 0;
  for (const chatId of allowedChatIds) {
    await bot.api.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    sent += 1;
  }
  return { sent, skipped: false };
}
