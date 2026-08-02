import { rejectUnauthenticatedRequest } from '@/lib/auth/api';
import { NextResponse } from 'next/server';
import { recordPipelineRun } from '@/lib/data/pipeline-health';
import { buildMacroApiResponse, fetchMacroAssessment, macroAssessmentHttpStatus } from '@/lib/macro/service';

export async function GET(request: Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;
  try {
    const market = new URL(request.url).searchParams.get('market') === 'KR' ? 'KR' : 'US';
    const assessment = await fetchMacroAssessment(market);
    const response = buildMacroApiResponse(assessment);
    const responseStatus = macroAssessmentHttpStatus(assessment);
    await recordPipelineRun({
      pipeline: 'macro',
      provider: market === 'KR' ? 'Yahoo+FRED+KIS' : 'Yahoo+FRED',
      market,
      status: response.decisionStatus === 'VALID'
        ? 'SUCCESS'
        : response.decisionStatus === 'BLOCKED' ? 'FAILED' : 'DEGRADED',
      observedAt: response.observedAt,
      fallbackUsed: response.quality.fallbackUsed,
      fallbackReason: response.quality.warnings.join(' · ') || null,
      errorMessage: response.decisionStatus === 'BLOCKED'
        ? '필수 매크로 입력 가중치가 의사결정 최소 기준에 미달했습니다.'
        : null,
      metadata: {
        modelVersion: response.modelVersion,
        score: response.score,
        rawScore: response.rawScore,
        regime: response.regime,
        quality: response.quality,
      },
    }).catch(() => undefined);

    if (responseStatus === 503) {
      return NextResponse.json({
        ...response,
        message: '필수 매크로 데이터가 부족하여 투자 판단을 차단했습니다.',
        code: 'MACRO_DECISION_BLOCKED',
      }, { status: responseStatus });
    }
    return NextResponse.json(response, { status: responseStatus });
  } catch (error: unknown) {
    console.error('Fetch Macro Data Error:', error);
    return NextResponse.json({
      message: '매크로 데이터를 불러오는 중 오류가 발생했습니다.',
      code: 'FETCH_MACRO_FAILED',
    }, { status: 500 });
  }
}
