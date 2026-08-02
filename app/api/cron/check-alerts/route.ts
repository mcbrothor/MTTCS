import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { sendTelegramMessage } from '@/lib/telegram';
import { getYahooDailyPrice } from '@/lib/finance/providers/yahoo-api';
import { getKisDomesticPrice } from '@/lib/finance/providers/kis-api';
import { validateCronRequest } from '@/lib/contest-cron';
import { evaluatePriceAlert } from '@/lib/alerts/evaluate';

interface OHLCData {
  date: string;
  close: number;
  volume: number;
}

interface PriceObservation {
  current: number;
  previous: number | null;
}

interface ClaimedAlertEvent {
  id: string;
  title: string;
  message: string;
  event_type: string;
  ticker: string | null;
  severity: 'INFO' | 'WATCH' | 'RISK';
  delivery_batch_key: string;
}

function calculateDistributionDays(data: OHLCData[], lookback = 25) {
  let count = 0;
  for (let index = Math.max(1, data.length - lookback); index < data.length; index += 1) {
    const prev = data[index - 1];
    const curr = data[index];
    if (curr.close < prev.close && curr.volume > prev.volume) count += 1;
  }
  return count;
}

async function fetchPriceObservation(ticker: string, market: string): Promise<PriceObservation | null> {
  try {
    if (market === 'KR') {
      let current: number | null = null;
      try {
        current = await getKisDomesticPrice(ticker);
      } catch {
        // Yahoo fallback below also provides a previous close for rule evaluation.
      }

      for (const suffix of ['KS', 'KQ']) {
        try {
          const data = await getYahooDailyPrice(`${ticker}.${suffix}`);
          if (data.length === 0) continue;
          const latest = data[data.length - 1]?.close;
          const previous = data.length > 1 ? data[data.length - 2]?.close : null;
          const resolvedCurrent = current ?? latest;
          if (Number.isFinite(resolvedCurrent) && Number(resolvedCurrent) > 0) {
            return {
              current: Number(resolvedCurrent),
              previous: Number.isFinite(previous) && Number(previous) > 0 ? Number(previous) : null,
            };
          }
        } catch {
          // Try the other Korean exchange suffix.
        }
      }
      return current && current > 0 ? { current, previous: null } : null;
    }

    const data = await getYahooDailyPrice(ticker);
    if (data.length === 0) return null;
    const current = data[data.length - 1]?.close;
    const previous = data.length > 1 ? data[data.length - 2]?.close : null;
    if (!Number.isFinite(current) || Number(current) <= 0) return null;
    return {
      current: Number(current),
      previous: Number.isFinite(previous) && Number(previous) > 0 ? Number(previous) : null,
    };
  } catch (error) {
    console.error(`Error fetching price for ${ticker}:`, error);
    return null;
  }
}

function deliveryStatus(channels: unknown) {
  return Array.isArray(channels) && channels.includes('TELEGRAM') ? 'PENDING' : 'SKIPPED';
}

async function insertAlertEvent(
  client: SupabaseClient,
  payload: Record<string, unknown>
) {
  const { error } = await client.from('alert_events').insert({
    ...payload,
    read_at: null,
  });
  if (error?.code === '23505') return false;
  if (error) throw error;
  return true;
}

function alertMessage(events: ClaimedAlertEvent[]) {
  const items = events.map((event) => {
    const ticker = event.ticker ? ` ${event.ticker}` : '';
    return `*[${event.event_type}]${ticker}*\n${event.message}`;
  });
  return `*MTN 알림 리포트*\n\n${items.join('\n\n')}`;
}

function recipientKey(chatId: string) {
  return createHash('sha256').update(`telegram:${chatId}`).digest('hex');
}

function createAlertDeliveryHooks(input: {
  client: SupabaseClient;
  batchKey: string;
  eventIds: string[];
  messageHash: string;
}) {
  const key = (chatId: string) => recipientKey(chatId);
  return {
    shouldSendChat: async (chatId: string) => {
      const { data, error } = await input.client.rpc('claim_alert_delivery_receipt', {
        p_batch_key: input.batchKey,
        p_recipient_key: key(chatId),
        p_event_ids: input.eventIds,
        p_message_hash: input.messageHash,
      });
      if (error) throw error;
      return data === true;
    },
    onChatSent: async (chatId: string) => {
      const { error } = await input.client
        .from('alert_delivery_receipts')
        .update({
          status: 'SENT',
          delivered_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('batch_key', input.batchKey)
        .eq('recipient_key', key(chatId))
        .eq('message_hash', input.messageHash);
      if (error) throw error;
    },
    onChatError: async (chatId: string, error: unknown) => {
      const { error: updateError } = await input.client
        .from('alert_delivery_receipts')
        .update({
          status: 'FAILED',
          last_error: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq('batch_key', input.batchKey)
        .eq('recipient_key', key(chatId));
      if (updateError) throw updateError;
    },
  };
}

async function updateClaimedEvents(
  client: SupabaseClient,
  eventIds: string[],
  status: 'SENT' | 'FAILED',
  errorMessage: string | null = null
) {
  const now = new Date().toISOString();
  const { error } = await client
    .from('alert_events')
    .update({
      delivery_status: status,
      delivered_at: status === 'SENT' ? now : null,
      delivery_error: errorMessage?.slice(0, 1000) ?? null,
      updated_at: now,
    })
    .in('id', eventIds)
    .eq('delivery_status', 'SENDING');
  if (error) throw error;
}

export async function GET(request: Request) {
  if (!validateCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const client = getSupabaseAdmin();
    const now = Date.now();
    let eventsCreated = 0;
    const priceCache = new Map<string, Promise<PriceObservation | null>>();
    const getPrice = (ticker: string, market: string) => {
      const key = `${market}:${ticker}`;
      const cached = priceCache.get(key);
      if (cached) return cached;
      const pending = fetchPriceObservation(ticker, market);
      priceCache.set(key, pending);
      return pending;
    };

    const { data: trades, error: tradeError } = await client
      .from('trades')
      .select('id, user_id, ticker, status, market, entry_price, stoploss_price, updated_at')
      .in('status', ['PLANNED', 'ACTIVE']);
    if (tradeError) throw tradeError;

    const ownerIds = new Set<string>();
    for (const trade of trades || []) {
      if (!trade.user_id) continue;
      ownerIds.add(String(trade.user_id));
      const observation = await getPrice(trade.ticker, trade.market);
      if (!observation) continue;

      if (trade.status === 'PLANNED' && Number(trade.entry_price) > 0) {
        const entryPrice = Number(trade.entry_price);
        const distance = ((observation.current - entryPrice) / entryPrice) * 100;
        if (Math.abs(distance) <= 5) {
          eventsCreated += Number(await insertAlertEvent(client, {
            user_id: trade.user_id,
            rule_id: null,
            event_key: `trade:${trade.id}:PIVOT_NEAR:${Math.floor(now / (12 * 60 * 60 * 1000))}`,
            event_type: 'PIVOT_NEAR',
            title: `${trade.ticker} 계획 진입가 접근`,
            message: `현재가 ${observation.current.toLocaleString()} · 계획 진입가 ${entryPrice.toLocaleString()} · 거리 ${distance.toFixed(2)}%`,
            ticker: trade.ticker,
            severity: 'WATCH',
            payload: { price: observation.current, tradeId: trade.id, channels: ['IN_APP', 'TELEGRAM'] },
            delivery_status: 'PENDING',
          }));
        }
      }

      if (trade.status === 'ACTIVE' && Number(trade.stoploss_price) > 0) {
        const stopPrice = Number(trade.stoploss_price);
        const distance = ((observation.current - stopPrice) / stopPrice) * 100;
        if (distance <= 3 && distance >= -5) {
          eventsCreated += Number(await insertAlertEvent(client, {
            user_id: trade.user_id,
            rule_id: null,
            event_key: `trade:${trade.id}:STOP_NEAR:${Math.floor(now / (2 * 60 * 60 * 1000))}`,
            event_type: 'STOP_NEAR',
            title: `${trade.ticker} 손절가 근접`,
            message: `현재가 ${observation.current.toLocaleString()} · 손절가 ${stopPrice.toLocaleString()} · 거리 ${distance.toFixed(2)}%`,
            ticker: trade.ticker,
            severity: 'RISK',
            payload: { price: observation.current, tradeId: trade.id, channels: ['IN_APP', 'TELEGRAM'] },
            delivery_status: 'PENDING',
          }));
        }
      }
    }

    const { data: rules, error: ruleError } = await client
      .from('alert_rules')
      .select('*')
      .eq('enabled', true)
      .eq('scope', 'SYMBOL');
    if (ruleError) throw ruleError;

    for (const rule of rules || []) {
      ownerIds.add(String(rule.user_id));
      if (['FILING', 'EARNINGS', 'SCREEN_ENTER', 'SCREEN_EXIT'].includes(rule.event_type)) continue;
      const market = /^\d{6}$/.test(rule.scope_id) ? 'KR' : 'US';
      const observation = await getPrice(rule.scope_id, market);
      if (!observation) continue;
      const signal = evaluatePriceAlert(rule, observation.current, observation.previous);
      if (!signal) continue;

      const cooldownMs = Math.max(1, Number(rule.cooldown_minutes) || 1) * 60_000;
      const eventKey = `alert:${rule.id}:${Math.floor(now / cooldownMs)}`;
      const channels = Array.isArray(rule.channels) ? rule.channels : ['IN_APP'];
      const inserted = await insertAlertEvent(client, {
        user_id: rule.user_id,
        rule_id: rule.id,
        event_key: eventKey,
        event_type: rule.event_type,
        title: `${rule.scope_id} ${rule.name}`,
        message: signal.message,
        ticker: rule.scope_id,
        severity: signal.severity,
        payload: { price: observation.current, previous: observation.previous, channels },
        delivery_status: deliveryStatus(channels),
      });
      eventsCreated += Number(inserted);
      if (inserted) {
        const { error: updateError } = await client
          .from('alert_rules')
          .update({ last_triggered_at: new Date(now).toISOString() })
          .eq('id', rule.id);
        if (updateError) throw updateError;
      }
    }

    for (const symbol of ['^KS200', 'QQQ']) {
      try {
        const data = await getYahooDailyPrice(symbol);
        const distributionDays = calculateDistributionDays(data, 25);
        if (distributionDays < 5) continue;
        const eventDate = new Date(now).toISOString().slice(0, 10);
        for (const userId of ownerIds) {
          eventsCreated += Number(await insertAlertEvent(client, {
            user_id: userId,
            rule_id: null,
            event_key: `macro:${symbol}:DISTRIBUTION_DAYS:${eventDate}`,
            event_type: 'PRICE_MOVE',
            title: `${symbol} Distribution Days 주의`,
            message: `최근 25일 내 기관 매도일 ${distributionDays}일`,
            ticker: symbol,
            severity: 'RISK',
            payload: { distributionDays, lookback: 25, channels: ['IN_APP', 'TELEGRAM'] },
            delivery_status: 'PENDING',
          }));
        }
      } catch (error) {
        console.error(`Failed macro stats fetching for ${symbol}:`, error);
      }
    }

    const { data: claimed, error: claimError } = await client.rpc('claim_alert_delivery_batch', {
      p_limit: 100,
    });
    if (claimError) throw claimError;
    const events = (claimed || []) as ClaimedAlertEvent[];
    if (events.length === 0) {
      return NextResponse.json({ success: true, events_created: eventsCreated, alerts_sent: 0, delivery_status: 'IDLE' });
    }

    const eventIds = events.map((event) => event.id);
    const batchKey = events[0].delivery_batch_key;
    if (!batchKey || events.some((event) => event.delivery_batch_key !== batchKey)) {
      await updateClaimedEvents(client, eventIds, 'FAILED', 'Claim returned an invalid delivery batch.');
      throw new Error('Claim returned an invalid alert delivery batch.');
    }

    const message = alertMessage(events);
    const messageHash = createHash('sha256').update(message).digest('hex');
    try {
      const delivery = await sendTelegramMessage(message, createAlertDeliveryHooks({
        client,
        batchKey,
        eventIds,
        messageHash,
      }));
      if (delivery.skipped) {
        await updateClaimedEvents(client, eventIds, 'FAILED', 'Telegram delivery is not configured.');
        return NextResponse.json({
          success: false,
          events_created: eventsCreated,
          alerts_sent: 0,
          delivery_status: 'FAILED',
          error: 'Telegram delivery is not configured.',
        }, { status: 503 });
      }
      await updateClaimedEvents(client, eventIds, 'SENT');
      return NextResponse.json({
        success: true,
        events_created: eventsCreated,
        alerts_sent: events.length,
        delivery_status: 'SENT',
        recipients_sent: delivery.sent,
        recipients_already_delivered: delivery.alreadyDelivered,
      });
    } catch (error) {
      await updateClaimedEvents(
        client,
        eventIds,
        'FAILED',
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
