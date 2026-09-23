import { createHash, randomUUID } from 'node:crypto';
import { telegramReceiptKey } from './telegram-delivery-receipts.mjs';

export async function deliverSharedTelegramChunk({ supabase, ledger, publicationId, chatId, chunkIndex, chunkCount, text, send }) {
  const key = telegramReceiptKey(publicationId, chatId, chunkIndex);
  const owner = randomUUID();
  const { data: claim, error } = await supabase.rpc('claim_recommendation_telegram_chunk', {
    p_key: key, p_publication_id: publicationId, p_chat_hash: key.split(':')[1], p_chunk: chunkIndex,
    p_content_hash: createHash('sha256').update(text).digest('hex'), p_owner: owner,
  });
  if (error) throw new Error(`Shared Telegram claim failed: ${error.message}`);
  if (claim?.status === 'SENT') return { alreadySent: true };
  if (claim?.status !== 'CLAIMED' || claim.owner_id !== owner) {
    const held = new Error(`Telegram chunk is ${claim?.status || 'unavailable'}; automatic resend blocked.`);
    held.deliveryUncertain = true;
    throw held;
  }
  const finish = async (status, messageId, message = null) => {
    const { data, error: finishError } = await supabase.from('recommendation_telegram_deliveries')
      .update({ status, telegram_message_id: messageId || null, error_message: message, updated_at: new Date().toISOString() })
      .eq('delivery_key', key).eq('owner_id', owner).eq('status', 'CLAIMED').select('delivery_key').maybeSingle();
    if (finishError || !data) throw new Error(`Shared Telegram receipt could not be finalized: ${finishError?.message || 'ownership lost'}`);
  };
  let accepted = false;
  try {
    const result = await send();
    accepted = true;
    await ledger.record({ key, publicationId, chatId, chunkIndex, chunkCount, text, messageId: result?.message_id });
    await finish('SENT', result?.message_id);
    return { sent: true };
  } catch (cause) {
    const uncertain = accepted || cause?.deliveryUncertain === true;
    try { await finish(uncertain ? 'UNCERTAIN' : 'FAILED', null, String(cause.message).slice(0, 500)); }
    catch (receiptError) { cause.receiptError = receiptError.message; }
    cause.deliveryUncertain = uncertain;
    throw cause;
  }
}
