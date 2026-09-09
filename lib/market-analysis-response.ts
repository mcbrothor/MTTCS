import type { MarketAnalysisResponse } from '@/types';

/** Accept the direct route body and its documented data envelope; reject incomplete analysis. */
export function parseMarketAnalysisResponse(payload: unknown): MarketAnalysisResponse {
  if (!payload || typeof payload !== 'object') throw new Error('종목 분석 응답이 비어 있습니다.');
  const envelope = payload as Record<string, unknown>;
  const value = (envelope.data ?? payload) as Partial<MarketAnalysisResponse>;
  if (!Array.isArray(value.priceData) || !value.sepaEvidence?.summary || !value.vcpAnalysis || !Array.isArray(value.vcpAnalysis.details)) {
    throw new Error('종목 분석 응답 형식이 올바르지 않습니다. 다시 조회해 주세요.');
  }
  return value as MarketAnalysisResponse;
}
