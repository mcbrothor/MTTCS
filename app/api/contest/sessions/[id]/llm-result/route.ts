import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { parseLlmRankings } from '@/lib/contest';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const raw = String(body.llm_raw_response || body.raw || '').trim();
    if (!raw) return apiError('LLM JSON response is required.', 'INVALID_INPUT', 400);

    const { data: candidates, error: candidateError } = await supabaseServer
      .from('contest_candidates')
      .select('id, ticker')
      .eq('session_id', id);
    if (candidateError) throw candidateError;
    if (!candidates || candidates.length === 0) return apiError('Contest session has no candidates.', 'NOT_FOUND', 404);

    const rankings = parseLlmRankings(raw, candidates.map((candidate) => candidate.ticker));
    const idByTicker = new Map(candidates.map((candidate) => [String(candidate.ticker).toUpperCase(), candidate.id]));

    for (const ranking of rankings) {
      const candidateId = idByTicker.get(ranking.ticker);
      if (!candidateId) continue;
      const { error: updateError } = await supabaseServer
        .from('contest_candidates')
        .update({
          llm_rank: ranking.rank,
          llm_comment: ranking.comment,
          updated_at: new Date().toISOString(),
        })
        .eq('id', candidateId);
      if (updateError) throw updateError;
    }

    const { error: sessionError } = await supabaseServer
      .from('beauty_contest_sessions')
      .update({
        llm_raw_response: raw,
        llm_provider: body.llm_provider ? String(body.llm_provider).slice(0, 100) : null,
        status: 'REVIEW_READY',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (sessionError) throw sessionError;

    const { data, error } = await supabaseServer
      .from('beauty_contest_sessions')
      .select('*, contest_candidates(*, contest_reviews(*))')
      .eq('id', id)
      .single();
    if (error) throw error;

    return apiSuccess(data, { source: 'Supabase contest_candidates', provider: 'Supabase', delay: 'REALTIME' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Failed to save LLM result.'), 'INVALID_INPUT', 400);
  }
}
