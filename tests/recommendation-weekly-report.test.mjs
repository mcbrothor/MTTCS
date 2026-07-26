import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const {
  formatRecommendationWeeklyReport,
  getRecommendationWeeklyWindow,
  validateRecommendationWeeklyReadiness,
} = jiti('../lib/recommendations/weekly-report.ts');
const { chunkTelegramMessage } = jiti('../lib/telegram.ts');

const fixtureUrl = new URL('./fixtures/recommendation-weekly-report.input.json', import.meta.url);
const goldenUrl = new URL('./fixtures/recommendation-weekly-report.md', import.meta.url);
const input = JSON.parse(await readFile(fixtureUrl, 'utf8'));
const golden = (await readFile(goldenUrl, 'utf8')).trimEnd();
const message = formatRecommendationWeeklyReport(input);

assert.deepEqual(
  getRecommendationWeeklyWindow('2026-07-24T15:00:00.000Z'),
  { from: '2026-07-18', to: '2026-07-24' },
  '주간 범위는 UTC 날짜가 아니라 KST 발송일의 전날부터 7일이어야 한다',
);
assert.equal(message, golden, '임원 보고서 출력은 검토된 golden 문서와 정확히 일치해야 한다');

assert.match(message, /나스닥[\s\S]*이번 주 평가 88건[\s\S]*시장보다 평균 `-0\.5%p` · 시장을 이긴 평가 55\.7% · 수익 난 평가 40\.9%/);
assert.match(message, /S&P500[\s\S]*이번 주 평가 86건[\s\S]*시장보다 평균 `-0\.5%p` · 시장을 이긴 평가 46\.5% · 수익 난 평가 43\.0%/);
assert.match(message, /코스피[\s\S]*이번 주 평가 73건[\s\S]*시장보다 평균 `\+4\.0%p` · 시장을 이긴 평가 60\.3% · 수익 난 평가 21\.9%/);
assert.match(message, /코스닥[\s\S]*이번 주 평가 60건[\s\S]*시장보다 평균 `\+5\.6%p` · 시장을 이긴 평가 61\.7% · 수익 난 평가 31\.7%/);
assert.doesNotMatch(message, /\bn\s*=/, '임원 보고서에는 설명 없는 n 변수를 노출하지 않아야 한다');
assert.doesNotMatch(message, /\bD(?:5|20|60)\b/, '거래일 구간은 D5 같은 코드 대신 자연어로 설명해야 한다');
assert.match(message, /추천 후 20·60거래일 신규 평가가 없어 중장기 결론은 보류합니다/);
assert.doesNotMatch(
  message,
  /SELECTION|daily-top10-category-balanced-v1|kr-risk-ranked-v2|kr-risk-flow-v2\.1/,
  '임원 본문에는 원인 코드나 엔진 버전을 노출하지 않아야 한다',
);
assert.doesNotMatch(message, /평균 수익|평균 최대 하락/, '미제공 절대수익·MAE를 정책 지표와 섞어 표시하지 않아야 한다');
assert.equal(message.length < 3_200, true, `보고서 길이는 3,200자 미만이어야 한다: ${message.length}`);
assert.equal(chunkTelegramMessage(message).length, 1, '보고서는 Telegram 단일 메시지로 전송되어야 한다');

const emptyMessage = formatRecommendationWeeklyReport({
  generatedAt: input.generatedAt,
  reportingWindow: input.reportingWindow,
  categories: [{
    category: 'NASDAQ100',
    market: 'US',
    dataAsOf: '2026-07-24',
    horizons: [
      { horizon: 'D5', sampleSize: 0, positiveHitRate: null, benchmarkWinRate: null, averageExcessReturnPct: null },
      { horizon: 'D20', sampleSize: 0, positiveHitRate: null, benchmarkWinRate: null, averageExcessReturnPct: null },
      { horizon: 'D60', sampleSize: 0, positiveHitRate: null, benchmarkWinRate: null, averageExcessReturnPct: null },
    ],
    causes: [],
  }],
});
assert.match(emptyMessage, /이번 주 평가완료 성과가 없어 정책 판단을 유보합니다/);
assert.match(emptyMessage, /나스닥.*평가완료 표본 없음/);
assert.doesNotMatch(emptyMessage, /나스닥.*n=0/);

const mixedMessage = formatRecommendationWeeklyReport({
  generatedAt: input.generatedAt,
  reportingWindow: input.reportingWindow,
  categories: [
    {
      category: 'NASDAQ100',
      market: 'US',
      dataAsOf: '2026-07-24',
      weeklyDataAsOf: null,
      horizons: [{ horizon: 'D5', sampleSize: 0, positiveHitRate: null, benchmarkWinRate: null, averageExcessReturnPct: null }],
      cumulativeHorizons: [{ horizon: 'D5', sampleSize: 100, positiveHitRate: 40, benchmarkWinRate: 40, averageExcessReturnPct: -4 }],
      causes: [],
    },
    {
      category: 'KOSPI200',
      market: 'KR',
      dataAsOf: '2026-07-24',
      weeklyDataAsOf: '2026-07-24',
      horizons: [{ horizon: 'D5', sampleSize: 10, positiveHitRate: 60, benchmarkWinRate: 70, averageExcessReturnPct: 2 }],
      causes: [],
    },
  ],
});
assert.match(mixedMessage, /코스피 추천이 시장 대비 우위/);
assert.doesNotMatch(mixedMessage, /열위: 나스닥|나스닥.*재검토/, '누적 fallback은 이번 주 결론과 조치에 섞지 않는다');
assert.match(mixedMessage, /나스닥.*누적 참고 평가 100건/);

const contributionMessage = formatRecommendationWeeklyReport({
  generatedAt: input.generatedAt,
  reportingWindow: input.reportingWindow,
  categories: [{
    category: 'NASDAQ100',
    market: 'US',
    dataAsOf: '2026-07-24',
    weeklyDataAsOf: '2026-07-24',
    horizons: [{
      horizon: 'D5',
      sampleSize: 10,
      positiveHitRate: 40,
      benchmarkWinRate: 40,
      averageReturnPct: -2,
      averageExcessReturnPct: -1.5,
      contributors: [
        { ticker: 'TSLA', name: 'Tesla', evaluationCount: 2, averageReturnPct: -8, averageExcessReturnPct: -6, contributionPctPoints: -1.2 },
        { ticker: 'NVDA', name: 'NVIDIA', evaluationCount: 1, averageReturnPct: 5, averageExcessReturnPct: 3, contributionPctPoints: 0.3 },
      ],
    }],
    causes: [],
  }],
});
assert.match(contributionMessage, /하회 요인: TSLA\(Tesla\) `-1\.20%p`\(평가 2건\)/);
assert.doesNotMatch(contributionMessage, /상회 기여:.*NVIDIA/, '시장 하회 브리핑은 하회에 기여한 종목을 우선해야 한다');
assert.match(contributionMessage, /평가 건수: 같은 종목도 추천일이 다르면 각각 1건으로 셉니다/);
assert.match(contributionMessage, /%p\(퍼센트포인트\)/);
assert.match(contributionMessage, /종목 기여도: 해당 종목의 초과수익 합계를 그 시장의 전체 평가 건수로 나눈 값/);

const longFindingMessage = formatRecommendationWeeklyReport({
  ...input,
  categories: input.categories.map((category, index) => ({
    ...category,
    findings: index === 0 ? [{
      causeCode: 'SELECTION',
      findingStatus: 'CONFIRMED',
      severity: 'CRITICAL',
      sampleSize: 10,
      summaryKo: '매우 긴 진단 '.repeat(1000),
    }] : [],
  })),
});
assert.equal(longFindingMessage.length < 3_200, true, `동적 진단이 길어도 단일 메시지 한도를 지켜야 한다: ${longFindingMessage.length}`);

assert.deepEqual(
  validateRecommendationWeeklyReadiness([
    { category: 'NASDAQ100', weeklyDataAsOf: '2026-07-24', d5SampleSize: 10 },
    { category: 'SP500', weeklyDataAsOf: null, d5SampleSize: 0 },
  ], { from: '2026-07-18', to: '2026-07-24' }, { minD5SampleSize: 5, maxDataLagDays: 3 }),
  {
    ready: false,
    failures: [
      'SP500: D5 표본 0건(최소 5건)',
      'SP500: 최신 평가일 없음',
    ],
    dataAsOf: '2026-07-24',
  },
);

console.log('recommendation weekly report tests passed');
