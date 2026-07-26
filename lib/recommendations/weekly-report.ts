interface HorizonSummary {
  horizon: string;
  sampleSize: number;
  positiveHitRate: number | null;
  benchmarkWinRate: number | null;
  averageReturnPct?: number | null;
  medianReturnPct?: number | null;
  averageExcessReturnPct: number | null;
  averageMaePct?: number | null;
  lowerDecileReturnPct?: number | null;
  flowCoveragePct?: number | null;
  contributors?: Array<{
    ticker: string;
    name: string | null;
    evaluationCount: number;
    averageReturnPct: number | null;
    averageExcessReturnPct: number;
    contributionPctPoints: number;
  }>;
}

interface DiagnosticFindingSummary {
  causeCode: string;
  findingStatus: 'HYPOTHESIS' | 'CONFIRMED';
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  sampleSize: number;
  summaryKo: string;
}

interface PolicyDecisionSummary {
  cohortCount: number;
  decision: 'PROMOTE_FLOW' | 'PROMOTE_RISK' | 'CONTINUE' | 'KEEP_OFFICIAL';
  riskComparison: {
    sampleSize: number;
    meanDelta: number | null;
    low90: number | null;
    high90: number | null;
  };
  flowComparison: {
    sampleSize: number;
    meanDelta: number | null;
    low90: number | null;
    high90: number | null;
  };
}

interface ReportCategory {
  category: keyof typeof CATEGORY_LABELS;
  market: 'US' | 'KR';
  horizons: HorizonSummary[];
  cumulativeHorizons?: HorizonSummary[];
  dataAsOf?: string | null;
  weeklyDataAsOf?: string | null;
  causes: Array<{ causeCode: string; count: number; critical: number; confirmed: number }>;
  findings?: DiagnosticFindingSummary[];
  policies?: Array<{ engineVersion: string; d5: HorizonSummary | null }>;
  policyDecision?: PolicyDecisionSummary | null;
}

const CATEGORY_LABELS = {
  NASDAQ100: '나스닥',
  SP500: 'S&P500',
  KOSPI200: '코스피',
  KOSDAQ150: '코스닥',
} as const;

const MARKET_EMOJIS = {
  US: '🇺🇸',
  KR: '🇰🇷',
} as const;

const CAUSE_LABELS: Record<string, string> = {
  MARKET_REGIME: '시장 환경',
  SELECTION: '종목 선정',
  ENTRY_TIMING: '진입 시점',
  SIGNAL_SOURCE: '신호 소스',
  CONCENTRATION: '종목 편중',
  DATA_QUALITY: '데이터 품질',
};

const POLICY_DECISION_LABELS: Record<PolicyDecisionSummary['decision'], string> = {
  PROMOTE_FLOW: '리스크·수급 정책 승격 검토',
  PROMOTE_RISK: '리스크 순위 정책 승격 검토',
  CONTINUE: '비교 관찰 계속',
  KEEP_OFFICIAL: '기본 정책 유지',
};

const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;

function shiftIsoDate(date: string, days: number) {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function seoulDate(isoDateTime: string) {
  const date = new Date(isoDateTime);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid generatedAt: ${isoDateTime}`);
  return new Date(date.getTime() + SEOUL_OFFSET_MS).toISOString().slice(0, 10);
}

export function getRecommendationWeeklyWindow(generatedAt: string) {
  const reportDate = seoulDate(generatedAt);
  const to = shiftIsoDate(reportDate, -1);
  return { from: shiftIsoDate(to, -6), to };
}

function percent(value: number | null | undefined, signed = false) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '확인 불가';
  return `${signed && value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function percentagePoint(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '확인 불가';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%p`;
}

function safeText(value: string, maxLength = 180) {
  const normalized = value.replace(/[*_`[\]]/g, '').replace(/\s+/g, ' ').trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function horizon(rows: HorizonSummary[] | undefined, name: string) {
  return rows?.find((row) => row.horizon === name) || null;
}

function categorySignal(row: HorizonSummary) {
  const excess = row.averageExcessReturnPct;
  const benchmarkWinRate = row.benchmarkWinRate;
  const positiveHitRate = row.positiveHitRate;
  if (excess === null || benchmarkWinRate === null) return '⚪';
  if (excess > 0 && benchmarkWinRate >= 50 && (positiveHitRate ?? 0) >= 50) return '🟢';
  if (excess > 0 && benchmarkWinRate >= 50) return '🟡';
  if (excess < 0 && benchmarkWinRate < 50) return '🔴';
  return '🟠';
}

function categoryNames(categories: ReportCategory[]) {
  const keys = new Set(categories.map((item) => item.category));
  if (keys.size === Object.keys(CATEGORY_LABELS).length) return '전 시장';
  if (keys.size === 2 && keys.has('NASDAQ100') && keys.has('SP500')) return '미국';
  if (keys.size === 2 && keys.has('KOSPI200') && keys.has('KOSDAQ150')) return '한국';
  return categories.map((item) => CATEGORY_LABELS[item.category]).join('·');
}

function contributorLabel(contributor: NonNullable<HorizonSummary['contributors']>[number]) {
  const ticker = safeText(contributor.ticker, 12).toUpperCase();
  const rawName = contributor.name
    ?.replace(/,?\s+(?:corporation|corp\.?|incorporated|inc\.?|limited|ltd\.?|company|co\.?)\.?$/i, '')
    .trim();
  const name = rawName ? safeText(rawName, 18) : '';
  if (!name || name.toUpperCase() === ticker) return ticker;
  return /^\d+$/.test(ticker) ? `${name}(${ticker})` : `${ticker}(${name})`;
}

function contributionLine(row: HorizonSummary) {
  const outperforming = (row.averageExcessReturnPct ?? 0) >= 0;
  const contributors = (row.contributors || [])
    .filter((item) => outperforming ? item.contributionPctPoints > 0 : item.contributionPctPoints < 0)
    .sort((left, right) => outperforming
      ? right.contributionPctPoints - left.contributionPctPoints
      : left.contributionPctPoints - right.contributionPctPoints)
    .slice(0, 3);
  if (contributors.length === 0) return null;
  const label = outperforming ? '상회 기여' : '하회 요인';
  const details = contributors.map((item) => (
    `${contributorLabel(item)} \`${percentagePoint(item.contributionPctPoints, 2)}\`(평가 ${item.evaluationCount}건)`
  ));
  return `  ${label}: ${details.join(' · ')}`;
}

function weeklyD5(item: ReportCategory) {
  return horizon(item.horizons, 'D5');
}

function executiveSummary(categories: ReportCategory[]) {
  const available = categories
    .map((item) => ({ item, row: weeklyD5(item) }))
    .filter((entry): entry is { item: ReportCategory; row: HorizonSummary } => Boolean(entry.row && entry.row.sampleSize > 0));
  if (available.length === 0) return ['⚪ 이번 주 평가완료 성과가 없어 정책 판단을 유보합니다.'];

  const winners = available.filter(({ row }) => (row.averageExcessReturnPct ?? 0) > 0).map(({ item }) => item);
  const laggards = available.filter(({ row }) => (row.averageExcessReturnPct ?? 0) < 0).map(({ item }) => item);
  const fragile = available
    .filter(({ row }) => row.positiveHitRate !== null && row.positiveHitRate < 50)
    .map(({ item }) => item);
  const lines: string[] = [];

  if (winners.length > 0 && laggards.length > 0) {
    lines.push(`🟡 시장 대비 우위: ${categoryNames(winners)} · 열위: ${categoryNames(laggards)}`);
  } else if (winners.length > 0) {
    lines.push(`🟢 ${categoryNames(winners)} 추천이 시장 대비 우위입니다.`);
  } else if (laggards.length > 0) {
    lines.push(`🔴 ${categoryNames(laggards)} 추천이 시장 대비 열위입니다.`);
  } else {
    lines.push('🟠 시장 대비 성과가 중립 수준입니다.');
  }

  if (fragile.length > 0) {
    lines.push(`⚠ ${categoryNames(fragile)}은 수익 종목 비율이 50% 미만이어서 절대 성과를 함께 점검해야 합니다.`);
  }

  const d20 = categories.reduce((sum, item) => sum + (horizon(item.horizons, 'D20')?.sampleSize || 0), 0);
  const d60 = categories.reduce((sum, item) => sum + (horizon(item.horizons, 'D60')?.sampleSize || 0), 0);
  if (d20 === 0 || d60 === 0) {
    const pending = d20 === 0 && d60 === 0 ? '20·60거래일' : d20 === 0 ? '20거래일' : '60거래일';
    lines.push(`⏳ 추천 후 ${pending} 신규 평가가 없어 중장기 결론은 보류합니다.`);
  }
  return lines;
}

function topFinding(categories: ReportCategory[]) {
  const rank = { CRITICAL: 3, WARN: 2, INFO: 1 } as const;
  return categories
    .flatMap((item) => (item.findings || []).map((finding) => ({ item, finding })))
    .sort((a, b) => {
      const confirmed = Number(b.finding.findingStatus === 'CONFIRMED') - Number(a.finding.findingStatus === 'CONFIRMED');
      return confirmed || rank[b.finding.severity] - rank[a.finding.severity] || b.finding.sampleSize - a.finding.sampleSize;
    })[0] || null;
}

function riskLines(categories: ReportCategory[]) {
  const risks = categories
    .map((item) => ({ item, row: weeklyD5(item) }))
    .filter((entry): entry is { item: ReportCategory; row: HorizonSummary } => entry.row?.lowerDecileReturnPct !== null
      && entry.row?.lowerDecileReturnPct !== undefined)
    .sort((a, b) => (a.row.lowerDecileReturnPct as number) - (b.row.lowerDecileReturnPct as number));
  const lines: string[] = [];
  if (risks[0]) {
    lines.push(`• 최대 하방 위험: ${CATEGORY_LABELS[risks[0].item.category]} 최악 10% 평균 ${percent(risks[0].row.lowerDecileReturnPct, true)}`);
  }

  const top = topFinding(categories);
  if (top) {
    const status = top.finding.findingStatus === 'CONFIRMED' ? '확인된 반복 원인' : '점검 가설';
    lines.push(`• ${status}: ${CATEGORY_LABELS[top.item.category]} · ${safeText(top.finding.summaryKo)}`);
  } else {
    const cause = categories
      .flatMap((item) => item.causes.map((row) => ({ item, row })))
      .sort((a, b) => b.row.confirmed - a.row.confirmed || b.row.critical - a.row.critical || b.row.count - a.row.count)[0];
    if (cause) {
      lines.push(`• 점검 가설: ${CATEGORY_LABELS[cause.item.category]} · ${CAUSE_LABELS[cause.row.causeCode] || safeText(cause.row.causeCode)} ${cause.row.count}건`);
    }
  }
  return lines;
}

function actionLines(categories: ReportCategory[]) {
  const available = categories
    .map((item) => ({ item, row: weeklyD5(item) }))
    .filter((entry): entry is { item: ReportCategory; row: HorizonSummary } => Boolean(entry.row && entry.row.sampleSize > 0));
  const laggards = available.filter(({ row }) => (row.averageExcessReturnPct ?? 0) < 0).map(({ item }) => item);
  const fragile = available.filter(({ row }) => (row.positiveHitRate ?? 100) < 50).map(({ item }) => item);
  const actions: string[] = [];
  if (laggards.length > 0) actions.push(`${categoryNames(laggards)} 종목 선정 요인과 손실 기여 종목 재검토`);
  if (fragile.length > 0) actions.push(`${categoryNames(fragile)} 상대성과와 절대손익 분리 점검`);

  const pendingLongTerm = categories.some((item) => (horizon(item.horizons, 'D20')?.sampleSize || 0) === 0
    || (horizon(item.horizons, 'D60')?.sampleSize || 0) === 0);
  if (pendingLongTerm) actions.push('추천 후 20·60거래일 평가가 쌓일 때까지 중장기 정책 변경 보류');
  return actions.slice(0, 3);
}

function dataAsOfLabel(categories: ReportCategory[]) {
  const dates = [...new Set(categories
    .map((item) => item.weeklyDataAsOf || item.dataAsOf)
    .filter((date): date is string => Boolean(date)))].sort();
  if (dates.length === 0) return '데이터 기준 확인 필요';
  if (dates.length === 1) return `데이터 ${dates[0]}`;
  return `데이터 ${dates[0]}~${dates.at(-1)}`;
}

function dateDistanceDays(from: string, to: string) {
  const fromMs = new Date(`${from}T00:00:00.000Z`).getTime();
  const toMs = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.floor((toMs - fromMs) / 86_400_000);
}

export function validateRecommendationWeeklyReadiness(
  categories: Array<{ category: string; weeklyDataAsOf?: string | null; d5SampleSize: number }>,
  reportingWindow: { from: string; to: string },
  options: { minD5SampleSize?: number; maxDataLagDays?: number } = {},
) {
  const minD5SampleSize = Math.max(1, options.minD5SampleSize ?? 5);
  const maxDataLagDays = Math.max(0, options.maxDataLagDays ?? 3);
  const failures: string[] = [];
  const dates: string[] = [];

  for (const category of categories) {
    if (category.d5SampleSize < minD5SampleSize) {
      failures.push(`${category.category}: D5 표본 ${category.d5SampleSize}건(최소 ${minD5SampleSize}건)`);
    }
    if (!category.weeklyDataAsOf) {
      failures.push(`${category.category}: 최신 평가일 없음`);
      continue;
    }
    dates.push(category.weeklyDataAsOf);
    const lagDays = dateDistanceDays(category.weeklyDataAsOf, reportingWindow.to);
    if (lagDays < 0 || lagDays > maxDataLagDays) {
      failures.push(`${category.category}: 최신 평가일 ${category.weeklyDataAsOf}(허용 지연 ${maxDataLagDays}일)`);
    }
  }

  return {
    ready: failures.length === 0,
    failures,
    dataAsOf: dates.sort().at(0) || null,
  };
}

export function formatRecommendationWeeklyReport(input: {
  generatedAt: string;
  reportingWindow?: { from: string; to: string };
  categories: ReportCategory[];
  dashboardUrl?: string | null;
}) {
  const reportDate = seoulDate(input.generatedAt);
  const reportingWindow = input.reportingWindow || getRecommendationWeeklyWindow(input.generatedAt);
  const lines = [
    '📊 *MTN 추천 성과 주간 브리핑*',
    `기준 ${reportDate} · 평가일 ${reportingWindow.from}~${reportingWindow.to}`,
    `${dataAsOfLabel(input.categories)} · 진입 시가 → 평가일 종가`,
    '',
    '*경영 요약*',
    ...executiveSummary(input.categories),
    '',
    '*시장별 추천 후 5거래일 성과*',
  ];

  for (const item of input.categories) {
    const weekly = horizon(item.horizons, 'D5');
    const cumulative = horizon(item.cumulativeHorizons, 'D5');
    const row = weekly && weekly.sampleSize > 0 ? weekly : cumulative;
    const label = `${MARKET_EMOJIS[item.market]} *${CATEGORY_LABELS[item.category]}*`;
    if (!row || row.sampleSize <= 0) {
      lines.push(`${label} · 평가완료 표본 없음`);
      continue;
    }
    const scope = weekly && weekly.sampleSize > 0 ? '이번 주' : '누적 참고';
    lines.push(
      `${categorySignal(row)} ${label} · ${scope} 평가 ${row.sampleSize}건`,
      `  시장보다 평균 \`${percentagePoint(row.averageExcessReturnPct)}\` · 시장을 이긴 평가 ${percent(row.benchmarkWinRate)} · 수익 난 평가 ${percent(row.positiveHitRate)}`,
    );
    if (row.averageReturnPct !== null && row.averageReturnPct !== undefined) {
      lines.push(`  평균 수익 ${percent(row.averageReturnPct, true)}${row.averageMaePct !== null && row.averageMaePct !== undefined
        ? ` · 평균 최대 하락 ${percent(row.averageMaePct, true)}` : ''}`);
    }
    const contribution = contributionLine(row);
    if (contribution) lines.push(contribution);
  }

  const d5 = input.categories.reduce((sum, item) => sum + (horizon(item.horizons, 'D5')?.sampleSize || 0), 0);
  const d20 = input.categories.reduce((sum, item) => sum + (horizon(item.horizons, 'D20')?.sampleSize || 0), 0);
  const d60 = input.categories.reduce((sum, item) => sum + (horizon(item.horizons, 'D60')?.sampleSize || 0), 0);
  const completed = [
    d5 > 0 ? `5거래일 ${d5}건` : '',
    d20 > 0 ? `20거래일 ${d20}건` : '',
    d60 > 0 ? `60거래일 ${d60}건` : '',
  ].filter(Boolean);
  const pending = [
    d5 === 0 ? '5거래일' : '',
    d20 === 0 ? '20거래일' : '',
    d60 === 0 ? '60거래일' : '',
  ].filter(Boolean);
  lines.push('', '*평가 완료 현황*');
  if (completed.length > 0) lines.push(`• 이번 주 새로 평가된 추천 · ${completed.join(' · ')}`);
  if (pending.length > 0) lines.push(`• 이번 주 신규 평가 없음 · ${pending.join(' · ')}`);

  const policyRows = input.categories.filter((item) => item.market === 'KR' && item.policyDecision);
  if (policyRows.length > 0) {
    lines.push('', '*정책 비교 · 동일 추천일 기준*');
    for (const item of policyRows) {
      const decision = item.policyDecision as PolicyDecisionSummary;
      lines.push(decision.cohortCount > 0
        ? `• ${CATEGORY_LABELS[item.category]} · ${POLICY_DECISION_LABELS[decision.decision]} · 비교 가능한 추천일 ${decision.cohortCount}일`
        : `• ${CATEGORY_LABELS[item.category]} · 정책 비교 대기 · 같은 추천일 자료 없음`);
    }
  }

  const risks = riskLines(input.categories);
  if (risks.length > 0) lines.push('', '*핵심 리스크*', ...risks);

  const actions = actionLines(input.categories);
  if (actions.length > 0) lines.push('', '*이번 주 조치*', ...actions.map((action, index) => `${index + 1}. ${action}`));

  lines.push(
    '',
    '*용어 안내*',
    '• 평가 건수: 같은 종목도 추천일이 다르면 각각 1건으로 셉니다.',
    '• 시장보다 평균 ±%p(퍼센트포인트): 추천 수익률에서 해당 시장 비교지수 수익률을 뺀 평균입니다.',
    '• 종목 기여도: 해당 종목의 초과수익 합계를 그 시장의 전체 평가 건수로 나눈 값입니다.',
    '_배당·세금·수수료·슬리피지 제외 · 평가가 끝나고 가격 데이터가 확보된 건만 집계_',
  );
  if (input.dashboardUrl) lines.push(`[상세 성과와 산식 보기](${input.dashboardUrl.slice(0, 500)})`);
  return lines.join('\n');
}
