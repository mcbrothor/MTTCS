import { NextResponse } from 'next/server';
import { buildIbValidationPrompt, IB_PROMPT_VERSION, IB_RESPONSE_SCHEMA_VERSION } from '@/lib/ai/contest-ib-prompt';
import { runContestAnalysis } from '@/lib/ai/contest-analysis';
import { extractStructuredJson } from '@/lib/ai/gemini';
import { supabaseServer } from '@/lib/supabase/server';
import type { BeautyContestSession, ContestCandidate, MasterFilterResponse } from '@/types';

// GET: 프롬프트만 반환 (LLM 호출 없음, 클립보드 복사용)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params;

  try {
    const { data: session, error } = await supabaseServer
      .from('beauty_contest_sessions')
      .select('*, candidates:contest_candidates(*)')
      .eq('id', sessionId)
      .single();

    if (error || !session) {
      return NextResponse.json({ error: '세션을 찾을 수 없습니다.' }, { status: 404 });
    }

    const candidates = (session.candidates ?? []) as ContestCandidate[];
    const marketContext = (session.market_context ?? null) as MasterFilterResponse | null;
    const prompt = buildIbValidationPrompt(
      session as BeautyContestSession,
      candidates,
      marketContext,
    );

    return NextResponse.json({
      success: true,
      data: {
        prompt,
        prompt_version: IB_PROMPT_VERSION,
        candidate_count: candidates.length,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: 외부 LLM 호출 및 IB 분석 결과 저장
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params;

  try {
    const { data: session, error: sessionError } = await supabaseServer
      .from('beauty_contest_sessions')
      .select('*, candidates:contest_candidates(*)')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: '세션을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (session.status === 'OPEN') {
      return NextResponse.json(
        { error: '내부 정량 분석(Step 2)을 먼저 실행해 주세요.' },
        { status: 400 },
      );
    }

    const candidates = (session.candidates ?? []) as ContestCandidate[];
    const marketContext = (session.market_context ?? null) as MasterFilterResponse | null;

    // 1. IB 위원회 프롬프트 빌드
    const prompt = buildIbValidationPrompt(
      session as BeautyContestSession,
      candidates,
      marketContext,
    );

    // 2. 외부 LLM 호출 (Gemini → Groq → Cerebras 폴백)
    const { rawResponse, providerUsed, modelUsed, fallbackChain } =
      await runContestAnalysis(prompt);

    // 3. JSON 파싱
    let ibAnalysis: Record<string, unknown>;
    try {
      ibAnalysis = extractStructuredJson(rawResponse) as Record<string, unknown>;
    } catch {
      ibAnalysis = { raw_text: rawResponse, parse_failed: true };
    }

    // 4. 세션에 IB 분석 결과 저장
    const { error: updateError } = await supabaseServer
      .from('beauty_contest_sessions')
      .update({
        ib_raw_response: rawResponse,
        ib_analysis: {
          ...ibAnalysis,
          schema_version: IB_RESPONSE_SCHEMA_VERSION,
          prompt_version: IB_PROMPT_VERSION,
          generated_at: new Date().toISOString(),
        },
        ib_provider: `${providerUsed} (${modelUsed})`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      data: {
        provider: providerUsed,
        model: modelUsed,
        fallback_chain: fallbackChain,
        ib_analysis: ibAnalysis,
      },
    });
  } catch (error: any) {
    console.error('IB Validation Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
