import assert from 'node:assert/strict';

import {
  applyRecommendationRepeatCooldown,
  classifyRecommendationSafetyState,
  completePolicyCandidates,
  deliverCategoriesIndependently,
  resolveActiveRecommendationDecision,
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
  const cooldown = applyRecommendationRepeatCooldown({
    picks: [{ ticker: 'RECENT' }, { ticker: 'OLD' }, { ticker: 'NEW' }],
    recentRecommendations: [
      { ticker: 'RECENT', runDate: '2026-07-30' },
      { ticker: 'OLD', runDate: '2026-07-24' },
      { ticker: 'NEW', runDate: '2026-08-01' },
    ],
    runDate: '2026-08-01',
    cooldownDays: 7,
  });
  assert.equal(cooldown.cooldownDate, '2026-07-25');
  assert.deepEqual(cooldown.blockedTickers, ['RECENT']);
  assert.equal(cooldown.picks[0].allocationEligible, false);
  assert.equal(cooldown.picks[0].actionReason, 'RECENT_ACTIVE_REPEAT');
  assert.equal(cooldown.picks[1].allocationEligible, undefined);
}

{
  assert.deepEqual(classifyRecommendationSafetyState('RED', 'FULL'), {
    state: 'RED', quality: 'FULL', failClosed: true, reason: 'MARKET_STATE_RED',
  });
  assert.equal(classifyRecommendationSafetyState({ state: 'GREY' }, 'FULL').state, 'GRAY');
  assert.equal(classifyRecommendationSafetyState('GRAY', 'FULL').failClosed, true);
  assert.equal(classifyRecommendationSafetyState(null, 'FULL').state, 'MISSING');
  assert.equal(classifyRecommendationSafetyState({ state: 'GREEN' }, 'MISSING').state, 'MISSING');
  assert.equal(classifyRecommendationSafetyState({ state: 'GREEN' }, 'FULL').failClosed, false);
  assert.equal(classifyRecommendationSafetyState('YELLOW', 'FULL').failClosed, false);

  const actionableGate = {
    disposition: 'ACTIONABLE',
    verdict: 'BUY',
    setupGrade: 'A',
    readiness: 'ACTIONABLE',
    eligible: true,
    fundamentalVerification: 'VERIFIED',
  };
  const watchGate = {
    disposition: 'WATCHLIST', verdict: 'WATCH', readiness: 'NEAR_TRIGGER', eligible: true,
  };
  const fivePicks = Array.from({ length: 5 }, (_, index) => ({ ticker: `PICK${index + 1}`, chartGate: actionableGate }));
  const partial = resolveActiveRecommendationDecision({
    picks: fivePicks,
    category: 'KOSPI200',
    marketState: 'GREEN',
    marketStateQuality: 'FULL',
  });
  assert.equal(partial.status, 'ACTIVE');
  assert.equal(partial.activeCount, 5);
  assert.equal(partial.watchlistCount, 0);
  assert.equal(partial.cashWeight, 0.5);
  assert.equal(partial.cashWeightPct, 50);
  assert.equal(partial.reason, 'PARTIAL_ALLOCATION');
  assert.equal(partial.picks.every((pick) => pick.actionState === 'ACTIVE'), true);

  const capped = resolveActiveRecommendationDecision({
    picks: Array.from({ length: 12 }, (_, index) => ({ ticker: `CAP${index + 1}`, chartGate: actionableGate })),
    category: 'KOSPI200',
    marketState: 'GREEN',
    marketStateQuality: 'FULL',
  });
  assert.equal(capped.activeCount, 10);
  assert.equal(capped.cashWeightPct, 0);

  const red = resolveActiveRecommendationDecision({ picks: fivePicks, marketState: { state: 'RED' }, marketStateQuality: 'FULL' });
  assert.equal(red.status, 'NO_TRADE');
  assert.equal(red.activeCount, 0);
  assert.equal(red.cashWeightPct, 100);
  assert.equal(red.reason, 'MARKET_STATE_RED');

  const missing = resolveActiveRecommendationDecision({ picks: fivePicks, marketState: null, marketStateQuality: 'MISSING' });
  assert.equal(missing.status, 'NO_TRADE');
  assert.equal(missing.safetyState, 'MISSING');
  assert.equal(missing.cashWeightPct, 100);

  const mixed = resolveActiveRecommendationDecision({
    picks: [fivePicks[0], { ticker: 'WATCH', chartGate: watchGate }],
    category: 'KOSPI200',
    marketState: 'GREEN',
    marketStateQuality: 'FULL',
  });
  assert.equal(mixed.activeCount, 1);
  assert.equal(mixed.watchlistCount, 1);
  assert.equal(mixed.picks[1].actionState, 'WATCHLIST');
  assert.equal(mixed.picks[1].actionReason, 'CHART_GATE_NOT_ACTIONABLE');

  const repeated = resolveActiveRecommendationDecision({
    picks: [{ ...fivePicks[0], allocationEligible: false, actionReason: 'RECENT_ACTIVE_REPEAT' }],
    category: 'KOSPI200',
    marketState: 'GREEN',
    marketStateQuality: 'FULL',
  });
  assert.equal(repeated.activeCount, 0);
  assert.equal(repeated.picks[0].actionReason, 'RECENT_ACTIVE_REPEAT');

  const weakSetup = resolveActiveRecommendationDecision({
    picks: [{ ticker: 'WEAK', chartGate: { ...actionableGate, setupGrade: 'B' } }],
    category: 'KOSPI200',
    marketState: 'GREEN',
    marketStateQuality: 'FULL',
  });
  assert.equal(weakSetup.activeCount, 0);

  const unverifiedFundamental = resolveActiveRecommendationDecision({
    picks: [{
      ticker: 'UNVERIFIED',
      chartGate: { ...actionableGate, fundamentalVerification: 'UNVERIFIED' },
    }],
    category: 'KOSPI200',
    marketState: 'GREEN',
    marketStateQuality: 'FULL',
  });
  assert.equal(unverifiedFundamental.activeCount, 0);

  const yellowUs = resolveActiveRecommendationDecision({
    picks: fivePicks,
    category: 'NASDAQ100',
    marketState: 'YELLOW',
    marketStateQuality: 'FULL',
  });
  assert.equal(yellowUs.activeCount, 3);
  assert.equal(yellowUs.cashWeight, 0.7);

  const yellowKr = resolveActiveRecommendationDecision({
    picks: fivePicks,
    category: 'KOSPI200',
    marketState: 'YELLOW',
    marketStateQuality: 'FULL',
  });
  assert.equal(yellowKr.activeCount, 2);

  const greenNasdaq = resolveActiveRecommendationDecision({
    picks: fivePicks,
    category: 'NASDAQ100',
    marketState: 'GREEN',
    marketStateQuality: 'FULL',
  });
  assert.equal(greenNasdaq.activeCount, 3);

  const rankCutoff = resolveActiveRecommendationDecision({
    picks: [
      { ...fivePicks[0], allocationEligible: false, actionReason: 'RECENT_ACTIVE_REPEAT' },
      ...fivePicks.slice(1),
    ],
    category: 'NASDAQ100',
    marketState: 'GREEN',
    marketStateQuality: 'FULL',
  });
  assert.equal(rankCutoff.activeCount, 2, 'rank 4+ must not replace a blocked US top-three slot');
  assert.equal(rankCutoff.picks[3].actionState, 'WATCHLIST');
  assert.equal(rankCutoff.picks[3].actionReason, 'CATEGORY_ACTIVE_CAP');

  const greenKosdaq = resolveActiveRecommendationDecision({
    picks: fivePicks,
    category: 'KOSDAQ150',
    marketState: 'GREEN',
    marketStateQuality: 'FULL',
  });
  assert.equal(greenKosdaq.activeCount, 3);

  for (const runDate of ['2026-07-21', '2026-07-22', '2026-07-23']) {
    const replay = resolveActiveRecommendationDecision({
      picks: Array.from({ length: 10 }, (_, index) => ({
        ticker: `${runDate}-${index}`,
        chartGate: actionableGate,
      })),
      category: 'KOSDAQ150',
      marketState: 'RED',
      marketStateQuality: 'FULL',
    });
    assert.equal(replay.activeCount, 0, `${runDate} RED replay must not activate a KOSDAQ pick`);
    assert.equal(replay.cashWeightPct, 100);
    assert.equal(replay.picks.every((pick) => pick.actionState === 'WATCHLIST'), true);
  }
}

{
  const selected = Array.from({ length: 5 }, (_, index) => ({ rank: index + 1, ticker: `SEL${index + 1}` }));
  const base = [
    selected[0],
    ...Array.from({ length: 9 }, (_, index) => ({ rank: index + 2, ticker: `BASE${index + 1}` })),
  ];
  const completed = completePolicyCandidates({ selectedPicks: selected, basePicks: base });
  assert.equal(completed.complete, true);
  assert.equal(completed.picks.length, 10);
  assert.equal(completed.selectedCount, 5);
  assert.equal(completed.watchlistCount, 5);
  assert.equal(completed.missingCount, 0);
  assert.deepEqual(completed.picks.map((pick) => pick.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(completed.picks.slice(0, 5).every((pick) => pick.allocationEligible && !pick.forcedWatchlist), true);
  assert.equal(completed.picks.slice(5).every((pick) => !pick.allocationEligible && pick.forcedWatchlist), true);

  const allocation = resolveActiveRecommendationDecision({
    picks: completed.picks.map((pick) => ({
      ...pick,
      chartGate: {
        disposition: 'ACTIONABLE',
        verdict: 'BUY',
        setupGrade: 'A',
        readiness: 'ACTIONABLE',
        eligible: true,
        fundamentalVerification: 'PARTIAL',
      },
    })),
    category: 'KOSPI200',
    marketState: 'GREEN',
    marketStateQuality: 'FULL',
  });
  assert.equal(allocation.activeCount, 5);
  assert.equal(allocation.watchlistCount, 5);
  assert.equal(allocation.cashWeight, 0.5);
  assert.equal(allocation.picks.slice(5).every((pick) => pick.actionReason === 'POLICY_WATCHLIST_BACKFILL'), true);
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

  assert.equal(result.effectiveEngineVersion, 'risk-v1');
  assert.equal(result.status, 'NO_TRADE');
  assert.equal(result.noTrade, true);
  assert.equal(result.activeCount, 0);
  assert.equal(result.cashWeightPct, 100);
  assert.equal(result.decision.reason, 'REQUESTED_POLICY_UNAVAILABLE');
  assert.equal(result.requestedPolicyAvailable, false);
  assert.equal(result.policies.find((policy) => policy.engineVersion === 'base-v1')?.isOfficial, false);
  assert.equal(result.policies.find((policy) => policy.engineVersion === 'risk-v1')?.isOfficial, true);
  assert.equal(result.policies.find((policy) => policy.engineVersion === 'risk-v1')?.picks.length, 1);
  assert.equal(result.policies.find((policy) => policy.engineVersion === 'risk-v1')?.picks[0].forcedWatchlist, true);
  assert.equal(result.policies.find((policy) => policy.engineVersion === 'risk-v1')?.picks[0].actionState, 'WATCHLIST');
  assert.equal(result.policies.find((policy) => policy.engineVersion === 'flow-v1')?.isOfficial, false);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].message, /received 5/);
}

{
  const legacyFallback = resolveRecommendationPolicies({
    basePolicy: { engineVersion: 'base-v1', picks: [{ ticker: 'BASE' }], ranked: null },
    requestedEngineVersion: 'risk-v1',
    failClosedOnRequestedPolicyFailure: false,
    optionalPolicies: [{ engineVersion: 'risk-v1', build: () => { throw new Error('unavailable'); } }],
  });
  assert.equal(legacyFallback.effectiveEngineVersion, 'base-v1');
  assert.equal(legacyFallback.noTrade, false);
  assert.equal(legacyFallback.activeCount, 1);
  assert.equal(legacyFallback.cashWeightPct, 90);
  assert.equal(legacyFallback.policies.find((policy) => policy.engineVersion === 'base-v1')?.isOfficial, true);
}

{
  const riskPicks = Array.from({ length: 5 }, (_, index) => ({ ticker: `RISK${index + 1}` }));
  const active = resolveRecommendationPolicies({
    basePolicy: { engineVersion: 'base-v1', picks: [{ ticker: 'BASE' }], ranked: null },
    requestedEngineVersion: 'risk-v1',
    optionalPolicies: [{
      engineVersion: 'risk-v1',
      build: () => ({ picks: riskPicks, ranked: riskPicks.map((pick) => ({ pick })) }),
    }],
    category: 'KOSPI200',
    marketState: 'GREEN',
    marketStateQuality: 'FULL',
  });
  const activeOfficial = active.policies.find((policy) => policy.isOfficial);
  assert.equal(active.status, 'ACTIVE');
  assert.equal(active.activeCount, 5);
  assert.equal(active.cashWeightPct, 50);
  assert.deepEqual(activeOfficial.picks.slice(0, 5).map((pick) => pick.ticker), riskPicks.map((pick) => pick.ticker));
  assert.equal(activeOfficial.picks.length, 6);
  assert.equal(activeOfficial.picks[5].ticker, 'BASE');
  assert.equal(activeOfficial.picks.slice(0, 5).every((pick) => pick.actionState === 'ACTIVE'), true);
  assert.equal(activeOfficial.picks[5].actionState, 'WATCHLIST');
  assert.equal(activeOfficial.picks[5].forcedWatchlist, true);
  assert.equal(activeOfficial.ranked.length, 5);

  const blocked = resolveRecommendationPolicies({
    basePolicy: { engineVersion: 'base-v1', picks: [{ ticker: 'BASE' }], ranked: null },
    requestedEngineVersion: 'risk-v1',
    optionalPolicies: [{
      engineVersion: 'risk-v1',
      build: () => ({ picks: riskPicks, ranked: riskPicks.map((pick) => ({ pick })) }),
    }],
    marketState: { state: 'GREY' },
    marketStateQuality: 'FULL',
  });
  const blockedOfficial = blocked.policies.find((policy) => policy.isOfficial);
  assert.equal(blocked.status, 'NO_TRADE');
  assert.equal(blocked.cashWeightPct, 100);
  assert.equal(blocked.decision.safetyState, 'GRAY');
  assert.equal(blockedOfficial.picks.length, 6);
  assert.equal(blockedOfficial.picks.every((pick) => pick.actionState === 'WATCHLIST'), true);
  assert.equal(blockedOfficial.candidatePicks.length, 5);
  assert.equal(blockedOfficial.ranked.length, 5);
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
