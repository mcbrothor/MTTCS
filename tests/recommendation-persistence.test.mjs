import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const {
  canPromoteShadowPublication,
  canReplaceIncompleteOfficial,
  buildRecommendationPublicationGate,
  initialTelegramDelivery,
  persistRecommendationPolicy,
  preservedTelegramDelivery,
  resolveRecommendationPublicationDecision,
  shouldPreservePublishedPublication,
  shouldPreserveSentPublication,
  pickCandidateSnapshot,
} = jiti('../lib/recommendations/persistence.ts');

const sentAt = '2026-06-19T12:15:49.495Z';

assert.deepEqual(initialTelegramDelivery(sentAt), {
  telegram_status: 'SENT',
  telegram_sent_at: sentAt,
});

assert.deepEqual(initialTelegramDelivery(null), {
  telegram_status: 'PENDING',
  telegram_sent_at: null,
});

assert.deepEqual(preservedTelegramDelivery('SENT', sentAt), {
  telegram_status: 'SENT',
  telegram_sent_at: sentAt,
});

assert.deepEqual(preservedTelegramDelivery('FAILED', null), {
  telegram_status: 'PENDING',
  telegram_sent_at: null,
});

assert.equal(shouldPreserveSentPublication(true, 'SENT'), true);
assert.equal(shouldPreserveSentPublication(false, 'SENT'), false);
assert.equal(shouldPreserveSentPublication(true, 'FAILED'), false);
assert.equal(shouldPreservePublishedPublication(true, 'PUBLISHED'), true);
assert.equal(shouldPreservePublishedPublication(true, 'FAILED'), false);
assert.equal(shouldPreservePublishedPublication(false, 'SHADOW'), true);
assert.equal(shouldPreservePublishedPublication(false, 'PUBLISHED'), false);
assert.equal(canPromoteShadowPublication(false, true, 'SHADOW'), true);
assert.equal(canPromoteShadowPublication(false, true, 'FAILED'), true);
assert.equal(canPromoteShadowPublication(true, false, 'PUBLISHED'), false);
assert.equal(canReplaceIncompleteOfficial('FAILED'), true);
assert.equal(canReplaceIncompleteOfficial('DRAFT'), true);
assert.equal(canReplaceIncompleteOfficial('PUBLISHED'), false);

const snapshot = pickCandidateSnapshot({
  rank: 1,
  category: 'KOSPI200',
  market: 'KR',
  ticker: '005930',
  name: '삼성전자',
  universe: 'KOSPI200',
  score: 90,
  grade: 'A',
  source: 'mixed',
  reason: 'test',
  confidence: 0.8,
}, [{
  source: 'leader',
  universe: 'KOSPI200',
  ticker: '005930',
  exchange: 'KOSPI',
  name: '삼성전자',
  score: 90,
  grade: 'A',
  price: 80000,
  priceAsOf: '2026-06-22',
  reason: 'test',
  metrics: {},
  raw: {},
}], {
  investor_flow: { as_of_date: '2026-06-22', provider: 'KIS', quality: 'FULL' },
});
assert.equal(snapshot.snapshot.investor_flow.provider, 'KIS');
assert.equal(snapshot.snapshot.investor_flow.as_of_date, '2026-06-22');

const eligibleChartGate = {
  disposition: 'ACTIONABLE',
  verdict: 'BUY',
  setupGrade: 'A',
  readiness: 'ACTIONABLE',
  eligible: true,
  fundamentalVerification: 'VERIFIED',
  score: 900,
  summary: '검증 완료',
};
const unverifiedChartGate = {
  disposition: 'UNVERIFIED',
  verdict: 'UNVERIFIED',
  setupGrade: null,
  readiness: null,
  eligible: false,
  fundamentalVerification: 'UNVERIFIED',
  score: -500,
  summary: '데이터 누락',
};
const picks = Array.from({ length: 10 }, (_, index) => ({
  rank: index + 1,
  category: 'NASDAQ100',
  market: 'US',
  ticker: `TEST${index + 1}`,
  name: `Test ${index + 1}`,
  universe: 'NASDAQ100',
  score: 90 - index,
  grade: 'A',
  source: 'mixed',
  reason: 'test',
  confidence: 0.8,
}));
const result = {
  categories: { NASDAQ100: picks },
  reportMarkdown: '',
  rawResponse: '',
};
const snapshots = Object.fromEntries(picks.map((pick, index) => [
  `NASDAQ100:${pick.ticker}`,
  { chart_gate: index === 9 ? unverifiedChartGate : eligibleChartGate },
]));
const publicationGate = buildRecommendationPublicationGate(result, 'NASDAQ100', snapshots);
assert.equal(publicationGate.canPublish, false);
assert.equal(publicationGate.eligibleCount, 9);
assert.deepEqual(resolveRecommendationPublicationDecision(true, publicationGate), {
  ...publicationGate,
  requestedOfficial: true,
  isOfficial: false,
  status: 'SHADOW',
});

function createPersistenceClient({ existingPublication = null, categoryOfficial = null } = {}) {
  const writes = [];
  return {
    writes,
    from(table) {
      let operation = 'select';
      let payload = null;
      let selection = '';
      const filters = {};
      const builder = {
        select(columns) {
          selection = columns;
          return builder;
        },
        eq(column, value) {
          filters[column] = value;
          return builder;
        },
        order() { return builder; },
        limit() { return Promise.resolve({ data: [], error: null }); },
        maybeSingle() {
          if (selection.startsWith('id, version')) {
            return Promise.resolve({ data: existingPublication, error: null });
          }
          if (selection === 'id, engine_version, status') {
            return Promise.resolve({ data: categoryOfficial, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert(value) {
          operation = 'insert';
          payload = value;
          writes.push({ table, operation, payload });
          return builder;
        },
        update(value) {
          operation = 'update';
          payload = value;
          writes.push({ table, operation, payload });
          return builder;
        },
        delete() {
          operation = 'delete';
          writes.push({ table, operation, payload: null });
          return builder;
        },
        single() {
          if (table === 'recommendation_publications' && operation === 'select' && selection.startsWith('*, recommendation_picks')) {
            return Promise.resolve({
              data: {
                ...(existingPublication || {}),
                recommendation_picks: existingPublication?.recommendation_picks || [],
              },
              error: null,
            });
          }
          if (table === 'recommendation_publications' && operation === 'insert') {
            return Promise.resolve({ data: { id: 'publication-1', ...payload }, error: null });
          }
          if (table === 'recommendation_publications' && operation === 'update') {
            return Promise.resolve({
              data: { ...(existingPublication || {}), id: filters.id || existingPublication?.id || 'publication-1', ...payload },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
        then(resolve, reject) {
          return Promise.resolve({ data: selection ? [] : null, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

const candidates = picks.map((pick) => ({
  source: 'leader',
  universe: 'NASDAQ100',
  ticker: pick.ticker,
  exchange: 'NAS',
  name: pick.name,
  score: pick.score,
  grade: pick.grade,
  price: 100,
  priceAsOf: '2026-06-22',
  reason: pick.reason,
  metrics: {},
  raw: {},
}));
const client = createPersistenceClient();
const persisted = await persistRecommendationPolicy({
  client,
  runId: 'run-1',
  runDate: '2026-06-22',
  generatedAt: '2026-06-22T12:00:00.000Z',
  provider: 'test',
  model: 'test',
  result,
  candidates,
  category: 'NASDAQ100',
  engineVersion: 'test-v1',
  isOfficial: true,
  candidateSnapshotByTicker: snapshots,
});
assert.equal(persisted.is_official, false);
assert.equal(persisted.status, 'SHADOW');
const publicationInsert = client.writes.find((write) => write.table === 'recommendation_publications' && write.operation === 'insert');
assert.equal(publicationInsert.payload.is_official, false);
assert.equal(publicationInsert.payload.telegram_status, 'SKIPPED');
assert.equal(publicationInsert.payload.market_context.publication_gate.eligibleCount, 9);
const picksInsert = client.writes.find((write) => write.table === 'recommendation_picks' && write.operation === 'insert');
assert.equal(picksInsert.payload[0].candidate_snapshot.publication_gate.canPublish, false);

const safeSnapshots = Object.fromEntries(picks.map((pick) => [
  `NASDAQ100:${pick.ticker}`,
  { chart_gate: eligibleChartGate },
]));
const promotionClient = createPersistenceClient({
  existingPublication: {
    id: 'shadow-publication-1',
    version: 1,
    is_official: false,
    status: 'SHADOW',
    telegram_status: 'SKIPPED',
    telegram_sent_at: null,
  },
});
const promoted = await persistRecommendationPolicy({
  client: promotionClient,
  runId: 'run-1',
  runDate: '2026-06-22',
  generatedAt: '2026-06-22T13:00:00.000Z',
  provider: 'test',
  model: 'test',
  result,
  candidates,
  category: 'NASDAQ100',
  engineVersion: 'test-v1',
  isOfficial: true,
  candidateSnapshotByTicker: safeSnapshots,
});
assert.equal(promoted.is_official, true);
assert.equal(promoted.status, 'PUBLISHED');
assert.equal(promotionClient.writes.some((write) => write.table === 'recommendation_picks' && write.operation === 'delete'), true);
const promotionDraft = promotionClient.writes.find((write) => (
  write.table === 'recommendation_publications'
  && write.operation === 'update'
  && write.payload.status === 'DRAFT'
));
assert.equal(promotionDraft.payload.is_official, true);
const promotedPicks = promotionClient.writes.find((write) => write.table === 'recommendation_picks' && write.operation === 'insert');
assert.equal(promotedPicks.payload.length, 10);
assert.equal(promotedPicks.payload.every((pick) => pick.candidate_snapshot.publication_gate.canPublish), true);

const publishedClient = createPersistenceClient({
  existingPublication: {
    id: 'published-publication-1',
    version: 1,
    is_official: true,
    status: 'PUBLISHED',
    telegram_status: 'SENT',
    telegram_sent_at: sentAt,
    recommendation_picks: [{ rank: 1, ticker: 'PRESERVED' }],
  },
});
const preservedPublished = await persistRecommendationPolicy({
  client: publishedClient,
  runId: 'run-1',
  runDate: '2026-06-22',
  generatedAt: '2026-06-22T14:00:00.000Z',
  provider: 'test',
  model: 'test',
  result,
  candidates,
  category: 'NASDAQ100',
  engineVersion: 'test-v1',
  isOfficial: true,
  candidateSnapshotByTicker: snapshots,
});
assert.equal(preservedPublished.is_official, true);
assert.equal(preservedPublished.status, 'PUBLISHED');
assert.deepEqual(preservedPublished.picks.map((pick) => pick.ticker), ['PRESERVED']);
assert.equal(publishedClient.writes.length, 0, '기존 PUBLISHED는 새 gate 실패에도 수정하지 않아야 한다');

const failedShadowClient = createPersistenceClient({
  existingPublication: {
    id: 'failed-shadow-publication-1',
    version: 1,
    is_official: false,
    status: 'FAILED',
    telegram_status: 'SKIPPED',
    telegram_sent_at: null,
  },
});
const recoveredFailedShadow = await persistRecommendationPolicy({
  client: failedShadowClient,
  runId: 'run-1',
  runDate: '2026-06-22',
  generatedAt: '2026-06-22T15:00:00.000Z',
  provider: 'test',
  model: 'test',
  result,
  candidates,
  category: 'NASDAQ100',
  engineVersion: 'test-v1',
  isOfficial: true,
  candidateSnapshotByTicker: safeSnapshots,
});
assert.equal(recoveredFailedShadow.is_official, true);
assert.equal(recoveredFailedShadow.status, 'PUBLISHED');
assert.equal(failedShadowClient.writes.some((write) => (
  write.table === 'recommendation_publications'
  && write.operation === 'update'
  && write.payload.is_official === true
  && write.payload.status === 'DRAFT'
)), true);

console.log('recommendation persistence tests passed');
