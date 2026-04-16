import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { supabaseServer } from '@/lib/supabase/server';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.actual_invested !== undefined) update.actual_invested = Boolean(body.actual_invested);
    if (body.linked_trade_id !== undefined) {
      update.linked_trade_id = body.linked_trade_id ? String(body.linked_trade_id) : null;
    }
    if (body.entry_reference_price !== undefined) {
      const price = Number(body.entry_reference_price);
      if (!Number.isFinite(price) || price <= 0) return apiError('entry_reference_price must be positive.', 'INVALID_INPUT', 400);
      update.entry_reference_price = price;
    }

    const { data, error } = await supabaseServer
      .from('contest_candidates')
      .update(update)
      .eq('id', id)
      .select('*, contest_reviews(*)')
      .single();

    if (error) throw error;
    return apiSuccess(data, { source: 'Supabase contest_candidates', provider: 'Supabase', delay: 'REALTIME' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Failed to update contest candidate.'), 'API_ERROR', 500);
  }
}
