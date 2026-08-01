import assert from 'node:assert/strict';

import {
  deliverCategoriesIndependently,
  resolveMacroSnapshotForRecommendation,
  resolveRecommendationPolicies,
} from '../scripts/lib/daily-recommendation-worker-utils.mjs';

{
  const valid = resolveMacroSnapshotForRecommendation({
    calc_date: '2026-07-23',
    macro_score: 80,
    regime: 'RISK_ON',
    raw_json: { quality: { status: 'VALID' } },
  }, '2026-07-23');
  assert.equal(valid.macroQuality, 'FULL');
  assert.equal(valid.macro?.macro_score, 80);
  assert.equal('raw_json' in valid.macro, false);

  const degraded = resolveMacroSnapshotForRecommendation({
    calc_date: '2026-07-23',
    macro_score: 68,
    regime: 'NEUTRAL',
    raw_json: { quality: { status: 'DEGRADED' } },
  }, '2026-07-23');
  assert.equal(degraded.macroQuality, 'DEGRADED');
  assert.equal(degraded.macro?.macro_score, 68);

  const blocked = resolveMacroSnapshotForRecommendation({
    calc_date: '2026-07-23',
    macro_score: 50,
    regime: 'NEUTRAL',
    raw_json: { quality: { status: 'BLOCKED' } },
  }, '2026-07-23');
  assert.equal(blocked.macroQuality, 'BLOCKED');
  assert.equal(blocked.macro, null);

  const legacyUnknown = resolveMacroSnapshotForRecommendation({
    calc_date: '2026-07-23',
    macro_score: 50,
    regime: 'NEUTRAL',
    raw_json: { breakdown: [] },
  }, '2026-07-23');
  assert.equal(legacyUnknown.macroQuality, 'MISSING');
  assert.equal(legacyUnknown.macro, null);

  const stale = resolveMacroSnapshotForRecommendation({
    calc_date: '2026-07-19',
    macro_score: 80,
    regime: 'RISK_ON',
    raw_json: { quality: { status: 'VALID' } },
  }, '2026-07-23');
  assert.equal(stale.macroQuality, 'STALE');
  assert.equal(stale.macro, null);
}

{
  const result = resolveRecommendationPolicies({
    basePolicy: { engineVersion: 'base-v1', picks: [{ ticker: 'BASE' }], ranked: null },
    requestedEngineVersion: 'risk-v1',
    optionalPolicies: [
      {
        engineVersion: 'risk-v1',
        build: () => {
          throw new Error('requires 10 eligible picks; received 5');
        },
      },
      {
        engineVersion: 'flow-v1',
        build: () => ({ picks: [{ ticker: 'FLOW' }], ranked: [{ pick: { ticker: 'FLOW' } }] }),
      },
    ],
  });

  assert.equal(result.effectiveEngineVersion, 'base-v1');
  assert.equal(result.policies.find((policy) => policy.engineVersion === 'base-v1')?.isOfficial, true);
  assert.equal(result.policies.find((policy) => policy.engineVersion === 'flow-v1')?.isOfficial, false);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].message, /received 5/);
}

{
  const statuses = [];
  const attempted = [];
  const deliveryContexts = [];
  const publications = new Map([
    ['NASDAQ100', { id: 'pub-us-1' }],
    ['SP500', { id: 'pub-us-2' }],
    ['KOSPI200', { id: 'pub-kr-1' }],
    ['KOSDAQ150', { id: 'pub-kr-2', telegram_status: 'SENT' }],
  ]);

  const result = await deliverCategoriesIndependently({
    categories: ['NASDAQ100', 'SP500', 'KOSPI200', 'KOSDAQ150'],
    publicationByCategory: publications,
    picksByCategory: {
      NASDAQ100: [{ ticker: 'AAPL' }],
      SP500: [{ ticker: 'MSFT' }],
      KOSPI200: [{ ticker: '005930' }],
      KOSDAQ150: [{ ticker: '196170' }],
    },
    formatMessage: ({ category }) => category,
    sendMessage: async (message, context) => {
      attempted.push(message);
      deliveryContexts.push(context);
      if (message === 'NASDAQ100') throw new Error('telegram unavailable');
      return { skipped: false };
    },
    markStatus: async (publicationId, status) => {
      statuses.push([publicationId, status]);
    },
  });

  assert.deepEqual(attempted, ['NASDAQ100', 'SP500', 'KOSPI200']);
  assert.deepEqual(deliveryContexts.map((context) => context.publicationId), ['pub-us-1', 'pub-us-2', 'pub-kr-1']);
  assert.deepEqual(statuses, [
    ['pub-us-1', 'FAILED'],
    ['pub-us-2', 'SENT'],
    ['pub-kr-1', 'SENT'],
  ]);
  assert.equal(result.failures.length, 1);
  assert.deepEqual(result.sentCategories, ['SP500', 'KOSPI200']);
  assert.deepEqual(result.alreadySentCategories, ['KOSDAQ150']);
}

{
  const postDeliveryCalls = [];
  const statuses = [];
  const result = await deliverCategoriesIndependently({
    categories: ['NASDAQ100', 'SP500', 'KOSPI200', 'KOSDAQ150'],
    publicationByCategory: new Map([
      ['NASDAQ100', { id: 'pub-1' }],
      ['SP500', { id: 'pub-2' }],
      ['KOSPI200', { id: 'pub-3', telegram_status: 'SENT' }],
      ['KOSDAQ150', { id: 'pub-4' }],
    ]),
    picksByCategory: Object.fromEntries(['NASDAQ100', 'SP500', 'KOSPI200', 'KOSDAQ150']
      .map((category) => [category, [{ ticker: category }]])),
    formatMessage: ({ category }) => category,
    sendMessage: async (message) => ({ skipped: message === 'SP500' }),
    markStatus: async (publicationId, status) => statuses.push([publicationId, status]),
    afterSent: async ({ category }) => {
      postDeliveryCalls.push(category);
      if (category === 'KOSDAQ150') throw new Error('chart delivery failed');
    },
  });

  assert.deepEqual(postDeliveryCalls, ['NASDAQ100', 'KOSDAQ150']);
  assert.deepEqual(statuses, [
    ['pub-1', 'SENT'],
    ['pub-2', 'SKIPPED'],
    ['pub-4', 'SENT'],
  ]);
  assert.deepEqual(result.sentCategories, ['NASDAQ100', 'KOSDAQ150']);
  assert.deepEqual(result.skippedCategories, ['SP500']);
  assert.deepEqual(result.alreadySentCategories, ['KOSPI200']);
  assert.deepEqual(result.postDeliveryFailures, [{ category: 'KOSDAQ150', message: 'chart delivery failed' }]);
}

{
  const statuses = [];
  const uncertain = new Error('response lost after upload');
  uncertain.deliveryUncertain = true;
  const result = await deliverCategoriesIndependently({
    categories: ['NASDAQ100'],
    publicationByCategory: new Map([['NASDAQ100', { id: 'pub-uncertain' }]]),
    picksByCategory: { NASDAQ100: [{ ticker: 'AAPL' }] },
    formatMessage: () => 'NASDAQ100',
    sendMessage: async () => { throw uncertain; },
    markStatus: async (publicationId, status) => statuses.push([publicationId, status]),
  });
  assert.deepEqual(statuses, [['pub-uncertain', 'SKIPPED']]);
  assert.equal(result.failures.length, 1);
}

console.log('daily recommendation worker utils tests passed');
