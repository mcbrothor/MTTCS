import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve('.') },
});
const { tieredCacheGetOrLoad } = jiti('../lib/cache.ts');

const key = `singleflight-${Date.now()}-${Math.random()}`;
let loads = 0;
const loader = async () => {
  loads += 1;
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { value: 42 };
};

const concurrent = await Promise.all([
  tieredCacheGetOrLoad(key, loader, 1_000),
  tieredCacheGetOrLoad(key, loader, 1_000),
  tieredCacheGetOrLoad(key, loader, 1_000),
]);

assert.equal(loads, 1);
assert.deepEqual(concurrent, [{ value: 42 }, { value: 42 }, { value: 42 }]);
assert.deepEqual(await tieredCacheGetOrLoad(key, loader, 1_000), { value: 42 });
assert.equal(loads, 1);

console.log('cache single-flight tests passed');
