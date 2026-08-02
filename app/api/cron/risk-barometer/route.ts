import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { validateCronRequest } from '@/lib/auth/cron';
import { recordPipelineRun } from '@/lib/data/pipeline-health';
import { RISK_BAROMETER_MODEL_VERSION } from '@/lib/risk-barometer/model';
import { persistRiskBarometerSnapshot } from '@/lib/risk-barometer/repository';
import { buildRiskBarometerSnapshot } from '@/lib/risk-barometer/service';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 240;

const state = globalThis as typeof globalThis & {
  __mtnRiskBarometerCronRunning?: boolean;
};

function parseBoolean(value: string | null) {
  if (value === null || value === 'false') return false;
  if (value === 'true') return true;
  return null;
}

function parseDate(value: string | null) {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) return null;
  return value;
}

export async function GET(request: Request) {
  if (!validateCronRequest(request)) {
    return apiError('Unauthorized cron request.', 'AUTH_REQUIRED', 401);
  }
  const url = new URL(request.url);
  const dryRun = parseBoolean(url.searchParams.get('dryRun'));
  const calcDate = parseDate(url.searchParams.get('calcDate'));
  if (dryRun === null) return apiError('dryRun은 true 또는 false여야 합니다.', 'INVALID_DRY_RUN', 400);
  if (calcDate === null) return apiError('calcDate는 YYYY-MM-DD 형식이어야 합니다.', 'INVALID_DATE', 400);
  if (state.__mtnRiskBarometerCronRunning) {
    return apiError('Risk barometer cron is already running.', 'RISK_BAROMETER_ALREADY_RUNNING', 409);
  }

  state.__mtnRiskBarometerCronRunning = true;
  try {
    const client = getSupabaseAdmin();
    const built = await buildRiskBarometerSnapshot({ client, calcDate });
    const snapshot = dryRun
      ? null
      : await persistRiskBarometerSnapshot({
          client,
          response: built.response,
          inputHash: built.inputHash,
          calcDate,
        });
    if (!dryRun) {
      await recordPipelineRun({
        pipeline: 'risk-barometer',
        provider: 'FRED+SEC+Yahoo+approved inputs',
        market: 'US',
        status: built.response.quality === 'VALID' ? 'SUCCESS' : 'DEGRADED',
        observedAt: built.response.asOf,
        fallbackUsed: built.response.quality !== 'VALID',
        fallbackReason: built.response.quality === 'VALID'
          ? null
          : `${built.response.coverage.valid}/10 indicators available`,
        metadata: {
          modelVersion: RISK_BAROMETER_MODEL_VERSION,
          inputHash: built.inputHash,
          score: built.response.score,
          rawScore: built.response.rawScore,
          quality: built.response.quality,
          snapshotId: snapshot?.id,
        },
      });
    }
    return apiSuccess({
      dryRun,
      persisted: !dryRun,
      inputHash: built.inputHash,
      barometer: built.response,
      snapshot,
    }, {
      source: dryRun ? 'Live calculation preview' : 'risk_barometer_snapshots',
      provider: 'MTN deterministic model',
      delay: 'EOD',
      observedAt: built.response.asOf,
      fallbackUsed: built.response.quality !== 'VALID',
      fallbackReason: built.response.quality === 'VALID'
        ? null
        : `${built.response.coverage.valid}/10 indicators available`,
      modelVersion: RISK_BAROMETER_MODEL_VERSION,
    });
  } catch (error) {
    const message = getErrorMessage(error, 'Risk barometer cron failed.');
    if (!dryRun) {
      await recordPipelineRun({
        pipeline: 'risk-barometer',
        provider: 'FRED+SEC+Yahoo+approved inputs',
        market: 'US',
        status: 'FAILED',
        fallbackUsed: true,
        fallbackReason: 'calculation failed',
        errorMessage: message,
        metadata: { modelVersion: RISK_BAROMETER_MODEL_VERSION, calcDate },
      }).catch(() => undefined);
    }
    return apiError(message, 'RISK_BAROMETER_CRON_FAILED', 500);
  } finally {
    state.__mtnRiskBarometerCronRunning = false;
  }
}
