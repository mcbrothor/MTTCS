import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { validateCronRequest } from '@/lib/auth/cron';
import { SYSTEM_ADMIN_ID } from '@/lib/auth/session';
import { upsertNasdaqSnapshot } from '@/lib/nasdaq/repository';
import { buildNasdaqStrategyForOwner } from '@/lib/nasdaq/service';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 240;

const state = globalThis as typeof globalThis & {
  __mtnNasdaqStrategyCronRunning?: boolean;
};

function dryRunValue(request: Request) {
  const value = new URL(request.url).searchParams.get('dryRun');
  if (value === null || value === 'false') return false;
  if (value === 'true') return true;
  return null;
}

async function recordPipeline(input: {
  client: ReturnType<typeof getSupabaseAdmin>;
  status: 'SUCCESS' | 'DEGRADED' | 'FAILED';
  observedAt: string | null;
  error?: string | null;
  metadata: Record<string, unknown>;
}) {
  const { error } = await input.client.from('data_pipeline_runs').insert({
    pipeline: 'nasdaq-strategy',
    provider: 'KIS+Yahoo',
    market: 'US',
    status: input.status,
    observed_at: input.observedAt,
    completed_at: new Date().toISOString(),
    fallback_used: input.status !== 'SUCCESS',
    fallback_reason: input.status === 'DEGRADED' ? 'strategy data degraded' : null,
    error_message: input.error ?? null,
    metadata: input.metadata,
  });
  if (error) console.warn('[nasdaq-strategy-cron] pipeline record failed:', getErrorMessage(error));
}

export async function GET(request: Request) {
  if (!validateCronRequest(request)) {
    return apiError('Unauthorized cron request.', 'AUTH_REQUIRED', 401);
  }
  const dryRun = dryRunValue(request);
  if (dryRun === null) {
    return apiError('dryRun must be exactly true or false.', 'INVALID_DRY_RUN', 400);
  }
  if (state.__mtnNasdaqStrategyCronRunning) {
    return apiError(
      'Nasdaq strategy cron is already running in this process.',
      'NASDAQ_STRATEGY_ALREADY_RUNNING',
      409,
    );
  }
  state.__mtnNasdaqStrategyCronRunning = true;
  let client: ReturnType<typeof getSupabaseAdmin> | null = null;
  try {
    client = getSupabaseAdmin();
    const built = await buildNasdaqStrategyForOwner({
      client,
      ownerId: SYSTEM_ADMIN_ID,
    });
    const response = built.response;
    const observedAt = response.quality.asOf
      ? `${response.quality.asOf}T23:59:59.000Z`
      : new Date().toISOString();
    if (dryRun) {
      return apiSuccess({
        dryRun: true,
        persisted: false,
        inputHash: built.inputHash,
        strategy: response,
        snapshot: null,
      }, {
        source: 'MTN Nasdaq strategy preview',
        provider: 'Rules / KIS+Yahoo',
        delay: 'EOD',
        observedAt,
        fallbackUsed: response.quality.status !== 'VALID',
        fallbackReason: response.quality.reasons.join(' ') || null,
        warnings: response.quality.reasons,
        modelVersion: response.modelVersion,
      });
    }
    const snapshot = await upsertNasdaqSnapshot({
      client,
      ownerId: SYSTEM_ADMIN_ID,
      snapshot: {
        asOfDate: response.asOf.slice(0, 10),
        tacticalProduct: response.settings.tacticalProduct,
        modelVersion: response.modelVersion,
        dataQuality: response.quality.status === 'VALID' ? 'READY' : response.quality.status,
        inputs: built.inputs,
        result: response as unknown as Record<string, unknown>,
        inputHash: built.inputHash,
        observedAt,
      },
    });
    await recordPipeline({
      client,
      status: response.quality.status === 'VALID' ? 'SUCCESS' : 'DEGRADED',
      observedAt,
      metadata: {
        modelVersion: response.modelVersion,
        decision: response.decision,
        tacticalProduct: response.settings.tacticalProduct,
        inputHash: built.inputHash,
        snapshotId: snapshot.id,
      },
    });
    return apiSuccess({
      dryRun: false,
      persisted: true,
      inputHash: built.inputHash,
      strategy: response,
      snapshot,
    }, {
      source: 'nasdaq_strategy_snapshots',
      provider: 'Rules / KIS+Yahoo',
      delay: 'EOD',
      observedAt,
      fallbackUsed: response.quality.status !== 'VALID',
      fallbackReason: response.quality.reasons.join(' ') || null,
      warnings: response.quality.reasons,
      modelVersion: response.modelVersion,
    });
  } catch (error) {
    const message = getErrorMessage(error, 'Nasdaq strategy cron failed.');
    if (!dryRun && client) {
      await recordPipeline({
        client,
        status: 'FAILED',
        observedAt: null,
        error: message,
        metadata: { modelVersion: 'nasdaq-core-leverage-2026.07-v1' },
      }).catch(() => undefined);
    }
    return apiError(message, 'NASDAQ_STRATEGY_CRON_FAILED', 500);
  } finally {
    state.__mtnNasdaqStrategyCronRunning = false;
  }
}
