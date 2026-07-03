import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const daily = jiti('../lib/daily-screeners/index.ts');

function candidate(overrides) {
  return {
    source: 'minervini',
    universe: 'NASDAQ100',
    ticker: 'AAA',
    exchange: 'US',
    name: 'AAA Inc',
    score: 50,
    grade: 'Review',
    price: 100,
    priceAsOf: '2026-06-12',
    reason: 'test reason',
    metrics: {},
    raw: {},
    ...overrides,
  };
}

{
  const rows = daily.dedupeCandidatesBySourceTicker([
    candidate({ ticker: 'AAA', score: 40, universe: 'SP500' }),
    candidate({ ticker: 'AAA', score: 80, universe: 'NASDAQ100' }),
    candidate({ ticker: 'BBB', score: 70 }),
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows.find((row) => row.ticker === 'AAA' && row.universe === 'NASDAQ100').score, 80);
  assert.equal(rows.find((row) => row.ticker === 'AAA' && row.universe === 'SP500').score, 40);
}

{
  const rows = [
    candidate({ ticker: 'CCC', score: 60 }),
    candidate({ ticker: 'AAA', score: 90 }),
    candidate({ ticker: 'BBB', score: 90 }),
    candidate({ source: 'momentum', ticker: 'MMM', score: 75 }),
  ];
  const grouped = daily.groupTopCandidatesBySource(rows, 2);
  assert.deepEqual(grouped.minervini.map((row) => row.ticker), ['AAA', 'BBB']);
  assert.deepEqual(grouped.minervini.map((row) => row.rank), [1, 2]);
  assert.equal(grouped.momentum[0].ticker, 'MMM');
}

{
  const rows = [
    candidate({ ticker: 'USA1', name: 'US One', score: 91, universe: 'NASDAQ100', exchange: 'NAS' }),
    candidate({ ticker: 'USA2', name: 'US Two', score: 83, universe: 'SP500', exchange: 'NYS' }),
    candidate({ ticker: 'KR1', name: '한국원', score: 95, universe: 'KOSPI200', exchange: 'KOSPI' }),
    candidate({ ticker: 'KR2', name: '한국투', score: 81, universe: 'KOSDAQ150', exchange: 'KOSDAQ' }),
  ];
  const grouped = daily.groupTopCandidatesBySourceMarket(rows, 10);
  assert.deepEqual(grouped.minervini.US.map((row) => row.ticker), ['USA1', 'USA2']);
  assert.deepEqual(grouped.minervini.KR.map((row) => row.ticker), ['KR1', 'KR2']);
  assert.deepEqual(grouped.minervini.US.map((row) => row.rank), [1, 2]);
  assert.deepEqual(grouped.minervini.KR.map((row) => row.rank), [1, 2]);
}

{
  const candidates = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'].map((ticker, index) => candidate({
    ticker,
    source: index === 0 ? 'leader' : 'minervini',
    score: 90 - index,
  }));
  const parsed = daily.parseDailyTop5Response(JSON.stringify({
    top5: candidates.map((row, index) => ({
      rank: index + 1,
      ticker: row.ticker,
      source: row.source,
      reason: `reason ${row.ticker}`,
      confidence: 0.75,
      risk: 'risk',
    })),
    report_markdown: '# Top5',
  }), candidates);
  assert.equal(parsed.top5.length, 5);
  assert.equal(parsed.top5[0].ticker, 'AAA');
  assert.equal(parsed.reportMarkdown, '# Top5');
}

{
  const candidates = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'].map((ticker) => candidate({ ticker }));
  const parsed = daily.parseDailyTop5Response(`\`\`\`json
{
  "top5": [
    { "ticker": "AAA" },
    { "ticker": "BBB" },
    { "ticker": "CCC" },
    { "ticker": "DDD" },
    { "ticker": "EEE" }
  ],
  "report_markdown": "# Fenced Top5"
}`, candidates);
  assert.equal(parsed.top5.length, 5);
  assert.equal(parsed.reportMarkdown, '# Fenced Top5');
}

{
  const candidates = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'].map((ticker) => candidate({ ticker }));
  const parsed = daily.parseDailyTop5Response(`{
  "top5": [
    { "ticker": "AAA", "reason": "A" },
    { "ticker": "BBB", "reason": "B" },
    { "ticker": "CCC", "reason": "C" },
    { "ticker": "DDD", "reason": "D" },
    { "ticker": "EEE", "reason": "E" }
  ],
  "report_markdown": "# broken
}`, candidates);
  assert.deepEqual(parsed.top5.map((row) => row.ticker), ['AAA', 'BBB', 'CCC', 'DDD', 'EEE']);
}

{
  const candidates = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'].map((ticker) => candidate({ ticker }));
  assert.throws(
    () => daily.parseDailyTop5Response(JSON.stringify({
      top5: [
        { ticker: 'AAA' },
        { ticker: 'AAA' },
        { ticker: 'CCC' },
        { ticker: 'DDD' },
        { ticker: 'EEE' },
      ],
    }), candidates),
    /Duplicate ticker/
  );
  assert.throws(
    () => daily.parseDailyTop5Response(JSON.stringify({
      top5: [
        { ticker: 'AAA' },
        { ticker: 'BBB' },
        { ticker: 'CCC' },
        { ticker: 'DDD' },
        { ticker: 'ZZZ' },
      ],
    }), candidates),
    /Unexpected ticker/
  );
}

{
  const byCategory = {
    NASDAQ100: Array.from({ length: 10 }, (_, index) => candidate({
      ticker: `NDX${index + 1}`,
      name: `Nasdaq Company ${index + 1}`,
      universe: 'NASDAQ100',
      exchange: 'US',
      source: index % 2 === 0 ? 'minervini' : 'leader',
      score: 95 - index,
    })),
    SP500: Array.from({ length: 10 }, (_, index) => candidate({
      ticker: `SP${index + 1}`,
      name: `S&P Company ${index + 1}`,
      universe: 'SP500',
      exchange: 'US',
      source: index % 2 === 0 ? 'leader' : 'canslim',
      score: 94 - index,
    })),
    KOSPI200: Array.from({ length: 10 }, (_, index) => candidate({
      ticker: `KP${index + 1}`,
      name: `코스피기업 ${index + 1}`,
      universe: 'KOSPI200',
      exchange: 'KOSPI',
      source: index % 2 === 0 ? 'momentum' : 'canslim',
      score: 93 - index,
    })),
    KOSDAQ150: Array.from({ length: 10 }, (_, index) => candidate({
      ticker: `KQ${index + 1}`,
      name: `코스닥기업 ${index + 1}`,
      universe: 'KOSDAQ150',
      exchange: 'KOSDAQ',
      source: index % 2 === 0 ? 'qullamaggie' : 'leader',
      score: 92 - index,
    })),
  };
  const parsed = daily.parseDailyCategoryTop10Response(JSON.stringify({
    categories: Object.fromEntries(Object.entries(byCategory).map(([category, rows]) => [category, rows.map((row, index) => ({
      rank: index + 1,
      ticker: row.ticker,
      source: row.source,
      reason: `${row.name} 선정 사유`,
      confidence: 0.8,
      risk: '변동성',
    }))])),
    report_markdown: '# Category Top10',
  }), Object.values(byCategory).flat());
  assert.equal(parsed.categories.NASDAQ100.length, 10);
  assert.equal(parsed.categories.SP500.length, 10);
  assert.equal(parsed.categories.KOSPI200.length, 10);
  assert.equal(parsed.categories.KOSDAQ150.length, 10);
  assert.equal(parsed.categories.NASDAQ100[0].name, 'Nasdaq Company 1');
  assert.equal(parsed.categories.KOSDAQ150[0].name, '코스닥기업 1');
  assert.equal(parsed.categories.KOSPI200[0].market, 'KR');
  assert.equal(parsed.reportMarkdown, '# Category Top10');
}

{
  const categories = {
    NASDAQ100: Array.from({ length: 10 }, (_, index) => candidate({ ticker: `NDX${index + 1}`, universe: 'NASDAQ100' })),
    SP500: Array.from({ length: 10 }, (_, index) => candidate({ ticker: `SP${index + 1}`, universe: 'SP500' })),
    KOSPI200: Array.from({ length: 10 }, (_, index) => candidate({ ticker: `KP${index + 1}`, universe: 'KOSPI200', exchange: 'KOSPI' })),
    KOSDAQ150: Array.from({ length: 10 }, (_, index) => candidate({ ticker: `KQ${index + 1}`, universe: 'KOSDAQ150', exchange: 'KOSDAQ' })),
  };
  const rowsFor = (override = {}) => Object.fromEntries(Object.entries(categories).map(([category, rows]) => [category, rows.map((row, index) => ({
    rank: index + 1,
    ticker: row.ticker,
    ...override,
  }))]));
  const allCandidates = Object.values(categories).flat();
  assert.throws(
    () => daily.parseDailyCategoryTop10Response(JSON.stringify({
      categories: { ...rowsFor(), NASDAQ100: categories.NASDAQ100.slice(0, 9).map((row, index) => ({ rank: index + 1, ticker: row.ticker })) },
      report_markdown: '',
    }), allCandidates),
    /NASDAQ100 daily Top10 response must include exactly 10/
  );
  assert.throws(
    () => daily.parseDailyCategoryTop10Response(JSON.stringify({
      categories: { ...rowsFor(), NASDAQ100: categories.NASDAQ100.map((row, index) => ({ rank: index + 1, ticker: index === 9 ? 'NDX1' : row.ticker })) },
      report_markdown: '',
    }), allCandidates),
    /Duplicate ticker in NASDAQ100/
  );
  assert.throws(
    () => daily.parseDailyCategoryTop10Response(JSON.stringify({
      categories: { ...rowsFor(), NASDAQ100: categories.NASDAQ100.map((row, index) => ({ rank: index + 1, ticker: index === 9 ? 'KP1' : row.ticker })) },
      report_markdown: '',
    }), allCandidates),
    /Unexpected ticker in NASDAQ100/
  );
}

{
  const us = Array.from({ length: 10 }, (_, index) => candidate({
    ticker: `US${index + 1}`,
    name: `US Company ${index + 1}`,
    universe: 'NASDAQ100',
    source: 'leader',
    score: 90 - index,
  }));
  const message = daily.formatDailyCategoryTop10TelegramMessage({
    runDate: '2026-06-12',
    category: 'NASDAQ100',
    top10: us.map((row, index) => ({
      rank: index + 1,
      category: 'NASDAQ100',
      market: 'US',
      ticker: row.ticker,
      name: row.name,
      universe: row.universe,
      score: row.score,
      grade: row.grade,
      source: row.source,
      reason: 'LLM 선정 사유',
      confidence: 0.82,
      risk: '핵심 리스크',
    })),
    provider: 'codex-cli',
  });
  assert.match(message, /나스닥 추천 Top10/);
  assert.match(message, /US1/);
  assert.match(message, /US Company 1/);
  assert.match(message, /신뢰도 82%/);
  assert.match(message, /근거: LLM 선정 사유/);
  assert.match(message, /리스크: 핵심 리스크/);
  assert.match(message, /\n\n2\. \*US2\*/);
}

{
  const prompt = daily.buildDailyCategoryTop10Prompt({
    runDate: '2026-06-12',
    candidates: [
      candidate({ ticker: 'AAA', source: 'minervini', score: 91 }),
      candidate({ ticker: 'BBB', source: 'momentum', universe: 'KOSPI200', exchange: 'KOSPI', score: 89 }),
    ],
  });
  assert.match(prompt, /MTN 점수만 재정렬하지 말고/);
  assert.match(prompt, /공개 시장 정보/);
  assert.match(prompt, /최신 뉴스, 실시간 가격, 재무 수치/);
  assert.match(prompt, /리스크 조정 모멘텀/);
  assert.match(prompt, /확인 필요/);
  assert.match(prompt, /categories/);
}

{
  const message = daily.formatDailyScreenerTelegramMessage({
    runDate: '2026-06-12',
    source: 'momentum',
    market: 'KR',
    candidates: [candidate({ source: 'momentum', ticker: 'MOMO', score: 88 })],
  });
  assert.match(message, /MTN Daily/);
  assert.match(message, /한국 Top10/);
  assert.match(message, /MOMO/);
  assert.match(message, /AAA Inc/);
}

console.log('daily screeners tests passed');
