import { NextResponse } from 'next/server';
import { buildIbValidationPrompt, IB_PROMPT_VERSION, IB_RESPONSE_SCHEMA_VERSION } from '@/lib/ai/contest-ib-prompt';
import { runContestAnalysis } from '@/lib/ai/contest-analysis';
import { supabaseServer } from '@/lib/supabase/server';
import type { BeautyContestSession, ContestCandidate, MasterFilterResponse } from '@/types';

// IB 프롬프트는 대형 컨텍스트 + 긴 마크다운 리포트 생성 필요 → 충분한 실행 시간 확보
export const maxDuration = 120;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * LLM 응답에서 메타데이터 JSON과 마크다운 리포트를 분리한다.
 *
 * 처리 전략 (순차 시도):
 *  1. ```json ... ``` 펜스 블록 추출
 *  2. 응답 전체를 JSON으로 파싱 (펜스 없이 JSON만 반환한 경우)
 *  3. 첫 `{`부터 depth-0 닫힘까지 bracket matching
 *  4. (3)이 너무 일찍 닫혔을 때(`rest`가 `, "..." | } | "...`로 시작)
 *     — 외부 `}`를 제거하고 rest의 다음 균형 close까지 합쳐 stitch 후 재파싱
 *  5. 모두 실패시 raw를 markdown으로 fallback (parseFailed=true)
 *
 * 이전 구현은 (3)만 수행해 LLM이 `{committee_consensus:{...}}, "candidates":[...]`처럼
 * 외부 객체를 일찍 닫은 응답에서 `, "candidates":[...]` 잔재가 report_markdown으로
 * 흘러가 화면에 raw JSON이 보이는 문제를 일으켰다.
 */
function parseIbResponse(raw: string): {
  metadata: Record<string, unknown> | null;
  reportMarkdown: string;
  parseFailed: boolean;
} {
  const trimmed = raw.trim();

  // Strategy 1: ```json 펜스
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = trimmed.match(fenceRegex);
  if (match) {
    const jsonStr = match[1];
    const fenceEnd = (match.index ?? 0) + match[0].length;
    const reportMarkdown = trimmed.slice(fenceEnd).trim();
    try {
      const metadata = JSON.parse(jsonStr) as Record<string, unknown>;
      return { metadata, reportMarkdown: sanitizeReportMarkdown(reportMarkdown), parseFailed: false };
    } catch {
      // fence 내용이 유효 JSON이 아니면 다음 전략으로
    }
  }

  // Strategy 2: 응답 전체가 그냥 JSON (펜스 없이)
  try {
    const metadata = JSON.parse(trimmed) as Record<string, unknown>;
    const embedded = typeof metadata.report_markdown === 'string' ? metadata.report_markdown : '';
    return { metadata, reportMarkdown: embedded, parseFailed: false };
  } catch {
    // 순수 JSON 아님
  }

  // Strategy 3/4: bracket matching + stitching recovery
  const start = trimmed.indexOf('{');
  if (start === -1) {
    return { metadata: null, reportMarkdown: trimmed, parseFailed: true };
  }

  const firstClose = findBalancedClose(trimmed, start, 0);
  if (firstClose === -1) {
    return { metadata: null, reportMarkdown: trimmed, parseFailed: true };
  }

  const jsonCandidate = trimmed.slice(start, firstClose + 1);
  const rest = trimmed.slice(firstClose + 1).trimStart();

  // (4) 너무 일찍 닫혔을 가능성: rest가 JSON 연속 토큰으로 시작
  if (rest.startsWith(',') || rest.startsWith('}') || rest.startsWith('"')) {
    // 외부 `}` 제거 후 rest의 다음 균형 close까지 stitch
    // jsonCandidate 마지막 `}`를 제외하고, rest에서 depth=1로 시작해 0이 되는 지점까지 사용
    const stitchClose = findBalancedClose(rest, 0, 1);
    if (stitchClose !== -1) {
      const stitched = jsonCandidate.slice(0, -1) + rest.slice(0, stitchClose + 1);
      try {
        const metadata = JSON.parse(stitched) as Record<string, unknown>;
        const reportMarkdown = rest.slice(stitchClose + 1).trim();
        return { metadata, reportMarkdown: sanitizeReportMarkdown(reportMarkdown), parseFailed: false };
      } catch {
        // stitching 실패 → 정상 경로로 fallthrough
      }
    }
  }

  // 정상 경로: jsonCandidate 파싱 + rest를 markdown으로
  try {
    const metadata = JSON.parse(jsonCandidate) as Record<string, unknown>;
    return {
      metadata,
      reportMarkdown: sanitizeReportMarkdown(rest),
      parseFailed: false,
    };
  } catch {
    return { metadata: null, reportMarkdown: rest, parseFailed: true };
  }
}

/**
 * `text`의 `from`부터 brace depth를 추적해 depth가 `initialDepth`에서 시작해
 * 0이 되는 첫 `}` 위치를 반환. 문자열 리터럴 안의 brace는 무시한다.
 * 찾지 못하면 -1.
 */
function findBalancedClose(text: string, from: number, startDepth: number): number {
  let depth = startDepth;
  let inString = false;
  let escaped = false;
  for (let i = from; i < text.length; i += 1) {
    const c = text[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') depth += 1;
    if (c === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * report_markdown으로 흘러들어온 텍스트가 JSON 잔재(`, "..."` / `} ...` / `"..."`)로
 * 시작한다면 stitching이 실패했거나 LLM이 마크다운을 안 줬다는 뜻 — UI 깨짐 방지를 위해 비움.
 */
function sanitizeReportMarkdown(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith(',') || trimmed.startsWith('}')) return '';
  // `"...` 단독으로 시작하는 케이스(드물게 LLM이 단순 따옴표 시작) — '#' 같은 markdown 신호 없으면 비움
  if (trimmed.startsWith('"') && !trimmed.includes('\n#') && !trimmed.includes('\n##')) return '';
  return trimmed;
}

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
      false // 프롬프트 복사용이므로 메타데이터 JSON 제외
    );

    return NextResponse.json({
      success: true,
      data: {
        prompt,
        prompt_version: IB_PROMPT_VERSION,
        candidate_count: candidates.length,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
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

    // 3. 메타데이터 + 마크다운 리포트 분리 파싱
    const { metadata, reportMarkdown, parseFailed } = parseIbResponse(rawResponse);

    const ibAnalysis: Record<string, unknown> = {
      ...(metadata ?? {}),
      report_markdown: reportMarkdown,
      schema_version: IB_RESPONSE_SCHEMA_VERSION,
      prompt_version: IB_PROMPT_VERSION,
      generated_at: new Date().toISOString(),
      parse_failed: parseFailed,
      ...(parseFailed ? { raw_text: rawResponse } : {}),
    };

    // 4. 세션에 IB 분석 결과 저장
    const { error: updateError } = await supabaseServer
      .from('beauty_contest_sessions')
      .update({
        ib_raw_response: rawResponse,
        ib_analysis: ibAnalysis,
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
  } catch (error: unknown) {
    console.error('IB Validation Error:', error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
