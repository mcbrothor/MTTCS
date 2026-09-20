import assert from 'node:assert/strict';
import { deliverSharedTelegramChunk } from '../scripts/lib/shared-telegram-delivery.mjs';

function fixture() {
  let receipt = null;
  let sends = 0;
  let records = 0;
  let failFinish = 0;
  const db = {
    async rpc(name, args) {
      assert.equal(name, 'claim_recommendation_telegram_chunk');
      if (!receipt || receipt.status === 'FAILED') receipt = { status: 'CLAIMED', owner_id: args.p_owner, delivery_key: args.p_key };
      return { data: { ...receipt }, error: null };
    },
    from(name) {
      assert.equal(name, 'recommendation_telegram_deliveries');
      return { update(update) {
        const filters = {};
        const query = {
          eq(key, value) { filters[key] = value; return query; },
          select() { return query; },
          async maybeSingle() {
            if (failFinish > 0) { failFinish--; return { data: null, error: { message: 'receipt database unavailable' } }; }
            if (!Object.entries(filters).every(([key, value]) => receipt?.[key] === value)) return { data: null, error: null };
            receipt = { ...receipt, ...update };
            return { data: { delivery_key: receipt.delivery_key }, error: null };
          },
        };
        return query;
      } };
    },
  };
  const args = { supabase: db, publicationId: '00000000-0000-4000-8000-000000000001', chatId: 'test-chat', chunkIndex: 0, chunkCount: 1, text: 'stored report',
    ledger: { async record() { records++; } }, send: async () => { sends++; return { message_id: 123 }; } };
  return { args, get receipt() { return receipt; }, get sends() { return sends; }, get records() { return records; }, failReceiptWrites(count) { failFinish = count; } };
}

{
  const f = fixture();
  assert.deepEqual(await deliverSharedTelegramChunk(f.args), { sent: true });
  assert.equal(f.receipt.status, 'SENT');
  assert.equal(f.receipt.telegram_message_id, 123);
  assert.deepEqual(await deliverSharedTelegramChunk(f.args), { alreadySent: true });
  assert.equal(f.sends, 1, 'SENT shared receipt suppresses duplicate transport');
  assert.equal(f.records, 1);
}
{
  const f = fixture();
  await assert.rejects(deliverSharedTelegramChunk({ ...f.args, send: async () => { throw new Error('definitive rejection'); } }), /definitive rejection/);
  assert.equal(f.receipt.status, 'FAILED');
  assert.deepEqual(await deliverSharedTelegramChunk(f.args), { sent: true });
  assert.equal(f.sends, 1, 'definite failure can be claimed again');
}
{
  const f = fixture();
  const uncertain = Object.assign(new Error('response lost after upload'), { deliveryUncertain: true });
  await assert.rejects(deliverSharedTelegramChunk({ ...f.args, send: async () => { throw uncertain; } }), (error) => error.deliveryUncertain);
  assert.equal(f.receipt.status, 'UNCERTAIN');
  await assert.rejects(deliverSharedTelegramChunk(f.args), (error) => error.deliveryUncertain && /automatic resend blocked/.test(error.message));
  assert.equal(f.sends, 0);
}
{
  const f = fixture();
  f.failReceiptWrites(1);
  await assert.rejects(deliverSharedTelegramChunk(f.args), (error) => error.deliveryUncertain && /finalized/.test(error.message));
  assert.equal(f.receipt.status, 'UNCERTAIN', 'accepted message with failed SENT write must not become retryable FAILED');
  await assert.rejects(deliverSharedTelegramChunk(f.args), (error) => error.deliveryUncertain);
  assert.equal(f.sends, 1);
}
{
  const f = fixture();
  await assert.rejects(deliverSharedTelegramChunk({ ...f.args, ledger: { record: async () => { throw new Error('disk full'); } } }), (error) => error.deliveryUncertain);
  assert.equal(f.receipt.status, 'UNCERTAIN', 'accepted message with local receipt failure stays ambiguous');
  assert.equal(f.sends, 1);
}
{
  const f = fixture();
  let release;
  let signalStarted;
  const started = new Promise((resolve) => { signalStarted = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  let winnerSends = 0;
  const winner = deliverSharedTelegramChunk({ ...f.args, send: async () => { winnerSends++; signalStarted(); await gate; return { message_id: 321 }; } });
  await started;
  await assert.rejects(deliverSharedTelegramChunk(f.args), (error) => error.deliveryUncertain && /CLAIMED/.test(error.message));
  release();
  await winner;
  assert.equal(winnerSends, 1);
  assert.equal(f.sends, 0, 'losing claimant never reaches transport');
  assert.equal(f.receipt.telegram_message_id, 321);
}
{
  const f = fixture();
  f.failReceiptWrites(2);
  await assert.rejects(deliverSharedTelegramChunk(f.args), (error) => error.deliveryUncertain && /receipt database/.test(error.receiptError));
  assert.equal(f.receipt.status, 'CLAIMED');
  await assert.rejects(deliverSharedTelegramChunk(f.args), (error) => error.deliveryUncertain);
  assert.equal(f.sends, 1, 'lost finalization cannot make claimed row retryable');
}
console.log('Shared Telegram transport-boundary reliability tests passed');
