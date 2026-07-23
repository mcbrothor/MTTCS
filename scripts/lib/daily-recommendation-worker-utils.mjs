function compactError(error) {
  return error instanceof Error ? error.message : String(error);
}

export function isTradingSession(tradeDates, runDate) {
  return Array.isArray(tradeDates) && tradeDates.some((tradeDate) => tradeDate === runDate);
}

export function resolveRecommendationPolicies({
  basePolicy,
  requestedEngineVersion,
  optionalPolicies = [],
}) {
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

  const effectiveEngineVersion = policies.some((policy) => policy.engineVersion === requestedEngineVersion)
    ? requestedEngineVersion
    : basePolicy.engineVersion;

  return {
    effectiveEngineVersion,
    failures,
    policies: policies.map((policy) => ({
      ...policy,
      isOfficial: policy.engineVersion === effectiveEngineVersion,
    })),
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
      const delivery = await sendMessage(formatMessage({ category, picks }), {
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
