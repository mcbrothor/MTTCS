import { createHash } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { kisAppKey, kisBaseUrl } from '@/lib/env';

export type KisRateLimitScope = 'rest' | 'token';

export interface KisRateLimitReservation {
  mode: 'distributed' | 'local';
  reservedAt: number;
  waitMs: number;
}

interface LocalRateLimitState {
  nextAllowedAtByKey: Map<string, number>;
  distributedRetryAt: number;
  distributedWarningAt: number;
}

declare global {
  var __mtnKisRateLimitState: LocalRateLimitState | undefined;
}

const previousState = globalThis.__mtnKisRateLimitState;
const state = previousState?.nextAllowedAtByKey instanceof Map
  ? previousState
  : {
      nextAllowedAtByKey: new Map<string, number>(),
      distributedRetryAt: 0,
      distributedWarningAt: 0,
    };
globalThis.__mtnKisRateLimitState = state;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nonNegativeNumber(value: string | undefined) {
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function kisRequestIntervalMs(scope: KisRateLimitScope, baseUrl: string) {
  if (scope === 'token') {
    return nonNegativeNumber(process.env.KIS_TOKEN_REQUEST_INTERVAL_MS) ?? 1_050;
  }
  return nonNegativeNumber(process.env.KIS_REQUEST_INTERVAL_MS)
    ?? (baseUrl.includes('openapivts') ? 1_050 : 120);
}

export function kisRateLimiterKey(
  scope: KisRateLimitScope,
  baseUrl: string,
  appKey: string
) {
  return `kis:${scope}:${createHash('sha256')
    .update(`${baseUrl.replace(/\/$/, '')}\0${appKey}`, 'utf8')
    .digest('hex')}`;
}

function localReservation(limiterKey: string, intervalMs: number): KisRateLimitReservation {
  const now = Date.now();
  const reservedAt = Math.max(now, state.nextAllowedAtByKey.get(limiterKey) ?? 0);
  state.nextAllowedAtByKey.set(limiterKey, reservedAt + intervalMs);
  return { mode: 'local', reservedAt, waitMs: Math.max(0, reservedAt - now) };
}

function distributedLimiterConfigured() {
  return process.env.KIS_DISTRIBUTED_RATE_LIMIT_ENABLED !== 'false'
    && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
    && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function distributedReservation(
  limiterKey: string,
  intervalMs: number
): Promise<KisRateLimitReservation | null> {
  const now = Date.now();
  if (!distributedLimiterConfigured() || now < state.distributedRetryAt) return null;

  try {
    const { data, error } = await getSupabaseAdmin().rpc(
      'reserve_provider_rate_limit_slot',
      {
        p_limiter_key: limiterKey,
        p_interval_ms: Math.round(intervalMs),
      }
    );
    if (error) throw error;

    const reservedAt = new Date(String(data)).getTime();
    if (!Number.isFinite(reservedAt)) {
      throw new Error('KIS 공유 제한기에서 유효한 예약 시각을 받지 못했습니다.');
    }
    state.distributedRetryAt = 0;
    return {
      mode: 'distributed',
      reservedAt,
      waitMs: Math.max(0, reservedAt - Date.now()),
    };
  } catch (error) {
    const retryMs = nonNegativeNumber(process.env.KIS_DISTRIBUTED_RATE_LIMIT_RETRY_MS) ?? 60_000;
    state.distributedRetryAt = Date.now() + retryMs;
    if (Date.now() >= state.distributedWarningAt) {
      state.distributedWarningAt = state.distributedRetryAt;
      console.warn('[KIS] 공유 요청 제한기를 사용할 수 없어 로컬 제한기로 전환합니다.', error);
    }
    return null;
  }
}

export async function reserveKisRequestSlot(
  scope: KisRateLimitScope,
  options: { distributedOnly?: boolean } = {}
): Promise<KisRateLimitReservation | null> {
  const baseUrl = kisBaseUrl();
  const limiterKey = kisRateLimiterKey(scope, baseUrl, kisAppKey());
  const intervalMs = kisRequestIntervalMs(scope, baseUrl);
  const distributed = await distributedReservation(limiterKey, intervalMs);
  if (distributed || options.distributedOnly) return distributed;
  return localReservation(limiterKey, intervalMs);
}

export async function waitForKisRequestSlot(scope: KisRateLimitScope = 'rest') {
  const reservation = await reserveKisRequestSlot(scope);
  if (reservation && reservation.waitMs > 0) await sleep(reservation.waitMs);
  return reservation?.mode ?? 'local';
}
