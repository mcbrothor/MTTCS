import { NextResponse } from 'next/server';
import type { ApiErrorCode, ApiFailure, ApiSuccess, DataSourceMeta } from '@/types';
import { buildFreshnessMeta } from '@/lib/data/freshness';

export function nowMeta(partial: Partial<DataSourceMeta> = {}): DataSourceMeta {
  return buildFreshnessMeta({
    ...partial,
    source: partial.source || 'MTN',
    provider: partial.provider || 'Internal',
    delay: partial.delay || 'UNKNOWN',
  });
}

export function apiSuccess<T>(data: T, meta: Partial<DataSourceMeta> = {}, status = 200) {
  const body: ApiSuccess<T> = { data, meta: nowMeta(meta) };
  return NextResponse.json(body, { status });
}

export function apiError(
  message: string,
  code: ApiErrorCode | string = 'API_ERROR',
  status = 400,
  details?: unknown,
  lastSuccessfulAt?: string | null
) {
  const body: ApiFailure = {
    message,
    code,
    details,
    recoverable: status < 500,
    lastSuccessfulAt: lastSuccessfulAt || null,
  };
  return NextResponse.json(body, { status });
}

export function getErrorMessage(error: unknown, fallback = 'Unknown error') {
  if (error instanceof Error) return error.message;
  // Supabase PostgrestError, fetch errors 등 plain object 형태의 에러도 메시지를 추출한다.
  // instanceof Error만 체크하면 message가 무시되고 fallback이 노출되어 디버깅이 막힌다.
  if (error && typeof error === 'object') {
    const obj = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const message = typeof obj.message === 'string' ? obj.message : '';
    const details = typeof obj.details === 'string' ? obj.details : '';
    const hint = typeof obj.hint === 'string' ? obj.hint : '';
    const code = typeof obj.code === 'string' ? obj.code : '';
    const composed = [message, details, hint].filter(Boolean).join(' — ');
    if (composed) return code ? `${composed} (${code})` : composed;
  }
  if (typeof error === 'string' && error) return error;
  return fallback;
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs = 10_000, message = 'Request timed out') {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
