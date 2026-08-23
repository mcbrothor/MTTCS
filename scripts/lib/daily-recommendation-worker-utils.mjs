function compactError(error) {
  return error instanceof Error ? error.message : String(error);
}

const ACTIVE_RECOMMENDATION_CAPACITY = 10;
const FAIL_CLOSED_MARKET_STATES = new Set(['RED', 'GRAY', 'MISSING']);
const UNUSABLE_MARKET_STATE_QUALITIES = new Set(['MISSING', 'STALE', 'BLOCKED', 'UNVERIFIED']);
// Wave3: RED/YELLOW에서 현금 비중 확대 — KOSDAQ 꼬리 리스크(-14.57%p) 대응
// Weekly replay: US alpha rank 1-3 집중, KOSDAQ 꼬리 심각 → GREEN도 KOSDAQ 3 유지하되 YELLOW/RED는 축소
const ACTIVE_CAP_BY_STATE_CATEGORY = Object.freeze({
  GREEN: Object.freeze({ NASDAQ100: 3, SP500: 3, KOSPI200: 10, KOSDAQ150: 3, US: 3, KR: 3 }),
  YELLOW: Object.freeze({ NASDAQ100: 2, SP500: 2, KOSPI200: 1, KOSDAQ150: 1, US: 2, KR: 1 }),
  RED: Object.freeze({ NASDAQ100: 0, SP500: 0, KOSPI200: 0, KOSDAQ150: 0, US: 0, KR: 0 }),
});

function normalizedMarketStateValue(value) {
  const raw = typeof value === 'string'
    ? value
    : value && typeof value === 'object' && typeof value.state === 'string'
      ? value.state
      : '';
  const normalized = raw.trim().toUpperCase();
  if (normalized === 'GREY' || normalized === 'GRAY') return 'GRAY';
  if (normalized === 'GREEN' || normalized === 'YELLOW' || normalized === 'RED') return normalized;
  return 'MISSING';
}

export function classifyRecommendationSafetyState(marketState, marketStateQuality) {
  const quality = String(marketStateQuality || '').trim().toUpperCase();
  const state = UNUSABLE_MARKET_STATE_QUALITIES.has(quality)
    ? 'MISSING'
    : normalizedMarketStateValue(marketState);
  const failClosed = FAIL_CLOSED_MARKET_STATES.has(state);
  return {
    state,
    quality: quality || null,
    failClosed,
    reason: failClosed ? `MARKET_STATE_${state}` : null,
  };
}

function marketForRecommendationCategory(category, explicitMarket) {
  if (explicitMarket === 'US' || explicitMarket === 'KR') return explicitMarket;
  if (category === 'NASDAQ100' || category === 'SP500') return 'US';
  if (category === 'KOSPI200' || category === 'KOSDAQ150') return 'KR';
  return null;
}

function activeCapForRecommendation({ category, market, safetyState, maxActivePicks }) {
  if (FAIL_CLOSED_MARKET_STATES.has(safetyState)) return 0;
  const configuredCap = ACTIVE_CAP_BY_STATE_CATEGORY[safetyState]?.[category]
    ?? ACTIVE_CAP_BY_STATE_CATEGORY[safetyState]?.[market];
  if (Number.isFinite(configuredCap)) return Math.min(maxActivePicks, configuredCap);
  return maxActivePicks;
}

function recommendationChartGate(pick) {
  return pick?.chartGate
    || pick?.chart_gate
    || pick?.candidateSnapshot?.chart_gate
    || pick?.candidate_snapshot?.chart_gate
    || null;
}

function isActionableRecommendationPick(pick) {
  const gate = recommendationChartGate(pick);
  return Boolean(
    gate
    && gate.eligible === true
    && gate.disposition === 'ACTIONABLE'
    && gate.verdict === 'BUY'
    && gate.setupGrade === 'A'
    && gate.readiness === 'ACTIONABLE'
    && (gate.fundamentalVerification === 'VERIFIED' || gate.fundamentalVerification === 'PARTIAL'),
  );
}

export function completePolicyCandidates({
  selectedPicks = [],
  basePicks = [],
  requiredCount = ACTIVE_RECOMMENDATION_CAPACITY,
} = {}) {
  const normalizedRequiredCount = Number.isFinite(Number(requiredCount))
    ? Math.min(ACTIVE_RECOMMENDATION_CAPACITY, Math.max(0, Math.floor(Number(requiredCount))))
    : ACTIVE_RECOMMENDATION_CAPACITY;
  const seen = new Set();
  const completed = [];
  const add = (pick, allocationEligible) => {
    const ticker = typeof pick?.ticker === 'string' ? pick.ticker.trim().toUpperCase() : '';
    if (!ticker || seen.has(ticker) || completed.length >= normalizedRequiredCount) return;
    seen.add(ticker);
    completed.push({
      ...pick,
      ticker,
      allocationEligible,
      forcedWatchlist: !allocationEligible,
      ...(allocationEligible ? {} : {
        actionState: 'WATCHLIST',
        actionReason: 'POLICY_WATCHLIST_BACKFILL',
      }),
    });
  };

  for (const pick of Array.isArray(selectedPicks) ? selectedPicks : []) add(pick, true);
  const selectedCount = completed.length;
  for (const pick of Array.isArray(basePicks) ? basePicks : []) add(pick, false);
  const picks = completed.map((pick, index) => ({ ...pick, rank: index + 1 }));
  const watchlistCount = picks.filter((pick) => pick.forcedWatchlist).length;
  return {
    picks,
    selectedCount,
    watchlistCount,
    requiredCount: normalizedRequiredCount,
    missingCount: Math.max(0, normalizedRequiredCount - picks.length),
    complete: picks.length === normalizedRequiredCount,
  };
}

export function applyRecommendationRepeatCooldown({
  picks = [],
  recentRecommendations = [],
  runDate,
  cooldownDays = 7,
} = {}) {
  if (typeof runDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(runDate)) {
    return { picks: [...picks], cooldownDate: null, blockedTickers: [] };
  }
  const normalizedDays = Number.isFinite(Number(cooldownDays))
    ? Math.min(30, Math.max(1, Math.floor(Number(cooldownDays))))
    : 7;
  const cutoff = new Date(`${runDate}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - normalizedDays);
  const cooldownDate = cutoff.toISOString().slice(0, 10);
  const recentlyActiveTickers = new Set(recentRecommendations
    .filter((row) => row?.runDate >= cooldownDate && row.runDate < runDate)
    .map((row) => row?.ticker)
    .filter(Boolean));
  const blockedTickers = [];
  const cooledPicks = picks.map((pick) => {
    if (!recentlyActiveTickers.has(pick?.ticker) || pick?.allocationEligible === false) return pick;
    blockedTickers.push(pick.ticker);
    return { ...pick, allocationEligible: false, actionReason: 'RECENT_ACTIVE_REPEAT' };
  });
  return { picks: cooledPicks, cooldownDate, blockedTickers };
}

export function resolveActiveRecommendationDecision(input = {}) {
  const picks = Array.isArray(input.picks) ? input.picks : [];
  const requestedMaximum = Number(input.maxActivePicks ?? ACTIVE_RECOMMENDATION_CAPACITY);
  const maxActivePicks = Number.isFinite(requestedMaximum)
    ? Math.min(ACTIVE_RECOMMENDATION_CAPACITY, Math.max(0, Math.floor(requestedMaximum)))
    : ACTIVE_RECOMMENDATION_CAPACITY;
  const hasMarketState = Object.prototype.hasOwnProperty.call(input, 'marketState')
    || Object.prototype.hasOwnProperty.call(input, 'marketStateQuality');
  const safety = hasMarketState
    ? classifyRecommendationSafetyState(input.marketState, input.marketStateQuality)
    : { state: 'UNASSESSED', quality: null, failClosed: false, reason: null };
  const market = marketForRecommendationCategory(input.category, input.market);
  const activeCap = activeCapForRecommendation({
    category: input.category,
    market,
    safetyState: safety.state,
    maxActivePicks,
  });
  const requireActionable = input.requireActionable !== false;
  const forcedReason = typeof input.forceNoTradeReason === 'string' && input.forceNoTradeReason.trim()
    ? input.forceNoTradeReason.trim()
    : null;
  const failClosed = safety.failClosed || Boolean(forcedReason);
  const decidedPicks = picks.map((pick, index) => {
    const actionable = !requireActionable || isActionableRecommendationPick(pick);
    const allocationEligible = pick?.allocationEligible !== false;
    const active = !failClosed && allocationEligible && actionable && index < activeCap;
    const actionReason = active
      ? null
      : forcedReason
        || safety.reason
        || (!allocationEligible
          ? pick.actionReason || 'POLICY_WATCHLIST_BACKFILL'
          : !actionable ? 'CHART_GATE_NOT_ACTIONABLE' : 'CATEGORY_ACTIVE_CAP');
    return {
      ...pick,
      actionState: active ? 'ACTIVE' : 'WATCHLIST',
      actionReason,
    };
  });
  const activePicks = decidedPicks.filter((pick) => pick.actionState === 'ACTIVE');
  const watchlistPicks = decidedPicks.filter((pick) => pick.actionState === 'WATCHLIST');
  const activeCount = activePicks.length;
  const cashWeightPct = Math.max(0, Math.min(
    100,
    ((ACTIVE_RECOMMENDATION_CAPACITY - activeCount) / ACTIVE_RECOMMENDATION_CAPACITY) * 100,
  ));
  const actionableCount = picks.filter((pick) => (
    pick?.allocationEligible !== false && (!requireActionable || isActionableRecommendationPick(pick))
  )).length;
  const reason = forcedReason
    || safety.reason
    || (activeCount === 0
      ? requireActionable ? 'NO_ACTIONABLE_PICKS' : 'NO_ELIGIBLE_PICKS'
      : activeCount < actionableCount ? 'CATEGORY_ACTIVE_CAP' : activeCount < ACTIVE_RECOMMENDATION_CAPACITY ? 'PARTIAL_ALLOCATION' : null);

  return {
    status: activeCount > 0 ? 'ACTIVE' : 'NO_TRADE',
    picks: decidedPicks,
    activePicks,
    watchlistPicks,
    activeCount,
    watchlistCount: watchlistPicks.length,
    actionableCount,
    activeCap,
    cashWeight: cashWeightPct / 100,
    cashWeightPct,
    maxActivePicks,
    safetyState: safety.state,
    safetyQuality: safety.quality,
    failClosed,
    reason,
  };
}

export function isTradingSession(tradeDates, runDate) {
  return Array.isArray(tradeDates) && tradeDates.some((tradeDate) => tradeDate === runDate);
}

export function resolveMacroSnapshotForRecommendation(snapshot, runDate, maxAgeDays = 3) {
  if (!snapshot) return { macro: null, macroQuality: 'MISSING' };
  const runAt = Date.parse(`${runDate}T00:00:00Z`);
  const snapshotAt = Date.parse(`${snapshot.calc_date || ''}T00:00:00Z`);
  const ageDays = Math.floor((runAt - snapshotAt) / 86_400_000);
  if (!Number.isFinite(ageDays) || ageDays < 0 || ageDays > maxAgeDays) {
    return { macro: null, macroQuality: 'STALE' };
  }

  const decisionStatus = snapshot.raw_json?.quality?.status;
  const macro = { ...snapshot };
  delete macro.raw_json;
  if (decisionStatus === 'VALID') return { macro, macroQuality: 'FULL' };
  if (decisionStatus === 'DEGRADED') return { macro, macroQuality: 'DEGRADED' };
  if (decisionStatus === 'BLOCKED') return { macro: null, macroQuality: 'BLOCKED' };
  return { macro: null, macroQuality: 'MISSING' };
}

export function resolveRecommendationPolicies(input) {
  const {
    basePolicy,
    requestedEngineVersion: requestedVersion,
    optionalPolicies = [],
    failClosedOnRequestedPolicyFailure = true,
    maxActivePicks = ACTIVE_RECOMMENDATION_CAPACITY,
  } = input;
  const requestedEngineVersion = requestedVersion || basePolicy.engineVersion;
  const policies = [{ ...basePolicy }];
  const failures = [];

  for (const optionalPolicy of optionalPolicies) {
    try {
      policies.push({
        engineVersion: optionalPolicy.engineVersion,
        ...optionalPolicy.build(),
      });
    } catch (error) {
      failures.push({
        engineVersion: optionalPolicy.engineVersion,
        message: compactError(error),
      });
    }
  }

  const requestedPolicy = policies.find((policy) => policy.engineVersion === requestedEngineVersion);
  const requestedPolicyUnavailable = requestedEngineVersion !== basePolicy.engineVersion && !requestedPolicy;
  const failClosed = failClosedOnRequestedPolicyFailure && requestedPolicyUnavailable;
  const effectiveEngineVersion = failClosed || requestedPolicy
    ? requestedEngineVersion
    : basePolicy.engineVersion;
  const selectedPolicy = requestedPolicy || (failClosed ? null : policies[0]);
  const completedPolicy = completePolicyCandidates({
    selectedPicks: selectedPolicy?.picks || [],
    basePicks: basePolicy.picks || [],
    requiredCount: ACTIVE_RECOMMENDATION_CAPACITY,
  });
  const hasMarketState = Object.prototype.hasOwnProperty.call(input, 'marketState')
    || Object.prototype.hasOwnProperty.call(input, 'marketStateQuality');
  const decision = resolveActiveRecommendationDecision({
    picks: completedPolicy.picks,
    maxActivePicks,
    category: input.category,
    market: input.market,
    requireActionable: input.requireActionable === true,
    ...(hasMarketState ? {
      marketState: input.marketState,
      marketStateQuality: input.marketStateQuality,
    } : {}),
    ...(failClosed ? { forceNoTradeReason: 'REQUESTED_POLICY_UNAVAILABLE' } : {}),
  });
  const selectedPolicyWithDecision = selectedPolicy
    ? {
      ...selectedPolicy,
      candidatePicks: selectedPolicy.picks || [],
      picks: decision.picks,
      ranked: selectedPolicy.ranked,
      candidateCompletion: completedPolicy,
      recommendationDecision: decision,
    }
    : {
      engineVersion: requestedEngineVersion,
      picks: decision.picks,
      candidatePicks: [],
      ranked: [],
      candidateCompletion: completedPolicy,
      noTrade: true,
      recommendationDecision: decision,
    };
  const resolvedPolicies = policies
    .filter((policy) => policy !== selectedPolicy)
    .map((policy) => ({ ...policy, isOfficial: false }));
  resolvedPolicies.push({
    ...selectedPolicyWithDecision,
    isOfficial: true,
    noTrade: decision.status === 'NO_TRADE',
  });

  return {
    effectiveEngineVersion,
    failures,
    policies: resolvedPolicies,
    status: decision.status,
    noTrade: decision.status === 'NO_TRADE',
    activePicks: decision.activePicks,
    activeCount: decision.activeCount,
    watchlistPicks: decision.watchlistPicks,
    watchlistCount: decision.watchlistCount,
    cashWeight: decision.cashWeight,
    cashWeightPct: decision.cashWeightPct,
    decision,
    requestedPolicyAvailable: !requestedPolicyUnavailable,
  };
}

export async function deliverCategoriesIndependently({
  categories,
  publicationByCategory,
  picksByCategory,
  formatMessage,
  sendMessage,
  markStatus,
  afterSent,
}) {
  const failures = [];
  const postDeliveryFailures = [];
  const sentCategories = [];
  const alreadySentCategories = [];
  const skippedCategories = [];

  for (const category of categories) {
    const publication = publicationByCategory.get(category);
    const picks = picksByCategory[category];
    if (!publication || !Array.isArray(picks) || picks.length === 0) {
      failures.push({
        category,
        message: !publication ? 'Official recommendation publication is missing.' : 'Recommendation picks are missing.',
      });
      continue;
    }
    if (publication.telegram_status === 'SENT') {
      alreadySentCategories.push(category);
      continue;
    }

    try {
      const delivery = await sendMessage(formatMessage({ category, picks, publication }), {
        category,
        publication,
        publicationId: publication.id,
      });
      const skipped = Boolean(delivery?.skipped);
      await markStatus(publication.id, skipped ? 'SKIPPED' : 'SENT', skipped ? null : new Date().toISOString());
      if (skipped) {
        skippedCategories.push(category);
        continue;
      }
      sentCategories.push(category);
      if (afterSent) {
        try {
          await afterSent({ category, picks, publication });
        } catch (error) {
          postDeliveryFailures.push({ category, message: compactError(error) });
        }
      }
    } catch (error) {
      const failedStatus = error?.deliveryUncertain ? 'SKIPPED' : 'FAILED';
      try {
        await markStatus(publication.id, failedStatus, null);
      } catch (markError) {
        failures.push({
          category,
          message: `${compactError(error)}; failed to persist ${failedStatus} status: ${compactError(markError)}`,
        });
        continue;
      }
      failures.push({ category, message: compactError(error) });
    }
  }

  return { failures, postDeliveryFailures, sentCategories, alreadySentCategories, skippedCategories };
}
