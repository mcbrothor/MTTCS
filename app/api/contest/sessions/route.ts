import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { buildContestPrompt, CONTEST_PROMPT_VERSION, CONTEST_RESPONSE_SCHEMA_VERSION, reviewDueDate, validateContestCandidates } from '@/lib/contest';
import { supabaseServer } from '@/lib/supabase/server';
import type { ContestMarket, ContestPromptCandidate, ScannerUniverse } from '@/types';

function parseMarket(value: unknown): ContestMarket {
  return value === 'KR' ? 'KR' : 'US';
}

function arrayOrEmpty(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export async function GET() {
  try {
    const { data, error } = await supabaseServer
      .from('beauty_contest_sessions')
      .select('*, contest_candidates(*, contest_reviews(*))')
      .order('selected_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    return apiSuccess(data || [], {
      source: 'Supabase beauty_contest_sessions',
      provider: 'Supabase',
      delay: 'REALTIME',
    });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Failed to fetch contest sessions.'), 'API_ERROR', 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const market = parseMarket(body.market);
    const universe = String(body.universe || (market === 'KR' ? 'KOSPI100' : 'NASDAQ100')) as ScannerUniverse;
    const selectedAt = body.selected_at ? new Date(body.selected_at).toISOString() : new Date().toISOString();
    const payload = validateContestCandidates(body.candidates as ContestPromptCandidate[]);
    const marketContext = body.market_context && typeof body.market_context === 'object' ? body.market_context : null;
    const candidatePoolSnapshot = arrayOrEmpty(body.candidate_pool_snapshot);

    const { data: session, error: sessionError } = await supabaseServer
      .from('beauty_contest_sessions')
      .insert([{
        market,
        universe,
        selected_at: selectedAt,
        prompt_payload: payload,
        prompt_version: CONTEST_PROMPT_VERSION,
        response_schema_version: CONTEST_RESPONSE_SCHEMA_VERSION,
        market_context: marketContext,
        candidate_pool_snapshot: candidatePoolSnapshot,
        llm_prompt: 'pending',
        llm_provider: body.llm_provider || null,
        status: 'OPEN',
        updated_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (sessionError) throw sessionError;

    const candidateRows = payload.map((candidate) => ({
      session_id: session.id,
      ticker: candidate.ticker,
      exchange: candidate.exchange,
      name: candidate.name,
      user_rank: candidate.user_rank,
      recommendation_tier: candidate.recommendation_tier || null,
      recommendation_reason: candidate.recommendation_reason || null,
      entry_reference_price: candidate.price,
      snapshot: candidate,
      updated_at: new Date().toISOString(),
    }));

    const { data: candidates, error: candidateError } = await supabaseServer
      .from('contest_candidates')
      .insert(candidateRows)
      .select();

    if (candidateError) throw candidateError;

    const byTicker = new Map((candidates || []).map((candidate) => [String(candidate.ticker).toUpperCase(), candidate]));
    const promptCandidates = payload.map((candidate) => ({
      ...candidate,
      candidate_id: byTicker.get(candidate.ticker)?.id,
    }));
    const { llmPrompt } = buildContestPrompt({
      market,
      universe,
      sessionId: session.id,
      candidates: promptCandidates,
      marketContext,
      llmProvider: body.llm_provider || null,
    });

    const { error: promptError } = await supabaseServer
      .from('beauty_contest_sessions')
      .update({
        prompt_payload: promptCandidates,
        llm_prompt: llmPrompt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.id);
    if (promptError) throw promptError;

    const reviewRows = (candidates || []).flatMap((candidate) => ([
      {
        candidate_id: candidate.id,
        horizon: 'W1',
        due_date: reviewDueDate(selectedAt, 'W1'),
        base_price: candidate.entry_reference_price,
        status: 'PENDING',
        updated_at: new Date().toISOString(),
      },
      {
        candidate_id: candidate.id,
        horizon: 'M1',
        due_date: reviewDueDate(selectedAt, 'M1'),
        base_price: candidate.entry_reference_price,
        status: 'PENDING',
        updated_at: new Date().toISOString(),
      },
    ]));

    const { error: reviewError } = await supabaseServer.from('contest_reviews').insert(reviewRows);
    if (reviewError) throw reviewError;

    const { data, error } = await supabaseServer
      .from('beauty_contest_sessions')
      .select('*, contest_candidates(*, contest_reviews(*))')
      .eq('id', session.id)
      .single();
    if (error) throw error;

    return apiSuccess(data, {
      source: 'Supabase beauty_contest_sessions',
      provider: 'Supabase',
      delay: 'REALTIME',
    }, 201);
  } catch (error) {
    return apiError(getErrorMessage(error, 'Failed to create contest session.'), 'INVALID_INPUT', 400);
  }
}
