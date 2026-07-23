import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  createTelegramReceiptLedger,
  telegramReceiptKey,
} from '../scripts/lib/telegram-delivery-receipts.mjs';

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'mtn-telegram-receipts-'));
try {
  const receiptPath = path.join(tempDir, 'nested', 'receipts.jsonl');
  const key = telegramReceiptKey('publication-1', 'chat-secret', 0);
  const ledger = createTelegramReceiptLedger(receiptPath);
  assert.equal(await ledger.has(key), false);
  await ledger.record({
    key,
    publicationId: 'publication-1',
    chatId: 'chat-secret',
    chunkIndex: 0,
    chunkCount: 2,
    text: 'recommendation chunk',
    messageId: 123,
  });
  assert.equal(await ledger.has(key), true);

  const reloaded = createTelegramReceiptLedger(receiptPath);
  assert.equal(await reloaded.has(key), true);
  const raw = await readFile(receiptPath, 'utf8');
  assert.doesNotMatch(raw, /chat-secret/);
  assert.match(raw, /"telegram_message_id":123/);
  assert.equal((await stat(receiptPath)).mode & 0o777, 0o600);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log('telegram delivery receipt tests passed');
