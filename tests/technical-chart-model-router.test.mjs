import assert from 'node:assert/strict';
import { parseModelFallbacks, selectTechnicalChartModel, selectTechnicalChartModels } from '../scripts/lib/technical-chart-model-router.mjs';

assert.deepEqual(parseModelFallbacks(' qwen3:8b, qwen2.5:7b '), ['qwen3:8b', 'qwen2.5:7b']);
assert.deepEqual(selectTechnicalChartModel({
  installedModels: ['qwen2.5:7b', 'qwen3:14b'],
  preferredModel: 'qwen3:14b',
  fallbackModels: ['qwen3:8b', 'qwen2.5:7b'],
}), { model: 'qwen3:14b', tier: 'PRIMARY', disableThinking: true });
assert.deepEqual(selectTechnicalChartModel({
  installedModels: ['qwen2.5:7b'],
  preferredModel: 'qwen3:14b',
  fallbackModels: ['qwen3:8b', 'qwen2.5:7b'],
}), { model: 'qwen2.5:7b', tier: 'COMPATIBILITY_FALLBACK', disableThinking: false });
assert.equal(selectTechnicalChartModel({ installedModels: ['llama3.1:8b'] }), null);
assert.deepEqual(selectTechnicalChartModels({
  installedModels: ['qwen2.5:7b', 'qwen3:14b'],
  preferredModel: 'qwen3:14b',
  fallbackModels: ['qwen3:8b', 'qwen2.5:7b'],
}).map((route) => route.model), ['qwen3:14b', 'qwen2.5:7b']);
console.log('technical chart model router tests passed');
