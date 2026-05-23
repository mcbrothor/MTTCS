import { Bot } from 'grammy';

const token = process.env.TELEGRAM_BOT_TOKEN;
const allowedChatIds = process.env.TELEGRAM_ALLOWED_CHAT_IDS?.split(',').map((id) => id.trim()).filter(Boolean) || [];
const TELEGRAM_MESSAGE_LIMIT = 4096;
const TELEGRAM_CHUNK_TARGET = 3900;

export function chunkTelegramMessage(text: string, maxLength = TELEGRAM_CHUNK_TARGET) {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let current = '';

  for (const line of text.split('\n')) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length <= maxLength) {
      current = next;
      continue;
    }

    if (current) chunks.push(current);

    if (line.length <= maxLength) {
      current = line;
      continue;
    }

    for (let index = 0; index < line.length; index += maxLength) {
      chunks.push(line.slice(index, index + maxLength));
    }
    current = '';
  }

  if (current) chunks.push(current);
  return chunks.filter((chunk) => chunk.length > 0 && chunk.length <= TELEGRAM_MESSAGE_LIMIT);
}

export async function sendTelegramMessage(text: string) {
  if (!token || allowedChatIds.length === 0) {
    return { sent: 0, skipped: true };
  }

  const bot = new Bot(token);
  const chunks = chunkTelegramMessage(text);
  let sent = 0;
  for (const chatId of allowedChatIds) {
    for (const chunk of chunks) {
      await bot.api.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
    }
    sent += 1;
  }
  return { sent, skipped: false, chunks: chunks.length };
}
