import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import path from 'node:path';

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function telegramReceiptKey(publicationId, chatId, chunkIndex) {
  return `${publicationId}:${sha256(chatId).slice(0, 24)}:${chunkIndex}`;
}

export function createTelegramReceiptLedger(filePath) {
  let cachePromise;

  async function cache() {
    if (!cachePromise) {
      cachePromise = (async () => {
        await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
        let raw = '';
        try {
          raw = await readFile(filePath, 'utf8');
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
        const receipts = new Set();
        for (const line of raw.split('\n').filter(Boolean)) {
          try {
            const receipt = JSON.parse(line);
            if (receipt.status === 'SENT' && receipt.key) receipts.add(receipt.key);
          } catch {
            // A damaged trailing line must not discard earlier durable receipts.
          }
        }
        return receipts;
      })();
    }
    return cachePromise;
  }

  return {
    async has(key) {
      return (await cache()).has(key);
    },

    async record({ key, publicationId, chatId, chunkIndex, chunkCount, text, messageId }) {
      const receipts = await cache();
      receipts.add(key);
      const receipt = {
        key,
        status: 'SENT',
        publication_id: publicationId,
        chat_id_hash: sha256(chatId).slice(0, 24),
        chunk_index: chunkIndex,
        chunk_count: chunkCount,
        content_sha256: sha256(text),
        telegram_message_id: messageId || null,
        sent_at: new Date().toISOString(),
      };
      const handle = await open(filePath, 'a', 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(receipt)}\n`);
        await handle.sync();
      } finally {
        await handle.close();
      }
      return receipt;
    },
  };
}
