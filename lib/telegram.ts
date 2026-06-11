import { Bot } from 'grammy';

const token = process.env.TELEGRAM_BOT_TOKEN;
const allowedChatIds = process.env.TELEGRAM_ALLOWED_CHAT_IDS?.split(',').map((id) => id.trim()).filter(Boolean) || [];
const TELEGRAM_MESSAGE_LIMIT = 4096;
const TELEGRAM_CHUNK_TARGET = 3900;
const TELEGRAM_PHOTO_CAPTION_LIMIT = 1024;

export interface TelegramPhoto {
  url: string;
  caption?: string | null;
}

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
      try {
        await bot.api.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
      } catch (err: unknown) {
        // LLM이 생성한 텍스트의 마크다운 특수 기호 불량 등으로 발송 실패 시, 유실 방지를 위해 Plain Text로 안전 재시도
        console.warn(`[Telegram] Markdown sending failed, retrying as Plain Text:`, err);
        try {
          await bot.api.sendMessage(chatId, chunk);
        } catch (retryErr: unknown) {
          console.error(`[Telegram] Retry as Plain Text also failed:`, retryErr);
          throw retryErr;
        }
      }
    }
    sent += 1;
  }
  return { sent, skipped: false, chunks: chunks.length };
}

export function normalizeTelegramPhotos(value: unknown): TelegramPhoto[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): TelegramPhoto | null => {
      if (typeof item === 'string') {
        return { url: item.trim(), caption: null };
      }

      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const rawUrl = record.url ?? record.imageUrl ?? record.photoUrl ?? record.src;
      if (typeof rawUrl !== 'string') return null;

      return {
        url: rawUrl.trim(),
        caption: typeof record.caption === 'string' ? record.caption.trim() : null,
      };
    })
    .filter((item): item is TelegramPhoto => item !== null && item.url.length > 0);
}

export async function sendTelegramPhotos(photos: TelegramPhoto[]) {
  if (!token || allowedChatIds.length === 0) {
    return { sent: 0, skipped: true, photos: 0 };
  }

  const cleanPhotos = normalizeTelegramPhotos(photos);
  if (cleanPhotos.length === 0) {
    return { sent: 0, skipped: false, photos: 0 };
  }

  const bot = new Bot(token);
  let sent = 0;
  for (const chatId of allowedChatIds) {
    for (const photo of cleanPhotos) {
      const caption = photo.caption ? photo.caption.slice(0, TELEGRAM_PHOTO_CAPTION_LIMIT) : undefined;
      try {
        await bot.api.sendPhoto(chatId, photo.url, caption ? { caption, parse_mode: 'Markdown' } : undefined);
      } catch (err: unknown) {
        console.warn(`[Telegram] Photo Markdown caption failed, retrying without parse mode:`, err);
        try {
          await bot.api.sendPhoto(chatId, photo.url, caption ? { caption } : undefined);
        } catch (retryErr: unknown) {
          console.error(`[Telegram] Photo sending failed:`, retryErr);
          throw retryErr;
        }
      }
    }
    sent += 1;
  }

  return { sent, skipped: false, photos: cleanPhotos.length };
}
