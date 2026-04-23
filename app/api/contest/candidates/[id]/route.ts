import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { buildContestSnapshot, buildLlmVerdict } from '@/lib/finance/core/snapshot';
import { supabaseServer } from '@/lib/supabase/server';
import type { BeautyContestSession, ContestCandidate } from '@/types';

async function syncLinkedTradeSnapshots(session: BeautyContestSession, candidate: ContestCandidate) {
  if (!candidate.linked_trade_id) return;

  const contestSnapshot = buildContestSnapshot(session, candidate);
  const llmVerdict = buildLlmVerdict(session, candidate);

  const { error } = await supabaseServer
    .from('trades')
    .update({
      contest_snapshot: contestSnapshot,
      llm_verdict: llmVerdict,
      updated_at: new Date().toISOString(),
    })
    .eq('id', candidate.linked_trade_id);

  if (error) throw error;
}

async function clearLinkedTradeSnapshots(tradeId: string) {
  const { error } = await supabaseServer
    .from('trades')
    .update({
      contest_snapshot: null,
      llm_verdict: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tradeId);

  if (error) throw error;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const { data: previousCandidate, error: previousError } = await supabaseServer
      .from('contest_candidates')
      .select('*')
      .eq('id', id)
      .single();
    if (previousError) throw previousError;

    if (body.actual_invested !== undefined) update.actual_invested = Boolean(body.actual_invested);
    if (body.final_pick_rank !== undefined) {
      if (body.final_pick_rank === null || body.final_pick_rank === '') {
        update.final_pick_rank = null;
      } else {
        const rank = Number(body.final_pick_rank);
        if (!Number.isInteger(rank) || rank < 1) return apiError('final_pick_rank must be a positive integer.', 'INVALID_INPUT', 400);
        update.final_pick_rank = rank;
      }
    }
    if (body.final_pick_note !== undefined) {
      update.final_pick_note = body.final_pick_note ? String(body.final_pick_note).slice(0, 2000) : null;
    }
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
    const candidate = data as ContestCandidate;
    const previousTradeId = typeof previousCandidate?.linked_trade_id === 'string' ? previousCandidate.linked_trade_id : null;
    const nextTradeId = typeof candidate.linked_trade_id === 'string' ? candidate.linked_trade_id : null;

    if (previousTradeId && previousTradeId !== nextTradeId) {
      await clearLinkedTradeSnapshots(previousTradeId);
    }

    if (nextTradeId) {
      const { data: session, error: sessionError } = await supabaseServer
        .from('beauty_contest_sessions')
        .select('*')
        .eq('id', candidate.session_id)
        .single();
      if (sessionError) throw sessionError;
      await syncLinkedTradeSnapshots(session as BeautyContestSession, candidate);
    }

    return apiSuccess(candidate, { source: 'Supabase contest_candidates', provider: 'Supabase', delay: 'REALTIME' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Failed to update contest candidate.'), 'API_ERROR', 500);
  }
}
