import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const {
  createWeeklyDeliveryHooks,
  weeklyReportKey,
  weeklyReportMessageHash,
  weeklyReportRecipientKey,
} = jiti('../lib/recommendations/weekly-delivery.ts');

assert.equal(
  weeklyReportKey({ from: '2026-07-18', to: '2026-07-24' }),
  'recommendation-weekly:2026-07-18:2026-07-24',
);
assert.equal(weeklyReportMessageHash('same'), weeklyReportMessageHash('same'));
assert.notEqual(weeklyReportMessageHash('same'), weeklyReportMessageHash('different'));
assert.equal(weeklyReportRecipientKey('123456').length, 64);
assert.doesNotMatch(weeklyReportRecipientKey('123456'), /123456/);

{
  const calls = [];
  let chain;
  chain = new Proxy({}, {
    get(_target, property) {
      if (property === 'then') return (resolve) => resolve({ error: null });
      return (...args) => {
        calls.push([property, ...args]);
        return chain;
      };
    },
  });
  const client = {
    rpc(name, args) {
      calls.push(['rpc', name, args]);
      return Promise.resolve({ data: true, error: null });
    },
    from(table) {
      calls.push(['from', table]);
      return chain;
    },
  };
  const hooks = createWeeklyDeliveryHooks({
    client,
    reportKey: 'recommendation-weekly:2026-07-18:2026-07-24',
    messageHash: weeklyReportMessageHash('message'),
  });

  assert.equal(await hooks.shouldSendChat('123456'), true);
  await hooks.onChatSent('123456');
  await hooks.onChatError('123456', new Error('delivery failed'));
  assert.ok(calls.some(([method, table]) => method === 'from' && table === 'recommendation_weekly_deliveries'));
  assert.ok(calls.some(([method, values]) => method === 'update' && values.status === 'SENT'));
  assert.ok(calls.some(([method, values]) => method === 'update' && values.status === 'FAILED'));
}

const migration = await readFile(
  new URL('../supabase/migrations/20260725190000_add_recommendation_weekly_delivery_ledger.sql', import.meta.url),
  'utf8',
);
assert.match(migration, /primary key \(report_key, recipient_key\)/i);
assert.match(migration, /on conflict \(report_key, recipient_key\) do nothing/i);
assert.match(migration, /and status = 'FAILED'/i);

console.log('recommendation weekly delivery tests passed');
