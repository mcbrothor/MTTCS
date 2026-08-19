import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const routeFiles = [
  '../app/api/market-breadth/route.ts',
  '../app/api/investor-flow/oscillator/route.ts',
  '../app/api/portfolio/allocation/route.ts',
  '../app/api/market-sentiment/route.ts',
];

test('investment-management GET APIs are authenticated and return model snapshots', async () => {
  for (const relative of routeFiles) {
    const source = await readFile(new URL(relative, import.meta.url), 'utf8');
    assert.match(source, /withAdminSession/);
    assert.match(source, /apiSuccess\(snapshot|apiSuccess\(recommendation/);
  }
});

test('scanner routes attach turnover intensity and persistence uses an idempotent key', async () => {
  for (const relative of ['../app/api/scanner/leader/route.ts', '../app/api/scanner/momentum/route.ts']) {
    const source = await readFile(new URL(relative, import.meta.url), 'utf8');
    assert.match(source, /calculateTurnoverIntensity/);
    assert.match(source, /ticker,exchange,as_of,model_version/);
  }
});

test('market sentiment route does not substitute neutral values for missing data', async () => {
  const source = await readFile(new URL('../lib/market-sentiment/model.ts', import.meta.url), 'utf8');
  assert.match(source, /quality: 'BLOCKED'/);
  assert.doesNotMatch(source, /putCall:\s*50|vkospi:\s*50|bondSpread:\s*50/);
});
