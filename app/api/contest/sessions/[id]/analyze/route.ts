import { NextResponse } from 'next/server';
import { buildContestPrompt, normalizeContestLlmResponse } from '@/lib/contest';
import { runContestAnalysis } from '@/lib/ai/contest-analysis';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params;

  try {
    // 1. 세션 데이터 조회 (후보 종목 포함)
    const { data: session, error: sessionError } = await supabaseServer
      .from('beauty_contest_sessions')
      .select('*, candidates:contest_candidates(*)')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: '세션을 찾을 수 없습니다.' }, { status: 404 });
    }

    const candidates = session.candidates || [];

    // 2. 프롬프트 빌드
    const { llmPrompt } = buildContestPrompt({
      market: session.market,
      universe: session.universe,
      candidates: candidates.map((c: any) => ({
        ...c,
        fundamental_snapshot: c.snapshot?.fundamental || {},
        news_headlines: c.snapshot?.news || []
      })),
      marketContext: session.market_context || '상태 정보 없음',
      sessionId: session.id
    });

    // 3. AI 분석 실행 (폴백 메커니즘 적용: Gemini -> Groq -> Cerebras)
    const { 
      rawResponse: raw, 
      providerUsed, 
      modelUsed,
      fallbackChain
    } = await runContestAnalysis(llmPrompt);

    // 4. 데이터 정규화 및 파싱
    const normalized = normalizeContestLlmResponse(
      raw,
      candidates.map((c: any) => ({ id: c.id, ticker: c.ticker })),
      sessionId
    );
    
    const rankings = normalized.rankings;
    const canonicalRaw = JSON.stringify(normalized, null, 2);
    const idByTicker = new Map(candidates.map((c: any) => [String(c.ticker).toUpperCase(), c.id]));
    const idByCandidateId = new Map(candidates.map((c: any) => [String(c.id), c.id]));

    // 5. 종목별 분석 결과 업데이트
    for (const ranking of rankings) {
      const candidateId = ranking.candidate_id 
        ? idByCandidateId.get(String(ranking.candidate_id)) 
        : idByTicker.get(String(ranking.ticker).toUpperCase());
      
      if (!candidateId) continue;
      
      await supabaseServer
        .from('contest_candidates')
        .update({
          llm_rank: ranking.rank,
          llm_comment: ranking.comment || ranking.key_strength,
          llm_scores: ranking.scores || {},
          llm_analysis: ranking.analysis,
          updated_at: new Date().toISOString(),
        })
        .eq('id', candidateId);
    }

    // 6. 세션 요약 및 상태 업데이트
    const { error: updateError } = await supabaseServer
      .from('beauty_contest_sessions')
      .update({
        llm_raw_response: canonicalRaw,
        llm_report_summary: normalized.executive_summary || '',
        llm_provider: `${providerUsed} (${modelUsed})`,
        response_schema_version: normalized.response_schema_version,
        status: 'REVIEW_READY',
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (updateError) throw updateError;

    return NextResponse.json({ 
      success: true, 
      data: {
        provider: providerUsed,
        model: modelUsed,
        summary: normalized.executive_summary,
        candidates_updated: rankings.length,
        fallback_chain: fallbackChain
      }
    });

  } catch (error: any) {
    console.error('AI Analysis Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
