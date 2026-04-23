import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { normalizeContestLlmResponse } from '@/lib/contest';
import { buildContestSnapshot, buildLlmVerdict } from '@/lib/finance/core/snapshot';
import { supabaseServer } from '@/lib/supabase/server';
import type { BeautyContestSession, ContestCandidate } from '@/types';

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

    const normalized = normalizeContestLlmResponse(
      raw,
      candidates.map((candidate) => ({ id: candidate.id, ticker: candidate.ticker })),
      id
    );
    const rankings = normalized.rankings;
    const canonicalRaw = JSON.stringify(normalized, null, 2);
    const idByTicker = new Map(candidates.map((candidate) => [String(candidate.ticker).toUpperCase(), candidate.id]));
    const idByCandidateId = new Map(candidates.map((candidate) => [String(candidate.id), candidate.id]));

    for (const ranking of rankings) {
      const candidateId = ranking.candidate_id ? idByCandidateId.get(ranking.candidate_id) : idByTicker.get(ranking.ticker);
      if (!candidateId) continue;
      const { error: updateError } = await supabaseServer
        .from('contest_candidates')
        .update({
          llm_rank: ranking.rank,
          llm_comment: ranking.comment || ranking.key_strength,
          llm_scores: ranking.scores || {},
          llm_analysis: ranking.analysis,
          updated_at: new Date().toISOString(),
        })
        .eq('id', candidateId);
      if (updateError) throw updateError;
    }

    const { error: sessionError } = await supabaseServer
      .from('beauty_contest_sessions')
      .update({
        llm_raw_response: canonicalRaw,
        llm_provider: body.llm_provider ? String(body.llm_provider).slice(0, 100) : null,
        response_schema_version: normalized.response_schema_version,
        status: 'REVIEW_READY',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (sessionError) throw sessionError;

    const { data, error } = await supabaseServer
      .from('beauty_contest_sessions')
      .select('*, candidates:contest_candidates(*, reviews:contest_reviews(*))')
      .eq('id', id)
      .single();
    if (error) throw error;

    const session = data as BeautyContestSession;
    const linkedCandidates = (session.candidates || []).filter((candidate): candidate is ContestCandidate => Boolean(candidate.linked_trade_id));

    for (const candidate of linkedCandidates) {
      const { error: syncError } = await supabaseServer
        .from('trades')
        .update({
          contest_snapshot: buildContestSnapshot(session, candidate),
          llm_verdict: buildLlmVerdict(session, candidate),
          updated_at: new Date().toISOString(),
        })
        .eq('id', candidate.linked_trade_id);
      if (syncError) throw syncError;
    }

    return apiSuccess(data, { source: 'Supabase contest_candidates', provider: 'Supabase', delay: 'REALTIME' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Failed to save LLM result.'), 'INVALID_INPUT', 400);
  }
}
