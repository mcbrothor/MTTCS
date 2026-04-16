import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { supabaseServer } from '@/lib/supabase/server';

const VALID_SOURCES = ['INITIAL', 'TEN_WEEK_MA', 'HIGH_WATERMARK', 'MANUAL', 'PYRAMID'];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tradeId = searchParams.get('trade_id')?.trim();
    if (!tradeId) return apiError('trade_id is required.', 'INVALID_INPUT', 400);

    const { data, error } = await supabaseServer
      .from('trade_stop_events')
      .select('*')
      .eq('trade_id', tradeId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return apiSuccess(data || [], { source: 'Supabase trade_stop_events', provider: 'Supabase', delay: 'REALTIME' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Failed to fetch stop events.'), 'API_ERROR', 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const tradeId = String(body.trade_id || '').trim();
    const stopPrice = Number(body.stop_price);
    const source = String(body.source || 'MANUAL').trim().toUpperCase();
    const reason = String(body.reason || '').trim();

    if (!tradeId) return apiError('trade_id is required.', 'INVALID_INPUT', 400);
    if (!Number.isFinite(stopPrice) || stopPrice <= 0) return apiError('stop_price must be positive.', 'INVALID_INPUT', 400);
    if (!VALID_SOURCES.includes(source)) return apiError('Invalid stop source.', 'INVALID_INPUT', 400, { allowed: VALID_SOURCES });
    if (!reason) return apiError('reason is required.', 'INVALID_INPUT', 400);

    const { data, error } = await supabaseServer
      .from('trade_stop_events')
      .insert([{
        trade_id: tradeId,
        stop_price: stopPrice,
        source,
        reason: reason.slice(0, 1000),
      }])
      .select()
      .single();

    if (error) throw error;

    await supabaseServer
      .from('trades')
      .update({ stoploss_price: stopPrice, updated_at: new Date().toISOString() })
      .eq('id', tradeId);

    return apiSuccess(data, { source: 'Supabase trade_stop_events', provider: 'Supabase', delay: 'REALTIME' }, 201);
  } catch (error) {
    return apiError(getErrorMessage(error, 'Failed to save stop event.'), 'API_ERROR', 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id')?.trim();
    if (!id) return apiError('id is required.', 'INVALID_INPUT', 400);

    const { error } = await supabaseServer.from('trade_stop_events').delete().eq('id', id);
    if (error) throw error;
    return apiSuccess({ id }, { source: 'Supabase trade_stop_events', provider: 'Supabase', delay: 'REALTIME' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Failed to delete stop event.'), 'API_ERROR', 500);
  }
}
