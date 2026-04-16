import { NextResponse } from 'next/server';
import type { ApiErrorCode, ApiFailure, ApiSuccess, DataSourceMeta } from '@/types';

export function nowMeta(partial: Partial<DataSourceMeta> = {}): DataSourceMeta {
  return {
    asOf: partial.asOf || new Date().toISOString(),
    source: partial.source || 'MTN',
    provider: partial.provider || 'Internal',
    delay: partial.delay || 'UNKNOWN',
    fallbackUsed: Boolean(partial.fallbackUsed),
    warnings: partial.warnings || [],
  };
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
  return error instanceof Error ? error.message : fallback;
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs = 10_000, message = 'Request timed out') {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
