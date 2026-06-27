import type {
  EarlyWarningMatrix,
  EarlyWarningSeverity,
  EarlyWarningSignal,
  RotationDiagnosis,
} from '@/types';

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export interface EarlyWarningQuote {
  symbol?: string;
  regularMarketPrice?: number | null;
  regularMarketChangePercent?: number | null;
  fiftyDayAverage?: number | null;
}

export interface EarlyWarningInput {
  market: string;
  mainSymbol: string;
  mainPrice: number;
  mainMa50: number;
  above200Pct: number;
  currentVix: number;
  macroQuotes: Record<string, EarlyWarningQuote | undefined>;
  breadthRows: { symbol: string; above200: boolean; return20: number }[];
  sectorRows: { symbol: string; name: string; return20: number; riskOn: boolean; rank: number }[];
  asOf?: string;
}

const severityRank: Record<EarlyWarningSeverity, number> = {
  OK: 0,
  WATCH: 1,
  REDUCE: 2,
  HALT: 3,
};

function stricter(left: EarlyWarningSeverity, right: EarlyWarningSeverity): EarlyWarningSeverity {
  return severityRank[right] > severityRank[left] ? right : left;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatPct(value: number | null | undefined, digits = 1) {
  if (!isNumber(value)) return '확인 필요';
  const rounded = round(value, digits);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

function quotePrice(quote?: EarlyWarningQuote | null) {
  return isNumber(quote?.regularMarketPrice) ? quote.regularMarketPrice : null;
}

function quoteChange(quote?: EarlyWarningQuote | null) {
  return isNumber(quote?.regularMarketChangePercent) ? quote.regularMarketChangePercent : null;
}

function quoteMa50(quote?: EarlyWarningQuote | null) {
  return isNumber(quote?.fiftyDayAverage) ? quote.fiftyDayAverage : null;
}

function distancePct(price: number | null, reference: number | null) {
  if (!isNumber(price) || !isNumber(reference) || reference <= 0) return null;
  return ((price - reference) / reference) * 100;
}

function priceLineStatus(price: number | null, line: number | null, hardBreakPct = -2): EarlyWarningSeverity {
  const distance = distancePct(price, line);
  if (distance === null) return 'WATCH';
  if (distance < hardBreakPct) return 'REDUCE';
  if (distance < 0) return 'WATCH';
  return 'OK';
}

function severitySummary(status: EarlyWarningSeverity) {
  if (status === 'OK') return {
    summary: '중요 조기경보가 안정 구간입니다.',
    action: '계획한 종목만 정상 비중 안에서 검토합니다.',
  };
  if (status === 'WATCH') return {
    summary: '일부 조기경보가 흔들리고 있습니다.',
    action: '새 매수는 작게 시작하고, 손절선과 보유 종목 상태를 먼저 확인합니다.',
  };
  if (status === 'REDUCE') return {
    summary: '여러 위험 신호가 겹쳐 비중 축소가 필요한 구간입니다.',
    action: '새 매수 비중을 줄이고, 약한 보유 종목은 방어 기준을 앞당깁니다.',
  };
  return {
    summary: '시장 밖으로 돈이 빠지는 위험 신호가 강합니다.',
    action: '신규 매수는 중단하고 현금, 손절선, 포트폴리오 집중도를 우선 점검합니다.',
  };
}

function rotationLabel(diagnosis: RotationDiagnosis) {
  if (diagnosis === 'HEALTHY_ROTATION') return '건강한 순환';
  if (diagnosis === 'BROAD_DE_RISKING') return '시장 밖으로 회피';
  if (diagnosis === 'BIG_TECH_LEADERSHIP') return '빅테크 주도 유지';
  return '방향 확인 필요';
}

function diagnoseRotation(input: EarlyWarningInput): EarlyWarningMatrix['rotation'] {
  const spyChange = quoteChange(input.macroQuotes.SPY) ?? 0;
  const qqqChange = quoteChange(input.macroQuotes.QQQ);
  const magsChange = quoteChange(input.macroQuotes.MAGS);
  const magsPrice = quotePrice(input.macroQuotes.MAGS);
  const receiverSymbols = ['IWM', 'MDY', 'RSP', 'XLI', 'XLRE', 'IYR'];
  const defensiveSymbols = ['SHY', 'TLT', 'GLD', 'UUP'];
  const receivers = receiverSymbols.filter((symbol) => {
    const change = quoteChange(input.macroQuotes[symbol]);
    return isNumber(change) && (change > 0.2 || change > spyChange + 0.35);
  });
  const defensives = defensiveSymbols.filter((symbol) => {
    const change = quoteChange(input.macroQuotes[symbol]);
    return isNumber(change) && change > 0.2 && change > spyChange + 0.2;
  });
  const topRiskOnSectors = input.sectorRows.slice(0, 3).filter((row) => row.riskOn).map((row) => row.symbol);
  const techWeak =
    (isNumber(magsChange) && magsChange < spyChange - 0.35) ||
    (isNumber(qqqChange) && qqqChange < spyChange - 0.35) ||
    (isNumber(magsPrice) && magsPrice < 60);
  const techStrong =
    (isNumber(magsChange) && magsChange > 0) ||
    (isNumber(qqqChange) && qqqChange > Math.max(0, spyChange));

  const defensiveDominance = defensives.length >= 3 && defensives.length > receivers.length;
  let diagnosis: RotationDiagnosis = 'UNCONFIRMED';
  if (techWeak && ((defensives.length >= 2 && receivers.length <= 1) || defensiveDominance)) {
    diagnosis = 'BROAD_DE_RISKING';
  } else if (techWeak && (receivers.length >= 2 || topRiskOnSectors.length >= 2)) {
    diagnosis = 'HEALTHY_ROTATION';
  } else if (techStrong) {
    diagnosis = 'BIG_TECH_LEADERSHIP';
  }

  const detail = diagnosis === 'HEALTHY_ROTATION'
    ? '빅테크가 쉬어도 중소형주, 동일가중, 리츠, 산업재 쪽으로 돈이 남아 있습니다.'
    : diagnosis === 'BROAD_DE_RISKING'
      ? '빅테크 약세와 함께 달러, 채권, 금 같은 방어 자산이 상대적으로 강합니다.'
      : diagnosis === 'BIG_TECH_LEADERSHIP'
        ? '시장은 아직 대형 기술주 중심으로 버티고 있습니다.'
        : '자금이 어디로 이동하는지 충분히 뚜렷하지 않습니다.';

  return {
    diagnosis,
    label: rotationLabel(diagnosis),
    detail,
    receivers: receivers.length ? receivers : topRiskOnSectors,
    defensives,
  };
}

function buildIndexSignal(input: EarlyWarningInput): EarlyWarningSignal {
  const mainDistance = distancePct(input.mainPrice, input.mainMa50);
  const qqqPrice = quotePrice(input.macroQuotes.QQQ);
  const qqqDistance = distancePct(qqqPrice, quoteMa50(input.macroQuotes.QQQ));
  const belowCount = [mainDistance, qqqDistance].filter((value) => isNumber(value) && value < 0).length;
  let status = priceLineStatus(input.mainPrice, input.mainMa50);
  if (belowCount >= 2) status = input.above200Pct < 40 ? 'HALT' : 'REDUCE';
  else if (belowCount === 1) status = stricter(status, 'WATCH');

  return {
    id: 'index_ma50',
    title: '지수가 50일 평균선 위에 있는가',
    what: '대표 지수와 기술주 지수가 최근 50거래일 평균 가격 위에 있는지 봅니다.',
    why: '강한 시장은 보통 중요한 지수가 50일 평균선 위에서 버팁니다. 이탈하면 단기 매도 압력이 커진 것으로 봅니다.',
    status,
    value: `${input.mainSymbol} ${formatPct(mainDistance)}${isNumber(qqqDistance) ? ` · QQQ ${formatPct(qqqDistance)}` : ''}`,
    threshold: '대표 지수와 QQQ가 50일 평균선 위',
    action: status === 'OK'
      ? '새 매수 검토 가능'
      : status === 'WATCH'
        ? '돌파 매수는 작게 시작'
        : status === 'REDUCE'
          ? '새 매수 비중 축소'
          : '신규 매수 중단',
    source: 'Yahoo Finance price and 50-day average',
  };
}

function buildBigTechSignal(input: EarlyWarningInput, rotation: EarlyWarningMatrix['rotation']): EarlyWarningSignal {
  const quote = input.macroQuotes.MAGS;
  const price = quotePrice(quote);
  const maDistance = distancePct(price, quoteMa50(quote));
  let status: EarlyWarningSeverity = 'WATCH';
  if (isNumber(price)) {
    status = price >= 60 ? priceLineStatus(price, quoteMa50(quote)) : 'REDUCE';
    if (price < 60 && rotation.diagnosis === 'HEALTHY_ROTATION') status = 'WATCH';
    if (price < 58 && rotation.diagnosis === 'BROAD_DE_RISKING') status = 'HALT';
  }

  return {
    id: 'big_tech_line',
    title: '빅테크 7종목 묶음이 핵심 가격선을 지키는가',
    what: '빅테크 7종목을 같은 비중으로 담은 MAGS가 60달러와 50일 평균선 위에 있는지 봅니다.',
    why: '최근 미국 시장은 빅테크 집중도가 높아서 이 묶음이 무너지면 지수 전체가 좋아 보여도 내부 위험이 커질 수 있습니다.',
    status,
    value: isNumber(price) ? `MAGS ${round(price, 2)}달러 · 50일선 대비 ${formatPct(maDistance)}` : 'MAGS 데이터 확인 필요',
    threshold: 'MAGS 60달러 이상, 가능하면 50일 평균선 위',
    action: status === 'OK'
      ? '빅테크 주도력 유지'
      : status === 'WATCH'
        ? '빅테크 약세가 다른 업종으로 흡수되는지 확인'
        : status === 'REDUCE'
          ? '기술주 신규 비중 축소'
          : '기술주 신규 진입 중단',
    source: 'Roundhill MAGS via Yahoo Finance',
    detail: rotation.detail,
  };
}

function buildAudJpySignal(input: EarlyWarningInput, rotation: EarlyWarningMatrix['rotation']): EarlyWarningSignal {
  const audJpy = input.macroQuotes['AUDJPY=X'];
  const price = quotePrice(audJpy);
  const change = quoteChange(audJpy);
  const uupAbove50 = distancePct(quotePrice(input.macroQuotes.UUP), quoteMa50(input.macroQuotes.UUP));
  let status: EarlyWarningSeverity = 'WATCH';
  if (isNumber(price)) {
    if (price >= 110) status = 'OK';
    else status = input.currentVix >= 20 || (isNumber(uupAbove50) && uupAbove50 > 0) ? 'REDUCE' : 'WATCH';
    if (price < 108 && rotation.diagnosis === 'BROAD_DE_RISKING') status = 'HALT';
  }

  return {
    id: 'aud_jpy',
    title: '위험 선호 환율이 110선을 지키는가',
    what: '호주달러/엔 환율이 110 위에 있는지 봅니다.',
    why: '호주달러는 경기 민감 통화, 엔은 안전 통화로 보는 경우가 많아 이 환율이 밀리면 위험자산 선호가 약해졌다는 단서가 됩니다.',
    status,
    value: isNumber(price) ? `AUD/JPY ${round(price, 2)} · 당일 ${formatPct(change)}` : 'AUD/JPY 데이터 확인 필요',
    threshold: '110 이상 유지',
    action: status === 'OK'
      ? '위험 선호 유지'
      : status === 'WATCH'
        ? '환율과 변동성 동시 확인'
        : status === 'REDUCE'
          ? '해외 성장주 신규 비중 축소'
          : '위험자산 신규 진입 중단',
    source: 'Yahoo Finance AUDJPY=X',
  };
}

function buildBreadthSignal(input: EarlyWarningInput): EarlyWarningSignal {
  const avgReturn20 = input.breadthRows.length
    ? input.breadthRows.reduce((sum, row) => sum + row.return20, 0) / input.breadthRows.length
    : null;
  let status: EarlyWarningSeverity = 'OK';
  if (input.above200Pct < 25) status = 'HALT';
  else if (input.above200Pct < 40) status = 'REDUCE';
  else if (input.above200Pct < 60 || (isNumber(avgReturn20) && avgReturn20 < 0)) status = 'WATCH';

  return {
    id: 'market_breadth',
    title: '함께 오르는 종목이 줄고 있는가',
    what: '주요 지수와 시장 폭 대용 ETF가 장기 평균선 위에 얼마나 남아 있는지 봅니다.',
    why: '지수는 몇 개 대형주로 버틸 수 있지만, 함께 오르는 종목이 줄면 상승장의 체력이 약해집니다.',
    status,
    value: `${round(input.above200Pct, 0)}%가 200일 평균선 위${isNumber(avgReturn20) ? ` · 20일 평균 ${formatPct(avgReturn20)}` : ''}`,
    threshold: '60% 이상 양호, 40% 미만 위험',
    action: status === 'OK'
      ? '시장 참여 폭 양호'
      : status === 'WATCH'
        ? '후보 종목을 더 엄격히 선별'
        : status === 'REDUCE'
          ? '새 매수 수량 축소'
          : '신규 매수 중단',
    source: 'ETF breadth proxy',
  };
}

function buildMoneyFlowSignal(rotation: EarlyWarningMatrix['rotation'], breadthStatus: EarlyWarningSeverity): EarlyWarningSignal {
  let status: EarlyWarningSeverity = 'WATCH';
  if (rotation.diagnosis === 'HEALTHY_ROTATION' || rotation.diagnosis === 'BIG_TECH_LEADERSHIP') status = 'OK';
  if (rotation.diagnosis === 'BROAD_DE_RISKING') status = breadthStatus === 'HALT' ? 'HALT' : 'REDUCE';

  return {
    id: 'money_flow',
    title: '빠진 돈이 시장 안에 남아 있는가',
    what: '빅테크에서 빠진 돈이 중소형주, 리츠, 산업재로 가는지 아니면 달러, 채권, 금으로 빠지는지 봅니다.',
    why: '건강한 순환이면 시장 내부에서 주도주만 바뀌지만, 방어 자산으로 몰리면 시장 전체 위험 회피로 볼 수 있습니다.',
    status,
    value: rotation.label,
    threshold: '시장 안 순환은 양호, 방어자산 쏠림은 위험',
    action: status === 'OK'
      ? '순환 업종 후보 확인'
      : status === 'WATCH'
        ? '방향이 뚜렷해질 때까지 추격 매수 자제'
        : status === 'REDUCE'
          ? '새 매수 비중 축소'
          : '신규 매수 중단',
    source: 'ETF relative flow proxy',
    detail: rotation.detail,
  };
}

export function buildEarlyWarningMatrix(input: EarlyWarningInput): EarlyWarningMatrix {
  const rotation = diagnoseRotation(input);
  const indexSignal = buildIndexSignal(input);
  const bigTechSignal = buildBigTechSignal(input, rotation);
  const audJpySignal = buildAudJpySignal(input, rotation);
  const breadthSignal = buildBreadthSignal(input);
  const moneyFlowSignal = buildMoneyFlowSignal(rotation, breadthSignal.status);
  const signals = [indexSignal, bigTechSignal, audJpySignal, breadthSignal, moneyFlowSignal];
  const status = signals.reduce<EarlyWarningSeverity>((current, signal) => stricter(current, signal.status), 'OK');
  const { summary, action } = severitySummary(status);

  return {
    status,
    summary,
    action,
    rotation,
    signals,
    updatedAt: input.asOf ?? new Date().toISOString(),
  };
}
