import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Compares secrets without leaking a useful length or early-mismatch timing signal.
 * Empty values are never considered valid credentials.
 */
export function secretsMatch(actual: string | null | undefined, expected: string | null | undefined) {
  if (!actual || !expected) return false;

  const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();
  return timingSafeEqual(digest(actual), digest(expected));
}

export interface TelegramWebhookConfig {
  token: string;
  allowedChatIds: string[];
  webhookSecret: string;
}

export function readTelegramWebhookConfig(
  env: NodeJS.ProcessEnv = process.env
): TelegramWebhookConfig | null {
  const token = env.TELEGRAM_BOT_TOKEN?.trim() || '';
  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET?.trim() || '';
  const allowedChatIds = (env.TELEGRAM_ALLOWED_CHAT_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (!token || !webhookSecret || allowedChatIds.length === 0) return null;
  return { token, allowedChatIds, webhookSecret };
}
