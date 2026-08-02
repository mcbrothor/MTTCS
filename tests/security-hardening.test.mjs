import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  readTelegramWebhookConfig,
  secretsMatch,
} from '../lib/security/secrets.ts';
import {
  redactSensitiveText,
  sanitizeExternalError,
} from '../lib/security/external-errors.ts';

assert.equal(secretsMatch('shared-secret', 'shared-secret'), true);
assert.equal(secretsMatch('shared-secret', 'wrong-secret'), false);
assert.equal(secretsMatch('', ''), false);
assert.equal(secretsMatch(null, 'shared-secret'), false);

assert.equal(readTelegramWebhookConfig({}), null);
assert.equal(readTelegramWebhookConfig({ TELEGRAM_BOT_TOKEN: 'token' }), null);
assert.equal(readTelegramWebhookConfig({
  TELEGRAM_BOT_TOKEN: 'token',
  TELEGRAM_ALLOWED_CHAT_IDS: '123',
}), null);
assert.deepEqual(readTelegramWebhookConfig({
  TELEGRAM_BOT_TOKEN: ' token ',
  TELEGRAM_ALLOWED_CHAT_IDS: ' 123, 456 ,, ',
  TELEGRAM_WEBHOOK_SECRET: ' secret ',
}), {
  token: 'token',
  allowedChatIds: ['123', '456'],
  webhookSecret: 'secret',
});

const testEnv = {
  KIS_APP_KEY: 'KIS-APP-KEY-SECRET',
  KIS_APP_SECRET: 'KIS-APP-SECRET-VALUE',
  DART_API_KEY: 'DART-API-KEY-SECRET',
  TELEGRAM_BOT_TOKEN: '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi',
};

const axiosLikeError = {
  message: 'Request failed: crtfc_key=DART-API-KEY-SECRET',
  code: 'ERR_BAD_RESPONSE',
  config: {
    headers: {
      Authorization: 'Bearer access-token-secret',
      appkey: 'KIS-APP-KEY-SECRET',
      appsecret: 'KIS-APP-SECRET-VALUE',
    },
    data: { secret: 'request-body-secret' },
  },
  response: {
    status: 401,
    data: {
      rt_cd: '1',
      msg1: 'Rejected appsecret=KIS-APP-SECRET-VALUE and Bearer access-token-secret',
      request: { crtfc_key: 'DART-API-KEY-SECRET' },
    },
  },
};

const sanitized = sanitizeExternalError('KIS', 'token', axiosLikeError, testEnv);
const serialized = JSON.stringify(sanitized);
assert.deepEqual(sanitized, {
  provider: 'KIS',
  operation: 'token',
  status: 401,
  code: '1',
  message: 'Rejected appsecret=[REDACTED] and Bearer [REDACTED]',
});
for (const secret of Object.values(testEnv)) assert.equal(serialized.includes(secret), false);
assert.equal(serialized.includes('request-body-secret'), false);
assert.equal(serialized.includes('config'), false);

const redacted = redactSensitiveText(
  'https://example.test?crtfc_key=DART-API-KEY-SECRET&token=abcdef Authorization: Bearer abc.def',
  testEnv
);
assert.equal(redacted.includes('DART-API-KEY-SECRET'), false);
assert.equal(redacted.includes('abcdef'), false);
assert.equal(redacted.includes('abc.def'), false);

const migration = await readFile(
  new URL('../supabase/migrations/20260711000000_harden_privileged_functions.sql', import.meta.url),
  'utf8'
);
assert.match(migration, /maintain_stock_metrics_retention_v2\(\s*p_dry_run boolean default true/);
assert.match(migration, /security definer\s+set search_path = ''/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /from public, anon, authenticated/);
assert.match(migration, /to service_role/);
assert.match(migration, /if not p_dry_run then/);

const workflow = await readFile(new URL('../.github/workflows/db-maintenance.yml', import.meta.url), 'utf8');
assert.match(workflow, /mtn_internal\.apply_retention_policies\(true,\s*null\)/i);
assert.doesNotMatch(workflow, /maintain_stock_metrics_retention_v2/i);

const webhookRoute = await readFile(new URL('../app/api/telegram-webhook/route.ts', import.meta.url), 'utf8');
assert.match(webhookRoute, /readTelegramWebhookConfig/);
assert.match(webhookRoute, /secretsMatch/);
assert.match(webhookRoute, /getSupabaseAdmin\(\)/);
assert.match(webhookRoute, /status: 503/);
assert.match(webhookRoute, /TELEGRAM_WEBHOOK_TIMEOUT_MS = \(maxDuration - 5\) \* 1000/);
assert.match(webhookRoute, /timeoutMilliseconds: TELEGRAM_WEBHOOK_TIMEOUT_MS/);
assert.doesNotMatch(webhookRoute, /supabaseServer/);

console.log('security hardening tests passed');
