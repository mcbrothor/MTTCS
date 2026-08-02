import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { validateCronRequest } from '@/lib/auth/cron';
import { SYSTEM_ADMIN_ID } from '@/lib/auth/session';
import {
  upsertGoldStrategySnapshot,
  type GoldDataQuality,
  type GoldRepositoryClient,
} from '@/lib/gold/repository';
import { buildGoldStrategyForOwner } from '@/lib/gold/service';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 240;

const goldCronState = globalThis as typeof globalThis & {
  __mtnGoldStrategyCronRunning?: boolean;
};

function parseDryRun(request: Request) {
  const value = new URL(request.url).searchParams.get('dryRun');
  if (value === null || value === 'false') return false;
  if (value === 'true') return true;
  return null;
}

function strategyDate(value: string) {
  const match = /^\d{4}-\d{2}-\d{2}/.exec(value);
  if (!match) throw new Error('Gold strategy asOf must begin with YYYY-MM-DD.');
  return match[0];
}

function strategyObservedAt(value: string) {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T23:59:59.000Z`
    : value;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Gold strategy asOf is not a valid timestamp.');
  }
  return parsed.toISOString();
}

function snapshotQuality(
  quality: 'VALID' | 'DEGRADED' | 'BLOCKED',
): GoldDataQuality {
  return quality === 'VALID' ? 'READY' : quality;
}

async function recordGoldPipelineHealth(input: {
  client: GoldRepositoryClient;
  status: 'SUCCESS' | 'DEGRADED' | 'FAILED';
  observedAt: string | null;
  fallbackReason?: string | null;
  errorMessage?: string | null;
  metadata: Record<string, unknown>;
}) {
  const { error } = await input.client.from('data_pipeline_runs').insert({
    pipeline: 'gold-strategy',
    provider: 'KIS+Yahoo+FRED+WGC',
    market: 'GOLD',
    status: input.status,
    observed_at: input.observedAt,
    completed_at: new Date().toISOString(),
    fallback_used: input.status !== 'SUCCESS',
    fallback_reason: input.fallbackReason ?? null,
    error_message: input.errorMessage ?? null,
    metadata: input.metadata,
  });
  if (error) {
    console.warn(
      '[gold-strategy-cron] pipeline health 기록 실패:',
      getErrorMessage(error),
    );
  }
}

export async function GET(request: Request) {
  if (!validateCronRequest(request)) {
    return apiError('Unauthorized cron request.', 'AUTH_REQUIRED', 401);
  }
  const dryRun = parseDryRun(request);
  if (dryRun === null) {
    return apiError(
      'dryRun must be exactly true or false.',
      'INVALID_DRY_RUN',
      400,
    );
  }
  if (goldCronState.__mtnGoldStrategyCronRunning) {
    return apiError(
      'Gold strategy cron is already running in this process.',
      'GOLD_STRATEGY_ALREADY_RUNNING',
      409,
    );
  }

  goldCronState.__mtnGoldStrategyCronRunning = true;
  let client: ReturnType<typeof getSupabaseAdmin> | null = null;
  let observedAt: string | null = null;
  try {
    client = getSupabaseAdmin();
    const built = await buildGoldStrategyForOwner({
      client,
      ownerId: SYSTEM_ADMIN_ID,
    });
    const response = built.response;
    const asOfDate = strategyDate(response.asOf);
    observedAt = strategyObservedAt(response.asOf);
    const dataQuality = snapshotQuality(response.quality.status);

    if (dryRun) {
      return apiSuccess({
        dryRun: true,
        persisted: false,
        inputHash: built.inputHash,
        strategy: response,
        snapshot: null,
      }, {
        source: 'MTN gold strategy preview',
        provider: 'Rules / KIS+Yahoo+FRED+WGC',
        delay: 'EOD',
        observedAt,
        fallbackUsed: response.quality.status !== 'VALID',
        fallbackReason: response.quality.reasons.join(' ') || null,
        warnings: response.quality.reasons,
        modelVersion: response.modelVersion,
      });
    }

    const snapshot = await upsertGoldStrategySnapshot({
      client,
      ownerId: SYSTEM_ADMIN_ID,
      snapshot: {
        asOfDate,
        coreProduct: response.settings.coreProduct,
        tacticalProduct: response.settings.tacticalProduct,
        modelVersion: response.modelVersion,
        dataQuality,
        inputs: built.inputs,
        result: response as unknown as Record<string, unknown>,
        inputHash: built.inputHash,
        observedAt,
      },
    });
    await recordGoldPipelineHealth({
      client,
      status: response.quality.status === 'VALID' ? 'SUCCESS' : 'DEGRADED',
      observedAt,
      fallbackReason: response.quality.reasons.join(' ') || null,
      metadata: {
        modelVersion: response.modelVersion,
        dataQuality: response.quality.status,
        decision: response.decision.code,
        coreProduct: response.settings.coreProduct,
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
      source: 'gold_strategy_snapshots',
      provider: 'Rules / KIS+Yahoo+FRED+WGC',
      delay: 'EOD',
      observedAt,
      fallbackUsed: response.quality.status !== 'VALID',
      fallbackReason: response.quality.reasons.join(' ') || null,
      warnings: response.quality.reasons,
      modelVersion: response.modelVersion,
    });
  } catch (error) {
    const message = getErrorMessage(error, 'Gold strategy cron failed.');
    if (!dryRun && client) {
      await recordGoldPipelineHealth({
        client,
        status: 'FAILED',
        observedAt,
        errorMessage: message,
        metadata: {
          modelVersion: 'gold-core-tactical-2026.07-v1',
        },
      }).catch(() => undefined);
    }
    return apiError(message, 'GOLD_STRATEGY_CRON_FAILED', 500);
  } finally {
    goldCronState.__mtnGoldStrategyCronRunning = false;
  }
}
