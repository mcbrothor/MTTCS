import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { supabaseServer } from '@/lib/supabase/server';

const VALID_TRIGGER_TYPES = ['GAIN_PCT', 'PRICE', 'R_MULTIPLE', 'MANUAL'];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tradeId = searchParams.get('trade_id')?.trim();
    if (!tradeId) return apiError('trade_id is required.', 'INVALID_INPUT', 400);

    const { data, error } = await supabaseServer
      .from('trade_exit_rules')
      .select('*')
      .eq('trade_id', tradeId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return apiSuccess(data || [], { source: 'Supabase trade_exit_rules', provider: 'Supabase', delay: 'REALTIME' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Failed to fetch exit rules.'), 'API_ERROR', 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const tradeId = String(body.trade_id || '').trim();
    const triggerType = String(body.trigger_type || 'GAIN_PCT').trim().toUpperCase();
    const triggerValue = Number(body.trigger_value);
    const exitFraction = Number(body.exit_fraction);

    if (!tradeId) return apiError('trade_id is required.', 'INVALID_INPUT', 400);
    if (!VALID_TRIGGER_TYPES.includes(triggerType)) {
      return apiError('Invalid trigger_type.', 'INVALID_INPUT', 400, { allowed: VALID_TRIGGER_TYPES });
    }
    if (!Number.isFinite(triggerValue)) return apiError('trigger_value must be numeric.', 'INVALID_INPUT', 400);
    if (!Number.isFinite(exitFraction) || exitFraction <= 0 || exitFraction > 1) {
      return apiError('exit_fraction must be between 0 and 1.', 'INVALID_INPUT', 400);
    }

    const { data, error } = await supabaseServer
      .from('trade_exit_rules')
      .insert([{
        trade_id: tradeId,
        trigger_type: triggerType,
        trigger_value: triggerValue,
        exit_fraction: exitFraction,
        note: body.note ? String(body.note).slice(0, 1000) : null,
        executed: Boolean(body.executed),
        updated_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (error) throw error;
    return apiSuccess(data, { source: 'Supabase trade_exit_rules', provider: 'Supabase', delay: 'REALTIME' }, 201);
  } catch (error) {
    return apiError(getErrorMessage(error, 'Failed to save exit rule.'), 'API_ERROR', 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = String(body.id || '').trim();
    if (!id) return apiError('id is required.', 'INVALID_INPUT', 400);

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.trigger_type !== undefined) {
      const triggerType = String(body.trigger_type).trim().toUpperCase();
      if (!VALID_TRIGGER_TYPES.includes(triggerType)) return apiError('Invalid trigger_type.', 'INVALID_INPUT', 400);
      update.trigger_type = triggerType;
    }
    if (body.trigger_value !== undefined) {
      const triggerValue = Number(body.trigger_value);
      if (!Number.isFinite(triggerValue)) return apiError('trigger_value must be numeric.', 'INVALID_INPUT', 400);
      update.trigger_value = triggerValue;
    }
    if (body.exit_fraction !== undefined) {
      const exitFraction = Number(body.exit_fraction);
      if (!Number.isFinite(exitFraction) || exitFraction <= 0 || exitFraction > 1) {
        return apiError('exit_fraction must be between 0 and 1.', 'INVALID_INPUT', 400);
      }
      update.exit_fraction = exitFraction;
    }
    if (body.note !== undefined) update.note = body.note ? String(body.note).slice(0, 1000) : null;
    if (body.executed !== undefined) update.executed = Boolean(body.executed);

    const { data, error } = await supabaseServer
      .from('trade_exit_rules')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return apiSuccess(data, { source: 'Supabase trade_exit_rules', provider: 'Supabase', delay: 'REALTIME' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Failed to update exit rule.'), 'API_ERROR', 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id')?.trim();
    if (!id) return apiError('id is required.', 'INVALID_INPUT', 400);

    const { error } = await supabaseServer.from('trade_exit_rules').delete().eq('id', id);
    if (error) throw error;
    return apiSuccess({ id }, { source: 'Supabase trade_exit_rules', provider: 'Supabase', delay: 'REALTIME' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Failed to delete exit rule.'), 'API_ERROR', 500);
  }
}
