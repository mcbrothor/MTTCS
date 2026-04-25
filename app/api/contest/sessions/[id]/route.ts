import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { supabaseServer } from '@/lib/supabase/server';

const VALID_STATUSES = ['OPEN', 'REVIEW_READY', 'COMPLETED'];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) return apiError('Invalid contest session status.', 'INVALID_INPUT', 400);
      update.status = body.status;
    }
    if (body.llm_provider !== undefined) update.llm_provider = body.llm_provider ? String(body.llm_provider) : null;
    if (body.llm_raw_response !== undefined) {
      update.llm_raw_response = body.llm_raw_response ? String(body.llm_raw_response).slice(0, 50_000) : null;
    }

    const { data, error } = await supabaseServer
      .from('beauty_contest_sessions')
      .update(update)
      .eq('id', id)
      .select('*, candidates:contest_candidates(*, reviews:contest_reviews(*))')
      .single();

    if (error) throw error;
    return apiSuccess(data, { source: 'Supabase beauty_contest_sessions', provider: 'Supabase', delay: 'REALTIME' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Failed to update contest session.'), 'API_ERROR', 500);
  }
}
