import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { settleModelInsightsUntilFirstSuccess } from '../lib/ai/gemini.ts';

function insight(overrides) {
  return {
    id: `${overrides.priority}-${overrides.label}`,
    provider: overrides.provider ?? 'gemini',
    label: overrides.label,
    model: overrides.model ?? overrides.label,
    status: overrides.status,
    text: overrides.text,
    message: overrides.message,
    selected: false,
    priority: overrides.priority,
    generatedAt: new Date().toISOString(),
  };
}

function delayedInsight(delayMs, payload) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(insight(payload)), delayMs);
  });
}

{
  const startedAt = performance.now();
  const result = await settleModelInsightsUntilFirstSuccess([
    delayedInsight(20, {
      label: 'gemini-primary',
      model: 'gemini-2.5-flash',
      status: 'success',
      text: 'LLM briefing',
      priority: 0,
    }),
    delayedInsight(250, {
      provider: 'local-llm',
      label: 'local-llm',
      model: 'qwen',
      status: 'failed',
      message: 'Local LLM timed out',
      priority: 4,
    }),
  ]);

  const elapsedMs = performance.now() - startedAt;
  assert.equal(result.selected?.label, 'gemini-primary');
  assert.equal(result.selected?.text, 'LLM briefing');
  assert.ok(elapsedMs < 120, `first success should return before slow providers finish; elapsed=${elapsedMs}`);
  assert.deepEqual(result.modelInsights.map((item) => item.label), ['gemini-primary']);
}

{
  const result = await settleModelInsightsUntilFirstSuccess([
    delayedInsight(5, {
      provider: 'groq',
      label: 'groq',
      status: 'failed',
      message: '429',
      priority: 2,
    }),
    delayedInsight(10, {
      provider: 'cerebras',
      label: 'cerebras',
      status: 'skipped',
      message: 'missing key',
      priority: 3,
    }),
  ]);

  assert.equal(result.selected, null);
  assert.deepEqual(result.modelInsights.map((item) => item.status), ['failed', 'skipped']);
}

console.log('market insight router tests passed');
