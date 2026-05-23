import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { calculateReturnPct, normalizeReviewStatus } from '@/lib/contest';
import { supabaseServer } from '@/lib/supabase/server';

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 12);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    let query = supabaseServer
      .from('contest_reviews')
      .select('*, contest_candidates(*, beauty_contest_sessions(*))')
      .order('due_date', { ascending: true });

    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;

    return apiSuccess(data || [], { source: 'Supabase contest_reviews', provider: 'Supabase', delay: 'REALTIME' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Failed to fetch contest reviews.'), 'API_ERROR', 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = String(body.id || '').trim();
    if (!id) return apiError('Review id is required.', 'INVALID_INPUT', 400);

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.review_price !== undefined) {
      const reviewPrice = Number(body.review_price);
      if (!Number.isFinite(reviewPrice) || reviewPrice <= 0) return apiError('review_price must be positive.', 'INVALID_INPUT', 400);
      update.review_price = reviewPrice;

      const { data: current, error: currentError } = await supabaseServer
        .from('contest_reviews')
        .select('base_price')
        .eq('id', id)
        .single();
      if (currentError) throw currentError;
      update.return_pct = calculateReturnPct(Number(current.base_price), reviewPrice);
      update.status = 'MANUAL';
      update.price_source = body.price_source ? String(body.price_source).slice(0, 200) : 'Manual';
      update.price_as_of = body.price_as_of ? String(body.price_as_of).slice(0, 10) : new Date().toISOString().slice(0, 10);
    }

    if (body.status !== undefined) update.status = normalizeReviewStatus(body.status);
    const tags = normalizeTags(body.mistake_tags);
    if (tags !== undefined) update.mistake_tags = tags;
    if (body.user_review_note !== undefined) {
      update.user_review_note = body.user_review_note ? String(body.user_review_note).slice(0, 4000) : null;
    }

    const { data, error } = await supabaseServer
      .from('contest_reviews')
      .update(update)
      .eq('id', id)
      .select('*, contest_candidates(*)')
      .single();
    if (error) throw error;

    return apiSuccess(data, { source: 'Supabase contest_reviews', provider: 'Supabase', delay: 'REALTIME' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Failed to update contest review.'), 'API_ERROR', 500);
  }
}
