interface HorizonSummary {
  horizon: string;
  sampleSize: number;
  positiveHitRate: number | null;
  benchmarkWinRate: number | null;
  averageExcessReturnPct: number | null;
  averageMaePct?: number | null;
  lowerDecileReturnPct?: number | null;
  flowCoveragePct?: number | null;
}
const CATEGORY_LABELS = {
  NASDAQ100: '나스닥',
  SP500: 'S&P500',
  KOSPI200: '코스피',
  KOSDAQ150: '코스닥',
} as const;
const MARKET_LABELS = {
  US: '미국',
  KR: '한국',
} as const;
const CATEGORY_BENCHMARKS = {
  NASDAQ100: '^NDX',
  SP500: '^GSPC',
  KOSPI200: '^KS200',
  KOSDAQ150: '^KQ150',
} as const;

function value(value: number | null, suffix = '%', signed = true) {
  if (value === null || !Number.isFinite(value)) return '-';
  return `${signed && value > 0 ? '+' : ''}${value.toFixed(1)}${suffix}`;
}

function rate(value: number | null, sampleSize: number) {
  if (value === null || !Number.isFinite(value)) return '-';
  if (sampleSize <= 0) return value.toFixed(1) + '%';
  const count = Math.round((value / 100) * sampleSize);
  return `${value.toFixed(1)}% (${count}/${sampleSize})`;
}

export function formatRecommendationWeeklyReport(input: {
  generatedAt: string;
  categories: Array<{
    category: keyof typeof CATEGORY_LABELS;
    market: 'US' | 'KR';
    horizons: HorizonSummary[];
    causes: Array<{ causeCode: string; count: number; critical: number; confirmed: number }>;
    policies?: Array<{ engineVersion: string; d5: HorizonSummary | null }>;
  }>;
  dashboardUrl?: string | null;
}) {
  const lines = [
    '*MTN 추천 성과 주간 보고*',
    `기준: ${input.generatedAt.slice(0, 10)} · 진입가는 첫 거래 가능일 시가, 평가는 해당 기간 마지막 거래일 종가`,
    '산식: 종목수익률=(평가종가/진입시가-1), 초과수익=종목수익률-벤치마크수익률',
    '해석: 양수수익률은 종목수익률>0 비율, 벤치마크 초과율은 초과수익>0 비율, 평균 초과수익은 초과수익의 산술평균입니다.',
  ];
  for (const item of input.categories) {
    lines.push('', `*${MARKET_LABELS[item.market]} · ${CATEGORY_LABELS[item.category]}*`, `벤치마크: ${CATEGORY_BENCHMARKS[item.category]}`);
    for (const row of item.horizons) {
      lines.push(`- ${row.horizon}: 표본 n=${row.sampleSize} | 양수수익률 ${rate(row.positiveHitRate, row.sampleSize)} | 벤치마크 초과율 ${rate(row.benchmarkWinRate, row.sampleSize)} | 평균 초과수익 ${value(row.averageExcessReturnPct)}`);
    }
    for (const policy of item.policies || []) {
      const row = policy.d5;
      lines.push(row
        ? `- ${policy.engineVersion}: D5 표본 n=${row.sampleSize} | 평균 초과수익 ${value(row.averageExcessReturnPct)} | 평균 MAE ${value(row.averageMaePct ?? null)} | 하위 10% 평균수익 ${value(row.lowerDecileReturnPct ?? null)} | 수급데이터 커버리지 ${rate(row.flowCoveragePct ?? null, row.sampleSize)}`
        : `- ${policy.engineVersion}: D5 표본 없음`);
    }
    const cause = item.causes.find((row) => row.confirmed > 0 || row.critical > 0) || item.causes[0];
    lines.push(cause
      ? `- 주요 원인: ${cause.causeCode} (${cause.confirmed > 0 ? '반복 원인' : '가설'} ${cause.count}건)`
      : '- 주요 원인: 충분한 근거 없음');
  }
  lines.push('', '주의: 배당·세금·수수료·슬리피지는 제외했고, 성숙(MATURED) 및 가격품질 FULL/FALLBACK 표본만 집계했습니다.');
  if (input.dashboardUrl) lines.push(`상세: ${input.dashboardUrl}`);
  return lines.join('\n');
}
