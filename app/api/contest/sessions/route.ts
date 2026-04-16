import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { buildContestPrompt, reviewDueDate } from '@/lib/contest';
import { supabaseServer } from '@/lib/supabase/server';
import type { ContestMarket, ContestPromptCandidate, ScannerUniverse } from '@/types';

function parseMarket(value: unknown): ContestMarket {
  return value === 'KR' ? 'KR' : 'US';
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
    const { payload, llmPrompt } = buildContestPrompt({
      market,
      universe,
      candidates: body.candidates as ContestPromptCandidate[],
      llmProvider: body.llm_provider || null,
    });

    const { data: session, error: sessionError } = await supabaseServer
      .from('beauty_contest_sessions')
      .insert([{
        market,
        universe,
        selected_at: selectedAt,
        prompt_payload: payload,
        llm_prompt: llmPrompt,
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
      entry_reference_price: candidate.price,
      snapshot: candidate,
      updated_at: new Date().toISOString(),
    }));

    const { data: candidates, error: candidateError } = await supabaseServer
      .from('contest_candidates')
      .insert(candidateRows)
      .select();

    if (candidateError) throw candidateError;

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

    return apiSuccess({ ...session, candidates }, {
      source: 'Supabase beauty_contest_sessions',
      provider: 'Supabase',
      delay: 'REALTIME',
    }, 201);
  } catch (error) {
    return apiError(getErrorMessage(error, 'Failed to create contest session.'), 'INVALID_INPUT', 400);
  }
}
