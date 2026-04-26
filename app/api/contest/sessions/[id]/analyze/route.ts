import { NextResponse } from 'next/server';
import { runRuleEngine, RULE_ENGINE_PROVIDER, RULE_ENGINE_VERSION } from '@/lib/ai/contest-rule-engine';
import { supabaseServer } from '@/lib/supabase/server';
import { fetchLatestStockMetrics } from '@/lib/finance/market/stock-metrics';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const candidates: Array<{ id: string; ticker: string; snapshot: Record<string, unknown> | null; user_rank: number }> =
      (session.candidates ?? []).map((c: any) => ({
        id: c.id,
        ticker: c.ticker,
        snapshot: (c.snapshot ?? null) as Record<string, unknown> | null,
        user_rank: c.user_rank ?? 0,
      }));

    // 2a. stock_metrics에서 최신 RS 데이터를 가져와 스냅샷 보강
    //     (snapshot 저장 당시 RS가 null이었던 경우를 복구)
    const market = ((session as any).market ?? 'US') as 'US' | 'KR';
    const rsMap = await fetchLatestStockMetrics(candidates.map(c => c.ticker), market);
    const hasPositiveNum = (v: unknown) => typeof v === 'number' && isFinite(v) && v > 0;
    const enriched = candidates.map(c => {
      const snap = (c.snapshot ?? {}) as Record<string, unknown>;
      if (hasPositiveNum(snap.rs_rating)) return c;
      const metric = rsMap.get(c.ticker.toUpperCase());
      if (!metric) return c;
      return {
        ...c,
        snapshot: {
          ...snap,
          rs_rating: metric.rs_rating ?? snap.rs_rating,
          ibd_proxy_score: metric.ibd_proxy_score ?? snap.ibd_proxy_score,
          rs_rank: metric.rs_rank ?? snap.rs_rank,
          rs_universe_size: metric.rs_universe_size ?? snap.rs_universe_size,
          mansfield_rs_flag: metric.mansfield_rs_flag ?? snap.mansfield_rs_flag,
          mansfield_rs_score: metric.mansfield_rs_score ?? snap.mansfield_rs_score,
        },
      };
    });

    // 2b. 인앱 룰 엔진으로 분석 (외부 LLM 호출 없음)
    const normalized = runRuleEngine(enriched, sessionId);
    const rankings = normalized.rankings;
    const canonicalRaw = JSON.stringify(normalized, null, 2);

    const idByCandidateId = new Map(candidates.map(c => [c.id, c.id]));
    const idByTicker = new Map(candidates.map(c => [c.ticker.toUpperCase(), c.id]));

    // 3. 종목별 분석 결과 업데이트
    for (const ranking of rankings) {
      const candidateId = ranking.candidate_id
        ? idByCandidateId.get(ranking.candidate_id)
        : idByTicker.get(ranking.ticker.toUpperCase());

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

    // 4. 세션 요약 및 상태 업데이트
    const { error: updateError } = await supabaseServer
      .from('beauty_contest_sessions')
      .update({
        llm_raw_response: canonicalRaw,
        llm_report_summary: '',
        llm_provider: `${RULE_ENGINE_PROVIDER} (${RULE_ENGINE_VERSION})`,
        response_schema_version: normalized.response_schema_version,
        status: 'REVIEW_READY',
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      data: {
        provider: RULE_ENGINE_PROVIDER,
        model: RULE_ENGINE_VERSION,
        summary: '',
        candidates_updated: rankings.length,
        fallback_chain: [],
      },
    });
  } catch (error: any) {
    console.error('Rule Engine Analysis Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
