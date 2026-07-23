const DEFAULT_STALE_AFTER_MS = 90 * 60_000;

function timestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function uniqueCategories(publications) {
  return new Set((publications || []).map((publication) => publication.category).filter(Boolean));
}

export function evaluateDailyDeliveryHealth({
  run,
  publications = [],
  now = Date.now(),
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
  expectedCategories,
  deliveryOverdue = true,
  maxAutoRetries = 2,
}) {
  if (!run) {
    return {
      healthy: false,
      reason: 'daily run is missing',
      actions: deliveryOverdue ? ['enqueue', 'kick_worker', 'alert'] : ['enqueue', 'kick_worker'],
    };
  }

  const retryCount = Number(
    run.scope?.watchdog_retry_count
      ?? String(run.error_summary || '').match(/watchdog_retry=(\d+)/)?.[1]
      ?? 0,
  );
  const runAgeMs = Math.max(0, now - timestamp(run.updated_at));
  if (run.status === 'processing') {
    if (runAgeMs > staleAfterMs) {
      if (retryCount >= maxAutoRetries) {
        return {
          healthy: false,
          reason: `daily run is stale after ${retryCount} watchdog retries`,
          actions: ['alert'],
        };
      }
      return {
        healthy: false,
        reason: 'daily run is stale in processing',
        actions: ['requeue', 'kick_worker', 'alert'],
      };
    }
    return {
      healthy: false,
      reason: deliveryOverdue ? 'daily run is still processing past delivery deadline' : 'daily run is still processing',
      actions: deliveryOverdue ? ['alert'] : [],
    };
  }

  if (run.status === 'failed') {
    if (retryCount >= maxAutoRetries) {
      return {
        healthy: false,
        reason: `daily run failed after ${retryCount} watchdog retries`,
        actions: ['alert'],
      };
    }
    return {
      healthy: false,
      reason: 'daily run failed',
      actions: ['requeue', 'kick_worker', 'alert'],
    };
  }

  if (run.status === 'pending') {
    return {
      healthy: false,
      reason: 'daily run is pending',
      actions: deliveryOverdue ? ['kick_worker', 'alert'] : ['kick_worker'],
    };
  }

  if (run.status !== 'completed') {
    return {
      healthy: false,
      reason: `daily run has unknown status (${run.status || 'missing'})`,
      actions: ['kick_worker', 'alert'],
    };
  }

  const availableCategories = uniqueCategories(publications);
  const expected = Array.isArray(expectedCategories) && expectedCategories.length > 0
    ? [...new Set(expectedCategories)]
    : [...availableCategories];
  const relevant = expected.length > 0
    ? publications.filter((publication) => expected.includes(publication.category))
    : publications;
  const sentCategories = uniqueCategories(relevant.filter((publication) => publication.telegram_status === 'SENT'));

  if (expected.length > 0 && expected.some((category) => !availableCategories.has(category))) {
    if (retryCount >= maxAutoRetries) {
      return {
        healthy: false,
        reason: `official publications remain incomplete after ${retryCount} watchdog retries (${availableCategories.size}/${expected.length})`,
        actions: ['alert'],
      };
    }
    return {
      healthy: false,
      reason: `official publications are incomplete (${availableCategories.size}/${expected.length})`,
      actions: ['requeue', 'kick_worker', 'alert'],
    };
  }

  if (relevant.length === 0) {
    if (retryCount >= maxAutoRetries) {
      return {
        healthy: false,
        reason: `official publications are missing after ${retryCount} watchdog retries`,
        actions: ['alert'],
      };
    }
    return {
      healthy: false,
      reason: 'official publications are missing',
      actions: ['requeue', 'kick_worker', 'alert'],
    };
  }

  if (sentCategories.size !== expected.length) {
    return {
      healthy: false,
      reason: `official telegram delivery is incomplete (${sentCategories.size}/${expected.length})`,
      actions: ['kick_worker', 'alert'],
    };
  }

  if (!run.telegram_sent_at) {
    return {
      healthy: false,
      reason: `official telegram delivery needs run synchronization (${sentCategories.size}/${expected.length})`,
      actions: ['sync_run'],
    };
  }

  return {
    healthy: true,
    reason: `official telegram delivery completed (${sentCategories.size}/${expected.length})`,
    actions: [],
  };
}
