import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function weeklyReportKey(reportingWindow: { from: string; to: string }) {
  return `recommendation-weekly:${reportingWindow.from}:${reportingWindow.to}`;
}

export function weeklyReportMessageHash(message: string) {
  return hash(message);
}

export function weeklyReportRecipientKey(chatId: string) {
  return hash(`telegram:${chatId}`);
}

export function createWeeklyDeliveryHooks(input: {
  client: SupabaseClient;
  reportKey: string;
  messageHash: string;
}) {
  const recipientKey = (chatId: string) => weeklyReportRecipientKey(chatId);

  return {
    shouldSendChat: async (chatId: string) => {
      const { data, error } = await input.client.rpc('claim_recommendation_weekly_delivery', {
        p_report_key: input.reportKey,
        p_recipient_key: recipientKey(chatId),
        p_message_hash: input.messageHash,
      });
      if (error) throw error;
      return data === true;
    },
    onChatSent: async (chatId: string) => {
      const { error } = await input.client
        .from('recommendation_weekly_deliveries')
        .update({
          status: 'SENT',
          delivered_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('report_key', input.reportKey)
        .eq('recipient_key', recipientKey(chatId))
        .eq('message_hash', input.messageHash);
      if (error) throw error;
    },
    onChatError: async (chatId: string, error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      const { error: updateError } = await input.client
        .from('recommendation_weekly_deliveries')
        .update({
          status: 'FAILED',
          last_error: message.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq('report_key', input.reportKey)
        .eq('recipient_key', recipientKey(chatId))
        .eq('message_hash', input.messageHash);
      if (updateError) throw updateError;
    },
  };
}
