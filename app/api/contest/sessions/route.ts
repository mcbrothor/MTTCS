import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { buildContestPrompt, CONTEST_PROMPT_VERSION, CONTEST_RESPONSE_SCHEMA_VERSION, reviewDueDate, validateContestCandidates } from '@/lib/contest';
import { parseContestSource } from '@/lib/contest-sources';
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
    if (process.env.MTN_TEST_ENVIRONMENT === 'true') {
      const contestResponse = require('../../../../tests/e2e/fixtures/contest-response.json');
      return apiSuccess([{
        id: contestResponse.session_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        selected_at: new Date().toISOString(),
        status: 'COMPLETED',
        market: 'US',
        universe: 'growth',
        llm_provider: 'gemini',
        candidates: contestResponse.rankings.map((r: any, idx: number) => ({
          id: `cand-${r.ticker.toLowerCase()}`,
          session_id: contestResponse.session_id,
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
      }]);
    }
    const { data, error } = await supabaseServer
      .from('beauty_contest_sessions')
      .select('*, candidates:contest_candidates(*, reviews:contest_reviews(*))')
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
  let stage = 'parse_body';
  try {
    const body = await request.json();
    if (process.env.MTN_TEST_ENVIRONMENT === 'true') {
      const contestResponse = require('../../../../tests/e2e/fixtures/contest-response.json');
      const mockSession = {
        id: contestResponse.session_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        selected_at: new Date().toISOString(),
        status: 'COMPLETED',
        market: body.market || 'US',
        universe: body.universe || 'NASDAQ100',
        llm_provider: 'gemini',
        llm_prompt: 'mock-prompt',
        candidates: contestResponse.rankings.map((r: any, idx: number) => ({
          id: `cand-${r.ticker.toLowerCase()}`,
          session_id: contestResponse.session_id,
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
      };
      return apiSuccess(mockSession, {
        source: 'e2e-mock',
        provider: 'E2E Mock',
        delay: 'REALTIME',
      }, 201);
    }
    stage = 'validate_input';
    const market = parseMarket(body.market);
    const source = parseContestSource(body.source) || parseContestSource((body.candidates || [])[0]?.screener_source) || 'minervini';
    const universe = String(body.universe || (market === 'KR' ? 'KOSPI200' : 'NASDAQ100')) as ScannerUniverse;
    const selectedAt = body.selected_at ? new Date(body.selected_at).toISOString() : new Date().toISOString();
    const payload = validateContestCandidates(body.candidates as ContestPromptCandidate[]);
    const marketContext = body.market_context && typeof body.market_context === 'object' ? body.market_context : null;
    const candidatePoolSnapshot = arrayOrEmpty(body.candidate_pool_snapshot);

    stage = 'insert_session';
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

    stage = 'insert_candidates';
    const { data: candidates, error: candidateError } = await supabaseServer
      .from('contest_candidates')
      .insert(candidateRows)
      .select();

    if (candidateError) throw candidateError;
    stage = 'build_prompt';

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
      source,
    });

    stage = 'update_prompt';
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

    stage = 'insert_reviews';
    const { error: reviewError } = await supabaseServer.from('contest_reviews').insert(reviewRows);
    if (reviewError) throw reviewError;

    stage = 'select_final';
    const { data, error } = await supabaseServer
      .from('beauty_contest_sessions')
      .select('*, candidates:contest_candidates(*, reviews:contest_reviews(*))')
      .eq('id', session.id)
      .single();
    if (error) throw error;

    return apiSuccess(data, {
      source: 'Supabase beauty_contest_sessions',
      provider: 'Supabase',
      delay: 'REALTIME',
    }, 201);
  } catch (error) {
    // 단계별 컨텍스트와 원본 에러를 모두 로그에 남겨 Vercel에서 진짜 원인을 추적 가능하게 한다.
    console.error('[contest/sessions POST] failed at stage:', stage, error);
    const baseMessage = getErrorMessage(error, 'Failed to create contest session.');
    const isDbError = error && typeof error === 'object' && !(error instanceof Error)
      && ('code' in (error as Record<string, unknown>) || 'details' in (error as Record<string, unknown>));
    const status = isDbError ? 500 : 400;
    const errorCode = isDbError ? 'DB_ERROR' : 'INVALID_INPUT';
    return apiError(`[${stage}] ${baseMessage}`, errorCode, status, { stage });
  }
}
