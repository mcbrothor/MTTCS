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
  sectorRows: { symbol: string; name: string; return1: number; return20: number; riskOn: boolean; rank: number }[];
  foreignNetBuy5d?: number | null;
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

function indexReason(
  status: EarlyWarningSeverity,
  primaryLabel: string,
  primaryDistance: number | null,
  secondaryLabel: string,
  secondaryDistance: number | null,
  above200Pct: number,
) {
  if (!isNumber(primaryDistance) || !isNumber(secondaryDistance)) {
    return `${primaryLabel} 또는 ${secondaryLabel}의 50일선 비교 데이터가 부족해 확정하지 않고 주의 상태로 판단했습니다.`;
  }
  const below = [
    { label: primaryLabel, distance: primaryDistance },
    { label: secondaryLabel, distance: secondaryDistance },
  ].filter((item) => item.distance < 0);
  if (status === 'HALT') {
    return `${below.map((item) => item.label).join('와 ')}가 모두 50일선 아래이고, 200일선 위 시장 참여 폭도 ${round(above200Pct, 0)}%로 40% 미만이어서 중단으로 판단했습니다.`;
  }
  if (status === 'REDUCE') {
    return `${below.map((item) => item.label).join('와 ')}가 모두 50일선 아래여서 단기 매도 압력이 강한 축소 상태로 판단했습니다.`;
  }
  if (status === 'WATCH') {
    return `${below[0]?.label ?? primaryLabel}가 50일선 아래로 내려가 두 지수의 추세가 엇갈리므로 주의로 판단했습니다.`;
  }
  return `${primaryLabel}와 ${secondaryLabel}가 모두 50일선 위에 있어 단기 추세가 유지되는 정상 상태로 판단했습니다.`;
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

function isKoreaMarket(market: string) {
  return market === 'KR' || market.startsWith('KR_');
}

function koreanIndexLabel(symbol: string) {
  if (symbol === '^KS200') return 'KOSPI 200';
  if (symbol === '^KS11') return 'KOSPI';
  if (symbol === '^KQ150') return 'KOSDAQ 150';
  if (symbol === '^KQ11') return 'KOSDAQ';
  return symbol;
}

function diagnoseUsRotation(input: EarlyWarningInput): EarlyWarningMatrix['rotation'] {
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

function diagnoseKoreaRotation(input: EarlyWarningInput): EarlyWarningMatrix['rotation'] {
  const leaders = input.sectorRows.slice(0, 3);
  const positiveLeaders = leaders.filter((row) => row.return1 > 0);
  const averageReturn = leaders.length
    ? leaders.reduce((sum, row) => sum + row.return1, 0) / leaders.length
    : null;

  let diagnosis: RotationDiagnosis = 'UNCONFIRMED';
  if (
    (input.above200Pct < 40 && positiveLeaders.length <= 1) ||
    (isNumber(averageReturn) && averageReturn <= -3)
  ) {
    diagnosis = 'BROAD_DE_RISKING';
  } else if (input.above200Pct >= 40 && positiveLeaders.length >= 2) {
    diagnosis = 'HEALTHY_ROTATION';
  }

  const detail = diagnosis === 'HEALTHY_ROTATION'
    ? '국내 주도 업종 다수가 상승하고 시장 참여 폭도 유지돼 업종 간 순환이 이어지고 있습니다.'
    : diagnosis === 'BROAD_DE_RISKING'
      ? '국내 주도 업종 약세와 시장 참여 폭 위축이 함께 나타나 자금 이탈 위험이 커졌습니다.'
      : '국내 주도 업종과 시장 참여 폭의 방향이 아직 충분히 뚜렷하지 않습니다.';

  return {
    diagnosis,
    label: rotationLabel(diagnosis),
    detail,
    receivers: positiveLeaders.map((row) => row.name),
    defensives: [],
  };
}

function diagnoseRotation(input: EarlyWarningInput): EarlyWarningMatrix['rotation'] {
  return isKoreaMarket(input.market) ? diagnoseKoreaRotation(input) : diagnoseUsRotation(input);
}

function buildIndexSignal(input: EarlyWarningInput): EarlyWarningSignal {
  const mainDistance = distancePct(input.mainPrice, input.mainMa50);
  if (isKoreaMarket(input.market)) {
    const secondarySymbol = input.mainSymbol.includes('KQ') ? '^KS11' : '^KQ11';
    const secondaryQuote = input.macroQuotes[secondarySymbol];
    const secondaryDistance = distancePct(quotePrice(secondaryQuote), quoteMa50(secondaryQuote));
    const belowCount = [mainDistance, secondaryDistance].filter((value) => isNumber(value) && value < 0).length;
    let status = priceLineStatus(input.mainPrice, input.mainMa50);
    if (belowCount >= 2) status = input.above200Pct < 40 ? 'HALT' : 'REDUCE';
    else if (belowCount === 1) status = stricter(status, 'WATCH');
    if (!isNumber(mainDistance) || !isNumber(secondaryDistance)) status = stricter(status, 'WATCH');

    const secondaryValue = isNumber(secondaryDistance)
      ? ` · ${koreanIndexLabel(secondarySymbol)} ${formatPct(secondaryDistance)}`
      : '';
    return {
      id: 'index_ma50',
      title: '국내 대표 지수가 50일 평균선 위에 있는가',
      what: '한국 대표 지수들이 최근 50거래일 평균 가격 위에 있는지 봅니다.',
      why: '국내 시장이 강할 때는 주요 지수가 50일 평균선 위에서 버팁니다. 동반 이탈하면 단기 매도 압력이 커진 것으로 봅니다.',
      status,
      reason: indexReason(
        status,
        koreanIndexLabel(input.mainSymbol),
        mainDistance,
        koreanIndexLabel(secondarySymbol),
        secondaryDistance,
        input.above200Pct,
      ),
      value: `${koreanIndexLabel(input.mainSymbol)} ${formatPct(mainDistance)}${secondaryValue}`,
      threshold: '국내 대표 지수가 50일 평균선 위',
      action: status === 'OK'
        ? '새 매수 검토 가능'
        : status === 'WATCH'
          ? '돌파 매수는 작게 시작'
          : status === 'REDUCE'
            ? '새 매수 비중 축소'
            : '신규 매수 중단',
      source: 'KIS·Yahoo Finance 국내 지수 가격과 50일 평균',
    };
  }

  const qqqPrice = quotePrice(input.macroQuotes.QQQ);
  const qqqDistance = distancePct(qqqPrice, quoteMa50(input.macroQuotes.QQQ));
  const belowCount = [mainDistance, qqqDistance].filter((value) => isNumber(value) && value < 0).length;
  let status = priceLineStatus(input.mainPrice, input.mainMa50);
  if (belowCount >= 2) status = input.above200Pct < 40 ? 'HALT' : 'REDUCE';
  else if (belowCount === 1) status = stricter(status, 'WATCH');
  if (!isNumber(mainDistance) || !isNumber(qqqDistance)) status = stricter(status, 'WATCH');

  return {
    id: 'index_ma50',
    title: '지수가 50일 평균선 위에 있는가',
    what: '대표 지수와 기술주 지수가 최근 50거래일 평균 가격 위에 있는지 봅니다.',
    why: '강한 시장은 보통 중요한 지수가 50일 평균선 위에서 버팁니다. 이탈하면 단기 매도 압력이 커진 것으로 봅니다.',
    status,
    reason: indexReason(status, input.mainSymbol, mainDistance, 'QQQ', qqqDistance, input.above200Pct),
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

function buildKoreaLeadershipSignal(input: EarlyWarningInput): EarlyWarningSignal {
  const leaders = input.sectorRows.slice(0, 3);
  const averageReturn = leaders.length
    ? leaders.reduce((sum, row) => sum + row.return1, 0) / leaders.length
    : null;
  const positiveCount = leaders.filter((row) => row.return1 > 0).length;
  let status: EarlyWarningSeverity = 'WATCH';
  if (leaders.length > 0 && positiveCount >= 2 && isNumber(averageReturn) && averageReturn >= 0) status = 'OK';
  else if (leaders.length > 0 && positiveCount === 0 && isNumber(averageReturn) && averageReturn <= -3) status = 'REDUCE';

  return {
    id: 'sector_leadership',
    title: '국내 주도 업종의 흐름이 유지되는가',
    what: '당일 수익률 상위 국내 업종들이 상승 흐름을 보이는지 봅니다.',
    why: '국내 상승장이 건강하려면 일부 종목만이 아니라 주도 업종 여러 곳으로 매수세가 이어져야 합니다.',
    status,
    reason: leaders.length === 0
      ? '업종 수익률 데이터가 없어 정상 여부를 확정하지 않고 주의로 판단했습니다.'
      : status === 'OK'
        ? `상위 3개 업종 중 ${positiveCount}개가 상승하고 평균 수익률도 ${formatPct(averageReturn)}여서 정상으로 판단했습니다.`
        : status === 'REDUCE'
          ? `상위 업종이 모두 하락하고 평균 수익률도 ${formatPct(averageReturn)}로 -3% 이하라서 축소로 판단했습니다.`
          : `상위 3개 업종 중 상승 업종이 ${positiveCount}개에 그쳐 매수세 확산이 충분하지 않으므로 주의로 판단했습니다.`,
    value: leaders.length
      ? `${leaders.map((row) => row.name).join(' · ')}${isNumber(averageReturn) ? ` · 평균 ${formatPct(averageReturn)}` : ''}`
      : '국내 업종 데이터 확인 필요',
    threshold: '상위 3개 업종 중 2개 이상 상승',
    action: status === 'OK'
      ? '주도 업종 후보 확인'
      : status === 'WATCH'
        ? '업종 확산 여부를 더 확인'
        : '약한 업종의 신규 비중 축소',
    source: '국내 업종 ETF 당일 수익률',
  };
}

function buildKoreaForeignFlowSignal(input: EarlyWarningInput): EarlyWarningSignal {
  const netBuy = input.foreignNetBuy5d;
  let status: EarlyWarningSeverity = 'WATCH';
  if (isNumber(netBuy) && netBuy >= 500) status = 'OK';
  else if (isNumber(netBuy) && netBuy <= -500) status = input.above200Pct < 40 ? 'HALT' : 'REDUCE';

  return {
    id: 'foreign_flow',
    title: '외국인 수급이 국내 시장을 지지하는가',
    what: '국내 대표지수 ETF의 최근 5거래일 외국인 순매수 흐름을 봅니다.',
    why: '외국인 수급은 국내 대형주와 지수 방향에 영향을 주므로 추세와 함께 확인할 필요가 있습니다.',
    status,
    reason: !isNumber(netBuy)
      ? '최근 5거래일 외국인 순매수 데이터가 없어 확정하지 않고 주의로 판단했습니다.'
      : status === 'OK'
        ? `5거래일 누적 순매수가 ${round(netBuy / 100, 1)}억원으로 +5억원 기준을 넘어 정상으로 판단했습니다.`
        : status === 'HALT'
          ? `5거래일 누적 순매수가 ${round(netBuy / 100, 1)}억원으로 -5억원 이하이고 시장 참여 폭도 40% 미만이라 중단으로 판단했습니다.`
          : status === 'REDUCE'
            ? `5거래일 누적 순매수가 ${round(netBuy / 100, 1)}억원으로 -5억원 이하라 축소로 판단했습니다.`
            : `5거래일 누적 순매수가 ±5억원의 뚜렷한 방향 기준 안에 있어 주의로 판단했습니다.`,
    value: isNumber(netBuy)
      ? `${netBuy > 0 ? '+' : ''}${round(netBuy / 100, 1)}억원 (5거래일 누적)`
      : '외국인 수급 데이터 확인 필요',
    threshold: '대표지수 ETF 5거래일 누적 ±5억원',
    action: status === 'OK'
      ? '외국인 수급 지지 확인'
      : status === 'WATCH'
        ? '지수 추세와 수급을 함께 확인'
        : status === 'REDUCE'
          ? '대형주 신규 비중 축소'
          : '신규 매수 중단',
    source: 'KIS 국내 대표지수 ETF 외국인 수급',
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
  const reason = !isNumber(price)
    ? 'MAGS 가격 데이터가 없어 핵심 가격선 유지 여부를 확정하지 않고 주의로 판단했습니다.'
    : status === 'HALT'
      ? `MAGS가 58달러 아래이고 자금도 시장 밖으로 이동해 기술주 주도력 훼손이 심한 중단 상태로 판단했습니다.`
      : status === 'REDUCE'
        ? price < 60
          ? `MAGS가 핵심 기준인 60달러 아래여서 기술주 신규 비중을 줄이는 축소 상태로 판단했습니다.`
          : `MAGS가 60달러는 지켰지만 50일선보다 ${formatPct(maDistance)} 낮아 축소로 판단했습니다.`
        : status === 'WATCH'
          ? price < 60
            ? `MAGS가 60달러 아래지만 자금이 다른 위험 업종으로 순환하고 있어 즉시 축소 대신 주의로 판단했습니다.`
            : `MAGS가 50일선보다 ${formatPct(maDistance)} 낮아 추세 회복을 확인해야 하므로 주의로 판단했습니다.`
          : `MAGS가 60달러 이상이고 50일선보다 ${formatPct(maDistance)} 높아 정상으로 판단했습니다.`;

  return {
    id: 'big_tech_line',
    title: '빅테크 7종목 묶음이 핵심 가격선을 지키는가',
    what: '빅테크 7종목을 같은 비중으로 담은 MAGS가 60달러와 50일 평균선 위에 있는지 봅니다.',
    why: '최근 미국 시장은 빅테크 집중도가 높아서 이 묶음이 무너지면 지수 전체가 좋아 보여도 내부 위험이 커질 수 있습니다.',
    status,
    reason,
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
  const reason = !isNumber(price)
    ? 'AUD/JPY 가격 데이터가 없어 위험 선호 여부를 확정하지 않고 주의로 판단했습니다.'
    : status === 'HALT'
      ? `AUD/JPY가 108 아래이고 자금도 방어자산으로 이동해 위험 회피가 강한 중단 상태로 판단했습니다.`
      : status === 'REDUCE'
        ? `AUD/JPY가 110 아래인 가운데 ${input.currentVix >= 20 ? `VIX도 ${round(input.currentVix, 1)}로 높아` : '달러도 50일선 위여서'} 위험 회피가 겹친 축소 상태로 판단했습니다.`
        : status === 'WATCH'
          ? 'AUD/JPY가 110 아래지만 변동성이나 달러의 추가 위험 신호가 겹치지 않아 주의로 판단했습니다.'
          : `AUD/JPY가 ${round(price, 2)}로 110선을 지켜 위험 선호가 유지되는 정상 상태로 판단했습니다.`;

  return {
    id: 'aud_jpy',
    title: '위험 선호 환율이 110선을 지키는가',
    what: '호주달러/엔 환율이 110 위에 있는지 봅니다.',
    why: '호주달러는 경기 민감 통화, 엔은 안전 통화로 보는 경우가 많아 이 환율이 밀리면 위험자산 선호가 약해졌다는 단서가 됩니다.',
    status,
    reason,
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
  const reason = status === 'HALT'
    ? `200일선 위에 있는 시장 폭 대용 ETF가 ${round(input.above200Pct, 0)}%로 25% 미만이어서 중단으로 판단했습니다.`
    : status === 'REDUCE'
      ? `200일선 위 비율이 ${round(input.above200Pct, 0)}%로 위험 기준인 40% 미만이어서 축소로 판단했습니다.`
      : status === 'WATCH'
        ? input.above200Pct < 60
          ? `200일선 위 비율이 ${round(input.above200Pct, 0)}%로 양호 기준인 60%에 못 미쳐 주의로 판단했습니다.`
          : `200일선 위 비율은 양호하지만 20일 평균 수익률이 ${formatPct(avgReturn20)}로 음수여서 주의로 판단했습니다.`
        : `200일선 위 비율이 ${round(input.above200Pct, 0)}%로 60% 이상이고 20일 평균 수익률도 양호해 정상으로 판단했습니다.`;

  return {
    id: 'market_breadth',
    title: '함께 오르는 종목이 줄고 있는가',
    what: isKoreaMarket(input.market)
      ? '국내 대표 지수와 시장 폭 대용 ETF가 장기 평균선 위에 얼마나 남아 있는지 봅니다.'
      : '주요 지수와 시장 폭 대용 ETF가 장기 평균선 위에 얼마나 남아 있는지 봅니다.',
    why: '지수는 몇 개 대형주로 버틸 수 있지만, 함께 오르는 종목이 줄면 상승장의 체력이 약해집니다.',
    status,
    reason,
    value: `${round(input.above200Pct, 0)}%가 200일 평균선 위${isNumber(avgReturn20) ? ` · 20일 평균 ${formatPct(avgReturn20)}` : ''}`,
    threshold: '60% 이상 양호, 40% 미만 위험',
    action: status === 'OK'
      ? '시장 참여 폭 양호'
      : status === 'WATCH'
        ? '후보 종목을 더 엄격히 선별'
        : status === 'REDUCE'
          ? '새 매수 수량 축소'
          : '신규 매수 중단',
    source: isKoreaMarket(input.market) ? '국내 대표지수·ETF 시장 폭 대용치' : 'ETF breadth proxy',
  };
}

function buildMoneyFlowSignal(
  rotation: EarlyWarningMatrix['rotation'],
  breadthStatus: EarlyWarningSeverity,
  koreaMarket = false,
): EarlyWarningSignal {
  let status: EarlyWarningSeverity = 'WATCH';
  if (rotation.diagnosis === 'HEALTHY_ROTATION' || rotation.diagnosis === 'BIG_TECH_LEADERSHIP') status = 'OK';
  if (rotation.diagnosis === 'BROAD_DE_RISKING') status = breadthStatus === 'HALT' ? 'HALT' : 'REDUCE';
  const reason = rotation.diagnosis === 'HEALTHY_ROTATION'
    ? '약해진 주도주에서 빠진 자금이 다른 위험 업종으로 이동해 시장 안 순환이 유지되므로 정상으로 판단했습니다.'
    : rotation.diagnosis === 'BIG_TECH_LEADERSHIP'
      ? '빅테크 주도력이 유지되고 방어자산 쏠림이 뚜렷하지 않아 정상으로 판단했습니다.'
      : rotation.diagnosis === 'BROAD_DE_RISKING'
        ? breadthStatus === 'HALT'
          ? '자금이 방어자산으로 이동하는 동시에 시장 참여 폭도 중단 수준까지 축소돼 중단으로 판단했습니다.'
          : '자금이 중소형주·산업재보다 달러·채권·금 등 방어자산으로 이동해 축소로 판단했습니다.'
        : '자금의 이동 방향이 뚜렷하지 않아 추격 매수를 보류해야 하는 주의 상태로 판단했습니다.';

  return {
    id: 'money_flow',
    title: '빠진 돈이 시장 안에 남아 있는가',
    what: koreaMarket
      ? '국내 주도 업종이 바뀌면서도 상승 업종과 시장 참여 폭이 유지되는지 봅니다.'
      : '빅테크에서 빠진 돈이 중소형주, 리츠, 산업재로 가는지 아니면 달러, 채권, 금으로 빠지는지 봅니다.',
    why: koreaMarket
      ? '건강한 순환이면 국내 시장 안에서 주도 업종만 바뀌지만, 상승 업종과 참여 폭이 함께 줄면 시장 이탈로 볼 수 있습니다.'
      : '건강한 순환이면 시장 내부에서 주도주만 바뀌지만, 방어 자산으로 몰리면 시장 전체 위험 회피로 볼 수 있습니다.',
    status,
    reason,
    value: rotation.label,
    threshold: koreaMarket ? '국내 업종 순환은 양호, 참여 폭 동반 축소는 위험' : '시장 안 순환은 양호, 방어자산 쏠림은 위험',
    action: status === 'OK'
      ? '순환 업종 후보 확인'
      : status === 'WATCH'
        ? '방향이 뚜렷해질 때까지 추격 매수 자제'
        : status === 'REDUCE'
          ? '새 매수 비중 축소'
          : '신규 매수 중단',
    source: koreaMarket ? '국내 업종 수익률·시장 폭 대용치' : 'ETF relative flow proxy',
    detail: rotation.detail,
  };
}

export function buildEarlyWarningMatrix(input: EarlyWarningInput): EarlyWarningMatrix {
  const koreaMarket = isKoreaMarket(input.market);
  const rotation = diagnoseRotation(input);
  const indexSignal = buildIndexSignal(input);
  const breadthSignal = buildBreadthSignal(input);
  const moneyFlowSignal = buildMoneyFlowSignal(rotation, breadthSignal.status, koreaMarket);
  const marketSpecificSignals = koreaMarket
    ? [buildKoreaLeadershipSignal(input), buildKoreaForeignFlowSignal(input)]
    : [buildBigTechSignal(input, rotation), buildAudJpySignal(input, rotation)];
  const signals = [indexSignal, ...marketSpecificSignals, breadthSignal, moneyFlowSignal];
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
