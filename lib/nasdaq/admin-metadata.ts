import { isNasdaqProductCode } from './data';

function date(value: unknown, field: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field}는 YYYY-MM-DD 형식이어야 합니다.`);
  }
  return value;
}

function ratio(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 10) {
    throw new Error(`${field}는 0~10 사이 숫자여야 합니다.`);
  }
  return number;
}

export function validateNasdaqProductMetadata(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('상품 메타데이터 요청 body는 객체여야 합니다.');
  }
  const input = body as Record<string, unknown>;
  if ('user_id' in input || 'owner_id' in input || 'ownerId' in input) {
    throw new Error('소유자 식별자는 요청 body로 지정할 수 없습니다.');
  }
  if (typeof input.product !== 'string' || !isNasdaqProductCode(input.product)) {
    throw new Error('product가 지원 상품 화이트리스트에 없습니다.');
  }
  const expectedLeverage = input.product === 'QQQ' ? 1 : input.product === 'QLD' ? 2 : 3;
  if (Number(input.leverageMultiple) !== expectedLeverage) {
    throw new Error(`${input.product} leverageMultiple은 ${expectedLeverage}이어야 합니다.`);
  }
  if (
    typeof input.sourceUrl !== 'string'
    || !input.sourceUrl.startsWith('https://')
    || input.sourceUrl.length > 2048
  ) {
    throw new Error('sourceUrl은 https URL이어야 합니다.');
  }
  return {
    product: input.product,
    leverageMultiple: expectedLeverage as 1 | 2 | 3,
    grossExpenseRatioPct: ratio(input.grossExpenseRatioPct, 'grossExpenseRatioPct'),
    netExpenseRatioPct: ratio(input.netExpenseRatioPct, 'netExpenseRatioPct'),
    effectiveDate: date(input.effectiveDate, 'effectiveDate'),
    reviewAfter: date(input.reviewAfter, 'reviewAfter'),
    sourceUrl: input.sourceUrl,
  };
}
