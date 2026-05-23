import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { supabaseServer } from '@/lib/supabase/server';

const VALID_STATUSES = ['OPEN', 'REVIEW_READY', 'COMPLETED'];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    if (process.env.MTN_TEST_ENVIRONMENT === 'true') {
      const contestResponse = require('../../../../../tests/e2e/fixtures/contest-response.json');
      return apiSuccess({
        id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        selected_at: new Date().toISOString(),
        status: body.status || 'COMPLETED',
        market: 'US',
        universe: 'growth',
        llm_provider: body.llm_provider || 'gemini',
        candidates: contestResponse.rankings.map((r: any, idx: number) => ({
          id: `cand-${r.ticker.toLowerCase()}`,
          session_id: id,
          ticker: r.ticker,
          exchange: 'NAS',
          name: r.ticker + ' Corp',
          user_rank: idx + 1,
          llm_rank: r.rank,
          recommendation_tier: r.recommendation === 'PROCEED' ? 'Recommended' : 'Low Priority',
          recommendation_reason: r.comment,
          entry_reference_price: 100,
          actual_invested: r.recommendation === 'PROCEED',
          final_pick_rank: r.recommendation === 'PROCEED' ? 1 : null,
          llm_scores: r.analysis,
          llm_analysis: r.analysis,
          llm_comment: r.comment,
          reviews: [
            { id: `rev-w1-${r.ticker.toLowerCase()}`, horizon: 'W1', status: 'PENDING', base_price: 100, due_date: new Date().toISOString() },
            { id: `rev-m1-${r.ticker.toLowerCase()}`, horizon: 'M1', status: 'PENDING', base_price: 100, due_date: new Date().toISOString() }
          ]
        }))
      });
    }
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
