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
function value(value: number | null, suffix = '%') {
  if (value === null || !Number.isFinite(value)) return '-';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}${suffix}`;
}

export function formatRecommendationWeeklyReport(input: {
  generatedAt: string;
  markets: Array<{
    market: 'US' | 'KR';
    horizons: HorizonSummary[];
    causes: Array<{ causeCode: string; count: number; critical: number; confirmed: number }>;
    policies?: Array<{ engineVersion: string; d5: HorizonSummary | null }>;
  }>;
  dashboardUrl?: string | null;
}) {
  const lines = [
    '*MTN 추천 성과 주간 보고*',
    `기준: ${input.generatedAt.slice(0, 10)} · 첫 거래 가능 시가 기준`,
  ];
  for (const market of input.markets) {
    lines.push('', `*${market.market === 'US' ? '미국' : '한국'}*`);
    for (const row of market.horizons) {
      lines.push(`- ${row.horizon}: n=${row.sampleSize} | 플러스 ${value(row.positiveHitRate)} | 시장초과 ${value(row.benchmarkWinRate)} | 평균알파 ${value(row.averageExcessReturnPct)}`);
    }
    for (const policy of market.policies || []) {
      const row = policy.d5;
      lines.push(row
        ? `- ${policy.engineVersion}: D5 n=${row.sampleSize} | 알파 ${value(row.averageExcessReturnPct)} | MAE ${value(row.averageMaePct ?? null)} | 하위10% ${value(row.lowerDecileReturnPct ?? null)} | 수급커버 ${value(row.flowCoveragePct ?? null)}`
        : `- ${policy.engineVersion}: D5 표본 없음`);
    }
    const cause = market.causes.find((item) => item.confirmed > 0 || item.critical > 0) || market.causes[0];
    lines.push(cause
      ? `- 주요 원인: ${cause.causeCode} (${cause.confirmed > 0 ? '반복 원인' : '가설'} ${cause.count}건)`
      : '- 주요 원인: 충분한 근거 없음');
  }
  lines.push('', '주의: 배당·세금·수수료·슬리피지를 제외한 모델 신호 성과입니다.');
  if (input.dashboardUrl) lines.push(`상세: ${input.dashboardUrl}`);
  return lines.join('\n');
}
