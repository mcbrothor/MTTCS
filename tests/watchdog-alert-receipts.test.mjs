import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createWatchdogAlertReceiptLedger,
  watchdogAlertReceiptKey,
} from '../scripts/lib/watchdog-alert-receipts.mjs';

const directory = await mkdtemp(join(tmpdir(), 'mtn-watchdog-alerts-'));
const ledgerPath = join(directory, 'receipts.jsonl');

try {
  const incident = {
    runDate: '2026-08-31',
    runId: 'run-1',
    state: 'OBSERVATION_INCOMPLETE',
    reason: 'telegram delivery is incomplete (3/4)',
  };
  const firstKey = watchdogAlertReceiptKey({ incident, chatId: '100' });
  const sameKey = watchdogAlertReceiptKey({ incident: { ...incident }, chatId: '100' });
  const otherChatKey = watchdogAlertReceiptKey({ incident, chatId: '200' });

  assert.equal(firstKey, sameKey);
  assert.notEqual(firstKey, otherChatKey);

  const ledger = await createWatchdogAlertReceiptLedger(ledgerPath);
  assert.equal(ledger.has(firstKey), false);
  await ledger.record({ key: firstKey, ...incident, chatId: '100' });
  assert.equal(ledger.has(firstKey), true);

  const reloaded = await createWatchdogAlertReceiptLedger(ledgerPath);
  assert.equal(reloaded.has(firstKey), true);
  assert.equal(reloaded.has(otherChatKey), false);
} finally {
  await rm(directory, { recursive: true, force: true });
}
