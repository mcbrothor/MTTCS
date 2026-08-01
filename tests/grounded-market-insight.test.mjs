import assert from 'node:assert/strict';
import {
  buildRuleBasedGroundedInsight,
  renderGroundedMarketInsight,
  validateGroundedMarketInsight,
} from '../lib/ai/grounded-market-insight.ts';
import { parseGroundedInsightResponse } from '../lib/ai/gemini.ts';

const evidenceCatalog = [
  { key: 'trend', label: '추세', value: '상승', unit: 'status', threshold: '중기선 위', source: 'test' },
  { key: 'breadth', label: '시장 폭', value: 72, unit: '%', threshold: 60, source: 'test' },
  { key: 'distribution', label: '분배일', value: 3, unit: 'days', threshold: 5, source: 'test' },
  { key: 'volatility', label: '변동성', value: 18, unit: 'level', threshold: 20, source: 'test' },
  { key: 'sectorRotation', label: '섹터', value: 'Risk-ON', unit: 'status', threshold: 'Growth > Value', source: 'test' },
];
const knownKeys = new Set(evidenceCatalog.map((item) => item.key));

const validPayload = {
  schemaVersion: '1',
  headline: '시장 흐름이 우호적입니다',
  stance: 'NORMAL',
  evidenceKeys: ['trend', 'breadth'],
  actionCode: 'SCAN_NORMALLY',
  commentary: '추세와 참여 폭이 함께 개선되어 선별적인 기회를 살필 수 있습니다.',
};

{
  const result = validateGroundedMarketInsight(validPayload, knownKeys);
  assert.deepEqual(result, validPayload);
}

{
  assert.throws(
    () => validateGroundedMarketInsight({ ...validPayload, commentary: '원달러 1502원은 위험합니다.' }, knownKeys),
    /must not contain numeric claims/,
  );
}

{
  assert.throws(
    () => validateGroundedMarketInsight({ ...validPayload, evidenceKeys: ['audJpy'] }, knownKeys),
    /unknown evidence key/,
  );
}

{
  assert.throws(
    () => validateGroundedMarketInsight({ ...validPayload, detail: 'schema drift' }, knownKeys),
    /schema mismatch/,
  );
}

{
  const parsed = parseGroundedInsightResponse(JSON.stringify(validPayload), evidenceCatalog);
  assert.equal(parsed.groundedInsight.actionCode, 'SCAN_NORMALLY');
  assert.deepEqual(parsed.selectedEvidence.map((item) => item.key), ['trend', 'breadth']);
  assert.match(parsed.text, /시장 폭: 72% \/ 기준 60/);
}

{
  const parsed = parseGroundedInsightResponse(JSON.stringify({
    ...validPayload,
    stance: 'CAUTIOUS',
    commentary: '시장 폭 72와 분배일 3을 함께 주의해야 합니다.',
  }), evidenceCatalog);
  assert.equal(parsed.groundedInsight.commentary, '상승 시도와 위험 신호를 함께 확인하며 검증된 기회만 신중하게 다룹니다.');
  assert.doesNotMatch(parsed.groundedInsight.commentary, /[0-9]/);
}

{
  const parsed = parseGroundedInsightResponse(JSON.stringify([validPayload]), evidenceCatalog);
  assert.equal(parsed.groundedInsight.headline, validPayload.headline);
}

{
  assert.throws(
    () => parseGroundedInsightResponse('시장 흐름은 좋습니다.', evidenceCatalog),
    /valid JSON object/,
  );
}

{
  const fallback = buildRuleBasedGroundedInsight('RED');
  const rendered = renderGroundedMarketInsight(fallback, evidenceCatalog);
  assert.equal(fallback.stance, 'DEFENSIVE');
  assert.equal(fallback.actionCode, 'PAUSE_NEW_BUYS');
  assert.match(rendered, /신규 매수를 멈추고/);
}

console.log('grounded market insight tests passed');
