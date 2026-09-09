import assert from 'node:assert/strict';
import { parseMarketAnalysisResponse } from '../lib/market-analysis-response.ts';
const data = { ticker: 'NVDA', priceData: [], sepaEvidence: { summary: {} }, vcpAnalysis: { details: [] } };
assert.equal(parseMarketAnalysisResponse(data), data);
assert.equal(parseMarketAnalysisResponse({ data }), data);
for (const value of [null, {}, { data: null }, { priceData: [] }, { ...data, vcpAnalysis: {} }]) {
  assert.throws(() => parseMarketAnalysisResponse(value));
}
console.log('market-analysis-response tests passed');
