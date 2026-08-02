import type { ServerSession } from '@/lib/auth/session';
import {
  MANUAL_RISK_KEYS,
  type ManualRiskObservationInput,
} from './repository';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isExpectedOfficialHost(key: string, sourceUrl: string) {
  const hostname = new URL(sourceUrl).hostname.toLowerCase();
  if (key === 'margin_debt') return hostname === 'finra.org' || hostname.endsWith('.finra.org');
  if (key === 'capital_market_frenzy') return hostname === 'sifma.org' || hostname.endsWith('.sifma.org');
  return true;
}

export function parseManualRiskObservation(
  value: unknown,
  session: ServerSession,
): ManualRiskObservationInput {
  if (!value || typeof value !== 'object') throw new Error('관측값 객체가 필요합니다.');
  const row = value as Record<string, unknown>;
  const key = String(row.key || '');
  const period = String(row.period || '');
  const unit = String(row.unit || '').trim();
  const sourceUrl = String(row.sourceUrl || '').trim();
  const observedAt = String(row.observedAt || '');
  const note = String(row.note || '').trim();
  const numericValue = Number(row.value);

  if (!MANUAL_RISK_KEYS.includes(key as (typeof MANUAL_RISK_KEYS)[number])) {
    throw new Error('승인 입력 대상 지표가 아닙니다.');
  }
  const parsedPeriod = new Date(`${period}T00:00:00Z`);
  if (
    !DATE_RE.test(period)
    || Number.isNaN(parsedPeriod.getTime())
    || parsedPeriod.toISOString().slice(0, 10) !== period
  ) {
    throw new Error('기간은 YYYY-MM-DD 형식이어야 합니다.');
  }
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw new Error('값은 0 이상의 유한한 숫자여야 합니다.');
  }
  if (!unit || unit.length > 40) throw new Error('단위는 1~40자로 입력해야 합니다.');
  const expectedUnit = key === 'margin_debt' ? 'USD' : key === 'capital_market_frenzy' ? '%' : 'multiple';
  if (unit !== expectedUnit) throw new Error(`${key} 단위는 ${expectedUnit}여야 합니다.`);
  if (!isHttpsUrl(sourceUrl)) throw new Error('공식 출처 URL은 https 주소여야 합니다.');
  if (!isExpectedOfficialHost(key, sourceUrl)) throw new Error('지표별 공식 출처 도메인을 사용해야 합니다.');
  if (Number.isNaN(new Date(observedAt).getTime())) throw new Error('관측시각이 올바르지 않습니다.');
  if (key === 'equity_risk_premium' && numericValue <= 0) {
    throw new Error('Forward P/E는 0보다 커야 합니다.');
  }
  if (!note || note.length > 600) throw new Error('근거는 1~600자로 입력해야 합니다.');

  return {
    key: key as ManualRiskObservationInput['key'],
    period,
    value: numericValue,
    unit,
    sourceUrl,
    observedAt: new Date(observedAt).toISOString(),
    approvedBy: session.systemId,
    approvedAt: new Date().toISOString(),
    note,
  };
}
