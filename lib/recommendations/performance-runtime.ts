export const RECOMMENDATION_PERFORMANCE_ROUTE_LIMIT_MS = 270_000;
export const RECOMMENDATION_PERFORMANCE_LEDGER_RESERVE_MS = 40_000;
export const RECOMMENDATION_PERFORMANCE_WORK_BUDGET_MS =
  RECOMMENDATION_PERFORMANCE_ROUTE_LIMIT_MS - RECOMMENDATION_PERFORMANCE_LEDGER_RESERVE_MS;
export const RECOMMENDATION_PERFORMANCE_PROVIDER_TIMEOUT_MS = 12_000;
export const RECOMMENDATION_PERFORMANCE_MIN_FINALIZATION_MS = 30_000;

export class RecommendationPerformanceDeadlineError extends Error {
  constructor(message = 'Recommendation performance shard work deadline reached.') {
    super(message);
    this.name = 'RecommendationPerformanceDeadlineError';
  }
}

interface RecommendationPerformanceRuntimeOptions {
  budgetMs?: number;
  now?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout> | number;
  clearTimer?: (handle: ReturnType<typeof setTimeout> | number) => void;
}

export function createRecommendationPerformanceRuntime(
  options: RecommendationPerformanceRuntimeOptions = {},
) {
  const budgetMs = options.budgetMs ?? RECOMMENDATION_PERFORMANCE_WORK_BUDGET_MS;
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) {
    throw new Error('Recommendation performance work budget must be a positive number.');
  }

  const now = options.now ?? Date.now;
  const startedAt = now();
  const deadlineAt = startedAt + budgetMs;
  const controller = new AbortController();
  const deadlineError = new RecommendationPerformanceDeadlineError();
  const setTimer = options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const timer = setTimer(() => {
    if (!controller.signal.aborted) controller.abort(deadlineError);
  }, budgetMs);

  function remainingMs() {
    return Math.max(0, deadlineAt - now());
  }

  function deadlineReached() {
    return controller.signal.aborted || remainingMs() === 0;
  }

  function throwIfExpired() {
    if (!deadlineReached()) return;
    if (!controller.signal.aborted) controller.abort(deadlineError);
    const reason = controller.signal.reason;
    throw reason instanceof RecommendationPerformanceDeadlineError ? reason : deadlineError;
  }

  function providerTimeoutMs(maximumMs = RECOMMENDATION_PERFORMANCE_PROVIDER_TIMEOUT_MS) {
    throwIfExpired();
    return Math.max(1, Math.min(maximumMs, remainingMs()));
  }

  return {
    startedAt,
    deadlineAt,
    signal: controller.signal,
    remainingMs,
    deadlineReached,
    throwIfExpired,
    providerTimeoutMs,
    dispose: () => clearTimer(timer),
  };
}

export function classifyRecommendationShardOutcome(input: {
  deadlineReached: boolean;
  errorCount: number;
  processedSecurities: number;
  totalSecurities: number;
}): 'SUCCESS' | 'DEGRADED' {
  return input.deadlineReached
    || input.errorCount > 0
    || input.processedSecurities < input.totalSecurities
    ? 'DEGRADED'
    : 'SUCCESS';
}

export function isRecommendationPerformanceDeadlineError(error: unknown) {
  return error instanceof RecommendationPerformanceDeadlineError
    || (error instanceof Error && error.name === 'RecommendationPerformanceDeadlineError');
}
