import { setTimeout as sleep } from 'node:timers/promises';

export async function postBackupFailureEvidence({
  url, key, body, prefer = 'return=minimal', fetchFn = fetch,
  attempts = 4, retryMs = 15_000, timeoutMs = 30_000,
}) {
  for (const [name, value, minimum, maximum] of [
    ['attempts', attempts, 1, 10], ['retryMs', retryMs, 0, 60_000], ['timeoutMs', timeoutMs, 1, 60_000],
  ]) {
    if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`Invalid backup evidence ${name}.`);
  }
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetchFn(url, {
      method: 'POST', signal: AbortSignal.timeout(timeoutMs), redirect: 'error',
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer },
      body,
    });
    await response.body?.cancel();
    if (response.ok) return;
    // Retry the observed Cloudflare origin connection failure only.
    // Transport timeouts/524 may have committed the append-only ledger insert.
    if (response.status !== 522 || attempt === attempts) throw new Error(`Backup failure evidence POST failed: HTTP ${response.status}.`);
    await sleep(retryMs);
  }
}
