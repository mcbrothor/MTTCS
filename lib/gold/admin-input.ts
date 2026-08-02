interface GoldMacroInputBody {
  period?: unknown;
  etfFlowUsdBillion?: unknown;
  holdingsChangeTonnes?: unknown;
  sourceUrl?: unknown;
  centralBankDemandWeakening?: unknown;
  note?: unknown;
  user_id?: unknown;
  userId?: unknown;
  owner_id?: unknown;
  ownerId?: unknown;
}

export type ValidatedGoldMacroInput = {
  observationMonth: string;
  etfNetFlowUsd: number;
  holdingsChangeTonnes: number;
  centralBankDemandStatus: 'STABLE' | 'WEAKENING';
  sourceUrl: string;
  sourceExcerpt: string | null;
};

type GoldMacroInputValidation =
  | { ok: true; value: ValidatedGoldMacroInput }
  | { ok: false; message: string };

function officialGoldOrgUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (
      url.protocol !== 'https:'
      || (hostname !== 'gold.org' && !hostname.endsWith('.gold.org'))
      || url.username
      || url.password
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function validateGoldMacroInput(body: unknown): GoldMacroInputValidation {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: '요청 본문은 객체여야 합니다.' };
  }
  const input = body as GoldMacroInputBody;
  if (
    input.user_id !== undefined
    || input.userId !== undefined
    || input.owner_id !== undefined
    || input.ownerId !== undefined
  ) {
    return {
      ok: false,
      message: 'owner 식별자는 요청 본문에서 지정할 수 없습니다.',
    };
  }

  if (
    typeof input.period !== 'string'
    || !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period)
  ) {
    return { ok: false, message: 'period는 YYYY-MM 형식이어야 합니다.' };
  }
  if (
    typeof input.etfFlowUsdBillion !== 'number'
    || !Number.isFinite(input.etfFlowUsdBillion)
  ) {
    return {
      ok: false,
      message: 'etfFlowUsdBillion은 유한한 숫자여야 합니다.',
    };
  }
  const etfNetFlowUsd = input.etfFlowUsdBillion * 1_000_000_000;
  if (!Number.isFinite(etfNetFlowUsd)) {
    return {
      ok: false,
      message: 'etfFlowUsdBillion 값이 저장 가능한 범위를 벗어났습니다.',
    };
  }
  if (
    typeof input.holdingsChangeTonnes !== 'number'
    || !Number.isFinite(input.holdingsChangeTonnes)
  ) {
    return {
      ok: false,
      message: 'holdingsChangeTonnes는 유한한 숫자여야 합니다.',
    };
  }
  if (typeof input.sourceUrl !== 'string') {
    return { ok: false, message: 'World Gold Council 출처 URL이 필요합니다.' };
  }
  const sourceUrl = officialGoldOrgUrl(input.sourceUrl.trim());
  if (!sourceUrl) {
    return {
      ok: false,
      message: 'sourceUrl은 공식 HTTPS gold.org URL이어야 합니다.',
    };
  }
  if (typeof input.centralBankDemandWeakening !== 'boolean') {
    return {
      ok: false,
      message: 'centralBankDemandWeakening은 boolean이어야 합니다.',
    };
  }
  if (
    input.note !== undefined
    && input.note !== null
    && typeof input.note !== 'string'
  ) {
    return { ok: false, message: 'note는 문자열이어야 합니다.' };
  }
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > 600) {
    return { ok: false, message: 'note는 600자 이하여야 합니다.' };
  }

  return {
    ok: true,
    value: {
      observationMonth: `${input.period}-01`,
      etfNetFlowUsd,
      holdingsChangeTonnes: input.holdingsChangeTonnes,
      centralBankDemandStatus: input.centralBankDemandWeakening
        ? 'WEAKENING'
        : 'STABLE',
      sourceUrl,
      sourceExcerpt: note || null,
    },
  };
}
