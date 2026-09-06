import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  saveQullamaggieEvidenceSnapshot,
  clearQullamaggieEvidenceStore,
} from '../lib/scanner/qullamaggie-evidence-store.ts';
import { GET as getEvidenceHandler } from '../app/api/scanner/qullamaggie/evidence/[snapshotId]/route.ts';

test('Qullamaggie 증거 API는 비인증 요청을 401로 차단한다', async () => {
  const req = new Request('http://localhost/api/scanner/qullamaggie/evidence/test_id', {
    headers: {},
  });
  const res = await getEvidenceHandler(req, {
    params: Promise.resolve({ snapshotId: 'test_id' }),
  });
  assert.equal(res.status, 401);
});

test('Qullamaggie 증거 API는 존재하는 스냅샷을 200과 함께 반환한다', async () => {
  clearQullamaggieEvidenceStore();
  const mockSnapshot = {
    schemaVersion: '1',
    snapshotId: 'qev_TEST_12345',
    symbol: { ticker: 'TEST', exchange: 'US', currency: 'USD' },
    provenance: {
      engineVersion: 'v1.1',
      paramsHash: 'abc',
      provider: 'MTN',
      adjustment: 'adjusted',
      timeframe: '1d',
      exchangeTimezone: 'America/New_York',
      asOfBarDate: '2026-09-05',
      calculatedAt: '2026-09-06T00:00:00Z',
      barStatus: 'closed',
      barsHash: 'hash',
      barCount: 100,
    },
    bars: [],
    analysis: { qScore: 80 },
    decision: { primarySetup: 'BREAKOUT' },
    baseCandidates: [],
    criteria: [],
    annotations: [],
    scoreTrace: [],
  };

  saveQullamaggieEvidenceSnapshot(mockSnapshot);

  const { createInternalRequest } = await import('../lib/auth/session.ts');
  process.env.MTN_AUTH_SECRET = process.env.MTN_AUTH_SECRET || 'test-secret-32-chars-long-security';

  const req = await createInternalRequest('http://localhost/api/scanner/qullamaggie/evidence/qev_TEST_12345');

  const res = await getEvidenceHandler(req, {
    params: Promise.resolve({ snapshotId: 'qev_TEST_12345' }),
  });

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.data.snapshot.snapshotId, 'qev_TEST_12345');
  assert.equal(json.data.snapshot.decision.primarySetup, 'BREAKOUT');
});
