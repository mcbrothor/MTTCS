import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve('.') },
});
const settings = jiti('../lib/gold/settings.ts');
const quality = jiti('../lib/gold/quality.ts');
const portfolio = jiti('../lib/gold/portfolio.ts');
const fred = jiti('../lib/data/fred.ts');
const hashing = jiti('../lib/gold/hash.ts');

assert.equal(
  hashing.hashGoldStrategyInputs({ date: '2026-07-24', nested: { b: 2, a: 1 } }),
  hashing.hashGoldStrategyInputs({ nested: { a: 1, b: 2 }, date: '2026-07-24' }),
);

{
  const rows = fred.parseFredCsv(
    'observation_date,DFII10\n2026-07-21,2.37\n2026-07-22,.\n2026-07-23,2.43\n',
    2,
  );
  assert.deepEqual(rows, [
    { date: '2026-07-21', value: 2.37 },
    { date: '2026-07-23', value: 2.43 },
  ]);
}

{
  const patch = settings.validateGoldSettingsPatch({
    coreProduct: '411060',
    tacticalProduct: 'GLD',
    baseCurrency: 'KRW',
    manualAccountValue: 100_000_000,
    externalGoldValue: 1_000_000,
    physicalGoldValue: 500_000,
    riskPaused: true,
    executionLevels: {
      GLD: { support: 360, resistance: 385, target: null },
    },
  });
  assert.equal(patch.coreProduct, '411060');
  assert.equal(patch.tacticalProduct, 'GLD');
  assert.equal(patch.manualAccountValue, 100_000_000);
  assert.equal(patch.externalGoldValue, 1_000_000);
  assert.equal(patch.riskPaused, true);
  assert.equal(patch.executionLevels.GLD.support, 360);
}

assert.throws(
  () => settings.validateGoldSettingsPatch({ coreProduct: 'XAUUSD' }),
  /화이트리스트/,
);
assert.throws(
  () => settings.validateGoldSettingsPatch({ owner_id: 'attacker' }),
  /소유자 식별자/,
);
assert.throws(
  () => settings.validateGoldSettingsPatch({ externalGoldValue: -1 }),
  /0 이상의 숫자/,
);
assert.throws(
  () => settings.validateGoldSettingsPatch({ manualAccountValue: -1 }),
  /양수 또는 null/,
);
assert.equal(
  settings.validateGoldSettingsPatch({ manualAccountValue: null }).manualAccountValue,
  null,
);

function bars(count, lastDate) {
  const end = new Date(`${lastDate}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (count - index - 1));
    return {
      date: date.toISOString().slice(0, 10),
      open: 100,
      high: 102,
      low: 99,
      close: 101,
      volume: 1_000,
    };
  });
}

{
  const ready = quality.assessGoldPriceDataset(
    { bars: bars(200, '2026-07-24') },
    { now: new Date('2026-07-26T00:00:00Z'), macroComplete: true },
  );
  assert.equal(ready.status, 'VALID');
  const degraded = quality.assessGoldPriceDataset(
    { bars: bars(200, '2026-07-24') },
    { now: new Date('2026-07-26T00:00:00Z'), macroComplete: false },
  );
  assert.equal(degraded.status, 'DEGRADED');
  const blocked = quality.assessGoldPriceDataset(
    { bars: bars(199, '2026-07-01') },
    { now: new Date('2026-07-26T00:00:00Z'), macroComplete: true },
  );
  assert.equal(blocked.status, 'BLOCKED');
  assert.match(blocked.reasons.join(' '), /200봉 미만/);
  assert.match(blocked.reasons.join(' '), /지연/);
}

{
  const result = portfolio.convertGoldPortfolio({
    state: {
      equityByMarket: { US: 10_000, KR: 20_000_000 },
      holdings: [
        { product: 'GLD', units: 2 },
        { product: '411060', units: 10 },
      ],
    },
    baseCurrency: 'KRW',
    usdKrwRate: 1_400,
    prices: { GLD: 370, '411060': 25_000 },
  });
  assert.equal(result.accountValue, 34_000_000);
  assert.equal(result.existingGoldValue, 1_286_000);
  assert.deepEqual(result.warnings, []);
}

console.log('gold integration helper tests passed');
