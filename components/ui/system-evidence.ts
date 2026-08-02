import type { ApiFailure, DataSourceMeta } from '@/types';

export type EvidenceState = 'ready' | 'limited' | 'blocked' | 'waiting';

export interface DisplayFailure {
  rawMessage: string;
  code?: string | null;
  recoverable?: boolean | null;
  lastSuccessfulAt?: string | null;
}

const INTERNAL_ERROR_PATTERN = /(?:\b(?:ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|PGRST\d*|SQLSTATE)\b|TypeError:\s*fetch failed|\bat\s+(?:async\s+)?[\w.[\]<>]+\s*\(|(?:route|page|server|client)\.(?:ts|tsx|js|mjs):\d+|127\.0\.0\.1(?::\d+)?|localhost(?::\d+)?|postgres(?:ql)?:\/\/|supabase\.co|node_modules)/i;

export function safeDisplayError(
  value: unknown,
  fallback = '내부 오류 상세는 운영 로그에서 확인하세요.',
) {
  const message = typeof value === 'string' ? value.trim() : '';
  if (!message || message.length > 240 || INTERNAL_ERROR_PATTERN.test(message)) return fallback;
  return message;
}

export function toDisplayFailure(value: unknown, fallback: string): DisplayFailure {
  const body = value && typeof value === 'object' ? value as Partial<ApiFailure> : {};
  return {
    rawMessage: typeof body.message === 'string' ? body.message : fallback,
    code: typeof body.code === 'string' ? body.code : null,
    recoverable: typeof body.recoverable === 'boolean' ? body.recoverable : null,
    lastSuccessfulAt: typeof body.lastSuccessfulAt === 'string' ? body.lastSuccessfulAt : null,
  };
}

export function describeFreshness(
  isStale: boolean | undefined,
  staleReason: string | null | undefined,
) {
  if (isStale === true) {
    return {
      label: '지연',
      detail: staleReason || 'API 신선도 기준을 초과했습니다.',
    };
  }
  if (isStale === false) {
    return {
      label: '정상',
      detail: 'API 신선도 판정 기준을 통과했습니다.',
    };
  }
  return {
    label: '미측정',
    detail: 'API가 신선도 판정을 제공하지 않았습니다.',
  };
}

export function describePromotion(value: string | null | undefined) {
  if (value === 'PROMOTE_FLOW') return '수급 정책 승격 후보';
  if (value === 'PROMOTE_RISK') return '리스크 정책 승격 후보';
  if (value === 'KEEP_OFFICIAL') return '현 정책 유지';
  if (value === 'CONTINUE') return '표본 축적 중';
  return '검증 대기';
}

export function deriveEvidenceState(meta: Partial<DataSourceMeta> | null | undefined): EvidenceState {
  if (!meta) return 'waiting';
  if (meta.isStale === true || meta.fallbackUsed === true || (meta.warnings?.length || 0) > 0) return 'limited';
  if (meta.isStale === false && meta.fallbackUsed === false) return 'ready';
  return 'waiting';
}
