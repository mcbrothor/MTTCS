import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export function watchdogAlertReceiptKey({ incident, chatId }) {
  const canonical = JSON.stringify({
    runDate: incident?.runDate || null,
    runId: incident?.runId || null,
    state: incident?.state || null,
    reason: incident?.reason || null,
    chatId: String(chatId),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export async function createWatchdogAlertReceiptLedger(filePath) {
  const sentKeys = new Set();
  try {
    const contents = await readFile(filePath, 'utf8');
    for (const line of contents.split('\n')) {
      if (!line.trim()) continue;
      try {
        const receipt = JSON.parse(line);
        if (receipt?.key) sentKeys.add(receipt.key);
      } catch {
        // A truncated final line must not make prior durable receipts unusable.
      }
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  return {
    has(key) {
      return sentKeys.has(key);
    },
    async record(receipt) {
      if (!receipt?.key) throw new Error('watchdog alert receipt key is required.');
      await mkdir(dirname(filePath), { recursive: true });
      await appendFile(filePath, `${JSON.stringify({ ...receipt, sentAt: new Date().toISOString() })}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
      sentKeys.add(receipt.key);
    },
  };
}
