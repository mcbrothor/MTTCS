import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeQullamaggieSetup } from '../lib/finance/engines/qullamaggie-score.ts';
import { buildQullamaggieEvidenceSnapshot } from '../lib/finance/engines/qullamaggie-evidence.ts';
import {
  saveQullamaggieEvidenceSnapshot,
  getQullamaggieEvidenceSnapshot,
  clearQullamaggieEvidenceStore,
} from '../lib/scanner/qullamaggie-evidence-store.ts';

function evidenceClient() {
  const rows = new Map();
  return {
    rows,
    from(table) {
      assert.equal(table, 'qullamaggie_evidence_snapshots');
      return {
        async insert(row) {
          if (rows.has(row.snapshot_id)) return { error: { code: '23505' } };
          rows.set(row.snapshot_id, row);
          return { error: null };
        },
        select() {
          return {
            eq(_column, snapshotId) {
              return {
                async maybeSingle() {
                  const row = rows.get(snapshotId);
                  return { data: row ? { payload: row.payload } : null, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

function bar(index, close, volume = 800000) {
  return {
    date: `2026${String(Math.floor(index / 22) + 1).padStart(2, '0')}${String((index % 22) + 1).padStart(2, '0')}`,
    open: close * 0.99,
    high: close * 1.02,
    low: close * 0.98,
    close,
    volume,
  };
}

function makeBreakoutData() {
  const data = [];
  for (let i = 0; i < 50; i++) {
    data.push(bar(i, 28 + i * 0.42, 900000));
  }
  const basePrices = [
    49.2, 48.4, 47.8, 48.6, 49.1,
    48.9, 49.4, 48.7, 49.6, 49.2,
    49.8, 49.4, 50.1, 49.7, 50.0,
    49.9, 50.2, 50.0, 50.3, 50.1,
  ];
  basePrices.forEach((price, idx) => data.push(bar(50 + idx, price, idx < 10 ? 700000 : 420000)));
  data.push({
    date: '20260401',
    open: 50.2,
    high: 52,
    low: 49.8,
    close: 51.4,
    volume: 1100000,
  });
  return data;
}

test('쿨라매기 증거 스냅샷은 엔진 판정 결과와 동일한 시세 및 어노테이션 좌표를 보존한다', () => {
  const data = makeBreakoutData();
  const analysis = analyzeQullamaggieSetup(data, { market: 'US', exchange: 'US' });
  assert.ok(analysis);

  const snapshot = buildQullamaggieEvidenceSnapshot(data, analysis, {
    ticker: 'TEST_STOCK',
    exchange: 'US',
    market: 'US',
  });

  assert.equal(snapshot.schemaVersion, '1');
  assert.ok(snapshot.snapshotId.startsWith('qev_TEST_STOCK_'));
  assert.equal(snapshot.bars.length, data.length);
  assert.equal(snapshot.decision.primarySetup, 'BREAKOUT');

  // 베이스 후보 평가 확인
  assert.ok(snapshot.baseCandidates.length > 0);
  const selectedBase = snapshot.baseCandidates.find((b) => b.selected);
  assert.ok(selectedBase);
  assert.equal(selectedBase.baseDays, analysis.baseDays);

  // Criteria 확인
  assert.ok(snapshot.criteria.length >= 7);
  const priorCriterion = snapshot.criteria.find((c) => c.id === 'crit_prior_move');
  assert.ok(priorCriterion);
  assert.equal(priorCriterion.result, 'pass');

  // 어노테이션 확인
  assert.ok(snapshot.annotations.length >= 3);
  const baseZoneAnno = snapshot.annotations.find((a) => a.id === 'anno_base_zone');
  assert.ok(baseZoneAnno);
  assert.equal(baseZoneAnno.type, 'price-zone');
  assert.equal(baseZoneAnno.lowPrice, selectedBase.baseLow);
  assert.equal(baseZoneAnno.highPrice, selectedBase.pivotPrice);
  const volumeAnnotations = snapshot.annotations.filter((annotation) => annotation.criterionId === 'crit_volume_dryup');
  assert.equal(volumeAnnotations.filter((annotation) => annotation.type === 'volume-window').length, 2);
  const volumeAverages = volumeAnnotations.filter((annotation) => annotation.type === 'volume-average');
  assert.equal(volumeAverages.length, 2);
  assert.ok(volumeAverages.every((annotation) => annotation.averageVolume > 0));
  const volumeCriterion = snapshot.criteria.find((criterion) => criterion.id === 'crit_volume_dryup');
  assert.deepEqual(volumeCriterion.annotationIds, volumeAnnotations.map((annotation) => annotation.id));

  // 점수 기여도 트레이스 확인
  assert.equal(snapshot.scoreTrace.length, 6);
});

test('쿨라매기 증거 스토어는 프로세스 캐시가 비어도 영속 스냅샷을 조회한다', async () => {
  clearQullamaggieEvidenceStore();
  const client = evidenceClient();
  const data = makeBreakoutData();
  const analysis = analyzeQullamaggieSetup(data, { market: 'US', exchange: 'US' });
  const snapshot = buildQullamaggieEvidenceSnapshot(data, analysis, {
    ticker: 'STORE_TEST',
    provider: 'Yahoo Finance',
    adjustment: 'unadjusted',
  });

  await saveQullamaggieEvidenceSnapshot(snapshot, client);
  clearQullamaggieEvidenceStore();
  const retrieved = await getQullamaggieEvidenceSnapshot(snapshot.snapshotId, client);

  assert.ok(retrieved);
  assert.equal(retrieved.snapshotId, snapshot.snapshotId);
  assert.equal(retrieved.symbol.ticker, 'STORE_TEST');
  assert.equal(retrieved.bars.length, data.length);
  assert.equal(retrieved.provenance.provider, 'Yahoo Finance');
  assert.equal(retrieved.provenance.adjustment, 'unadjusted');
  assert.match(retrieved.provenance.barsHash, /^[a-f0-9]{64}$/);

  // 미존재 snapshotId 조회 시 null
  assert.equal(await getQullamaggieEvidenceSnapshot('non_existent_id', client), null);
});
