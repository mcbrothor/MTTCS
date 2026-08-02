import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve('.') },
});
const repository = jiti('../lib/gold/repository.ts');

function createQueryClient(responses) {
  const calls = [];
  const pending = [...responses];
  const client = {
    from(table) {
      calls.push(['from', table]);
      let chain;
      chain = new Proxy(
        {},
        {
          get(_target, property) {
            if (property === 'then') {
              return (resolve, reject) => {
                const response = pending.shift() ?? { data: null, error: null };
                return Promise.resolve(response).then(resolve, reject);
              };
            }
            return (...args) => {
              calls.push([property, ...args]);
              return chain;
            };
          },
        },
      );
      return chain;
    },
  };
  return { client, calls };
}

const ownerId = '11111111-1111-4111-8111-111111111111';
const otherOwnerId = '22222222-2222-4222-8222-222222222222';
const settingsRow = {
  owner_id: ownerId,
  core_product: '411060',
  tactical_product: '132030',
  base_currency: 'KRW',
  external_gold_value: '1250000.5',
  physical_gold_value: 500000,
  execution_levels: {},
  reference_scenario: { instrument: 'XAU/USD', active_signal: false },
  risk_paused: false,
  created_at: '2026-07-26T00:00:00.000Z',
  updated_at: '2026-07-26T00:00:00.000Z',
};

{
  const { client, calls } = createQueryClient([
    { data: settingsRow, error: null },
  ]);
  const result = await repository.getGoldStrategySettings({ client, ownerId });
  assert.equal(result.ownerId, ownerId);
  assert.equal(result.externalGoldValue, 1250000.5);
  assert.ok(
    calls.some(
      ([method, column, value]) =>
        method === 'eq' && column === 'owner_id' && value === ownerId,
    ),
  );
}

{
  const { client, calls } = createQueryClient([
    { data: settingsRow, error: null },
  ]);
  await repository.upsertGoldStrategySettings({
    client,
    ownerId,
    settings: {
      owner_id: otherOwnerId,
      ownerId: otherOwnerId,
      coreProduct: '411060',
      tacticalProduct: '132030',
      externalGoldValue: 1000,
    },
  });
  const upsert = calls.find(([method]) => method === 'upsert');
  assert.ok(upsert);
  assert.equal(upsert[1].owner_id, ownerId);
  assert.equal(upsert[1].ownerId, undefined);
  assert.equal(upsert[2].onConflict, 'owner_id');
}

const macroRow = {
  id: '33333333-3333-4333-8333-333333333333',
  owner_id: ownerId,
  observation_month: '2026-06-01',
  etf_net_flow_usd: '-8900000000',
  holdings_change_tonnes: '-74',
  etf_flow_direction: 'OUTFLOW',
  central_bank_demand_status: 'STRENGTHENING',
  source_url:
    'https://www.gold.org/goldhub/research/gold-etfs-holdings-and-flows/2026/07',
  source_excerpt: 'Approved aggregate only.',
  central_bank_source_url:
    'https://www.gold.org/goldhub/research/central-bank-gold-reserves-survey-2026',
  approved_at: '2026-07-26T00:00:00.000Z',
  created_at: '2026-07-26T00:00:00.000Z',
  updated_at: '2026-07-26T00:00:00.000Z',
};

{
  const { client, calls } = createQueryClient([
    { data: macroRow, error: null },
  ]);
  const result = await repository.getLatestGoldMacroObservation({
    client,
    ownerId,
  });
  assert.equal(result.etfFlowDirection, 'OUTFLOW');
  assert.equal(result.etfNetFlowUsd, -8900000000);
  assert.ok(
    calls.some(
      ([method, column, options]) =>
        method === 'order' &&
        column === 'observation_month' &&
        options.ascending === false,
    ),
  );
  assert.ok(
    calls.some(
      ([method, column, value]) =>
        method === 'eq' && column === 'owner_id' && value === ownerId,
    ),
  );
}

const snapshotRow = {
  id: '44444444-4444-4444-8444-444444444444',
  owner_id: ownerId,
  as_of_date: '2026-07-24',
  core_product: '411060',
  tactical_product: '132030',
  model_version: 'gold-core-tactical-2026.07-v1',
  data_quality: 'DEGRADED',
  inputs: { macroComplete: false },
  result: { tacticalWeight: 0 },
  input_hash: 'a'.repeat(64),
  observed_at: '2026-07-25T00:00:00.000Z',
  created_at: '2026-07-25T00:00:00.000Z',
  updated_at: '2026-07-25T00:00:00.000Z',
};

{
  const { client, calls } = createQueryClient([
    { data: [snapshotRow], error: null },
  ]);
  const rows = await repository.listGoldStrategySnapshots({
    client,
    ownerId,
    product: '132030',
    limit: 500,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dataQuality, 'DEGRADED');
  assert.ok(
    calls.some(
      ([method, column, value]) =>
        method === 'eq' && column === 'owner_id' && value === ownerId,
    ),
  );
  assert.ok(
    calls.some(
      ([method, expression]) =>
        method === 'or' &&
        expression ===
          'core_product.eq.132030,tactical_product.eq.132030',
    ),
  );
  assert.ok(
    calls.some(([method, value]) => method === 'limit' && value === 100),
  );
}

{
  const { client, calls } = createQueryClient([
    { data: snapshotRow, error: null },
  ]);
  await repository.upsertGoldStrategySnapshot({
    client,
    ownerId,
    snapshot: {
      asOfDate: '2026-07-24',
      coreProduct: '411060',
      tacticalProduct: '132030',
      modelVersion: 'gold-core-tactical-2026.07-v1',
      dataQuality: 'DEGRADED',
      inputs: { macroComplete: false },
      result: { tacticalWeight: 0 },
      inputHash: 'a'.repeat(64),
      observedAt: '2026-07-25T00:00:00.000Z',
    },
  });
  const upsert = calls.find(([method]) => method === 'upsert');
  assert.equal(upsert[1].owner_id, ownerId);
  assert.equal(
    upsert[2].onConflict,
    'owner_id,as_of_date,core_product,tactical_product,input_hash',
  );
}

await assert.rejects(
  repository.getGoldStrategySettings({
    client: createQueryClient([]).client,
    ownerId: '  ',
  }),
  /ownerId is required/,
);

console.log('gold repository tests passed');
